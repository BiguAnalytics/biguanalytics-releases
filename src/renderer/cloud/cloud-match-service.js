// @ts-check
import { assertSupabaseOk, isBrowserOffline, resolveCloudContext } from './cloud-context.js';
import { mapCloudEventToLocal, mapLocalEventToCloud } from './cloud-event-service.js';
import { applyCloudOperation, syncService as defaultSyncService } from './sync-service.js';
import {
  hydrateCloudMatch,
  mapCloudMatchSummaryToLocal as mapCloudMatchSummaryToNormalizedLocal,
  mapLocalMatchToCloud as mapNormalizedLocalMatchToCloud,
  normalizeMatchForHome,
} from './match-mapper.js';
import { buildVideoReferencePayload } from './video-reference-service.js';
import { markStartup, timeStartup } from '../startup-timing.js';

export { hydrateCloudMatch, normalizeMatchForHome } from './match-mapper.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOUD_LIST_CACHE_TTL_MS = 30_000;
const CLOUD_LIST_PAGE_SIZE = 50;

/**
 * @param {number|null|undefined} seconds
 * @returns {number}
 */
function secondsToMs(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) : 0;
}

/**
 * @param {number|null|undefined} ms
 * @returns {number}
 */
function msToSeconds(ms) {
  const value = Number(ms);
  return Number.isFinite(value) && value >= 0 ? value / 1000 : 0;
}

/**
 * @param {object} row
 * @returns {object}
 */
export function mapCloudMatchToLocal(row) {
  return hydrateCloudMatch(row);
}

/**
 * @param {object} row
 * @returns {object}
 */
function mapCloudMatchSummaryToLocal(row) {
  return mapCloudMatchSummaryToNormalizedLocal(row);
}

/**
 * @param {object} match
 * @param {{clubId: string, userId: string}} context
 * @returns {object}
 */
export function mapLocalMatchToCloud(match, context) {
  return mapNormalizedLocalMatchToCloud(match, context);
}

/**
 * @param {object|Array<object>|null|undefined} possession
 * @returns {Array<object>}
 */
function possessionToSegments(possession) {
  const intervals = Array.isArray(possession)
    ? possession
    : Array.isArray(possession?.intervals)
      ? possession.intervals
      : [];
  const segments = [...intervals];
  if (possession?.activeTeam && Number.isFinite(possession.activeStart) && Number.isFinite(possession.activeEnd)) {
    segments.push({
      team: possession.activeTeam,
      start: possession.activeStart,
      end: possession.activeEnd,
    });
  }
  return segments.filter(segment => (
    (segment.team === 'home' || segment.team === 'away')
    && Number.isFinite(Number(segment.start))
    && Number.isFinite(Number(segment.end))
    && Number(segment.end) >= Number(segment.start)
  ));
}

/**
 * @param {string} matchId
 * @param {object|Array<object>|null|undefined} possession
 * @param {{clubId: string, userId: string}} context
 * @returns {Array<object>}
 */
export function mapPossessionToCloudRows(matchId, possession, context) {
  return possessionToSegments(possession).map(segment => ({
    match_id: matchId,
    club_id: context.clubId,
    team: segment.team,
    start_ms: secondsToMs(segment.start),
    end_ms: secondsToMs(segment.end),
    created_by: context.userId,
  }));
}

/**
 * @param {Array<object>} rows
 * @returns {object}
 */
export function mapCloudPossessionsToLocal(rows = []) {
  return {
    activeTeam: null,
    activeStart: null,
    activeEnd: null,
    intervals: rows.map(row => ({
      team: row.team,
      start: msToSeconds(row.start_ms),
      end: msToSeconds(row.end_ms),
    })),
  };
}

/**
 * @param {string} matchId
 * @param {Array<object>} sequences
 * @param {{clubId: string, userId: string}} context
 * @returns {Array<object>}
 */
export function mapSequencesToCloudRows(matchId, sequences = [], context) {
  return sequences.map(sequence => ({
    ...(UUID_RE.test(String(sequence.id || '')) ? { id: sequence.id } : {}),
    match_id: matchId,
    club_id: context.clubId,
    start_ms: secondsToMs(sequence.start),
    end_ms: secondsToMs(sequence.end),
    team: sequence.team || null,
    result: sequence.result || null,
    phases_count: Number(sequence.phases ?? sequence.phases_count) || 0,
    start_zone: sequence.zoneStart || sequence.startZone || null,
    end_zone: sequence.zoneEnd || sequence.endZone || null,
    created_by: context.userId,
  }));
}

