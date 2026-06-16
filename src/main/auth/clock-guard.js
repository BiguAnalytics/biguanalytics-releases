// @ts-check
const path = require('path');
const { createSecureFileStore } = require('./secure-file');

const CLOCK_STATE_FILE = path.join('auth', 'clock-state.bin');

/**
 * @param {Date} value
 * @returns {string}
 */
function toIso(value) {
  return value.toISOString();
}

/**
 * @param {{app: {getPath: (name: string) => string}, safeStorage: object, now?: () => Date, toleranceMinutes: number}} deps
 */
function createClockGuard(deps) {
  const now = deps.now || (() => new Date());
  const toleranceMs = Math.max(0, Number(deps.toleranceMinutes) || 0) * 60 * 1000;
  const store = createSecureFileStore({
    app: deps.app,
    safeStorage: deps.safeStorage,
    relativePath: CLOCK_STATE_FILE,
  });

  async function markNow() {
    await store.writeJson({
      version: 1,
      lastClientSeenAt: toIso(now()),
    });
  }

  async function checkAndUpdate() {
    const current = now();
    try {
      const state = await store.readJson();
      const lastSeen = new Date(state.lastClientSeenAt);
      if (!Number.isFinite(lastSeen.getTime())) {
        return { ok: false, reason: 'clock_state_corrupt', clockRollbackDetected: true };
      }
      if (current.getTime() + toleranceMs < lastSeen.getTime()) {
        return { ok: false, reason: 'clock_rollback_detected', clockRollbackDetected: true };
      }
    } catch (error) {
      if (error?.code !== 'AUTH_FILE_NOT_FOUND') {
        return { ok: false, reason: 'clock_state_corrupt', clockRollbackDetected: true };
      }
    }

    await markNow();
    return { ok: true, reason: 'clock_ok', clockRollbackDetected: false };
  }

  return {
    checkAndUpdate,
    filePath: store.filePath,
    markNow,
    remove: store.remove,
  };
}

module.exports = {
  CLOCK_STATE_FILE,
  createClockGuard,
};
