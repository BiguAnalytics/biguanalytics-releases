// @ts-check
const { performance } = require('perf_hooks');
let activeStartupTimer = null;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isEnabledValue(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

/**
 * @param {number} value
 * @returns {number}
 */
function roundMs(value) {
  return Math.round(value * 10) / 10;
}

/**
 * @param {{isPackaged?: boolean}|null|undefined} app
 * @returns {boolean}
 */
function isStartupDebugEnabled(app) {
  return isEnabledValue(process.env.BIGU_STARTUP_DEBUG)
    || process.env.NODE_ENV === 'development'
    || process.argv.includes('--dev')
    || app?.isPackaged === false;
}

/**
 * @param {{
 *   app?: {isPackaged?: boolean}|null,
 *   logger?: {info?: function(string): void},
 *   now?: function(): number,
 * }} [options]
 */
function createStartupTimer(options = {}) {
  const now = options.now || (() => performance.now());
  const logger = options.logger || console;
  const start = now();
  let previous = start;

  /**
   * @param {string} label
   * @param {object} [detail]
   */
  function mark(label, detail = {}) {
    const current = now();
    const payload = {
      label,
      totalMs: roundMs(current - start),
      deltaMs: roundMs(current - previous),
      ...detail,
    };
    previous = current;
    if (isStartupDebugEnabled(options.app)) {
      logger.info?.(`[startup] ${JSON.stringify(payload)}`);
    }
    return payload;
  }

  /**
   * @template T
   * @param {string} label
   * @param {function(): Promise<T>} operation
   * @returns {Promise<T>}
   */
  async function timeAsync(label, operation) {
    mark(`${label}:start`);
    try {
      const result = await operation();
      mark(`${label}:end`);
      return result;
    } catch (error) {
      mark(`${label}:error`, {
        error: error instanceof Error ? error.message.slice(0, 160) : String(error || 'unknown'),
      });
      throw error;
    }
  }

  return {
    mark,
    timeAsync,
    isEnabled: () => isStartupDebugEnabled(options.app),
  };
}

function setStartupTimer(timer) {
  activeStartupTimer = timer;
}

function getStartupTimer() {
  if (!activeStartupTimer) {
    activeStartupTimer = createStartupTimer();
  }
  return activeStartupTimer;
}

module.exports = {
  createStartupTimer,
  getStartupTimer,
  isStartupDebugEnabled,
  setStartupTimer,
};
