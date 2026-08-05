import { describe, expect, it, vi } from 'vitest';

import { applyCloudOperation, createSyncService } from '../sync-service.js';

describe('syncService', () => {
  it('flushes pending operations and marks successful ids as applied', async () => {
    const calls = [];
    const client = {
      from(table) {
        return {
          upsert: async (payload) => {
            calls.push({ table, method: 'upsert', payload });
            return { error: null };
          },
        };
      },
    };
    const localApi = {
      matches: {
        getPendingSync: vi.fn(async () => [
          {
            id: 'pending-1',
            matchId: 'match-1',
            entity: 'matches',
            action: 'upsert',
            payload: { id: 'match-1', club_id: 'club-1' },
          },
        ]),
        markPendingSyncApplied: vi.fn(async () => true),
      },
    };
    const service = createSyncService({ clientSource: async () => client, localApi });

    const result = await service.flushPendingSync();

    expect(result).toEqual({ applied: 1, failed: 0 });
    expect(calls).toEqual([{ table: 'matches', method: 'upsert', payload: { id: 'match-1', club_id: 'club-1' } }]);
    expect(localApi.matches.markPendingSyncApplied).toHaveBeenCalledWith(['pending-1']);
  });

  it('coalesces enqueue requests by dedupeKey before storing pending_sync', async () => {
    const localApi = {
      matches: {
        enqueuePendingSync: vi.fn(async operation => operation),
      },
    };
    const service = createSyncService({ localApi, clientSource: async () => ({}) });

    await service.enqueue({
      matchId: 'match-1',
      entity: 'match_events',
      action: 'upsert',
      dedupeKey: 'match_events:evt-1',
      payload: { id: 'evt-1' },
    });

    expect(localApi.matches.enqueuePendingSync).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending_sync',
      dedupeKey: 'match_events:evt-1',
    }));
  });

  it('hydrates pending operations with the current club and user before flushing', async () => {
    const calls = [];
    const client = {
      from(table) {
        return {
          upsert: async (payload) => {
            calls.push({ table, method: 'upsert', payload });
            return { error: null };
          },
        };
      },
    };
    const localApi = {
      matches: {
        getPendingSync: vi.fn(async () => [
          {
            id: 'pending-match',
            matchId: 'match-1',
            entity: 'matches',
            action: 'upsert',
            payload: { id: 'match-1', club_id: '', created_by: '' },
          },
          {
            id: 'pending-event',
            matchId: 'match-1',
            entity: 'match_events',
            action: 'upsert',
            payload: { id: 'evt-1', match_id: 'match-1', club_id: '', created_by: '' },
          },
        ]),
        markPendingSyncApplied: vi.fn(async () => true),
      },
    };
    const service = createSyncService({
      clientSource: async () => client,
      localApi,
      accessProvider: () => ({
        state: 'active',
        user: { id: 'coach-user' },
        profile: { club_id: 'club-1' },
      }),
    });

    await expect(service.flushPendingSync()).resolves.toEqual({ applied: 2, failed: 0 });

    expect(calls).toEqual([
      {
        table: 'matches',
        method: 'upsert',
        payload: { id: 'match-1', club_id: 'club-1', created_by: 'coach-user' },
      },
      {
        table: 'match_events',
        method: 'upsert',
        payload: { id: 'evt-1', match_id: 'match-1', club_id: 'club-1', created_by: 'coach-user' },
      },
    ]);
    expect(localApi.matches.markPendingSyncApplied).toHaveBeenCalledWith(['pending-match', 'pending-event']);
  });

  it('shares an in-flight flush so a pending operation is applied only once', async () => {
    const calls = [];
    let releaseCloudWrite;
    const cloudWrite = new Promise(resolve => { releaseCloudWrite = resolve; });
    const client = {
      from(table) {
        return {
          upsert: async (payload) => {
            calls.push({ table, payload });
            await cloudWrite;
            return { error: null };
          },
        };
      },
    };
    const localApi = {
      matches: {
        getPendingSync: vi.fn(async () => [{
          id: 'pending-1',
          matchId: 'match-1',
          entity: 'matches',
          action: 'upsert',
          payload: { id: 'match-1' },
        }]),
        markPendingSyncApplied: vi.fn(async () => true),
      },
    };
    const service = createSyncService({ clientSource: async () => client, localApi });

    const firstFlush = service.flushPendingSync();
    const secondFlush = service.flushPendingSync();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    releaseCloudWrite();

    await expect(Promise.all([firstFlush, secondFlush])).resolves.toEqual([
      { applied: 1, failed: 0 },
      { applied: 1, failed: 0 },
    ]);
    expect(localApi.matches.markPendingSyncApplied).toHaveBeenCalledTimes(1);
  });

  it('allows a later flush after the current flush completes', async () => {
    let pending = [{
      id: 'pending-1',
      matchId: 'match-1',
      entity: 'matches',
      action: 'upsert',
      payload: { id: 'match-1' },
    }];
    let cloudWrites = 0;
    const client = {
      from() {
        return {
          upsert: async () => {
            cloudWrites += 1;
            return { error: null };
          },
        };
      },
    };
    const localApi = {
      matches: {
        getPendingSync: vi.fn(async () => pending),
        markPendingSyncApplied: vi.fn(async (ids) => {
          pending = pending.filter(operation => !ids.includes(operation.id));
          return true;
        }),
      },
    };
    const service = createSyncService({ clientSource: async () => client, localApi });

    await expect(service.flushPendingSync()).resolves.toEqual({ applied: 1, failed: 0 });
    pending = [{
      id: 'pending-2',
      matchId: 'match-1',
      entity: 'matches',
      action: 'upsert',
      payload: { id: 'match-1', version: 2 },
    }];
    await expect(service.flushPendingSync()).resolves.toEqual({ applied: 1, failed: 0 });

    expect(cloudWrites).toBe(2);
  });

  it('keeps existing cloud rows when a replacement insert fails', async () => {
    const calls = [];
    const client = {
      from(table) {
        return {
          select: () => ({
            eq: async () => ({ data: [{ id: 'old-1' }], error: null }),
          }),
          delete: () => ({
            eq: async () => {
              calls.push({ table, method: 'delete' });
              return { error: null };
            },
            in: async () => {
              calls.push({ table, method: 'delete-in' });
              return { error: null };
            },
          }),
          upsert: async () => {
            calls.push({ table, method: 'upsert' });
            return { error: new Error('replacement insert failed') };
          },
        };
      },
    };

    await expect(applyCloudOperation(client, {
      matchId: 'match-1',
      entity: 'match_events',
      action: 'replace',
      payload: [{ id: 'new-1', match_id: 'match-1' }],
    })).rejects.toThrow('replacement insert failed');

    expect(calls).toEqual([{ table: 'match_events', method: 'upsert' }]);
  });

  it('replaces cloud rows by writing desired data before deleting only stale ids', async () => {
    const calls = [];
    const client = {
      from(table) {
        return {
          select: () => ({
            eq: async () => ({ data: [{ id: 'old-1' }, { id: 'keep-1' }], error: null }),
          }),
          delete: () => ({
            eq: async () => ({ error: null }),
            in: async (column, values) => {
              calls.push({ table, method: 'delete-in', column, values });
              return { error: null };
            },
          }),
          upsert: async () => {
            calls.push({ table, method: 'upsert' });
            return { error: null };
          },
        };
      },
    };

    await applyCloudOperation(client, {
      matchId: 'match-1',
      entity: 'match_events',
      action: 'replace',
      payload: [
        { id: 'keep-1', match_id: 'match-1' },
        { id: 'new-1', match_id: 'match-1' },
      ],
    });

    expect(calls).toEqual([
      { table: 'match_events', method: 'upsert' },
      { table: 'match_events', method: 'delete-in', column: 'id', values: ['old-1'] },
    ]);
  });

  it('keeps failed operations pending with visible per-match error state', async () => {
    const pending = [{
      id: 'pending-1',
      matchId: 'match-1',
      entity: 'matches',
      action: 'upsert',
      payload: { id: 'match-1' },
    }];
    const client = {
      from() {
        return {
          upsert: async () => ({ error: new Error('cloud permission denied') }),
        };
      },
    };
    const localApi = {
      matches: {
        getPendingSync: vi.fn(async () => pending),
        enqueuePendingSync: vi.fn(async operation => {
          pending[0] = operation;
          return operation;
        }),
        markPendingSyncApplied: vi.fn(async () => true),
      },
    };
    const service = createSyncService({ clientSource: async () => client, localApi });

    await expect(service.flushPendingSync()).resolves.toEqual({
      applied: 0,
      failed: 1,
      errors: [expect.objectContaining({ matchId: 'match-1', message: 'cloud permission denied' })],
    });
    expect(localApi.matches.enqueuePendingSync).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'match-1',
      status: 'pending_sync',
      syncStatus: 'error',
      syncError: 'cloud permission denied',
      attempts: 1,
      failedAt: expect.any(String),
    }));
    expect(localApi.matches.markPendingSyncApplied).not.toHaveBeenCalled();
  });

  it('does not remove a newer enqueue that reuses an applied operation id', async () => {
    let releaseCloudWrite;
    const cloudCalls = [];
    const cloudWrite = new Promise(resolve => { releaseCloudWrite = resolve; });
    const pending = [{
      id: 'pending-1',
      matchId: 'match-1',
      entity: 'matches',
      action: 'upsert',
      updatedAt: '2026-08-05T00:00:00.000Z',
      payload: { id: 'match-1', version: 1 },
    }];
    const client = {
      from() {
        return {
          upsert: async () => {
            cloudCalls.push(true);
            await cloudWrite;
            return { error: null };
          },
        };
      },
    };
    const localApi = {
      matches: {
        getPendingSync: vi.fn(async () => pending),
        enqueuePendingSync: vi.fn(async operation => {
          pending[0] = operation;
          return operation;
        }),
        markPendingSyncApplied: vi.fn(async () => true),
      },
    };
    const service = createSyncService({ clientSource: async () => client, localApi });

    const flush = service.flushPendingSync();
    await vi.waitFor(() => expect(cloudCalls).toHaveLength(1));
    await service.enqueue({
      id: 'pending-1',
      matchId: 'match-1',
      entity: 'matches',
      action: 'upsert',
      updatedAt: '2026-08-05T00:01:00.000Z',
      payload: { id: 'match-1', version: 2 },
    });
    releaseCloudWrite();

    await expect(flush).resolves.toEqual({ applied: 1, failed: 0 });
    expect(localApi.matches.markPendingSyncApplied).not.toHaveBeenCalled();
    expect(pending[0].payload.version).toBe(2);
  });

  it('records a recoverable error for every pending match when cloud resolution fails', async () => {
    const pending = [{
      id: 'pending-1',
      matchId: 'match-1',
      entity: 'matches',
      action: 'upsert',
      payload: { id: 'match-1' },
    }];
    const localApi = {
      matches: {
        getPendingSync: vi.fn(async () => pending),
        enqueuePendingSync: vi.fn(async operation => operation),
        markPendingSyncApplied: vi.fn(async () => true),
      },
    };
    const service = createSyncService({
      clientSource: async () => { throw new Error('cloud client unavailable'); },
      localApi,
    });

    await expect(service.flushPendingSync()).resolves.toEqual({
      applied: 0,
      failed: 1,
      errors: [expect.objectContaining({ matchId: 'match-1', message: 'cloud client unavailable' })],
    });
    expect(localApi.matches.enqueuePendingSync).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'match-1',
      syncStatus: 'error',
      syncError: 'cloud client unavailable',
    }));
  });
});
