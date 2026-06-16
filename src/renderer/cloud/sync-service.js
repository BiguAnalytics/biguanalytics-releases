// @ts-check
import { getSupabaseClient } from '../auth/supabase-client.js';
import { markStartup } from '../startup-timing.js';
import { assertSupabaseOk, resolveClient, resolveCloudContext } from './cloud-context.js';

const CREATED_BY_ENTITIES = new Set(['matches', 'match_events', 'match_possessions', 'match_sequences']);

/**
 * @param {object} client
 * @param {object} operation
 * @returns {Promise<void>}
 */
export async function applyCloudOperation(client, operation) {
  const entity = operation.entity;
  const action = operation.action;
  const payload = operation.payload;

  if (entity === 'matches' && action === 'upsert') {
    assertSupabaseOk(await client.from('matches').upsert(payload, { onConflict: 'id' }));
    return;
  }
  if (entity === 'matches' && action === 'delete') {
    assertSupabaseOk(await client.from('matches').delete().eq('id', operation.matchId));
    return;
  }
  if (entity === 'video_references' && action === 'upsert') {
    assertSupabaseOk(await client.from('video_references').upsert(payload, { onConflict: 'match_id' }));
    return;
  }
  if (entity === 'match_events' && action === 'upsert') {
    assertSupabaseOk(await client.from('match_events').upsert(payload, { onConflict: 'id' }));
    return;
  }
  if (entity === 'match_events' && action === 'delete') {
    assertSupabaseOk(await client.from('match_events').delete().eq('id', payload.id));
    return;
  }
  if (entity === 'match_events' && action === 'replace') {
    assertSupabaseOk(await client.from('match_events').delete().eq('match_id', operation.matchId));
    if (Array.isArray(payload) && payload.length > 0) {
      assertSupabaseOk(await client.from('match_events').upsert(payload, { onConflict: 'id' }));
    }
    return;
  }
  if (entity === 'match_possessions' && action === 'replace') {
    assertSupabaseOk(await client.from('match_possessions').delete().eq('match_id', operation.matchId));
    if (Array.isArray(payload) && payload.length > 0) {
      assertSupabaseOk(await client.from('match_possessions').insert(payload));
    }
    return;
  }
  if (entity === 'match_sequences' && action === 'replace') {
    assertSupabaseOk(await client.from('match_sequences').delete().eq('match_id', operation.matchId));
    if (Array.isArray(payload) && payload.length > 0) {
      assertSupabaseOk(await client.from('match_sequences').insert(payload));
    }
    return;
  }
  if (entity === 'match_notes' && action === 'replace') {
    assertSupabaseOk(await client.from('match_notes').delete().eq('match_id', operation.matchId));
    if (payload?.content) {
      assertSupabaseOk(await client.from('match_notes').insert(payload));
    }
    return;
  }

  throw new Error(`Operacion de sync no soportada: ${entity}:${action}`);
}

/**
 * @param {object} payload
 * @param {string} entity
 * @param {{clubId: string, userId: string}} context
 * @returns {object}
 */
function hydratePayloadContext(payload, entity, context) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const next = { ...payload };
  if (['matches', 'match_events', 'match_possessions', 'match_sequences', 'match_notes'].includes(entity) && !next.club_id) {
    next.club_id = context.clubId;
  }
  if (CREATED_BY_ENTITIES.has(entity) && !next.created_by) {
    next.created_by = context.userId;
  }
  if (entity === 'match_notes' && !next.author_id) {
    next.author_id = context.userId;
  }
  return next;
}

/**
 * @param {object} operation
 * @param {{clubId: string, userId: string}} context
 * @returns {object}
 */
export function hydrateOperationContext(operation, context) {
  if (!context?.clubId || !context?.userId) return operation;
  const payload = Array.isArray(operation.payload)
    ? operation.payload.map(item => hydratePayloadContext(item, operation.entity, context))
    : hydratePayloadContext(operation.payload, operation.entity, context);
  return { ...operation, payload };
}

/**
 * @param {{clientSource?: Promise<object>|object|function(): Promise<object>, localApi?: object}} [deps]
 */
export function createSyncService(deps = {}) {
  const clientSource = deps.client || deps.clientSource || getSupabaseClient;
  const localApi = deps.localApi || globalThis.window?.api;

  async function resolveFlushTarget() {
    try {
      const context = await resolveCloudContext(deps);
      return { client: context.client, context };
    } catch {
      return { client: await resolveClient(clientSource), context: null };
    }
  }

  return {
    /**
     * @param {object} operation
     * @returns {Promise<object>}
     */
    async enqueue(operation) {
      return localApi.matches.enqueuePendingSync({
        id: operation.id,
        status: 'pending_sync',
        ...operation,
        status: 'pending_sync',
      });
    },

    /**
     * @param {object} operation
     */
    async applyOperation(operation) {
      const target = await resolveFlushTarget();
      await applyCloudOperation(
        target.client,
        target.context ? hydrateOperationContext(operation, target.context) : operation
      );
    },

    /**
     * @returns {Promise<{applied: number, failed: number}>}
     */
    async flushPendingSync() {
      const pending = await localApi.matches.getPendingSync();
      markStartup('sync:pending-count', { count: pending.length });
      if (!pending.length) {
        markStartup('sync:flush-result', { applied: 0, failed: 0 });
        return { applied: 0, failed: 0 };
      }
      const target = await resolveFlushTarget();
      const appliedIds = [];
      let failed = 0;

      for (const operation of pending) {
        try {
          const hydrated = target.context ? hydrateOperationContext(operation, target.context) : operation;
          await applyCloudOperation(target.client, hydrated);
          appliedIds.push(operation.id);
        } catch {
          failed += 1;
        }
      }

      if (appliedIds.length > 0) {
        await localApi.matches.markPendingSyncApplied(appliedIds);
      }
      const result = { applied: appliedIds.length, failed };
      markStartup('sync:flush-result', result);
      return result;
    },

    startAutoSync() {
      if (typeof window === 'undefined') return () => {};
      const flush = () => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        this.flushPendingSync().catch(() => {});
      };
      window.addEventListener('online', flush);
      window.setTimeout(flush, 0);
      return () => window.removeEventListener('online', flush);
    },
  };
}

export const syncService = createSyncService();
