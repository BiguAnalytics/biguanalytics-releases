import { describe, expect, it, vi } from 'vitest';

import { createSyncService } from '../sync-service.js';

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
});
