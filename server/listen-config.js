// @ts-check

const DEFAULT_AI_BACKEND_HOST = '127.0.0.1';
const DEFAULT_AI_BACKEND_PORT = 8787;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const NETWORK_HOSTS = new Set(['0.0.0.0', '::']);
const PRODUCTION_REQUIRED_ENV_KEYS = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const DEV_PUBLIC_REQUIRED_ENV_KEYS = ['GEMINI_API_KEY', 'ALLOWED_CLIENT_TOKENS'];

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizePort(value) {
  const port = Number(value || DEFAULT_AI_BACKEND_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Puerto IA invalido.');
  }
  return port;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isEnabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

/**
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} env
 * @returns {boolean}
 */
function isProductionEnv(env) {
  return String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

/**
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} env
 * @returns {string}
 */
function getDefaultAIBackendHost(env) {
  return isProductionEnv(env) && isEnabled(env.AI_BACKEND_EXPOSE_NETWORK)
    ? '0.0.0.0'
    : DEFAULT_AI_BACKEND_HOST;
}

/**
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} env
 * @returns {Array<string>}
 */
function getMissingPublicBackendEnvKeys(env) {
  const required = isProductionEnv(env) || String(env.SUPABASE_URL || env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    ? PRODUCTION_REQUIRED_ENV_KEYS
    : DEV_PUBLIC_REQUIRED_ENV_KEYS;
  return required.filter(key => !String(env[key] || '').trim());
}

/**
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} env
 * @returns {void}
 */
function assertPublicBackendEnv(env) {
  const missing = getMissingPublicBackendEnvKeys(env);
  if (missing.length > 0) {
    throw new Error(`Public AI backend startup requires ${missing.join(', ')}.`);
  }
}

/**
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env]
 * @returns {{host: string, port: number}}
 */
function getAIBackendListenConfig(env = process.env) {
  const host = String(env.AI_BACKEND_HOST || env.HOST || getDefaultAIBackendHost(env)).trim();
  const port = normalizePort(env.PORT);

  if (!LOOPBACK_HOSTS.has(host) && !NETWORK_HOSTS.has(host)) {
    throw new Error('Host IA invalido.');
  }

  if (NETWORK_HOSTS.has(host) && !isEnabled(env.AI_BACKEND_EXPOSE_NETWORK)) {
    throw new Error('AI backend network exposure requires AI_BACKEND_EXPOSE_NETWORK=true.');
  }

  if (NETWORK_HOSTS.has(host) || isProductionEnv(env)) {
    assertPublicBackendEnv(env);
  }

  return { host, port };
}

module.exports = {
  DEFAULT_AI_BACKEND_HOST,
  DEFAULT_AI_BACKEND_PORT,
  assertPublicBackendEnv,
  getDefaultAIBackendHost,
  getMissingPublicBackendEnvKeys,
  getAIBackendListenConfig,
};
