// @ts-check
import { getSupabaseClient } from '../auth/supabase-client.js';

/**
 * @param {Promise<object>|object|function(): Promise<object>} clientSource
 * @returns {Promise<object>}
 */
export async function resolveClient(clientSource = getSupabaseClient) {
  if (typeof clientSource === 'function') return clientSource();
  return clientSource;
}

/**
 * @returns {Promise<object|null>}
 */
async function getDefaultAccessState() {
  try {
    const accessGuard = await import('../auth/access-guard.js');
    return accessGuard.getAccessState?.() || null;
  } catch {
    return null;
  }
}

/**
 * @param {{client?: object, clientSource?: Promise<object>|object|function(): Promise<object>, accessProvider?: function(): object|null}} [deps]
 * @returns {Promise<{client: object, clubId: string, userId: string, profile: object|null}>}
 */
export async function resolveCloudContext(deps = {}) {
  const client = deps.client || await resolveClient(deps.clientSource);
  const access = deps.accessProvider ? deps.accessProvider() : await getDefaultAccessState();
  const userId = access?.user?.id || access?.profile?.id || '';
  const clubId = access?.profile?.club_id || access?.club?.id || '';
  if (userId && clubId) return { client, clubId, userId, profile: access.profile || null };

  const sessionResult = await client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const sessionUserId = sessionResult.data?.session?.user?.id;
  if (!sessionUserId) throw new Error('No hay sesion activa para sincronizar.');

  const profileResult = await client
    .from('profiles')
    .select('*')
    .eq('id', sessionUserId)
    .single();
  if (profileResult.error) throw profileResult.error;
  return {
    client,
    clubId: profileResult.data.club_id,
    userId: sessionUserId,
    profile: profileResult.data,
  };
}

/**
 * @param {object} result
 * @returns {object}
 */
export function assertSupabaseOk(result) {
  if (result?.error) throw result.error;
  return result;
}

/**
 * @returns {boolean}
 */
export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