/**
 * @param {Array<object>} rows
 * @returns {Array<object>}
 */
export function mapCloudSequencesToLocal(rows = []) {
  return rows.map(row => ({
    id: row.id,
    start: msToSeconds(row.start_ms),
    end: msToSeconds(row.end_ms),
    duration: Number((msToSeconds(row.end_ms) - msToSeconds(row.start_ms)).toFixed(2)),
    team: row.team,
    result: row.result || '',
    phases: Number(row.phases_count) || 0,
    zoneStart: row.start_zone || null,
    zoneEnd: row.end_zone || null,
  }));
}

/**
 * @param {object} client
 * @param {object} syncService
 * @param {object} operation
 */
async function applyOrEnqueue(client, syncService, operation) {
  try {
    await applyCloudOperation(client, operation);
  } catch {
    await syncService.enqueue(operation);
  }
}

/**
 * @param {object} context
 * @param {object} match
 * @returns {Array<object>}
 */
function buildFullSyncOperations(context, match) {
  const base = { clubId: context.clubId, userId: context.userId };
  const operations = [
    {
      matchId: match.id,
      entity: 'matches',
      action: 'upsert',
      status: 'pending_sync',
      dedupeKey: `matches:${match.id}`,
      payload: mapLocalMatchToCloud(match, base),
    },
  ];
  const videoPayload = buildVideoReferencePayload(match.id, match.video);
  if (videoPayload) {
    operations.push({
      matchId: match.id,
      entity: 'video_references',
      action: 'upsert',
      status: 'pending_sync',
      dedupeKey: `video_references:${match.id}`,
      payload: videoPayload,
    });
  }
  return operations;
}

/**
 * @param {object} context
 * @param {object} match
 * @returns {Array<object>}
 */
function buildFullDetailSyncOperations(context, match) {
  return [
    ...buildFullSyncOperations(context, match),
    ...buildUpdateOperations(context, match, {
      events: match.events || [],
      possession: match.possession,
      sequences: match.sequences || [],
      coachNotes: match.coachNotes || '',
    }),
  ];
}

/**
 * @param {object} context
 * @param {object} match
 * @param {object} updates
 * @returns {Array<object>}
 */
function buildUpdateOperations(context, match, updates) {
  const base = { clubId: context.clubId, userId: context.userId };
  const operations = [];
  const matchKeys = ['homeTeam', 'awayTeam', 'date', 'competition', 'venue', 'status', 'homeScore', 'awayScore', 'score', 'scoreAdjustment', 'scoreOverride'];
  if (matchKeys.some(key => Object.prototype.hasOwnProperty.call(updates, key))) {
    operations.push({
      matchId: match.id,
      entity: 'matches',
      action: 'upsert',
      status: 'pending_sync',
      dedupeKey: `matches:${match.id}`,
      payload: mapLocalMatchToCloud(match, base),
    });
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'video')) {
    const payload = buildVideoReferencePayload(match.id, match.video);
    if (payload) {
      operations.push({
        matchId: match.id,
        entity: 'video_references',
        action: 'upsert',
        status: 'pending_sync',
        dedupeKey: `video_references:${match.id}`,
        payload,
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'events')) {
    operations.push({
      matchId: match.id,
      entity: 'match_events',
      action: 'replace',
      status: 'pending_sync',
      dedupeKey: `match_events:${match.id}:replace`,
      payload: (match.events || []).map(event => mapLocalEventToCloud(event, { matchId: match.id, ...base })),
    });
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'possession')) {
    operations.push({
      matchId: match.id,
      entity: 'match_possessions',
      action: 'replace',
      status: 'pending_sync',
      dedupeKey: `match_possessions:${match.id}:replace`,
      payload: mapPossessionToCloudRows(match.id, match.possession, base),
    });
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'sequences')) {
    operations.push({
      matchId: match.id,
      entity: 'match_sequences',
      action: 'replace',
      status: 'pending_sync',
      dedupeKey: `match_sequences:${match.id}:replace`,
      payload: mapSequencesToCloudRows(match.id, match.sequences || [], base),
    });
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'coachNotes')) {
    operations.push({
      matchId: match.id,
      entity: 'match_notes',
      action: 'replace',
      status: 'pending_sync',
      dedupeKey: `match_notes:${match.id}:replace`,
      payload: {
        match_id: match.id,
        club_id: context.clubId,
        author_id: context.userId,
        content: match.coachNotes || '',
      },
    });
  }
  return operations;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getCloudErrorMessage(error) {
  return error instanceof Error && error.message ? error.message : 'Error de sync cloud';
}

