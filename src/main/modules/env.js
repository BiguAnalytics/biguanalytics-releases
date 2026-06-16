// @ts-check
const fs = require('fs');
const path = require('path');

let envFilesLoaded = false;
const CANONICAL_ENV_KEYS = new Set([
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'BIGU_LICENSE_ENDPOINT',
  'BIGU_LICENSE_PUBLIC_KEY',
  'BIGU_LICENSE_DEV_MOCK',
  'BIGU_OFFLINE_GRACE_HOURS',
  'BIGU_MIN_OFFLINE_GRACE_HOURS',
  'BIGU_MAX_OFFLINE_GRACE_HOURS',
  'BIGU_CLOCK_ROLLBACK_TOLERANCE_MINUTES',
]);
const ENV_KEY_ALIASES = new Map([
  ['SUPABASE_URL', [
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
  ]],
  ['SUPABASE_PUBLISHABLE_KEY', [
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_PUBLIC_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]],
]);
const ALIAS_TO_CANONICAL_ENV_KEY = new Map(
  [...ENV_KEY_ALIASES.entries()].flatMap(([canonical, aliases]) => aliases.map(alias => [alias, canonical]))
);

const EMPTY_PUBLIC_SUPABASE_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_PUBLISHABLE_KEY: '',
};

/**
 * @param {string} key
 * @returns {string}
 */
function canonicalEnvKey(key) {
  const rawKey = String(key || '').trim();
  const upperKey = rawKey.toUpperCase();
  if (ALIAS_TO_CANONICAL_ENV_KEY.has(upperKey)) return ALIAS_TO_CANONICAL_ENV_KEY.get(upperKey);
  return CANONICAL_ENV_KEYS.has(upperKey) ? upperKey : rawKey;
}

/**
 * @param {string} key
 * @returns {Array<string>}
 */
function getEnvKeyCandidates(key) {
  const canonical = canonicalEnvKey(key).toUpperCase();
  return ENV_KEY_ALIASES.get(canonical) || [canonical];
}

/**
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} env
 * @param {string} key
 * @returns {string|undefined}
 */
function getCaseInsensitiveEnvValue(env, key) {
  const envKeys = Object.keys(env);
  for (const candidate of getEnvKeyCandidates(key)) {
    if (env[candidate]) return env[candidate];
    const found = envKeys.find(name => name.toUpperCase() === candidate);
    if (found && env[found]) return env[found];
  }
  return undefined;
}

/**
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseEnvContent(content) {
  return String(content || '').split(/\r?\n/).reduce((values, rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return values;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = normalized.indexOf('=');
    if (separator <= 0) return values;
    const key = canonicalEnvKey(normalized.slice(0, separator));
    let value = normalized.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
    return values;
  }, {});
}

/**
 * @returns {Array<string>}
 */
function getEnvFileCandidates() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../.env'),
  ];

  try {
    const electron = require('electron');
    const app = electron.app || electron.default?.app;
    if (app?.getPath) {
      candidates.push(path.join(app.getPath('userData'), '.env'));
    }
  } catch {
    // Electron is not available in unit tests that import this module directly.
  }

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, '.env'));
  }
  if (process.execPath) {
    candidates.push(path.join(path.dirname(process.execPath), '.env'));
  }
  return [...new Set(candidates)];
}

/**
 * @param {Record<string, string>} values
 */
function mergeEnvValues(values) {
  Object.entries(values).forEach(([key, value]) => {
    if (!key || !value) return;
    if (!getCaseInsensitiveEnvValue(process.env, key)) {
      process.env[canonicalEnvKey(key)] = value;
    }
  });
}

function loadEnvFiles() {
  if (envFilesLoaded) return;
  envFilesLoaded = true;
  getEnvFileCandidates().forEach((filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        mergeEnvValues(parseEnvContent(fs.readFileSync(filePath, 'utf8')));
      }
    } catch {
      // Ignore unreadable env files and keep using the process environment.
    }
  });
}

function loadMainEnvironment() {
  loadEnvFiles();
}

/**
 * @returns {{SUPABASE_URL?: string, SUPABASE_PUBLISHABLE_KEY?: string}}
 */
function getPublicSupabaseConfig() {
  try {
    return require('../../config/public-env') || EMPTY_PUBLIC_SUPABASE_CONFIG;
  } catch {
    return EMPTY_PUBLIC_SUPABASE_CONFIG;
  }
}

/**
 * @param {string|undefined|null} value
 * @returns {string}
 */
function normalizeSupabaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

/**
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env]
 * @returns {{supabaseUrl: string, supabasePublishableKey: string}}
 */
function getSupabaseConfigFromEnv(env = process.env) {
  return {
    supabaseUrl: normalizeSupabaseUrl(getCaseInsensitiveEnvValue(env, 'SUPABASE_URL')),
    supabasePublishableKey: getCaseInsensitiveEnvValue(env, 'SUPABASE_PUBLISHABLE_KEY') || '',
  };
}

/**
 * @param {{env?: NodeJS.ProcessEnv|Record<string, string|undefined>, publicConfig?: Record<string, string|undefined>}} [options]
 * @returns {{supabaseUrl: string, supabasePublishableKey: string}}
 */
function getSupabaseConfigFromSources(options = {}) {
  const env = options.env || {};
  const publicConfig = options.publicConfig || EMPTY_PUBLIC_SUPABASE_CONFIG;
  const envConfig = getSupabaseConfigFromEnv(env);

  return {
    supabaseUrl: envConfig.supabaseUrl || normalizeSupabaseUrl(getCaseInsensitiveEnvValue(publicConfig, 'SUPABASE_URL')),
    supabasePublishableKey: envConfig.supabasePublishableKey || getCaseInsensitiveEnvValue(publicConfig, 'SUPABASE_PUBLISHABLE_KEY') || '',
  };
}

/**
 * @returns {{supabaseUrl: string, supabasePublishableKey: string}}
 */
function getSupabaseConfig() {
  loadMainEnvironment();
  return getSupabaseConfigFromSources({
    env: process.env,
    publicConfig: getPublicSupabaseConfig(),
  });
}

module.exports = {
  canonicalEnvKey,
  getCaseInsensitiveEnvValue,
  getPublicSupabaseConfig,
  getSupabaseConfig,
  getSupabaseConfigFromEnv,
  getSupabaseConfigFromSources,
  loadMainEnvironment,
  normalizeSupabaseUrl,
  parseEnvContent,
};
