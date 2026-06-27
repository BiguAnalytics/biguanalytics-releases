// @ts-check
import { assertSupabaseOk, resolveCloudContext } from './cloud-context.js';
import { applyCloudOperation, syncService as defaultSyncService } from './sync-service.js';
import { mapLocalMatchToCloud, normalizeMatchForHome } from './match-mapper.js';
import { markStartup } from '../startup-timing.js';
import { normalizeFieldZone } from '../field-zones.js';

/**
 * @param {number|null|undefined} seconds
 * @returns {number|null}
 */
function secondsToMs(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) : null;
}

/**
 * @param {number|null|undefined} ms
 * @returns {number|null}
 */
function msToSeconds(ms) {
  const value = Number(ms);
  return Number.isFinite(value) && value >= 0 ? value / 1000 : null;
}

/**
 * @param {object|null|undefined} source
 * @returns {{zone: string|null, zoneId: string|null, zoneLabel: string|null, legacyZone?: string}}
 */
function normalizeEventZonePayload(source = {}) {
  const normalized = normalizeFieldZone(source);
  if (!normalized) return { zone: null, zoneId: null, zoneLabel: null };
  return {
    zone: normalized.id,
    zoneId: normalized.id,
    zoneLabel: normalized.label,
    ...(normalized.originalZone ? { legacyZone: normalized.originalZone } : {}),
  };
}

/**
 * @param {object} event
 * @param {{matchId: string, clubId: string, userId: string}} context
 * @returns {object}
 */
export function mapLocalEventToCloud(event, context) {
  const zonePayload = normalizeEventZonePayload(event);
  return {
    id: event.id,
    match_id: context.matchId,
    club_id: context.clubId,
    created_by: event.createdBy || event.created_by || context.userId,
    timestamp_ms: secondsToMs(event.timestamp),
    event_type: event.type || event.event_type || '',
    team: event.team || null,
    result: event.result || null,
    subtype: event.subtype || null,
    zone: zonePayload.zone,
    note: event.note || null,
    payload: { ...event, ...zonePayload },
    created_at: event.createdAt || event.created_at || undefined,
    updated_at: event.updatedAt || event.updated_at || new Date().toISOString(),
  };
}

/**
 * @param {object} row
 * @returns {object}
 */