/**
 * @param {object} client
 * @param {number} page
 * @param {number} pageSize
 * @returns {Promise<object>}
 */
async function fetchCloudMatchSummaries(client, page, pageSize, clubId = '') {
  const query = client.from('matches').select('*, video_references(*), match_events(count)');
  let scoped = query;
  if (clubId && typeof scoped.eq === 'function') {
    scoped = scoped.eq('club_id', clubId);
  }
  let ordered = typeof scoped.order === 'function'
    ? scoped.order('created_at', { ascending: false })
    : scoped;
  if (ordered && typeof ordered.then === 'function') ordered = await ordered;
  if (ordered && typeof ordered.range === 'function') {
    const from = page * pageSize;
    return ordered.range(from, from + pageSize - 1);
  }
  return ordered;
}

/**
 * @param {Array<object>} matches
 * @param {object} status
 */
function announceHomeMatchesUpdated(matches, status) {
  markStartup('cloud-sync:update-matches', { count: matches.length });
  if (typeof CustomEvent === 'function') {
    globalThis.window?.dispatchEvent?.(new CustomEvent('bigu:home-matches-updated', {
      detail: { matches, status },
    }));
  }
}

/**
 * @param {string} label
 * @param {object} [detail]
 */
function markCloud(label, detail = {}) {
  markStartup(label, detail);
}

/**
 * @param {{clientSource?: Promise<object>|object|function(): Promise<object>, localApi?: object, syncService?: object, accessProvider?: function(): object|null}} [deps]
 */
