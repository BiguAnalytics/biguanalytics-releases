// @ts-check
const { getCaseInsensitiveEnvValue, loadMainEnvironment } = require('../modules/env');

const DEFAULT_OFFLINE_GRACE_HOURS = 72;
const MIN_OFFLINE_GRACE_HOURS = 24;
const MAX_OFFLINE_GRACE_HOURS = 72;
const CLOCK_ROLLBACK_TOLERANCE_MINUTES = 5;

/**
 * @param {string|number|null|undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/**
 * @param {string|number|null|undefined} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampHours(value, min, max) {
  return Math.min(max, Math.max(min, normalizeNumber(value, DEFAULT_OFFLINE_GRACE_HOURS)));
}

/**
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
function parseBoolean(value) {
  return /^(1|true|yes)$/i.test(String(value || '').trim());
}

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
function normalizePem(value) {
  return String(value || '').replace(/\\n/g, '\n').trim();
}

/**
 * @param {{env?: Record<string, string|undefined>, processInfo?: {defaultApp?: boolean, argv?: Array<string>}}} [deps]
 */
function getAuthConfig(deps = {}) {
  if (!deps.env) loadMainEnvironment();
  const env = deps.env || process.env;
  const processInfo = deps.processInfo || process;
  const minOfflineGraceHours = normalizeNumber(
    getCaseInsensitiveEnvValue(env, 'BIGU_MIN_OFFLINE_GRACE_HOURS'),
    MIN_OFFLINE_GRACE_HOURS
  );
  const maxOfflineGraceHours = normalizeNumber(
    getCaseInsensitiveEnvValue(env, 'BIGU_MAX_OFFLINE_GRACE_HOURS'),
    MAX_OFFLINE_GRACE_HOURS
  );
  const explicitMock = getCaseInsensitiveEnvValue(env, 'BIGU_LICENSE_DEV_MOCK');
  const developmentRuntime = Boolean(processInfo.defaultApp || processInfo.argv?.includes('--dev') || env.VITEST);
  const requestedDevMock = explicitMock === undefined ? developmentRuntime : parseBoolean(explicitMock);

  return {
    offlineGraceHours: clampHours(
      getCaseInsensitiveEnvValue(env, 'BIGU_OFFLINE_GRACE_HOURS'),
      minOfflineGraceHours,
      maxOfflineGraceHours
    ),
    minOfflineGraceHours,
    maxOfflineGraceHours,
    clockRollbackToleranceMinutes: normalizeNumber(
      getCaseInsensitiveEnvValue(env, 'BIGU_CLOCK_ROLLBACK_TOLERANCE_MINUTES'),
      CLOCK_ROLLBACK_TOLERANCE_MINUTES
    ),
    licenseEndpoint: String(getCaseInsensitiveEnvValue(env, 'BIGU_LICENSE_ENDPOINT') || '').trim(),
    licensePublicKey: normalizePem(getCaseInsensitiveEnvValue(env, 'BIGU_LICENSE_PUBLIC_KEY')),
    licenseDevMock: Boolean(developmentRuntime && requestedDevMock),
  };
}

module.exports = {
  CLOCK_ROLLBACK_TOLERANCE_MINUTES,
  DEFAULT_OFFLINE_GRACE_HOURS,
  MAX_OFFLINE_GRACE_HOURS,
  MIN_OFFLINE_GRACE_HOURS,
  clampHours,
  getAuthConfig,
  normalizePem,
};
