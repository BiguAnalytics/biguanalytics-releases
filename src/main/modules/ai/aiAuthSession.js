// @ts-check
const { AUTH_SESSION_STORAGE_KEY } = require('../auth-session-keys');
const { getSupabaseConfig } = require('../env');

const SESSION_EXPIRED_MESSAGE = 'Tu sesión expiró. Volvé a iniciar sesión.';

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function parseStoredValue(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * @param {unknown} value
 * @returns {object|null}
 */
function findSession(value) {
  const parsed = parseStoredValue(value);
  if (!parsed) return null;
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const found = findSession(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof parsed !== 'object') return null;
  if (typeof parsed.access_token === 'string' && parsed.access_token.trim()) return parsed;
  const candidates = [
    parsed.currentSession,
    parsed.session,
    parsed.data?.session,
    parsed.data?.currentSession,
    parsed.data,
  ];
  for (const candidate of candidates) {
    const found = findSession(candidate);
    if (found) return found;
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function findAccessToken(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      return findAccessToken(JSON.parse(trimmed));
    } catch {
      return '';
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAccessToken(item);
      if (found) return found;
    }
    return '';
  }
  if (typeof value === 'object') {
    if (typeof value.access_token === 'string' && value.access_token.trim()) {
      return value.access_token.trim();
    }
    if (value.currentSession) {
      const found = findAccessToken(value.currentSession);
      if (found) return found;
    }
    if (value.session) {
      const found = findAccessToken(value.session);
      if (found) return found;
    }
    if (value.data) {
      const found = findAccessToken(value.data);
      if (found) return found;
    }
  }
  return '';
}

/**
 * @param {object|null} session
 * @returns {string}
 */
function getRefreshToken(session) {
  return typeof session?.refresh_token === 'string' ? session.refresh_token.trim() : '';
}

/**
 * @param {object|null} session
 * @returns {string|null}
 */
function getSessionUserId(session) {
  return session?.user?.id || session?.user_id || session?.sub || null;
}

/**
 * @param {object|null} session
 * @returns {number|null}
 */
function getExpiresAtMs(session) {
  const rawValue = session?.expires_at ?? session?.expiresAt;
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return rawValue > 1e12 ? rawValue : rawValue * 1000;
  }
  if (typeof rawValue === 'string' && rawValue.trim()) {
    const numeric = Number(rawValue);
    if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
    const parsed = Date.parse(rawValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * @param {object|null} session
 * @param {{now?: function(): Date, skewSeconds?: number}} [options]
 * @returns {boolean}
 */
function isSupabaseSessionExpired(session, options = {}) {
  const expiresAtMs = getExpiresAtMs(session);
  if (!expiresAtMs) return false;
  const now = options.now || (() => new Date());
  const skewMs = Math.max(0, Number(options.skewSeconds || 0)) * 1000;
  return expiresAtMs <= now().getTime() + skewMs;
}

/**
 * @param {string} token
 * @returns {string}
 */
function maskToken(token) {
  const trimmed = String(token || '').trim();
  return trimmed ? `***${trimmed.slice(-4)}` : '';
}

/**
 * @param {{logger?: {info?: function(string): void}, debug?: boolean}} options
 * @param {object} event
 */
function logAuthDebug(options, event) {
  const shouldLog = options.debug === true
    || (options.debug !== false && process.env.NODE_ENV === 'development')
    || process.env.BIGU_AI_AUTH_DEBUG === 'true';
  if (!shouldLog) return;
  const logger = options.logger || console;
  logger.info?.(`[ai-auth] ${JSON.stringify(event)}`);
}

/**
 * @param {unknown} stored
 * @param {object} refreshedSession
 * @returns {unknown}
 */
function mergeRefreshedSession(stored, refreshedSession) {
  const parsed = parseStoredValue(stored);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (Object.prototype.hasOwnProperty.call(parsed, 'currentSession')) {
      return { ...parsed, currentSession: refreshedSession };
    }
    if (Object.prototype.hasOwnProperty.call(parsed, 'session')) {
      return { ...parsed, session: refreshedSession };
    }
    if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
      return { ...parsed, data: { ...parsed.data, session: refreshedSession } };
    }
  }
  return refreshedSession;
}

/**
 * @param {object} session
 * @returns {object|null}
 */
function normalizeRefreshedSession(session) {
  if (!session || typeof session !== 'object') return null;
  if (session.session && typeof session.session === 'object') return normalizeRefreshedSession(session.session);
  if (session.data?.session && typeof session.data.session === 'object') return normalizeRefreshedSession(session.data.session);
  return typeof session.access_token === 'string' && session.access_token.trim() ? session : null;
}

/**
 * @param {string} refreshToken
 * @param {{fetchImpl?: typeof fetch, getConfig?: function(): {supabaseUrl: string, supabasePublishableKey: string}}} [options]
 * @returns {Promise<object|null>}
 */
async function refreshSupabaseSession(refreshToken, options = {}) {
  const token = String(refreshToken || '').trim();
  if (!token) return null;
  const config = (options.getConfig || getSupabaseConfig)();
  const supabaseUrl = String(config.supabaseUrl || '').replace(/\/+$/, '');
  const supabasePublishableKey = String(config.supabasePublishableKey || '').trim();
  const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!supabaseUrl || !supabasePublishableKey || typeof fetchImpl !== 'function') return null;

  const response = await fetchImpl(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${supabasePublishableKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: token }),
  });
  if (!response.ok) return null;
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return normalizeRefreshedSession(data);
}

