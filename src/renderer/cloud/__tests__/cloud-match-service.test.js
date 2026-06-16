import { describe, expect, it, vi } from 'vitest';

import {
  createCloudMatchService,
  mapCloudMatchToLocal,
  mapLocalMatchToCloud,
} from '../cloud-match-service.js';

describe('cloudMatchService', () => {
  it('maps Supabase match rows into local match.json fields', () => {
    expect(mapCloudMatchToLocal({
      id: 'match-1',
      club_id: 'club-1',
      created_by: 'user-1',
      local_team: 'Bigua',
      rival_team: 'Rival',
      match_date: '2026-05-31',
      competition: 'Regional',
      venue: 'home',
      status: 'tagging',
      local_score: 12,
      rival_score: 8,
      bigua_score: 12,
      opponent_score: 8,
      winner_team: 'Bigua',
      result_for_bigua: 'win',
      score_updated_at: '2026-05-31T00:02:00.000Z',
      created_at: '2026-05-31T00:00:00.000Z',
      updated_at: '2026-05-31T00:01:00.000Z',
      video_references: [{ source_type: 'youtube', youtube_url: 'https://youtu.be/abc123', youtube_video_id: 'abc123' }],
    })).toEqual(expect.objectContaining({
      id: 'match-1',
      homeTeam: 'Bigua',
      awayTeam: 'Rival',
      date: '2026-05-31',
      homeScore: 12,
      awayScore: 8,
      score: expect.objectContaining({
        local: 12,
        rival: 8,
        bigua: 12,
        opponent: 8,
        winnerTeam: 'Bigua',
        resultForBigua: 'win',
        updatedAt: '2026-05-31T00:02:00.000Z',
      }),
      video: expect.objectContaining({ type: 'youtube', videoId: 'abc123' }),
      cloud: { clubId: 'club-1', createdBy: 'user-1' },
    }));
  });

  it('normalizes partial cloud match rows before caching for Home', () => {
    expect(mapCloudMatchToLocal({
      id: 'match-partial',
      club_id: 'club-1',
      created_by: 'user-1',
      local_team: null,
      rival_team: null,
      match_date: null,
      status: null,
    })).toEqual(expect.objectContaining({
      id: 'match-partial',
      homeTeam: 'Bigua',
      awayTeam: 'Rival',
      date: expect.any(String),
      competition: '',
      venue: 'home',
      status: 'created',
      homeScore: 0,
      awayScore: 0,
      score: expect.objectContaining({
        local: 0,
        rival: 0,
        bigua: 0,
        opponent: 0,
        winnerTeam: null,
        resultForBigua: 'unknown',
      }),
    }));
  });

  it('maps local matches to lightweight Supabase rows without dashboards or video bytes', () => {
    const row = mapLocalMatchToCloud({
      id: 'match-1',
      homeTeam: 'Bigua',
      awayTeam: 'Rival',
      date: '2026-05-31',
      competition: 'Regional',
      venue: 'away',
      status: 'tagging',
      score: {
        local: 21,
        rival: 17,
        bigua: 21,
        opponent: 17,
        winnerTeam: 'Bigua',
        resultForBigua: 'win',
        updatedAt: '2026-05-31T00:02:00.000Z',
      },
      events: [{ id: 'evt-1' }],
      dashboard: { rendered: true },
    }, { clubId: 'club-1', userId: 'user-1' });

    expect(row).toEqual({
      id: 'match-1',
      club_id: 'club-1',
      created_by: 'user-1',
      local_team: 'Bigua',
      rival_team: 'Rival',
      match_date: '2026-05-31',
      competition: 'Regional',
      venue: 'away',
      status: 'tagging',
      local_score: 21,
      rival_score: 17,
      bigua_score: 21,
      opponent_score: 17,
      winner_team: 'Bigua',
      result_for_bigua: 'win',
      score_updated_at: '2026-05-31T00:02:00.000Z',
    });
  });

  it('creates a match in local cache first, syncs Supabase, and enqueues on failure', async () => {
    const calls = [];
    const client = {
      from(table) {
        return {
          upsert: async (payload) => {
            calls.push({ table, payload });
            return { data: payload, error: null };
          },
        };
      },
    };
    const localMatch = {
      id: 'match-1',
      homeTeam: 'Bigua',
      awayTeam: 'Rival',
      date: '2026-05-31',
      competition: 'Regional',
      venue: 'home',
      status: 'created',
      video: { type: 'youtube', url: 'https://youtu.be/abc123', videoId: 'abc123' },
    };
    const localApi = {
      matches: {
        create: vi.fn(async () => localMatch),
        upsertCache: vi.fn(async match => match),
      },
    };
    const syncService = { enqueue: vi.fn(async operation => operation), flushPendingSync: vi.fn(async () => ({ applied: 0, failed: 0 })) };
    const service = createCloudMatchService({
      clientSource: async () => client,
      localApi,
      syncService,
      accessProvider: () => ({
        state: 'active',
        user: { id: 'user-1' },
        profile: { club_id: 'club-1' },
      }),
    });

    await service.createMatch({ awayTeam: 'Rival' });

    expect(localApi.matches.create).toHaveBeenCalledWith({ awayTeam: 'Rival' });
    expect(calls.map(call => call.table)).toEqual(['matches', 'video_references']);

    client.from = () => ({
      upsert: async () => ({ data: null, error: new Error('fetch failed') }),
    });

    await service.createMatch({ awayTeam: 'Rival offline' });
    expect(syncService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      entity: 'matches',
      action: 'upsert',
      status: 'pending_sync',
    }));
  });

  it('lists cloud match summaries without hydrating every match detail', async () => {
    let cachedMatch = null;
    const detailCalls = [];
    const matchRow = {
      id: 'match-1',
      club_id: 'club-1',
      created_by: 'user-1',
      local_team: 'Bigua',
      rival_team: 'Cardos',
      match_date: '2026-05-27',
      competition: 'Regional',
      venue: 'home',
      status: 'tagging',
      created_at: '2026-05-27T00:00:00.000Z',
      updated_at: '2026-05-27T00:10:00.000Z',
      video_references: [],
    };
    const client = {
      from(table) {
        if (table === 'matches') {
          return {
            select: () => ({
              order: vi.fn(() => ({
                range: vi.fn(async () => ({ data: [matchRow], error: null })),
              })),
              eq: vi.fn(() => ({
                single: vi.fn(async () => {
                  detailCalls.push(table);
                  return { data: matchRow, error: null };
                }),
              })),
            }),
          };
        }
        if (table === 'match_events') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [{ id: 'evt-1', match_id: 'match-1', timestamp_ms: 12000, event_type: 'ruck', team: 'home', result: 'ganado' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'match_possessions') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [{ match_id: 'match-1', team: 'home', start_ms: 0, end_ms: 30000 }],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          }),
        };
      },
    };
    const localApi = {
      matches: {
        upsertCache: vi.fn(async (match) => {
          cachedMatch = { ...(cachedMatch || {}), ...match };
          return cachedMatch;
        }),
        getAll: vi.fn(async () => [cachedMatch]),
      },
    };
    const service = createCloudMatchService({
      clientSource: async () => client,
      localApi,
      syncService: { enqueue: vi.fn(), flushPendingSync: vi.fn(async () => ({ applied: 0, failed: 0 })) },
      accessProvider: () => ({
        state: 'active',
        user: { id: 'user-1' },
        profile: { club_id: 'club-1' },
      }),
    });

    await service.listMatches();

    expect(detailCalls).toEqual([]);
    expect(cachedMatch).toEqual(expect.objectContaining({
      id: 'match-1',
      homeTeam: 'Bigua',
      awayTeam: 'Cardos',
    }));
    expect(cachedMatch.events).toBeUndefined();
    expect(service.getLastListStatus()).toEqual(expect.objectContaining({
      source: 'cloud',
      partial: false,
      total: 1,
      cached: 1,
    }));
  });

  it('returns cloud matches without events even when the local cache read is stale', async () => {
    const matchRow = {
      id: 'match-empty-events',
      club_id: 'club-1',
      created_by: 'user-1',
      local_team: 'Bigua',
      rival_team: 'Cardos',
      match_date: '2026-06-10',
      competition: 'Regional',
      venue: 'home',
      status: 'created',
      created_at: '2026-06-10T00:00:00.000Z',
      updated_at: '2026-06-10T00:00:00.000Z',
      video_references: [],
    };
    const client = {
      from(table) {
        expect(table).toBe('matches');
        return {
          select: () => ({
            order: () => ({
              range: async () => ({ data: [matchRow], error: null }),
            }),
          }),
        };
      },
    };
    const localApi = {
      matches: {
        upsertCache: vi.fn(async match => match),
        getAll: vi.fn(async () => []),
      },
    };
    const service = createCloudMatchService({
      clientSource: async () => client,
      localApi,
      syncService: { enqueue: vi.fn(), flushPendingSync: vi.fn(async () => ({ applied: 0, failed: 0 })) },
      accessProvider: () => ({
        state: 'active',
        user: { id: 'user-1' },
        profile: { club_id: 'club-1' },
      }),
    });

    const matches = await service.listMatches({ forceRefresh: true });

    expect(matches).toEqual([
      expect.objectContaining({
        id: 'match-empty-events',
        homeTeam: 'Bigua',
        awayTeam: 'Cardos',
        eventCount: undefined,
      }),
    ]);
    expect(matches[0].events).toBeUndefined();
    expect(localApi.matches.upsertCache).toHaveBeenCalledWith(expect.not.objectContaining({
      events: expect.any(Array),
    }));
  });

  it('caches cloud list refreshes and supports forced refreshes', async () => {
    let cloudReads = 0;
    const client = {
      from(table) {
        expect(table).toBe('matches');
        return {
          select: () => ({
            order: () => ({
              range: async () => {
                cloudReads += 1;
                return {
                  data: [{
                    id: `match-${cloudReads}`,
                    club_id: 'club-1',
                    created_by: 'user-1',
                    local_team: 'Bigua',
                    rival_team: 'Rival',
                    match_date: '2026-05-27',
                    status: 'created',
                    video_references: [],
                  }],
                  error: null,
                };
              },
            }),
          }),
        };
      },
    };
    const localApi = {
      matches: {
        upsertCache: vi.fn(async match => match),
        getAll: vi.fn(async () => []),
      },
    };
    const service = createCloudMatchService({
      clientSource: async () => client,
      localApi,
      syncService: { enqueue: vi.fn(), flushPendingSync: vi.fn(async () => ({ applied: 0, failed: 0 })) },
      accessProvider: () => ({
        state: 'active',
        user: { id: 'user-1' },
        profile: { club_id: 'club-1' },
      }),
      now: () => 1_000,
    });

    await service.listMatches();
    await service.listMatches();
    await service.listMatches({ forceRefresh: true });

    expect(cloudReads).toBe(2);
    expect(localApi.matches.upsertCache).toHaveBeenCalledTimes(2);
  });

  it('reports partial summary cache failures without blocking the local list', async () => {
    const client = {
      from(table) {
        expect(table).toBe('matches');
        return {
          select: () => ({
            order: () => ({
              range: async () => ({
                data: [
                  {
                    id: 'match-ok',
                    club_id: 'club-1',
                    created_by: 'user-1',
                    local_team: 'Bigua',
                    rival_team: 'Rival',
                    match_date: '2026-05-27',
                    status: 'created',
                    video_references: [],
                  },
                  {
                    id: 'match-fail',
                    club_id: 'club-1',
                    created_by: 'user-1',
                    local_team: 'Bigua',
                    rival_team: 'Cardos',
                    match_date: '2026-05-28',
                    status: 'created',
                    video_references: [],
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      },
    };
    const localApi = {
      matches: {
        upsertCache: vi.fn(async (match) => {
          if (match.id === 'match-fail') throw new Error('disk full');
          return match;
        }),
        getAll: vi.fn(async () => [{ id: 'match-ok' }]),
      },
    };
    const service = createCloudMatchService({
      clientSource: async () => client,
      localApi,
      syncService: { enqueue: vi.fn(), flushPendingSync: vi.fn(async () => ({ applied: 0, failed: 0 })) },
      accessProvider: () => ({
        state: 'active',
        user: { id: 'user-1' },
        profile: { club_id: 'club-1' },
      }),
    });

    await expect(service.listMatches()).resolves.toEqual([
      expect.objectContaining({ id: 'match-ok', homeTeam: 'Bigua', score: expect.any(Object) }),
    ]);
    expect(service.getLastListStatus()).toEqual(expect.objectContaining({
      source: 'cloud',
      partial: true,
      total: 2,
      cached: 1,
    }));
    expect(service.getLastListStatus().errors[0]).toEqual(expect.objectContaining({
      matchId: 'match-fail',
      message: expect.stringContaining('disk full'),
    }));
  });

  it('can return cached local match summaries without touching Supabase on startup', async () => {
    const localApi = {
      matches: {
        getAll: vi.fn(async () => [{ id: 'cached-match' }]),
        upsertCache: vi.fn(),
      },
    };
    const syncService = {
      enqueue: vi.fn(),
      flushPendingSync: vi.fn(async () => ({ applied: 0, failed: 0 })),
    };
    const clientSource = vi.fn(async () => {
      throw new Error('Supabase must not run before Home is visible.');
    });
    const service = createCloudMatchService({
      clientSource,
      localApi,
      syncService,
      accessProvider: () => ({
        state: 'active',
        user: { id: 'user-1' },
        profile: { club_id: 'club-1' },
      }),
    });

    await expect(service.listMatches({ localFirst: true })).resolves.toEqual([
      expect.objectContaining({ id: 'cached-match', homeTeam: 'Bigua', score: expect.any(Object) }),
    ]);

    expect(localApi.matches.getAll).toHaveBeenCalledTimes(1);
    expect(clientSource).not.toHaveBeenCalled();
    expect(syncService.flushPendingSync).not.toHaveBeenCalled();
  });

  it('returns local cache immediately and refreshes cloud summaries in the background', async () => {
    let cached = [{ id: 'cached-match', homeTeam: 'Bigua', awayTeam: 'Old', cloud: null }];
    const client = {
      from(table) {
        expect(table).toBe('matches');
        return {
          select: () => ({
            order: () => ({
              range: async () => ({
                data: [{
                  id: 'cloud-only',
                  club_id: 'club-1',
                  created_by: 'user-1',
                  local_team: 'Bigua',
                  rival_team: 'Cardos',
                  match_date: '2026-05-27',
                  status: 'tagging',
                  local_score: 7,
                  rival_score: 3,
                  bigua_score: 7,
                  opponent_score: 3,
                  winner_team: 'Bigua',
                  result_for_bigua: 'win',
                  score_updated_at: '2026-05-27T00:10:00.000Z',
                  video_references: [],
                }],
                error: null,
              }),
            }),
          }),
        };
      },
    };
    const localApi = {
      matches: {
        getAll: vi.fn(async () => cached),
        upsertCache: vi.fn(async (match) => {
          cached = [...cached.filter(item => item.id !== match.id), match];
          return match;
        }),
        delete: vi.fn(async () => {}),
      },
    };
    const service = createCloudMatchService({
      clientSource: async () => client,
      localApi,
      syncService: { enqueue: vi.fn(), flushPendingSync: vi.fn(async () => ({ applied: 0, failed: 0 })) },
      accessProvider: () => ({
        state: 'active',
        user: { id: 'user-1' },
        profile: { club_id: 'club-1' },
      }),
    });

    await expect(service.listMatches({ localFirst: true, refreshInBackground: true }))
      .resolves.toEqual([
        expect.objectContaining({ id: 'cached-match', homeTeam: 'Bigua', awayTeam: 'Old', score: expect.any(Object) }),
      ]);
    await vi.waitFor(() => {
      expect(localApi.matches.upsertCache).toHaveBeenCalledWith(expect.objectContaining({
        id: 'cloud-only',
        homeTeam: 'Bigua',
        awayTeam: 'Cardos',
        homeScore: 7,
        awayScore: 3,
      }));
    });
  });

  it('removes cached cloud-origin matches missing from a complete cloud refresh', async () => {
    let cached = [
      { id: 'cloud-old', cloud: { clubId: 'club-1' } },
      { id: 'local-draft', cloud: null },
    ];
    const client = {
      from(table) {
        expect(table).toBe('matches');
        return {
          select: () => ({
            order: () => ({
              range: async () => ({ data: [], error: null }),
            }),
          }),
        };
      },
    };
    const localApi = {
      matches: {
        getAll: vi.fn(async () => cached),
        upsertCache: vi.fn(async match => match),
        delete: vi.fn(async (matchId) => {
          cached = cached.filter(match => match.id !== matchId);
        }),
      },
    };
    const service = createCloudMatchService({
      clientSource: async () => client,
      localApi,
      syncService: { enqueue: vi.fn(), flushPendingSync: vi.fn(async () => ({ applied: 0, failed: 0 })) },
      accessProvider: () => ({
        state: 'active',
        user: { id: 'user-1' },
        profile: { club_id: 'club-1' },
      }),
    });

    await service.listMatches({ forceRefresh: true });

    expect(localApi.matches.delete).toHaveBeenCalledWith('cloud-old');
    expect(localApi.matches.delete).not.toHaveBeenCalledWith('local-draft');
  });

  it('announces cloud list refreshes for incremental Home updates', async () => {
    const source = await import('node:fs').then(fs => fs.readFileSync(new URL('../cloud-match-service.js', import.meta.url), 'utf8'));

    expect(source).toContain("new CustomEvent('bigu:home-matches-updated'");
    expect(source).toContain("markStartup('cloud-sync:update-matches'");
    expect(source).toContain('announceHomeMatchesUpdated(matches');
  });
});
