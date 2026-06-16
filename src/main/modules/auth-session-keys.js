// @ts-check
const AUTH_SESSION_STORAGE_KEY = 'bigu-license-auth';
const AUTH_SESSION_ALLOWED_SUFFIXES = new Set([
  '',
  '-code-verifier',
  '-user',
]);

/**
 * @param {unknown} key
 * @returns {string}
 */
function validateAuthSessionKey(key) {
  const normalized = String(key || '').trim();
  const suffix = normalized.startsWith(AUTH_SESSION_STORAGE_KEY)
    ? normalized.slice(AUTH_SESSION_STORAGE_KEY.length)
    : null;
  if (!AUTH_SESSION_ALLOWED_SUFFIXES.has(suffix)) {
    throw new Error('Clave de sesion invalida.');
  }
  return normalized;
}

module.exports = {
  AUTH_SESSION_STORAGE_KEY,
  validateAuthSessionKey,
};