/**
 * @param {{get: function(string): Promise<string|null>, set?: function(string, string): Promise<unknown>}} store
 * @param {{
 *   now?: function(): Date,
 *   refreshSession?: function(string): Promise<object|null>,
 *   logger?: {info?: function(string): void},
 *   debug?: boolean,
 * }} [options]
 * @returns {Promise<string>}
 */
async function getStoredSupabaseAccessToken(store, options = {}) {
  const stored = await store.get(AUTH_SESSION_STORAGE_KEY);
  const session = findSession(stored);
  const accessToken = findAccessToken(session || stored);
  const userId = getSessionUserId(session);
  const expired = session ? isSupabaseSessionExpired(session, { now: options.now }) : false;

  logAuthDebug(options, {
    hasSession: Boolean(session),
    hasAccessToken: Boolean(accessToken),
    accessToken: maskToken(accessToken),
    userId,
    expired,
    action: expired ? 'refresh' : 'read',
  });

  if (accessToken && !expired) return accessToken;

  const refreshToken = getRefreshToken(session);
  if (refreshToken) {
    const refreshSession = options.refreshSession || refreshSupabaseSession;
    const refreshed = normalizeRefreshedSession(await refreshSession(refreshToken));
    const refreshedAccessToken = findAccessToken(refreshed);
    if (refreshedAccessToken) {
      if (typeof store.set === 'function') {
        await store.set(AUTH_SESSION_STORAGE_KEY, JSON.stringify(mergeRefreshedSession(stored, refreshed)));
      }
      logAuthDebug(options, {
        hasSession: true,
        hasAccessToken: true,
        accessToken: maskToken(refreshedAccessToken),
        userId: getSessionUserId(refreshed) || userId,
        expired: false,
        action: 'refreshed',
      });
      return refreshedAccessToken;
    }
  }

  logAuthDebug(options, {
    hasSession: Boolean(session),
    hasAccessToken: false,
    userId,
    expired: true,
    action: 'missing-session',
  });
  throw new Error(SESSION_EXPIRED_MESSAGE);
}

module.exports = {
  SESSION_EXPIRED_MESSAGE,
  findAccessToken,
  getStoredSupabaseAccessToken,
  isSupabaseSessionExpired,
  refreshSupabaseSession,
};
