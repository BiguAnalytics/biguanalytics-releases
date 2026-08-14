import { describe, expect, it, vi } from 'vitest';

import {
  createCloudEventService,
  mapCloudEventToLocal,
  mapLocalEventToCloud,
} from '../cloud-event-service.js';

function createQueryRecorder() {
  const calls = [];
  return {
    calls,
    client: {
      from(table) {
        const query = {
          upsert(payload) {
            calls.push({ table, method: 'upsert', payload });
            return Promise.resolve({ data: payload, error: null });
          },
          delete() {
            calls.push({ table, method: 'delete:start' });
            return {
              eq(column, value) {
                calls.push({ table, method: 'delete:eq', column, value });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
        return query;
      },
    },
  };
}

describe('cloudEventService', () => {
  it('maps local event seconds to Supabase timestamp_ms and payload jsonb', () => {
    expect(mapLocalEventToCloud({
      id: 'evt-1',
      timestamp: 12.345,
      type: 'ruck',
      team: 'home',
      result: 'ganado',
      subtype: '',
      zone: 'C3',
      note: 'limpieza',
      player: '9',
    }, { matchId: 'match-1', clubId: 'club-1', userId: 'user-1' })).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      match_id: 'match-1',
      club_id: 'club-1',
      created_by: 'user-1',
      timestamp_ms: 12345,
      event_type: 'ruck',
      payload: expect.objectContaining({ player: '9' }),
    });
  });

  it('maps legacy local event IDs to stable UUIDs without losing the local ID', () => {
    const first = mapLocalEventToCloud({
      id: 'evt-legacy-1',
      timestamp: 12,
      type: 'note',
      team: null,
      result: '',
      subtype: '',
      note: '',
    }, { matchId: '11111111-1111-4111-8111-111111111111', clubId: 'club-1', userId: 'user-1' });
    const second = mapLocalEventToCloud({
      id: 'evt-legacy-1',
      timestamp: 20,
      type: 'note',
      team: null,
      result: '',
      subtype: '',
      note: '',
    }, { matchId: '11111111-1111-4111-8111-111111111111', clubId: 'club-1', userId: 'user-1' });

    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(first.id).toBe(second.id);
    expect(first.id).not.toBe('evt-legacy-1');
    expect(first.payload.id).toBe('evt-legacy-1');
    expect(mapCloudEventToLocal({ ...first, payload: first.payload }).id).toBe('evt-legacy-1');
  });

  it('uses normalized zoneId as the cloud zone when event.zone is missing', () => {
    expect(mapLocalEventToCloud({
      id: 'evt-zone',
      timestamp: 18,
      type: 'ruck',
      team: 'home',
      result: 'ganado',
      zone: null,
      zoneId: 'opp_22',
      zoneLabel: '22 rival',
    }, { matchId: 'match-1', clubId: 'club-1', userId: 'user-1' })).toMatchObject({
      zone: 'opp_22',
      payload: expect.objectContaining({
        zoneId: 'opp_22',
        zoneLabel: '22 rival',
      }),
    });
  });

  it('maps cloud rows back into local tag events', () => {
    expect(mapCloudEventToLocal({
      id: 'evt-1',
      timestamp_ms: 12000,
      event_type: 'lineout',
      team: 'away',
      result: 'perdido',
      subtype: 'malo',
      zone: 'A1',
      note: 'presion',
      payload: { player: '2' },
      created_at: '2026-05-31T00:00:00.000Z',
      updated_at: '2026-05-31T00:01:00.000Z',
    })).toEqual(expect.objectContaining({
      id: 'evt-1',
      timestamp: 12,
      type: 'lineout',
      player: '2',
      updatedAt: '2026-05-31T00:01:00.000Z',
    }));
  });

  it('preserves the original event creator when another club member edits it', () => {
    const localEvent = mapCloudEventToLocal({
      id: 'evt-owned',
      created_by: 'creator-user',
      timestamp_ms: 12000,
      event_type: 'lineout',
      team: 'away',
      payload: {},
    });

    expect(localEvent.createdBy).toBe('creator-user');
    expect(mapLocalEventToCloud(localEvent, {
      matchId: 'match-1',
      clubId: 'club-1',
      userId: 'editor-user',
    }).created_by).toBe('creator-user');
  });

  it('preserves an untimed cloud event as untimed instead of converting null to zero', () => {
    expect(mapCloudEventToLocal({
      id: 'evt-untimed',
      timestamp_ms: null,
      event_type: 'note',
      team: 'home',
      payload: {},
    })).toEqual(expect.objectContaining({
      id: 'evt-untimed',
      timestamp: null,
    }));
  });

  it('does not lose heatmap zone data when cloud zone column is empty but payload has it', () => {
    expect(mapCloudEventToLocal({
      id: 'evt-zoned',
      timestamp_ms: 22000,
      event_type: 'ruck',
      team: 'home',
      result: 'ganado',
      subtype: '',
      zone: null,
      note: '',
      payload: {
        zone: 'opp_22',
        zoneId: 'opp_22',
        zoneLabel: '22 rival',
      },
      created_at: '2026-05-31T00:00:00.000Z',
      updated_at: '2026-05-31T00:01:00.000Z',
    })).toEqual(expect.objectContaining({
      zone: 'opp_22',
      zoneId: 'opp_22',
      zoneLabel: '22 rival',
    }));
  });

  it('creates a local event, syncs Supabase, and enqueues when offline', async () => {
    const recorder = createQueryRecorder();
    const localEvent = { id: 'evt-1', timestamp: 7, type: 'kick', team: 'home' };
    const localMatch = {
      id: 'match-1',
      homeTeam: 'Bigua',
      awayTeam: 'Rival',
      date: '2026-05-31',
      status: 'tagging',
      homeScore: 5,
      awayScore: 0,
      score: {
        local: 5,
        rival: 0,
        bigua: 5,
        opponent: 0,
        winnerTeam: 'Bigua',
        resultForBigua: 'win',
        updatedAt: '2026-05-31T00:02:00.000Z',
      },
    };
    const localApi = {
      events: {
        add: vi.fn(async () => localEvent),
      },
      matches: {
        getById: vi.fn(async () => localMatch),
      },
    };
    const syncService = {
      enqueue: vi.fn(async operation => operation),
    };
    const service = createCloudEventService({
      clientSource: async () => recorder.client,
      localApi,
      syncService,
      accessProvider: () => ({
        state: 'active',
        user: { id: 'user-1' },
        profile: { club_id: 'club-1' },
      }),
    });

    await service.addEvent('match-1', { timestamp: 7, type: 'kick', team: 'home' });

    expect(localApi.events.add).toHaveBeenCalledWith('match-1', { timestamp: 7, type: 'kick', team: 'home' });
    expect(recorder.calls).toEqual([
      expect.objectContaining({ table: 'match_events', method: 'upsert' }),
      expect.objectContaining({
        table: 'matches',
        method: 'upsert',
        payload: expect.objectContaining({
          id: 'match-1',
          local_score: 5,
          rival_score: 0,
          bigua_score: 5,
          opponent_score: 0,
          winner_team: 'Bigua',
          result_for_bigua: 'win',
          score_updated_at: '2026-05-31T00:02:00.000Z',
        }),
      }),
    ]);

    recorder.client.from = () => ({
      upsert: async () => ({ data: null, error: new Error('fetch failed') }),
    });

    await service.addEvent('match-1', { timestamp: 9, type: 'ruck' });
    expect(syncService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'match-1',
      entity: 'match_events',
      action: 'upsert',
      status: 'pending_sync',
      syncStatus: 'error',
      syncError: 'fetch failed',
    }));
    expect(syncService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'match-1',
      entity: 'matches',
      action: 'upsert',
      status: 'pending_sync',
      payload: expect.objectContaining({
        local_score: 5,
        result_for_bigua: 'win',
      }),
    }));
  });

  it('keeps local tagging responsive and queues sync when cloud context is unavailable', async () => {
    const localEvent = { id: 'evt-offline', timestamp: 22, type: 'scrum', team: 'home' };
    const localApi = {
      events: {
        add: vi.fn(async () => localEvent),
      },
    };
    const syncService = {
      enqueue: vi.fn(async operation => operation),
    };
    const service = createCloudEventService({
      clientSource: async () => {
        throw new Error('offline');
      },
      localApi,
      syncService,
      accessProvider: () => null,
    });

    await expect(service.addEvent('match-1', { timestamp: 22, type: 'scrum', team: 'home' }))
      .resolves.toBe(localEvent);
    expect(localApi.events.add).toHaveBeenCalledTimes(1);
    expect(syncService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'match-1',
      entity: 'match_events',
      action: 'upsert',
      status: 'pending_sync',
    }));
  });

  it('enqueues tagged events and match metadata when cloud context is unavailable', async () => {
    const localEvent = {
      id: 'evt-offline',
      timestamp: 22,
      type: 'scrum',
      team: 'home',
      result: 'ganado',
    };
    const localMatch = {
      id: 'match-1',
      homeTeam: 'Bigua',
      awayTeam: 'Cardos',
      date: '2026-06-16',
      status: 'tagging',
      events: [localEvent],
      homeScore: 0,
      awayScore: 0,
    };
    const localApi = {
      events: {
        add: vi.fn(async () => localEvent),
      },
      matches: {
        getById: vi.fn(async () => localMatch),
      },
    };
    const syncService = {
      enqueue: vi.fn(async operation => operation),
    };
    const service = createCloudEventService({
      clientSource: async () => {
        throw new Error('offline');
      },
      localApi,
      syncService,
      accessProvider: () => null,
    });

    await expect(service.addEvent('match-1', { timestamp: 22, type: 'scrum', team: 'home' }))
      .resolves.toBe(localEvent);

    expect(syncService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'match-1',
      entity: 'match_events',
      action: 'upsert',
      dedupeKey: 'match_events:evt-offline',
      payload: expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
        match_id: 'match-1',
        club_id: '',
        created_by: '',
        payload: expect.objectContaining({ id: 'evt-offline' }),
      }),
    }));
    expect(syncService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'match-1',
      entity: 'matches',
      action: 'upsert',
      dedupeKey: 'matches:match-1',
      payload: expect.objectContaining({
        id: 'match-1',
        club_id: '',
        created_by: '',
      }),
    }));
  });

  it('uses the event resource key for pending deletes so they supersede queued upserts', async () => {
    const syncService = {
      enqueue: vi.fn(async operation => operation),
    };
    const service = createCloudEventService({
      clientSource: async () => {
        throw new Error('offline');
      },
      localApi: {
        events: { delete: vi.fn(async () => undefined) },
      },
      syncService,
      accessProvider: () => null,
    });

    await service.deleteEvent('match-1', 'evt-delete');

    expect(syncService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'match-1',
      entity: 'match_events',
      action: 'delete',
      dedupeKey: 'match_events:evt-delete',
    }));
  });

  it('paginates direct event downloads instead of trusting the server row limit', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `evt-${index}`,
      timestamp_ms: index * 1000,
      event_type: 'note',
      team: null,
      result: '',
      payload: {},
    }));
    const client = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async from => ({
                data: from === 0 ? firstPage : [{
                  id: 'evt-1000',
                  timestamp_ms: 1000000,
                  event_type: 'note',
                  team: null,
                  result: '',
                  payload: {},
                }],
                error: null,
              }),
            }),
          }),
        }),
      })),
    };
    const service = createCloudEventService({
      clientSource: async () => client,
      localApi: {},
      syncService: { enqueue: vi.fn() },
      accessProvider: () => ({
        state: 'active',
        user: { id: 'user-1' },
        profile: { club_id: 'club-1' },
      }),
    });

    const events = await service.downloadEvents('match-1');

    expect(events).toHaveLength(1001);
    expect(events.at(-1)).toEqual(expect.objectContaining({ id: 'evt-1000', timestamp: 1000 }));
  });
});
