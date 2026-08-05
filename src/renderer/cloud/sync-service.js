// @ts-check
import { getSupabaseClient } from '../auth/supabase-client.js';
import { markStartup } from '../startup-timing.js';
import { assertSupabaseOk, resolveClient, resolveCloudContext } from './cloud-context.js';

const CREATED_BY_ENTITIES = new Set(['matches', 'match_events', 'match_possessions', 'match_sequences']);

/**
 * @param {object} client
 * @param {string} entity
 * @param {string} matchId
 * @returns {Promise<Array<string>>}
 */
async function getCloudRowIds(client, entity, matchId) {
  const result = await client.from(entity).select('id').eq('match_id', matchId);
  assertSupabaseOk(result);
  return (result.data || [])
    .map(row => row?.id)
    .filter(Boolean)
    .map(String);
}

/**
 * @param {object} client
 * @param {string} entity
 * @param {Array<string>} ids
 * @returns {Promise<void>}
 */
async function deleteCloudRowsById(client, entity, ids) {
  if (!ids.length) return;
  const query = client.from(entity).delete();
  if (typeof query.in === 'function') {
    assertSupabaseOk(await query.in('id', ids));
    return;
  }
  for (const id of ids) {
    assertSupabaseOk(await client.from(entity).delete().eq('id', id));
  }
}

/**
 * Writes the replacement before deleting stale rows so an insert failure
 * leaves the previous cloud state available for retry.
 * @param {object} client
 * @param {string} entity
 * @param {string} matchId
 * @param {Array<object>} desiredRows
 * @param {'insert'|'upsert'} writeMethod
 * @param {boolean} shouldWrite
 * @returns {Promise<void>}
 */
async function replaceCloudRows(client, entity, matchId, desiredRows, writeMethod, shouldWrite) {
  const existingIds = await getCloudRowIds(client, entity, matchId);
  if (shouldWrite) {
    if (writeMethod === 'upsert') {
      assertSupabaseOk(await client.from(entity).upsert(desiredRows, { onConflict: 'id' }));
    } else {
      assertSupabaseOk(await client.from(entity).insert(desiredRows));
    }
  }
  const desiredIds = new Set(desiredRows.map(row => row?.id).filter(Boolean).map(String));
  await deleteCloudRowsById(client, entity, existingIds.filter(id => !desiredIds.has(id)));
}

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
    const rows = Array.isArray(payload) ? payload : [];
    await replaceCloudRows(client, 'match_events', operation.matchId, rows, 'upsert', rows.length > 0);
    return;
  }
  if (entity === 'match_possessions' && action === 'replace') {
    const rows = Array.isArray(payload) ? payload : [];
    await replaceCloudRows(client, 'match_possessions', operation.matchId, rows, 'insert', rows.length > 0);
    return;
  }
  if (entity === 'match_sequences' && action === 'replace') {
    const rows = Array.isArray(payload) ? payload : [];
    await replaceCloudRows(client, 'match_sequences', operation.matchId, rows, 'insert', rows.length > 0);
    return;
  }
  if (entity === 'match_notes' && action === 'replace') {
    const rows = payload?.content ? [payload] : [];
    await replaceCloudRows(client, 'match_notes', operation.matchId, rows, 'insert', rows.length > 0);
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
 * @param {unknown} error
 * @returns {string}
 */
function getSyncErrorMessage(error) {
  return error instanceof Error && error.message ? error.message : String(error || 'Error de sincronizacion');
}

/**
 * @param {{clientSource?: Promise<object>|object|function(): Promise<object>, localApi?: object}} [deps]
 */
export function createSyncService(deps = {}) {
  const clientSource = deps.client || deps.clientSource || getSupabaseClient;
  const localApi = deps.localApi || globalThis.window?.api;
  let flushPromise = null;

  async function resolveFlushTarget() {
    try {
      const context = await resolveCloudContext(deps);
      return { client: context.client, context };
    } catch {
      return { client: await resolveClient(clientSource), context: null };
    }
  }

  async function recordOperationFailure(operation, error, errors) {
    const message = getSyncErrorMessage(error);
    const failedAt = new Date().toISOString();
    errors.push({ matchId: operation.matchId || '', message });
    markStartup('sync:operation-error', {
      matchId: operation.matchId || '',
      message: message.slice(0, 160),
    });
    try {
      await localApi.matches.enqueuePendingSync({
        ...operation,
        status: 'pending_sync',
        syncStatus: 'error',
        syncError: message,
        failedAt,
        attempts: (Number(operation.attempts) || 0) + 1,
        updatedAt: failedAt,
      });
    } catch (enqueueError) {
      const enqueueMessage = getSyncErrorMessage(enqueueError);
      errors.push({
        matchId: operation.matchId || '',
        message: `No se pudo guardar el error de sync: ${enqueueMessage}`,
      });
      markStartup('sync:enqueue-error', {
        matchId: operation.matchId || '',
        message: enqueueMessage.slice(0, 160),
      });
    }
  }

  async function flushPendingSyncInternal() {
    const pending = await localApi.matches.getPendingSync();
    markStartup('sync:pending-count', { count: pending.length });
    if (!pending.length) {
      markStartup('sync:flush-result', { applied: 0, failed: 0 });
      return { applied: 0, failed: 0 };
    }
    let target;
    try {
      target = await resolveFlushTarget();
    } catch (error) {
      const errors = [];
      for (const operation of pending) await recordOperationFailure(operation, error, errors);
      const result = { applied: 0, failed: pending.length, errors };
      markStartup('sync:flush-result', result);
      return result;
    }
    const appliedIds = [];
    let failed = 0;
    const errors = [];
    const pendingVersions = new Map(pending.map(operation => [
      String(operation.id),
      operation.updatedAt || null,
    ]));

    for (const operation of pending) {
      try {
        const hydrated = target.context ? hydrateOperationContext(operation, target.context) : operation;
        await applyCloudOperation(target.client, hydrated);
        appliedIds.push(operation.id);
      } catch (error) {
        failed += 1;
        await recordOperationFailure(operation, error, errors);
      }
    }

    if (appliedIds.length > 0) {
      const latestPending = await localApi.matches.getPendingSync();
      const latestById = new Map(latestPending.map(operation => [String(operation.id), operation]));
      const unchangedAppliedIds = appliedIds.filter(id => {
        const latest = latestById.get(String(id));
        return latest && (latest.updatedAt || null) === pendingVersions.get(String(id));
      });
      if (unchangedAppliedIds.length > 0) {
        await localApi.matches.markPendingSyncApplied(unchangedAppliedIds);
      }
    }
    const result = { applied: appliedIds.length, failed };
    if (errors.length > 0) result.errors = errors;
    markStartup('sync:flush-result', result);
    return result;
  }

  function flushPendingSync() {
    if (flushPromise) return flushPromise;
    const current = flushPendingSyncInternal();
    const tracked = current.finally(() => {
      if (flushPromise === tracked) flushPromise = null;
    });
    flushPromise = tracked;
    return tracked;
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
    flushPendingSync,

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
