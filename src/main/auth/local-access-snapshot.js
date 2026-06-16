// @ts-check
const path = require('path');
const { createSecureFileStore } = require('./secure-file');

const LOCAL_ACCESS_SNAPSHOT_FILE = path.join('auth', 'local-access-snapshot.bin');
const HARD_DENIAL_STATES = new Set([
  'blocked_device',
  'blocked_user',
  'expired_license',
  'invalid_license',
  'suspended_license',
]);
const LOCAL_ACCESS_SOURCE = 'local_access_snapshot';
const BLOCKED_PROFILE_STATUSES = new Set(['blocked', 'rejected', 'suspended']);
const BLOCKED_LICENSE_STATUSES = new Set(['expired', 'rejected', 'suspended']);
const BLOCKED_DEVICE_STATUSES = new Set(['blocked', 'rejected', 'revoked', 'suspended']);
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

/**
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeText(value) {
  return String(value || '').trim().slice(0, 160);
}

/**
 * @param {unknown} value
 * @param {Set<string>} allowed
 * @returns {string}
 */
function sanitizeOption(value, allowed) {
  const normalized = sanitizeText(value).toLowerCase();
  return allowed.has(normalized) ? normalized : '';
}

/**
 * @param {string} firstName
 * @param {string} lastName
 * @returns {string}
 */
function buildDisplayName(firstName, lastName) {
  const first = sanitizeText(firstName);
  const last = sanitizeText(lastName);
  if (!first) return '';
  return [first, last ? `${last.charAt(0).toUpperCase()}.` : ''].filter(Boolean).join(' ');
}

/**
 * @param {object|null|undefined} profile
 * @returns {boolean}
 */
