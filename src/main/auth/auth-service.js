// @ts-check
const { app, safeStorage } = require('electron');
const { createClockGuard } = require('./clock-guard');
const { getAuthConfig } = require('./config');
const { DEV_LICENSE_PUBLIC_KEY } = require('./dev-keys');
const { createDeviceIdStore } = require('./device-id');
const { createLicenseClient } = require('./license-client');
const { createLocalAccessSnapshotService } = require('./local-access-snapshot');
const { createOfflineGraceService } = require('./offline-grace');
const { getStartupTimer } = require('../modules/startup-timing');

const ONLINE_CHECK_TIMEOUT_MS = 10000;
const ALLOWED_PROFILE_STATUSES = new Set(['approved']);
const ALLOWED_LICENSE_STATUSES = new Set(['active', 'trial']);
const ALLOWED_DEVICE_STATUSES = new Set(['approved']);
const REJECTED_DEVICE_STATUSES = new Set(['blocked', 'rejected', 'revoked']);
const PROFILE_ROLE_VALUES = new Set(['jugador', 'entrenador', 'analista', 'staff', 'otro']);
const PLAYER_POSITION_VALUES = new Set([
  'pilar',
  'hooker',
  'segunda_linea',
  'ala',
  'octavo',
  'medio_scrum',
  'apertura',
  'centro',
  'wing',
  'fullback',
  'otro',
]);

