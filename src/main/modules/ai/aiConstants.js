// @ts-check

const AI_MATCH_ANALYSIS_MODEL = 'gemini-2.5-flash-lite';
const AI_GENERATED_BY = 'ai-backend-proxy';
const LOCAL_AI_BACKEND_URL = 'http://localhost:8787';
const PUBLIC_CONFIG = require('../../../config/public-env');
const PRODUCTION_AI_BACKEND_URL = normalizeBackendUrl(PUBLIC_CONFIG.PRODUCTION_AI_BACKEND_URL);
const DEFAULT_AI_BACKEND_URL = PRODUCTION_AI_BACKEND_URL;

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
function normalizeBackendUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

/**
 * @returns {boolean}
 */
function isPackagedElectronRuntime() {
  try {
    const electron = require('electron');
    return Boolean(electron.app?.isPackaged || electron.default?.app?.isPackaged);
  } catch {
    return false;
  }
}

/**
 * @param {{env?: NodeJS.ProcessEnv|Record<string, string|undefined>, isPackaged?: boolean}} [options]
 * @returns {boolean}
 */
function isProductionAIBackendRuntime(options = {}) {
  const env = options.env || process.env;
  const isPackaged = Object.prototype.hasOwnProperty.call(options, 'isPackaged')
    ? Boolean(options.isPackaged)
    : isPackagedElectronRuntime();
  return isPackaged || env.NODE_ENV === 'production';
}

/**
 * @param {{env?: NodeJS.ProcessEnv|Record<string, string|undefined>}} [options]
 * @returns {string}
 */
function getConfiguredDevelopmentAIBackendUrl(options = {}) {
  const env = options.env || process.env;
  return normalizeBackendUrl(env.AI_BACKEND_URL || env.BIGU_AI_BACKEND_URL);
}

/**
 * @param {{env?: NodeJS.ProcessEnv|Record<string, string|undefined>, isPackaged?: boolean}} [options]
 * @returns {string}
 */
function getDefaultAIBackendUrl(options = {}) {
  if (isProductionAIBackendRuntime(options)) return PRODUCTION_AI_BACKEND_URL;
  return getConfiguredDevelopmentAIBackendUrl(options) || LOCAL_AI_BACKEND_URL;
}

/**
 * @param {string|null|undefined} configuredBackendUrl
 * @param {{env?: NodeJS.ProcessEnv|Record<string, string|undefined>, isPackaged?: boolean}} [options]
 * @returns {string}
 */
function resolveAIBackendUrl(configuredBackendUrl, options = {}) {
  if (isProductionAIBackendRuntime(options)) return PRODUCTION_AI_BACKEND_URL;
  return normalizeBackendUrl(configuredBackendUrl) || getDefaultAIBackendUrl(options);
}

module.exports = {
  AI_GENERATED_BY,
  AI_MATCH_ANALYSIS_MODEL,
  DEFAULT_AI_BACKEND_URL,
  LOCAL_AI_BACKEND_URL,
  PRODUCTION_AI_BACKEND_URL,
  getDefaultAIBackendUrl,
  isProductionAIBackendRuntime,
  resolveAIBackendUrl,
};