export function createCloudMatchService(deps = {}) {
  const localApi = deps.localApi || globalThis.window?.api;
  const activeSyncService = deps.syncService || defaultSyncService;
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  let listCache = {
    key: '',
    fetchedAt: 0,
  };
  let lastListStatus = {
    source: 'cache',
    partial: false,
    total: 0,
    cached: 0,
    page: 0,
    pageSize: CLOUD_LIST_PAGE_SIZE,
    hasMore: false,
    fromCache: false,
    errors: [],
  };

  function setLastListStatus(status) {
    lastListStatus = {
      source: 'cache',
      partial: false,
      total: 0,
      cached: 0,
      page: 0,
      pageSize: CLOUD_LIST_PAGE_SIZE,
      hasMore: false,
      fromCache: false,
      errors: [],
      ...status,
    };
    if (typeof CustomEvent === 'function') {
      globalThis.window?.dispatchEvent?.(new CustomEvent('bigu:cloud-list-status', {
        detail: lastListStatus,
      }));
    }
  }

  function readClubIdFromAccess(access = {}) {
    return String(access?.profile?.club_id || access?.club?.id || '');
  }

  async function getKnownAccessClubId() {
    if (deps.accessProvider) return readClubIdFromAccess(deps.accessProvider());
    try {
      const accessGuard = await import('../auth/access-guard.js');
      return readClubIdFromAccess(accessGuard.getAccessState?.());
    } catch {
      return '';
    }
  }

  async function syncOperations(operations, context) {
    for (const operation of operations) {
      await applyOrEnqueue(context.client, activeSyncService, operation);
    }
  }

  async function applyBackfillOperations(operations, context) {
    let appliedAll = true;
    for (const operation of operations) {
      try {
        await applyCloudOperation(context.client, operation);
      } catch {
        appliedAll = false;
        await activeSyncService.enqueue(operation);
      }
    }
    return appliedAll;
  }

  async function downloadMatchDetail(matchId) {
    const context = await resolveCloudContext(deps);
    const [matchResult, eventsResult, possessionsResult, sequencesResult, notesResult] = await Promise.all([
      context.client.from('matches').select('*, video_references(*)').eq('id', matchId).single(),
      context.client.from('match_events').select('*').eq('match_id', matchId).order('timestamp_ms', { ascending: true }),
      context.client.from('match_possessions').select('*').eq('match_id', matchId).order('start_ms', { ascending: true }),
      context.client.from('match_sequences').select('*').eq('match_id', matchId).order('start_ms', { ascending: true }),
      context.client.from('match_notes').select('*').eq('match_id', matchId).order('updated_at', { ascending: false }),
    ]);
    assertSupabaseOk(matchResult);
    assertSupabaseOk(eventsResult);
    assertSupabaseOk(possessionsResult);
    assertSupabaseOk(sequencesResult);
    assertSupabaseOk(notesResult);

    const local = {
      ...mapCloudMatchToLocal(matchResult.data),
      events: (eventsResult.data || []).map(mapCloudEventToLocal),
      possession: mapCloudPossessionsToLocal(possessionsResult.data || []),
      sequences: mapCloudSequencesToLocal(sequencesResult.data || []),
      coachNotes: notesResult.data?.[0]?.content || '',
    };
    return localApi.matches.upsertCache(local);
  }

  function isVisibleForClub(match, clubId = '') {
    const matchClubId = String(match?.cloud?.clubId || match?.clubId || match?.club_id || '');
    return !clubId || !matchClubId || matchClubId === String(clubId);
  }

  async function getNormalizedLocalMatches(clubId = '') {
    const matches = await localApi.matches.getAll();
    return (Array.isArray(matches) ? matches : [])
      .filter(Boolean)
      .map(normalizeMatchForHome)
      .filter(match => match.id && isVisibleForClub(match, clubId));
  }

  /**
   * @param {object} left
   * @param {object} right
   * @returns {boolean}
   */
  function isMatchNewer(left, right) {
    const leftTime = new Date(left?.updatedAt || left?.createdAt || 0).getTime();
    const rightTime = new Date(right?.updatedAt || right?.createdAt || 0).getTime();
    return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime > rightTime;
  }

  /**
   * @param {Array<object>} cachedBefore
   * @param {Array<object>} cloudRows
   * @param {object} context
   * @param {number} page
   * @param {number} pageSize
   */
  async function removeDeletedCloudMatches(cachedBefore, cloudRows, context, page, pageSize) {
    if (page !== 0 || cloudRows.length === pageSize || typeof localApi.matches.delete !== 'function') return;
    const cloudIds = new Set(cloudRows.map(row => String(row.id || '')).filter(Boolean));
    for (const match of cachedBefore) {
      if (!match?.id || !match.cloud?.clubId || match.cloud.clubId !== context.clubId) continue;
      if (!cloudIds.has(String(match.id))) {
        await localApi.matches.delete(match.id);
      }
    }
  }

  /**
   * @param {Array<object>} localMatches
   * @param {Array<object>} refreshedMatches
   * @returns {Array<object>}
   */
  function mergeRefreshedCloudMatches(localMatches, refreshedMatches) {
    const merged = [...localMatches];
    for (const refreshed of refreshedMatches) {
      if (!refreshed?.id) continue;
      const index = merged.findIndex(match => String(match.id) === String(refreshed.id));
      if (index >= 0) {
        merged[index] = { ...merged[index], ...refreshed };
      } else {
        merged.push(refreshed);
      }
    }
    return merged.map(normalizeMatchForHome).filter(match => match.id);
  }

  /**
   * @param {Array<object>} cachedMatches
   * @param {Set<string>} cloudIds
   * @param {object} context
   * @returns {Promise<{backfilled: number, errors: Array<object>}>}
   */
  async function backfillLegacyLocalMatches(cachedMatches, cloudIds, context) {
    if (typeof localApi.matches?.getById !== 'function') return { backfilled: 0, errors: [] };
    let backfilled = 0;
    const errors = [];
    const candidates = cachedMatches.filter(match => (
      match?.id
      && !match.corrupt
      && !match.cloud?.clubId
      && !cloudIds.has(String(match.id))
    ));

    for (const candidate of candidates) {
      try {
        const fullMatch = await localApi.matches.getById(candidate.id);
        if (!fullMatch?.id || fullMatch.cloud?.clubId) continue;
        const applied = await applyBackfillOperations(buildFullDetailSyncOperations(context, fullMatch), context);
        if (applied && typeof localApi.matches?.upsertCache === 'function') {
          await localApi.matches.upsertCache({
            ...fullMatch,
            cloud: {
              clubId: context.clubId,
              createdBy: fullMatch.createdBy || fullMatch.cloud?.createdBy || context.userId,
            },
          });
        }
        if (applied) backfilled += 1;
      } catch (error) {
        errors.push({
          matchId: candidate.id,
          message: getCloudErrorMessage(error),
        });
      }
    }

    return { backfilled, errors };
  }

  /**
   * @param {{page: number, pageSize: number, cacheKey: string, forceRefresh?: boolean, announce?: boolean}} options
   * @returns {Promise<Array<object>>}
   */
  async function refreshCloudList(options) {
    const { page, pageSize, cacheKey } = options;
    let refreshedCloudMatches = [];
    let visibleClubId = '';
    markCloud('cloud:home:list-start', { page, pageSize });
    if (!isBrowserOffline()) {
      try {
        const context = await timeStartup('supabase:resolve-cloud-context', () => resolveCloudContext(deps));
        visibleClubId = context.clubId;
        const scopedCacheKey = `${context.clubId}:${cacheKey}`;
        const freshCache = listCache.key === scopedCacheKey && now() - listCache.fetchedAt < CLOUD_LIST_CACHE_TTL_MS;
        if (!freshCache || options.forceRefresh) {
          const flushResult = await timeStartup('cloud:flush-pending-sync', () => activeSyncService.flushPendingSync?.());
          if (flushResult) markCloud('sync:flush-result', flushResult);
          const cachedBefore = await getNormalizedLocalMatches(context.clubId);
          markCloud('cloud:match:sync-pull', { clubId: context.clubId, page, pageSize });
          const result = await timeStartup('supabase:list-matches', () => fetchCloudMatchSummaries(context.client, page, pageSize, context.clubId));
          assertSupabaseOk(result);
          const rows = result.data || [];
          const errors = [];
          let cached = 0;
          const refreshed = [];
          for (const row of rows) {
            try {
              const incoming = mapCloudMatchSummaryToLocal(row);
              const existing = cachedBefore.find(match => String(match.id) === String(incoming.id));
              let visibleSummary = existing || incoming;
              if (!existing || !isMatchNewer(existing, incoming)) {
                await localApi.matches.upsertCache(incoming);
                visibleSummary = incoming;
              }
              refreshed.push(normalizeMatchForHome(visibleSummary || incoming));
              cached += 1;
            } catch (error) {
              errors.push({
                matchId: row?.id || '',
                message: getCloudErrorMessage(error),
              });
            }
          }
          refreshedCloudMatches = refreshed;
          await removeDeletedCloudMatches(cachedBefore, rows, context, page, pageSize);
          const backfillResult = page === 0
            ? await backfillLegacyLocalMatches(cachedBefore, new Set(rows.map(row => String(row.id || '')).filter(Boolean)), context)
            : { backfilled: 0, errors: [] };
          listCache = {
            key: scopedCacheKey,
            fetchedAt: now(),
          };
          setLastListStatus({
            source: 'cloud',
            partial: errors.length + backfillResult.errors.length > 0,
            total: rows.length,
            cached,
            backfilled: backfillResult.backfilled,
            page,
            pageSize,
            hasMore: rows.length === pageSize,
            fromCache: false,
            initialCloudSyncPending: false,
            hasCloudSession: true,
            errors: [...errors, ...backfillResult.errors],
          });
          markCloud('cloud:home:matches-count', { count: rows.length, cached });
        } else {
          setLastListStatus({
            ...lastListStatus,
            page,
            pageSize,
            fromCache: true,
            initialCloudSyncPending: false,
          });
        }
      } catch (error) {
        const message = getCloudErrorMessage(error);
        markCloud('cloud:rls-or-query-error', { message });
        setLastListStatus({
          source: 'cache',
          partial: true,
          page,
          pageSize,
          fromCache: true,
          initialCloudSyncPending: false,
          hasCloudSession: !/no hay sesion/i.test(message),
          errors: [{ matchId: '', message }],
        });
      }
    } else {
      setLastListStatus({
        source: 'cache',
        partial: false,
        page,
        pageSize,
        fromCache: true,
        initialCloudSyncPending: false,
        hasCloudSession: false,
        errors: [],
      });
    }
    const matches = mergeRefreshedCloudMatches(await getNormalizedLocalMatches(visibleClubId), refreshedCloudMatches);
    markCloud('cloud:home:list-end', { count: matches.length, source: lastListStatus.source, partial: lastListStatus.partial });
    if (options.announce !== false) {
      announceHomeMatchesUpdated(matches, { ...lastListStatus, errors: [...lastListStatus.errors] });
    }
    return matches;
  }

  return {
    async listMatches(options = {}) {
      const page = Math.max(0, Number(options.page) || 0);
      const pageSize = Math.max(1, Math.min(100, Number(options.pageSize) || CLOUD_LIST_PAGE_SIZE));
      const cacheKey = `${page}:${pageSize}`;
      if (options.localFirst) {
        const shouldRefreshInBackground = options.refreshInBackground === true && !isBrowserOffline();
        setLastListStatus({
          source: 'cache',
          partial: false,
          page,
          pageSize,
          fromCache: true,
          initialCloudSyncPending: shouldRefreshInBackground,
          hasCloudSession: shouldRefreshInBackground,
          errors: [],
        });
        const knownClubId = await getKnownAccessClubId();
        const localMatches = await timeStartup('data:matches-local-cache', () => getNormalizedLocalMatches(knownClubId));
        if (shouldRefreshInBackground) {
          refreshCloudList({ page, pageSize, cacheKey, forceRefresh: true, announce: true }).catch(() => {});
        }
        return localMatches;
      }
      return refreshCloudList({ page, pageSize, cacheKey, forceRefresh: options.forceRefresh, announce: true });
    },

    getLastListStatus() {
      return { ...lastListStatus, errors: [...lastListStatus.errors] };
    },

    async hydrateMatchDetails(matchIds = []) {
      if (isBrowserOffline()) return [];
      const hydrated = [];
      for (const matchId of matchIds) {
        if (!matchId) continue;
        try {
          hydrated.push(await downloadMatchDetail(matchId));
        } catch (error) {
          setLastListStatus({
            ...lastListStatus,
            partial: true,
            errors: [
              ...lastListStatus.errors,
              { matchId, message: getCloudErrorMessage(error) },
            ],
          });
        }
      }
      return hydrated;
    },

    async createMatch(data) {
      const match = await localApi.matches.create(data);
      markCloud('cloud:match:create', { matchId: match.id });
      try {
        const context = await resolveCloudContext(deps);
        markCloud('cloud:match:sync-push', { matchId: match.id, entity: 'matches' });
        await syncOperations(buildFullSyncOperations(context, match), context);
      } catch {
        const fallbackContext = {
          clubId: '',
          userId: '',
        };
        for (const operation of buildFullSyncOperations(fallbackContext, match)) {
          await activeSyncService.enqueue(operation);
        }
      }
      return match;
    },
    async getMatchById(matchId, options = {}) {
      if (options.localFirst && typeof localApi.matches?.getById === 'function') {
        try {
          const cachedMatch = await timeStartup('data:match-local-cache', () => localApi.matches.getById(matchId));
          if (cachedMatch) return cachedMatch;
        } catch {
          // Continue with the cloud detail path when the local cache is unavailable.
        }
      }
      if (!isBrowserOffline()) {
        try {
          return await downloadMatchDetail(matchId);
        } catch {
          // Use cache if cloud is unreachable.
        }
      }
      return localApi.matches.getById(matchId);
    },

    async updateMatch(matchId, updates) {
      const match = await localApi.matches.update(matchId, updates);
      try {
        const context = await resolveCloudContext(deps);
        markCloud('cloud:match:sync-push', { matchId: match.id, entity: 'matches' });
        await syncOperations(buildUpdateOperations(context, match, updates), context);
      } catch {
        const pending = buildUpdateOperations({ clubId: '', userId: '' }, match, updates);
        for (const operation of pending) await activeSyncService.enqueue(operation);
      }
      return match;
    },

    async deleteMatch(matchId) {
      try {
        const context = await resolveCloudContext(deps);
        await applyOrEnqueue(context.client, activeSyncService, {
          matchId,
          entity: 'matches',
          action: 'delete',
          status: 'pending_sync',
          dedupeKey: `matches:${matchId}:delete`,
          payload: { id: matchId },
        });
      } catch {
        await activeSyncService.enqueue({
          matchId,
          entity: 'matches',
          action: 'delete',
          status: 'pending_sync',
          dedupeKey: `matches:${matchId}:delete`,
          payload: { id: matchId },
        });
      }
      return localApi.matches.delete(matchId);
    },
  };
}

export const cloudMatchService = createCloudMatchService();