export function mapCloudEventToLocal(row) {
  const payload = row.payload || {};
  const zonePayload = normalizeEventZonePayload({
    ...payload,
    zone: row.zone || payload.zone || payload.zoneId,
  });
  return {
    ...payload,
    id: row.id,
    timestamp: msToSeconds(row.timestamp_ms),
    type: row.event_type,
    team: row.team,
    result: row.result || '',
    subtype: row.subtype || '',
    ...zonePayload,
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
 * @param {object} localApi
 * @param {object} status
 */
async function announceLocalHomeUpdate(localApi, status = {}) {
  if (typeof CustomEvent !== 'function' || typeof localApi.matches?.getAll !== 'function') return;
  try {
    const matches = (await localApi.matches.getAll()).map(normalizeMatchForHome);
    globalThis.window?.dispatchEvent?.(new CustomEvent('bigu:home-matches-updated', {
      detail: { matches, status },
    }));
  } catch {
    // Home refresh should never block tagging.
  }
}

/**
 * @param {object} syncService
 * @param {object} operation
 */
async function enqueuePending(syncService, operation) {
  await syncService.enqueue({
    status: 'pending_sync',
    ...operation,
    status: 'pending_sync',
  });
}

/**
 * @param {{clientSource?: Promise<object>|object|function(): Promise<object>, localApi?: object, syncService?: object, accessProvider?: function(): object|null}} [deps]
 */
export function createCloudEventService(deps = {}) {
  const localApi = deps.localApi || globalThis.window?.api;
  const activeSyncService = deps.syncService || defaultSyncService;

  return {
    async syncMatchMetadata(matchId, context) {
      if (typeof localApi.matches?.getById !== 'function') return null;
      const match = await localApi.matches.getById(matchId);
      const operation = {
        matchId,
        entity: 'matches',
        action: 'upsert',
        status: 'pending_sync',
        dedupeKey: `matches:${matchId}`,
        payload: mapLocalMatchToCloud(match, {
          clubId: context.clubId,
          userId: context.userId,
        }),
      };
      await applyOrEnqueue(context.client, activeSyncService, operation);
      return match;
    },

    async syncEvent(matchId, event) {
      const context = await resolveCloudContext(deps);
      const payload = mapLocalEventToCloud(event, {
        matchId,
        clubId: context.clubId,
        userId: context.userId,
      });
      const operation = {
        matchId,
        entity: 'match_events',
        action: 'upsert',
        status: 'pending_sync',
        dedupeKey: `match_events:${event.id}`,
        payload,
      };
      await applyOrEnqueue(context.client, activeSyncService, operation);
      await this.syncMatchMetadata(matchId, context);
      return event;
    },

    async enqueueEventSync(matchId, event) {
      await enqueuePending(activeSyncService, {
        matchId,
        entity: 'match_events',
        action: 'upsert',
        dedupeKey: `match_events:${event.id}`,
        payload: mapLocalEventToCloud(event, {
          matchId,
          clubId: '',
          userId: '',
        }),
      });
      if (typeof localApi.matches?.getById !== 'function') return;
      const match = await localApi.matches.getById(matchId);
      await enqueuePending(activeSyncService, {
        matchId,
        entity: 'matches',
        action: 'upsert',
        dedupeKey: `matches:${matchId}`,
        payload: mapLocalMatchToCloud(match, {
          clubId: '',
          userId: '',
        }),
      });
    },

    async addEvent(matchId, eventData) {
      const event = await localApi.events.add(matchId, eventData);
      try {
        await this.syncEvent(matchId, event);
      } catch (error) {
        try {
          await this.enqueueEventSync(matchId, event);
        } catch (enqueueError) {
          markStartup('cloud:rls-or-query-error', {
            message: enqueueError instanceof Error ? enqueueError.message.slice(0, 160) : String(enqueueError || error || 'sync failed'),
          });
        }
      }
      await announceLocalHomeUpdate(localApi, { source: 'local-event', partial: false });
      return event;
    },

    async updateEvent(matchId, eventId, updates) {
      const event = await localApi.events.update(matchId, eventId, updates);
      try {
        await this.syncEvent(matchId, event);
      } catch (error) {
        try {
          await this.enqueueEventSync(matchId, event);
        } catch (enqueueError) {
          markStartup('cloud:rls-or-query-error', {
            message: enqueueError instanceof Error ? enqueueError.message.slice(0, 160) : String(enqueueError || error || 'sync failed'),
          });
        }
      }
      await announceLocalHomeUpdate(localApi, { source: 'local-event', partial: false });
      return event;
    },

    async deleteEvent(matchId, eventId) {
      await localApi.events.delete(matchId, eventId);
      try {
        const context = await resolveCloudContext(deps);
        const operation = {
          matchId,
          entity: 'match_events',
          action: 'delete',
          status: 'pending_sync',
          dedupeKey: `match_events:${eventId}:delete`,
          payload: { id: eventId },
        };
        await applyOrEnqueue(context.client, activeSyncService, operation);
        await this.syncMatchMetadata(matchId, context);
      } catch (error) {
        try {
          await enqueuePending(activeSyncService, {
            matchId,
            entity: 'match_events',
            action: 'delete',
            dedupeKey: `match_events:${eventId}:delete`,
            payload: { id: eventId },
          });
          if (typeof localApi.matches?.getById === 'function') {
            const match = await localApi.matches.getById(matchId);
            await enqueuePending(activeSyncService, {
              matchId,
              entity: 'matches',
              action: 'upsert',
              dedupeKey: `matches:${matchId}`,
              payload: mapLocalMatchToCloud(match, {
                clubId: '',
                userId: '',
              }),
            });
          }
        } catch (enqueueError) {
          markStartup('cloud:rls-or-query-error', {
            message: enqueueError instanceof Error ? enqueueError.message.slice(0, 160) : String(enqueueError || error || 'sync failed'),
          });
        }
      }
      await announceLocalHomeUpdate(localApi, { source: 'local-event', partial: false });
    },

    async downloadEvents(matchId) {
      const context = await resolveCloudContext(deps);
      const result = await context.client
        .from('match_events')
        .select('*')
        .eq('match_id', matchId)
        .order('timestamp_ms', { ascending: true });
      assertSupabaseOk(result);
      return (result.data || []).map(mapCloudEventToLocal);
    },
  };
}

export const cloudEventService = createCloudEventService();
