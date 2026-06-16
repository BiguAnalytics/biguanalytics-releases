// @ts-check
import { getSupabaseClient } from '../auth/supabase-client.js';
import { assertSupabaseOk, resolveClient } from './cloud-context.js';

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
 * @param {{clientSource?: Promise<object>|object|function(): Promise<object>, localApi?: object}} [deps]
 */
export function createSyncService(deps = {}) {
  const clientSource = deps.clientSource || getSupabaseClient;
  const localApi = deps.localApi || globalThis.window?.api;

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
      const client = await resolveClient(clientSource);
      await applyCloudOperation(client, operation);
    },

    /**
     * @returns {Promise<{applied: number, failed: number}>}
     */
    async flushPendingSync() {
      const pending = await localApi.matches.getPendingSync();
      if (!pending.length) return { applied: 0, failed: 0 };
      const client = await resolveClient(clientSource);
      const appliedIds = [];
      let failed = 0;

      for (const operation of pending) {
        try {
          await applyCloudOperation(client, operation);
          appliedIds.push(operation.id);
        } catch {
          failed += 1;
        }
      }

      if (appliedIds.length > 0) {
        await localApi.matches.markPendingSyncApplied(appliedIds);
      }
      return { applied: appliedIds.length, failed };
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
