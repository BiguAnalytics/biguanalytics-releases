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
      id: 'evt-1',
      match_id: 'match-1',
      club_id: 'club-1',
      created_by: 'user-1',
      timestamp_ms: 12345,
      event_type: 'ruck',
      payload: expect.objectContaining({ player: '9' }),
    });
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
        id: 'evt-offline',
        match_id: 'match-1',
        club_id: '',
        created_by: '',
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
});
