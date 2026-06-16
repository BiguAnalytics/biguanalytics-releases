// @ts-check
const crypto = require('crypto');
const { net } = require('electron');
const { DEV_LICENSE_PRIVATE_KEY } = require('./dev-keys');
const { signJws } = require('./jws');

/**
 * @param {unknown} value
 * @returns {string}
 */
function readId(value) {
  return String(value || '').trim();
}

/**
 * @param {object} payload
 * @returns {{userId: string, licenseId: string, userEmail: string, clubName: string, clubSlug: string}}
 */
function normalizeActivationPayload(payload = {}) {
  const user = payload.user || {};
  const profile = payload.profile || {};
  const club = payload.club || {};
  return {
    userId: readId(payload.userId || user.id || profile.id),
    licenseId: readId(payload.licenseId || club.id || profile.club_id),
    userEmail: readId(payload.userEmail || user.email || profile.email),
    clubName: readId(payload.clubName || club.name),
    clubSlug: readId(payload.clubSlug || club.slug),
  };
}

/**
 * @param {object} input
 * @returns {object}
 */
function buildReceiptClaims(input) {
  const serverNow = input.serverNow || new Date();
  const offlineGraceExpiresAt = new Date(serverNow.getTime() + input.maxOfflineHours * 60 * 60 * 1000);
  return {
    version: 1,
    userId: input.userId,
    licenseId: input.licenseId,
    deviceIdHash: input.deviceIdHash,
    issuedAt: serverNow.toISOString(),
    serverNowAtIssue: serverNow.toISOString(),
    offlineGraceExpiresAt: offlineGraceExpiresAt.toISOString(),
    maxOfflineHours: input.maxOfflineHours,
    scopes: ['app:open'],
    jti: crypto.randomUUID(),
  };
}

/**
 * @param {{config: object, now?: () => Date, fetchImpl?: typeof fetch, netModule?: {isOnline?: () => boolean}}} deps
 */
function createLicenseClient(deps) {
  const config = deps.config;
  const now = deps.now || (() => new Date());
  const fetchImpl = deps.fetchImpl || global.fetch;
  const netModule = deps.netModule || net;

  async function verifyWithEndpoint(payload) {
    if (!config.licenseEndpoint || typeof fetchImpl !== 'function') {
      return { status: 'network_error', reason: 'missing_license_endpoint', onlineHint: netModule?.isOnline?.() !== false };
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 10000) : null;
    try {
      const response = await fetchImpl(config.licenseEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
      if (!response.ok) {
        return { status: 'network_error', reason: `http_${response.status}`, onlineHint: netModule?.isOnline?.() !== false };
      }
      const body = await response.json();
      return {
        ...body,
        status: ['valid', 'invalid', 'revoked', 'expired'].includes(body?.status) ? body.status : 'network_error',
        onlineHint: netModule?.isOnline?.() !== false,
      };
    } catch {
      return { status: 'network_error', reason: 'request_failed', onlineHint: netModule?.isOnline?.() !== false };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  return {
    /**
     * @param {object} payload
     * @returns {Promise<object>}
     */
    async verifyOnline(payload = {}) {
      const normalized = normalizeActivationPayload(payload);
      const request = {
        ...normalized,
        deviceIdHash: payload.deviceIdHash,
        maxOfflineHours: config.offlineGraceHours,
      };

      if (config.licenseDevMock) {
        const claims = buildReceiptClaims({
          ...request,
          serverNow: now(),
        });
        return {
          status: 'valid',
          receipt: {
            ...claims,
            userEmail: normalized.userEmail,
            clubName: normalized.clubName,
            clubSlug: normalized.clubSlug,
            signedToken: signJws(claims, DEV_LICENSE_PRIVATE_KEY),
          },
          onlineHint: netModule?.isOnline?.() !== false,
          devMock: true,
        };
      }

      return verifyWithEndpoint(request);
    },
  };
}

module.exports = {
  buildReceiptClaims,
  createLicenseClient,
  normalizeActivationPayload,
};
