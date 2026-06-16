// @ts-check
const path = require('path');
const { DEV_LICENSE_PUBLIC_KEY } = require('./dev-keys');
const { verifyJws } = require('./jws');
const { createSecureFileStore } = require('./secure-file');

const OFFLINE_RECEIPT_FILE = path.join('auth', 'offline-receipt.bin');
const FIRST_ACTIVATION_MESSAGE = 'Necesitás conectarte a internet para activar BiguAnalytics por primera vez.';

function buildDenied(state, reason, extra = {}) {
  return { state, reason, allowed: false, ...extra };
}

/**
 * @param {object} receipt
 * @returns {object}
 */
function getSignedComparableReceipt(receipt) {
  return {
    version: receipt.version,
    userId: receipt.userId,
    licenseId: receipt.licenseId,
    deviceIdHash: receipt.deviceIdHash,
    issuedAt: receipt.issuedAt,
    serverNowAtIssue: receipt.serverNowAtIssue,
    offlineGraceExpiresAt: receipt.offlineGraceExpiresAt,
    maxOfflineHours: receipt.maxOfflineHours,
    scopes: receipt.scopes,
    jti: receipt.jti,
  };
}

/**
 * @param {object} receipt
 * @param {string} publicKey
 * @returns {boolean}
 */
function verifyReceiptSignature(receipt, publicKey) {
  const payload = verifyJws(receipt?.signedToken, publicKey);
  if (!payload) return false;
  return JSON.stringify(getSignedComparableReceipt(receipt)) === JSON.stringify(getSignedComparableReceipt(payload));
}

/**
 * @param {Date} now
 * @param {string} expiresAt
 * @returns {number}
 */
function getHoursRemaining(now, expiresAt) {
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) return 0;
  return Math.max(0, Math.ceil((expires - now.getTime()) / (60 * 60 * 1000)));
}

/**
 * @param {{app: {getPath: (name: string) => string}, safeStorage: object, now?: () => Date, publicKey?: string, allowDevelopmentPublicKeyFallback?: boolean, deviceIdStore: object, clockGuard: object}} deps
 */
function createOfflineGraceService(deps) {
  const now = deps.now || (() => new Date());
  const publicKey = typeof deps.publicKey === 'string' ? deps.publicKey : DEV_LICENSE_PUBLIC_KEY;
  const store = createSecureFileStore({
    app: deps.app,
    safeStorage: deps.safeStorage,
    relativePath: OFFLINE_RECEIPT_FILE,
  });

  async function getReceipt() {
    try {
      return { receipt: await store.readJson() };
    } catch (error) {
      if (error?.code === 'AUTH_FILE_NOT_FOUND') {
        return { missing: true, receipt: null };
      }
      await store.remove();
      return { corrupt: true, receipt: null };
    }
  }

  async function validateReceipt() {
    const current = now();
    const loaded = await getReceipt();
    if (loaded.missing) {
      return buildDenied('activation_required', 'missing_receipt', {
        message: FIRST_ACTIVATION_MESSAGE,
      });
    }
    if (loaded.corrupt) {
      return buildDenied('renewal_required', 'receipt_corrupt', {
        message: 'Conecta internet para renovar acceso.',
      });
    }

    const receipt = loaded.receipt;
    const signatureValid = verifyReceiptSignature(receipt, publicKey)
      || (deps.allowDevelopmentPublicKeyFallback === true && verifyReceiptSignature(receipt, DEV_LICENSE_PUBLIC_KEY));
    if (!signatureValid) {
      return buildDenied('renewal_required', 'invalid_signature', {
        message: 'Conecta internet para renovar acceso.',
      });
    }

    const deviceIdHash = await deps.deviceIdStore.getDeviceIdHash();
    if (receipt.deviceIdHash !== deviceIdHash) {
      return buildDenied('renewal_required', 'device_mismatch', {
        message: 'Conecta internet para renovar acceso.',
      });
    }

    const expiresAt = new Date(receipt.offlineGraceExpiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || current.getTime() > expiresAt.getTime()) {
      return buildDenied('renewal_required', 'offline_grace_expired', {
        offlineGraceExpiresAt: receipt.offlineGraceExpiresAt,
        message: 'Conecta internet para renovar acceso.',
      });
    }

    const clock = await deps.clockGuard.checkAndUpdate();
    if (!clock.ok) {
      return buildDenied('renewal_required', clock.reason, {
        clockRollbackDetected: true,
        message: 'Conecta internet para renovar acceso.',
      });
    }

    return {
      state: 'offline_grace',
      reason: 'receipt_valid',
      allowed: true,
      user: receipt.userId ? { id: receipt.userId, email: receipt.userEmail || '' } : null,
      profile: receipt.userId ? { id: receipt.userId, email: receipt.userEmail || '', club_id: receipt.licenseId } : null,
      club: receipt.licenseId ? { id: receipt.licenseId, name: receipt.clubName || 'Club', slug: receipt.clubSlug || '' } : null,
      device: { status: 'offline_bound' },
      offline: true,
      hoursRemaining: getHoursRemaining(current, receipt.offlineGraceExpiresAt),
      offlineGraceExpiresAt: receipt.offlineGraceExpiresAt,
      maxOfflineHours: receipt.maxOfflineHours,
    };
  }

  return {
    clearReceipt: store.remove,
    filePath: store.filePath,
    saveReceipt: store.writeJson,
    validateReceipt,
  };
}

module.exports = {
  FIRST_ACTIVATION_MESSAGE,
  OFFLINE_RECEIPT_FILE,
  createOfflineGraceService,
  getHoursRemaining,
  verifyReceiptSignature,
};