function isProfilePersonalInfoComplete(profile = {}) {
  if (profile.profile_complete === true || profile.personal_info_complete === true) return true;
  const firstName = sanitizeText(profile.first_name);
  const lastName = sanitizeText(profile.last_name);
  const age = Number(profile.age);
  const appRole = sanitizeOption(profile.app_role, PROFILE_ROLE_VALUES);
  const expectedPlayer = appRole === 'jugador';
  const position = sanitizeOption(profile.position, PLAYER_POSITION_VALUES);
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
 * @param {object} input
 * @returns {string}
 */
function getDisplayName(input = {}) {
  const profile = input.profile || {};
  const displayName = sanitizeText(profile.display_name);
  const firstName = sanitizeText(profile.first_name);
  const lastName = sanitizeText(profile.last_name);
  return displayName || buildDisplayName(firstName, lastName);
}

/**
 * @param {object} access
 * @param {{now: () => Date, receipt?: object|null, state?: string, reason?: string}} options
 * @returns {object}
 */
function buildSanitizedSnapshot(access = {}, options) {
  const user = access.user || {};
  const profile = access.profile || {};
  const club = access.club || {};
  const device = access.device || {};
  const receipt = options.receipt || {};
  const state = sanitizeText(options.state || access.state || '');
  const reason = sanitizeText(options.reason || access.reason || '');
  const clubId = sanitizeText(club.id || profile.club_id || receipt.licenseId);
  const userId = sanitizeText(user.id || profile.id || receipt.userId);
  const deviceId = sanitizeText(device.id);
  const profileFirstName = sanitizeText(profile.first_name);
  const profileLastName = sanitizeText(profile.last_name);
  const profileAppRole = sanitizeOption(profile.app_role, PROFILE_ROLE_VALUES);
  const profilePosition = sanitizeOption(profile.position, PLAYER_POSITION_VALUES);
  const profileComplete = isProfilePersonalInfoComplete(profile);

  return {
    state,
    reason,
    allowed: state === 'active',
    hardDenied: HARD_DENIAL_STATES.has(state),
    user_id: userId,
    user_email: sanitizeText(user.email || profile.email || receipt.userEmail),
    club_id: clubId,
    club_name: sanitizeText(club.name || receipt.clubName),
    club_slug: sanitizeText(club.slug || receipt.clubSlug),
    device_id: deviceId,
    local_device_id_hash: sanitizeText(options.deviceIdHash || access.localDeviceIdHash),
    profile_status: sanitizeText(profile.status),
    license_status: sanitizeText(club.license_status || (state === 'active' ? 'active' : '')),
    device_status: sanitizeText(device.status),
    profile_complete: profileComplete,
    profile_display_name: getDisplayName({ user, profile }),
    profile_first_name: profileFirstName,
    profile_last_name: profileLastName,
    profile_age: Number.isFinite(Number(profile.age)) ? Number(profile.age) : null,
    profile_app_role: profileAppRole,
    profile_is_player: typeof profile.is_player === 'boolean' ? profile.is_player : null,
    profile_position: profilePosition,
    lastVerifiedAt: options.now().toISOString(),
    offlineGraceExpiresAt: sanitizeText(access.offlineGraceExpiresAt || receipt.offlineGraceExpiresAt),
    lastKnownDisplayName: getDisplayName({ user, profile }),
    lastKnownRole: sanitizeText(profile.app_role || profile.role),
  };
}

/**
 * @param {object} snapshot
 * @returns {object}
 */
function snapshotToDeniedAccess(snapshot = {}) {
  const state = sanitizeText(snapshot.state) || 'invalid_license';
  const reason = sanitizeText(snapshot.reason) || 'cached_hard_denial';
  return {
    state,
    allowed: false,
    reason,
    blockReason: reason,
    localState: state,
    localSource: LOCAL_ACCESS_SOURCE,
    user: snapshot.user_id ? { id: snapshot.user_id, email: snapshot.user_email || '' } : null,
    profile: snapshot.user_id ? {
      id: snapshot.user_id,
      email: snapshot.user_email || '',
      club_id: snapshot.club_id || '',
      status: snapshot.profile_status || '',
      profile_complete: snapshot.profile_complete === true,
      display_name: snapshot.profile_display_name || snapshot.lastKnownDisplayName || '',
      first_name: snapshot.profile_first_name || '',
      last_name: snapshot.profile_last_name || '',
      age: snapshot.profile_age || null,
      app_role: snapshot.profile_app_role || snapshot.lastKnownRole || '',
      is_player: typeof snapshot.profile_is_player === 'boolean' ? snapshot.profile_is_player : null,
      position: snapshot.profile_position || '',
    } : null,
    club: snapshot.club_id ? {
      id: snapshot.club_id,
      name: snapshot.club_name || 'Club',
      slug: snapshot.club_slug || '',
      license_status: snapshot.license_status || '',
    } : null,
    device: snapshot.device_id || snapshot.device_status ? {
      id: snapshot.device_id || '',
      status: snapshot.device_status || '',
    } : null,
    offlineGraceExpiresAt: snapshot.offlineGraceExpiresAt || '',
    lastVerifiedAt: snapshot.lastVerifiedAt || '',
    lastKnownDisplayName: snapshot.lastKnownDisplayName || '',
    lastKnownRole: snapshot.lastKnownRole || '',
  };
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
 * @param {string} state
 * @param {string} reason
 * @param {object} snapshot
 * @returns {object}
 */
function buildBlockedSnapshotAccess(state, reason, snapshot = {}) {
  return {
    ...snapshotToDeniedAccess({
      ...snapshot,
      state,
      reason,
    }),
    state,
    reason,
    blockReason: reason,
  };
}

/**
 * @param {object} snapshot
 * @param {string} currentDeviceIdHash
 * @param {function(): Date} now
 * @returns {object|null}
 */
function snapshotToOfflineGraceAccess(snapshot = {}, currentDeviceIdHash = '', now) {
  if (!snapshot) return null;
  if (snapshot.hardDenied || HARD_DENIAL_STATES.has(snapshot.state)) {
    return snapshotToDeniedAccess(snapshot);
  }
  if (snapshot.state !== 'active' || snapshot.allowed !== true) {
    return buildBlockedSnapshotAccess('renewal_required', 'local_access_not_active', snapshot);
  }
  if (BLOCKED_PROFILE_STATUSES.has(sanitizeText(snapshot.profile_status))) {
    return buildBlockedSnapshotAccess('blocked_user', `profile_${sanitizeText(snapshot.profile_status)}`, snapshot);
  }
  if (snapshot.profile_complete !== true) {
    return buildBlockedSnapshotAccess('personal_info_required', 'profile_incomplete', snapshot);
  }
  if (BLOCKED_LICENSE_STATUSES.has(sanitizeText(snapshot.license_status))) {
    const status = sanitizeText(snapshot.license_status);
    return buildBlockedSnapshotAccess(status === 'expired' ? 'expired_license' : 'suspended_license', `license_${status}`, snapshot);
  }
  if (BLOCKED_DEVICE_STATUSES.has(sanitizeText(snapshot.device_status))) {
    return buildBlockedSnapshotAccess('blocked_device', `device_${sanitizeText(snapshot.device_status)}`, snapshot);
  }
  if (snapshot.device_status && snapshot.device_status !== 'approved') {
    return buildBlockedSnapshotAccess('blocked_device', 'device_not_approved', snapshot);
  }
  if (snapshot.local_device_id_hash && currentDeviceIdHash && snapshot.local_device_id_hash !== currentDeviceIdHash) {
    return buildBlockedSnapshotAccess('renewal_required', 'device_mismatch', snapshot);
  }

  const current = now();
  const expiresAt = new Date(snapshot.offlineGraceExpiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || current.getTime() > expiresAt.getTime()) {
    return buildBlockedSnapshotAccess('renewal_required', 'offline_grace_expired', snapshot);
  }

  return {
    state: 'offline_grace',
    reason: 'snapshot_valid',
    allowed: true,
    localState: snapshot.state,
    localSource: LOCAL_ACCESS_SOURCE,
    user: snapshot.user_id ? { id: snapshot.user_id, email: snapshot.user_email || '' } : null,
    profile: snapshot.user_id ? {
      id: snapshot.user_id,
      email: snapshot.user_email || '',
      club_id: snapshot.club_id || '',
      status: snapshot.profile_status || '',
      profile_complete: true,
      display_name: snapshot.profile_display_name || snapshot.lastKnownDisplayName || '',
      first_name: snapshot.profile_first_name || '',
      last_name: snapshot.profile_last_name || '',
      age: snapshot.profile_age || null,
      app_role: snapshot.profile_app_role || snapshot.lastKnownRole || '',
      is_player: typeof snapshot.profile_is_player === 'boolean' ? snapshot.profile_is_player : null,
      position: snapshot.profile_position || '',
    } : null,
    club: snapshot.club_id ? {
      id: snapshot.club_id,
      name: snapshot.club_name || 'Club',
      slug: snapshot.club_slug || '',
      license_status: snapshot.license_status || '',
    } : null,
    device: snapshot.device_id || snapshot.device_status ? {
      id: snapshot.device_id || '',
      status: snapshot.device_status || '',
    } : null,
    offline: true,
    hoursRemaining: getHoursRemaining(current, snapshot.offlineGraceExpiresAt),
    offlineGraceExpiresAt: snapshot.offlineGraceExpiresAt || '',
    lastVerifiedAt: snapshot.lastVerifiedAt || '',
  };
}

/**
 * @param {{app: {getPath: (name: string) => string}, safeStorage: object, now?: () => Date}} deps
 */
function createLocalAccessSnapshotService(deps) {
  const now = deps.now || (() => new Date());
  const store = createSecureFileStore({
    app: deps.app,
    safeStorage: deps.safeStorage,
    relativePath: LOCAL_ACCESS_SNAPSHOT_FILE,
  });

  async function readSnapshot() {
    try {
      return await store.readJson();
    } catch {
      return null;
    }
  }

  return {
    clear: store.remove,
    filePath: store.filePath,

    /**
     * @param {object} access
     * @param {object} receipt
     */
    async saveAllowed(access = {}, receipt = {}, metadata = {}) {
      await store.writeJson(buildSanitizedSnapshot(access, {
        now,
        receipt,
        state: 'active',
        reason: 'online_verified',
        deviceIdHash: metadata.deviceIdHash,
      }));
    },

    /**
     * @param {object} access
     */
    async saveDenied(access = {}) {
      await store.writeJson(buildSanitizedSnapshot(access, {
        now,
        state: access.state,
        reason: access.reason,
      }));
    },

    async getHardDenial() {
      const snapshot = await readSnapshot();
      if (!snapshot?.hardDenied || !HARD_DENIAL_STATES.has(snapshot.state)) return null;
      return snapshotToDeniedAccess(snapshot);
    },

    async getOfflineGrace(options = {}) {
      const snapshot = await readSnapshot();
      if (!snapshot) return null;
      return snapshotToOfflineGraceAccess(snapshot, options.deviceIdHash || '', now);
    },
  };
}

module.exports = {
  HARD_DENIAL_STATES,
  LOCAL_ACCESS_SOURCE,
  LOCAL_ACCESS_SNAPSHOT_FILE,
  buildSanitizedSnapshot,
  createLocalAccessSnapshotService,
  snapshotToOfflineGraceAccess,
};