function getAccessUser(payload = {}, receipt = {}) {
  const user = payload.user || {};
  const profile = payload.profile || {};
  return {
    id: receipt.userId || payload.userId || user.id || profile.id || '',
    email: receipt.userEmail || payload.userEmail || user.email || profile.email || '',
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function readStatus(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function readText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

/**
 * @param {unknown} value
 * @param {Set<string>} allowed
 * @returns {string}
 */
function readAllowedValue(value, allowed) {
  const normalized = readText(value).toLowerCase();
  return allowed.has(normalized) ? normalized : '';
}

/**
 * @param {object|null|undefined} profile
 * @returns {boolean}
 */
function isProfilePersonalInfoComplete(profile = {}) {
  if (profile.profile_complete === true || profile.personal_info_complete === true) return true;
  const firstName = readText(profile.first_name);
  const lastName = readText(profile.last_name);
  const age = Number(profile.age);
  const appRole = readAllowedValue(profile.app_role, PROFILE_ROLE_VALUES);
  const expectedPlayer = appRole === 'jugador';
  const position = readAllowedValue(profile.position, PLAYER_POSITION_VALUES);
  return Boolean(
    firstName
      && lastName
      && Number.isFinite(age)
      && age >= 12
      && age <= 100
      && appRole
      && typeof profile.is_player === 'boolean'
      && profile.is_player === expectedPlayer
      && (!expectedPlayer || position)
  );
}

/**
 * @param {Date} now
 * @param {number} hours
 * @param {string|null|undefined} clubExpiresAt
 * @returns {string}
 */
function buildOfflineGraceExpiresAt(now, hours, clubExpiresAt) {
  const graceExpiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const clubExpiry = clubExpiresAt ? new Date(clubExpiresAt) : null;
  if (clubExpiry && Number.isFinite(clubExpiry.getTime()) && clubExpiry.getTime() < graceExpiresAt.getTime()) {
    return clubExpiry.toISOString();
  }
  return graceExpiresAt.toISOString();
}

/**
 * @param {string} state
 * @param {string} reason
 * @param {object} payload
 * @returns {object}
 */
function buildLocalBlockedAccess(state, reason, payload = {}) {
  return {
    state,
    allowed: false,
    reason,
    blockReason: reason,
    user: payload.user || null,
    profile: payload.profile || null,
    club: payload.club || null,
    device: payload.device || null,
    localSource: 'local_access_snapshot',
    offlineGraceExpiresAt: payload.offlineGraceExpiresAt || '',
  };
}

/**
 * @param {object} payload
 * @param {Date} current
 * @returns {object|null}
 */
function validateSupabaseLocalAccessPayload(payload = {}, current) {
  const user = payload.user || {};
  const profile = payload.profile || {};
  const club = payload.club || {};
  const device = payload.device || {};
  const profileStatus = readStatus(profile.status);
  const licenseStatus = readStatus(club.license_status);
  const deviceStatus = readStatus(device.status);

  if (!user.id || !profile.id || !club.id || !device.id) {
    return buildLocalBlockedAccess('activation_required', 'missing_local_identity', payload);
  }
  if (!ALLOWED_PROFILE_STATUSES.has(profileStatus)) {
    return buildLocalBlockedAccess('blocked_user', profileStatus ? `profile_${profileStatus}` : 'profile_not_approved', payload);
  }
  if (!isProfilePersonalInfoComplete(profile)) {
    return buildLocalBlockedAccess('personal_info_required', 'profile_incomplete', payload);
  }
  if (!ALLOWED_LICENSE_STATUSES.has(licenseStatus)) {
    const state = licenseStatus === 'expired' ? 'expired_license' : 'suspended_license';
    return buildLocalBlockedAccess(state, licenseStatus ? `license_${licenseStatus}` : 'license_not_active', payload);
  }
  const clubExpiry = club.expires_at ? new Date(club.expires_at) : null;
  if (clubExpiry && Number.isFinite(clubExpiry.getTime()) && clubExpiry.getTime() <= current.getTime()) {
    return buildLocalBlockedAccess('expired_license', 'license_expired', payload);
  }
  if (device.revoked_at || deviceStatus === 'revoked') {
    return buildLocalBlockedAccess('blocked_device', 'device_revoked', payload);
  }
  if (deviceStatus === 'pending') {
    return buildLocalBlockedAccess('pending_device', 'device_pending', payload);
  }
  if (REJECTED_DEVICE_STATUSES.has(deviceStatus)) {
    const reasonStatus = deviceStatus === 'blocked' ? 'rejected' : deviceStatus;
    return buildLocalBlockedAccess('blocked_device', `device_${reasonStatus}`, payload);
  }
  if (!ALLOWED_DEVICE_STATUSES.has(deviceStatus)) {
    return buildLocalBlockedAccess('blocked_device', deviceStatus ? `device_${deviceStatus}` : 'device_not_approved', payload);
  }
  return null;
}

/**
 * @param {object|null|undefined} access
 * @returns {boolean}
 */
function isAllowedLocalGrace(access) {
  return access?.state === 'offline_grace' && access.allowed !== false;
}

/**
 * @param {object|null|undefined} access
 * @returns {object}
 */
function getSafeLocalAccessDebug(access) {
  return {
    state: access?.state || 'missing',
    reason: access?.reason || '',
    localState: access?.localState || '',
    localSource: access?.localSource || '',
    userId: access?.user?.id || access?.profile?.id || '',
    userEmail: access?.user?.email || access?.profile?.email || '',
    clubId: access?.club?.id || access?.profile?.club_id || '',
    clubName: access?.club?.name || '',
    lastVerifiedAt: access?.lastVerifiedAt || '',
    offlineGraceExpiresAt: access?.offlineGraceExpiresAt || '',
    graceValid: isAllowedLocalGrace(access),
    blockReason: access?.blockReason || access?.reason || '',
  };
}

function getAccessClub(payload = {}, receipt = {}) {
  const club = payload.club || {};
  const profile = payload.profile || {};
  return {
    id: receipt.licenseId || payload.licenseId || club.id || profile.club_id || '',
    name: receipt.clubName || payload.clubName || club.name || 'Club',
    slug: receipt.clubSlug || payload.clubSlug || club.slug || '',
  };
}

/**
 * @param {string} status
 * @param {string} reason
 */
function mapInvalidLicense(status, reason) {
  return {
    state: 'invalid_license',
    allowed: false,
    reason: reason || (status === 'expired' ? 'license_expired' : `license_${status}`),
    message: 'Licencia revocada o invalida.',
  };
}

/**
 * @param {object} payload
 * @param {object} denied
 * @returns {object}
 */
function buildDeniedAccess(payload = {}, denied = {}) {
  return {
    ...denied,
    user: payload.user || null,
    profile: payload.profile || null,
    club: payload.club || null,
    device: payload.device || null,
  };
}

/**
 * @param {{app?: object, safeStorage?: object, now?: () => Date, config?: object, licenseClient?: object}} [deps]
 */
function createAuthAccessService(deps = {}) {
  const electronApp = deps.app || app;
  const activeSafeStorage = deps.safeStorage || safeStorage;
  const now = deps.now || (() => new Date());
  const config = deps.config || getAuthConfig();
  const startupTimer = getStartupTimer();
  const publicKey = config.licensePublicKey || (config.licenseDevMock ? DEV_LICENSE_PUBLIC_KEY : '');
  const deviceIdStore = createDeviceIdStore({ app: electronApp, safeStorage: activeSafeStorage });
  const clockGuard = createClockGuard({
    app: electronApp,
    safeStorage: activeSafeStorage,
    now,
    toleranceMinutes: config.clockRollbackToleranceMinutes,
  });
  const offlineGrace = createOfflineGraceService({
    app: electronApp,
    safeStorage: activeSafeStorage,
    now,
    publicKey,
    allowDevelopmentPublicKeyFallback: config.licenseDevMock === true,
    deviceIdStore,
    clockGuard,
  });
  const localAccessSnapshot = createLocalAccessSnapshotService({
    app: electronApp,
    safeStorage: activeSafeStorage,
    now,
  });
  const licenseClient = deps.licenseClient || createLicenseClient({ config, now });

  /**
   * @param {string} label
   * @param {object} [detail]
   */
  function markDebug(label, detail = {}) {
    startupTimer.mark(label, detail);
  }

  /**
   * @param {object} access
   * @returns {object}
   */
  function finalizeLocalAccess(access) {
    const debug = getSafeLocalAccessDebug(access);
    markDebug('local-access:user', { id: debug.userId, email: debug.userEmail });
    markDebug('local-access:club', { id: debug.clubId, name: debug.clubName });
    markDebug('local-access:status', {
      state: debug.state,
      reason: debug.reason,
      localState: debug.localState,
      localSource: debug.localSource,
    });
    markDebug('local-access:lastVerifiedAt', { lastVerifiedAt: debug.lastVerifiedAt });
    markDebug('local-access:offlineGraceExpiresAt', { offlineGraceExpiresAt: debug.offlineGraceExpiresAt });
    markDebug('local-access:grace-valid', { valid: debug.graceValid });
    if (debug.graceValid) {
      markDebug('license:enter-from-local-grace', {
        localSource: debug.localSource,
        offlineGraceExpiresAt: debug.offlineGraceExpiresAt,
      });
    } else {
      markDebug('license:block-reason', {
        state: debug.state,
        reason: debug.blockReason,
      });
    }
    markDebug('local-access:read:end');
    return access;
  }

  /**
   * @param {object} access
   * @returns {Promise<object>}
   */
  async function validateClockForLocalAccess(access) {
    if (!isAllowedLocalGrace(access)) return access;
    const clock = await clockGuard.checkAndUpdate();
    if (clock.ok) return access;
    return {
      ...access,
      state: 'renewal_required',
      allowed: false,
      reason: clock.reason,
      blockReason: clock.reason,
      clockRollbackDetected: true,
      message: 'Conecta internet para renovar acceso.',
    };
  }

  async function validateOfflineFallback() {
    markDebug('local-access:read:start');
    const deviceIdHash = await deviceIdStore.getDeviceIdHash();
    const hardDenial = await localAccessSnapshot.getHardDenial();
    if (hardDenial) return finalizeLocalAccess(hardDenial);

    const receiptAccess = await offlineGrace.validateReceipt();
    if (isAllowedLocalGrace(receiptAccess)) {
      const snapshotAccess = await localAccessSnapshot.getOfflineGrace({ deviceIdHash });
      if (!isAllowedLocalGrace(snapshotAccess)) {
        return finalizeLocalAccess(snapshotAccess || {
          ...receiptAccess,
          state: 'renewal_required',
          allowed: false,
          reason: 'missing_local_profile_snapshot',
          blockReason: 'missing_local_profile_snapshot',
        });
      }
      return finalizeLocalAccess({
        ...snapshotAccess,
        reason: receiptAccess.reason,
        localState: 'active',
        localSource: 'offline_receipt',
      });
    }
    if (receiptAccess.reason !== 'missing_receipt') {
      return finalizeLocalAccess(receiptAccess);
    }

    const snapshotAccess = await localAccessSnapshot.getOfflineGrace({
      deviceIdHash,
    });
    if (snapshotAccess) {
      return finalizeLocalAccess(await validateClockForLocalAccess(snapshotAccess));
    }
    return finalizeLocalAccess(receiptAccess);
  }

  /**
   * @param {object} payload
   * @param {string} deviceIdHash
   * @returns {Promise<object|null>}
   */
  async function createSupabaseLocalGrace(payload = {}, deviceIdHash = '') {
    const current = now();
    const denied = validateSupabaseLocalAccessPayload(payload, current);
    if (denied) {
      await offlineGrace.clearReceipt();
      await localAccessSnapshot.saveDenied(denied);
      return denied;
    }

    const offlineGraceExpiresAt = buildOfflineGraceExpiresAt(current, config.offlineGraceHours, payload.club?.expires_at);
    const access = {
      state: 'active',
      allowed: true,
      reason: 'supabase_local_grace',
      user: payload.user || null,
      profile: payload.profile || null,
      club: payload.club || null,
      device: payload.device || null,
      offlineGraceExpiresAt,
      maxOfflineHours: config.offlineGraceHours,
      localSource: 'local_access_snapshot',
      lastVerifiedAt: current.toISOString(),
    };
    await offlineGrace.clearReceipt();
    await clockGuard.markNow();
    await localAccessSnapshot.saveAllowed(access, null, { deviceIdHash });
    return access;
  }

  /**
   * @param {object} payload
   * @param {{fallbackOnNetworkError?: boolean}} [options]
   */
  async function runOnlineVerification(payload = {}, options = {}) {
    const deviceIdHash = await deviceIdStore.getDeviceIdHash();
    markDebug('license:online-check:start');
    let onlineCheckTimedOut = false;
    const timeoutId = setTimeout(() => {
      onlineCheckTimedOut = true;
      markDebug('license:online-check:timeout', { timeoutMs: ONLINE_CHECK_TIMEOUT_MS });
    }, ONLINE_CHECK_TIMEOUT_MS);
    let response;
    try {
      response = await licenseClient.verifyOnline({
        ...payload,
        deviceIdHash,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (['invalid', 'revoked', 'expired'].includes(response?.status)) {
      const denied = buildDeniedAccess(payload, mapInvalidLicense(response.status, response.reason));
      await offlineGrace.clearReceipt();
      await localAccessSnapshot.saveDenied(denied);
      markDebug('license:online-check:end', { status: response.status, reason: denied.reason, timedOut: onlineCheckTimedOut });
      return denied;
    }

    const localPayloadDenial = validateSupabaseLocalAccessPayload(payload, now());
    if (localPayloadDenial) {
      await offlineGrace.clearReceipt();
      await localAccessSnapshot.saveDenied(localPayloadDenial);
      markDebug('license:online-check:end', {
        status: response?.status || 'local_denied',
        reason: localPayloadDenial.reason,
        timedOut: onlineCheckTimedOut,
      });
      return localPayloadDenial;
    }

    if (response?.status !== 'valid' || !response.receipt) {
      if (!options.fallbackOnNetworkError) {
        const localGrace = await createSupabaseLocalGrace(payload, deviceIdHash);
        if (localGrace) {
          markDebug('license:online-check:end', {
            status: response?.status || 'local',
            reason: localGrace.reason,
            timedOut: onlineCheckTimedOut,
          });
          return localGrace;
        }
      }
      if (options.fallbackOnNetworkError) return validateOfflineFallback();
      const denied = {
        state: 'network_error',
        allowed: false,
        reason: response?.reason || 'network_error',
        message: 'Conecta internet para renovar acceso.',
      };
      markDebug('license:online-check:end', {
        status: response?.status || 'network_error',
        reason: denied.reason,
        timedOut: onlineCheckTimedOut,
      });
      return denied;
    }

    await offlineGrace.saveReceipt(response.receipt);
    await clockGuard.markNow();
    const user = getAccessUser(payload, response.receipt);
    const club = getAccessClub(payload, response.receipt);
    const access = {
      state: 'active',
      allowed: true,
      reason: 'online_verified',
      user: user.id ? user : null,
      profile: user.id ? { ...(payload.profile || {}), id: user.id, email: user.email, club_id: club.id } : payload.profile || null,
      club: club.id ? { ...(payload.club || {}), ...club } : payload.club || null,
      device: payload.device || { status: 'approved' },
      offlineGraceExpiresAt: response.receipt.offlineGraceExpiresAt,
      maxOfflineHours: response.receipt.maxOfflineHours,
      devMock: Boolean(response.devMock),
    };
    await localAccessSnapshot.saveAllowed(access, response.receipt, { deviceIdHash });
    markDebug('license:online-check:end', { status: response.status, reason: access.reason, timedOut: onlineCheckTimedOut });
    return access;
  }

  return {
    activateOnline(payload = {}) {
      return runOnlineVerification(payload, { fallbackOnNetworkError: false });
    },

    getAccessStatus() {
      return validateOfflineFallback();
    },

    refreshOnline(payload = {}) {
      return runOnlineVerification(payload, { fallbackOnNetworkError: true });
    },

    async revokeLocalAccess(access = {}) {
      const denied = {
        state: access.state || 'invalid_license',
        allowed: false,
        reason: access.reason || 'online_hard_denial',
        user: access.user || null,
        profile: access.profile || null,
        club: access.club || null,
        device: access.device || null,
        offlineGraceExpiresAt: access.offlineGraceExpiresAt || '',
      };
      await offlineGrace.clearReceipt();
      await localAccessSnapshot.saveDenied(denied);
      return denied;
    },

    async logout() {
      await offlineGrace.clearReceipt();
      await localAccessSnapshot.clear();
      await clockGuard.remove();
      return { state: 'activation_required', reason: 'signed_out', allowed: false };
    },
  };
}

function createDefaultAuthAccessService() {
  return createAuthAccessService();
}

module.exports = {
  createAuthAccessService,
  createDefaultAuthAccessService,
};
