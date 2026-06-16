// @ts-check
import { getSupabaseClient } from './supabase-client.js';

const DEVICE_FINGERPRINT_VERSION = 2;
const APPROVED_STATUS = 'approved';
const PENDING_STATUS = 'pending';
const BLOCKED_STATUSES = new Set(['blocked', 'rejected', 'revoked']);

/**
 * @param {Promise<object>|object|function(): Promise<object>} clientSource
 * @returns {Promise<object>}
 */
async function resolveClient(clientSource) {
  if (typeof clientSource === 'function') return clientSource();
  return clientSource;
}

/**
 * @param {object|null|undefined} device
 * @returns {string}
 */
function getDeviceStatus(device) {
  return String(device?.status || '').trim().toLowerCase();
}

/**
 * @param {object|null|undefined} device
 * @returns {boolean}
 */
function isApprovedDevice(device) {
  return getDeviceStatus(device) === APPROVED_STATUS && !device?.revoked_at;
}

/**
 * @param {object|null|undefined} device
 * @returns {boolean}
 */
function isPendingDevice(device) {
  return getDeviceStatus(device) === PENDING_STATUS;
}

/**
 * @param {object|null|undefined} device
 * @returns {boolean}
 */
function isBlockedDevice(device) {
  return Boolean(device?.revoked_at) || BLOCKED_STATUSES.has(getDeviceStatus(device));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeHash(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : '';
}

/**
 * @param {object} fingerprint
 * @returns {object}
 */
function buildIdentityPayload(fingerprint = {}) {
  return {
    p_fingerprint_hash: normalizeHash(fingerprint.fingerprintHash),
    p_fingerprint_version: DEVICE_FINGERPRINT_VERSION,
    p_installation_id_hash: normalizeHash(fingerprint.installationIdHash) || null,
    p_machine_id_hash: normalizeHash(fingerprint.machineIdHash) || null,
    p_device_name: String(fingerprint.deviceName || '').trim(),
    p_platform: String(fingerprint.platform || '').trim(),
    p_app_version: String(fingerprint.appVersion || '').trim(),
  };
}

/**
 * @param {object} device
 * @param {object} fingerprint
 * @returns {boolean}
 */
function shouldMigrateDeviceIdentity(device, fingerprint) {
  return (
    device?.fingerprint_hash !== fingerprint.fingerprintHash
    || Number(device?.fingerprint_version || 1) !== DEVICE_FINGERPRINT_VERSION
    || device?.installation_id_hash !== fingerprint.installationIdHash
    || (fingerprint.machineIdHash && device?.machine_id_hash !== fingerprint.machineIdHash)
  );
}

/**
 * @param {object} device
 * @param {object} fingerprint
 */
async function cacheApprovedDevice(device, fingerprint) {
  if (!isApprovedDevice(device) || !globalThis.window?.api?.device?.cacheApprovedDevice) return;
  try {
    await window.api.device.cacheApprovedDevice({
      deviceId: device.id,
      fingerprintVersion: DEVICE_FINGERPRINT_VERSION,
      lastKnownDeviceName: fingerprint.deviceName || device.device_name || '',
      lastVerifiedAt: new Date().toISOString(),
      offlineGraceExpiresAt: '',
    });
  } catch {
    // Local cache failures must not change the online access decision.
  }
}

/**
 * @param {string} deviceId
 */
async function clearCachedApprovedDevice(deviceId = '') {
  if (!globalThis.window?.api?.device?.clearCachedApprovedDevice) return;
  try {
    await window.api.device.clearCachedApprovedDevice({ deviceId });
  } catch {
    // Local cache failures must not change the online access decision.
  }
}

/**
 * @param {object} client
 * @param {object} device
 * @param {object} fingerprint
 * @returns {Promise<object>}
 */
async function touchOrMigrateDeviceIdentity(client, device, fingerprint) {
  if (!client?.rpc || !isApprovedDevice(device)) return device;
  const payload = {
    p_device_id: device.id,
    ...buildIdentityPayload(fingerprint),
  };
  const rpcName = shouldMigrateDeviceIdentity(device, fingerprint)
    ? 'migrate_own_device_identity_v2'
    : 'touch_own_device_identity_v2';
  const result = await client.rpc(rpcName, payload);
  if (result.error) throw result.error;
  return result.data || device;
}

/**
 * @param {object} client
 * @param {object} device
 * @param {object} fingerprint
 * @returns {Promise<object>}
 */
async function finalizeFoundDevice(client, device, fingerprint) {
  if (isApprovedDevice(device)) {
    const updated = await touchOrMigrateDeviceIdentity(client, device, fingerprint);
    await cacheApprovedDevice(updated, fingerprint);
    return updated;
  }
  if (isBlockedDevice(device)) {
    await clearCachedApprovedDevice(device.id);
  }
  return device;
}

/**
 * @param {object} client
 * @param {Array<{key: string, value: unknown}>} filters
 * @param {{orderBy?: string, ascending?: boolean, limit?: number}} [options]
 * @returns {Promise<object|null>}
 */
async function findDeviceBy(client, filters, options = {}) {
  let query = client.from('devices').select('*');
  filters.forEach(({ key, value }) => {
    query = query.eq(key, value);
  });
  if (options.orderBy && typeof query.order === 'function') {
    query = query.order(options.orderBy, { ascending: options.ascending === true });
  }
  if (options.limit && typeof query.limit === 'function') {
    query = query.limit(options.limit);
  }
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

/**
 * @param {object} client
 * @param {object} profile
 * @param {object} club
 * @param {string} deviceId
 * @returns {Promise<object|null>}
 */
async function findCachedDevice(client, profile, club, deviceId) {
  if (!deviceId) return null;
  return findDeviceBy(client, [
    { key: 'id', value: deviceId },
    { key: 'user_id', value: profile.id },
    { key: 'club_id', value: club.id },
  ]);
}

/**
 * @param {object} client
 * @param {object} profile
 * @param {object} club
 * @param {object} fingerprint
 * @returns {Promise<object|null>}
 */
async function findByCurrentFingerprint(client, profile, club, fingerprint) {
  return findDeviceBy(client, [
    { key: 'user_id', value: profile.id },
    { key: 'club_id', value: club.id },
    { key: 'fingerprint_hash', value: fingerprint.fingerprintHash },
  ]);
}

/**
 * @param {object} client
 * @param {object} profile
 * @param {object} club
 * @param {string} key
 * @param {string} value
 * @returns {Promise<object|null>}
 */
async function findByIdentityHash(client, profile, club, key, value) {
  const hash = normalizeHash(value);
  if (!hash) return null;
  return findDeviceBy(client, [
    { key: 'user_id', value: profile.id },
    { key: 'club_id', value: club.id },
    { key, value: hash },
  ], { orderBy: 'last_seen_at', ascending: false, limit: 1 });
}

/**
 * @param {object} client
 * @param {object} profile
 * @param {object} club
 * @param {object} fingerprint
 * @returns {Promise<object|null>}
 */
async function findLegacyDevice(client, profile, club, fingerprint) {
  const legacyHash = normalizeHash(fingerprint.legacyFingerprintHash);
  if (legacyHash) {
    const exactLegacy = await findDeviceBy(client, [
      { key: 'user_id', value: profile.id },
      { key: 'club_id', value: club.id },
      { key: 'fingerprint_hash', value: legacyHash },
    ]);
    if (exactLegacy) return exactLegacy;
  }

  return findDeviceBy(client, [
    { key: 'user_id', value: profile.id },
    { key: 'club_id', value: club.id },
    { key: 'device_name', value: fingerprint.deviceName },
    { key: 'platform', value: fingerprint.platform },
    { key: 'status', value: APPROVED_STATUS },
  ], { orderBy: 'last_seen_at', ascending: false, limit: 1 });
}

/**
 * @returns {Promise<object>}
 */
async function getFingerprint() {
  return window.api.device.getFingerprint();
}

/**
 * @returns {Promise<object>}
 */
async function getCachedApprovedDevice() {
  if (!globalThis.window?.api?.device?.getCachedApprovedDevice) return { deviceId: '' };
  try {
    return await window.api.device.getCachedApprovedDevice();
  } catch {
    return { deviceId: '' };
  }
}

/**
 * @param {Promise<object>|object|function(): Promise<object>} [clientSource]
 */
export function createDeviceService(clientSource = getSupabaseClient) {
  return {
    /**
     * @param {{id: string}} profile
     * @param {{firstName: string, lastName: string, age: number, role: string, isPlayer: boolean, position: string, displayName?: string}} personalInfo
     * @returns {Promise<{profile: object}>}
     */
    async updatePersonalProfile(profile, personalInfo) {
      const client = await resolveClient(clientSource);
      const updatedProfile = await client
        .from('profiles')
        .update({
          first_name: String(personalInfo.firstName || '').trim(),
          last_name: String(personalInfo.lastName || '').trim(),
          age: Number(personalInfo.age),
          app_role: String(personalInfo.role || '').trim(),
          is_player: Boolean(personalInfo.isPlayer),
          position: personalInfo.isPlayer ? String(personalInfo.position || '').trim() || null : null,
          display_name: String(personalInfo.displayName || '').trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)
        .select('*')
        .single();
      if (updatedProfile.error) throw updatedProfile.error;
      return { profile: updatedProfile.data };
    },

    /**
     * @param {{id: string}} profile
     * @param {{id: string}} club
     * @returns {Promise<{device: object|null, fingerprint: object}>}
     */
    async findDevice(profile, club) {
      const client = await resolveClient(clientSource);
      const fingerprint = await getFingerprint();
      const cached = await getCachedApprovedDevice();
      const cachedDeviceId = String(cached?.deviceId || '').trim();
      if (cachedDeviceId) {
        const cachedDevice = await findCachedDevice(client, profile, club, cachedDeviceId);
        if (!cachedDevice) {
          await clearCachedApprovedDevice(cachedDeviceId);
        } else {
          const device = await finalizeFoundDevice(client, cachedDevice, fingerprint);
          return { device, fingerprint };
        }
      }

      let pendingCandidate = null;
      const currentDevice = await findByCurrentFingerprint(client, profile, club, fingerprint);
      if (currentDevice) {
        if (isApprovedDevice(currentDevice) || isBlockedDevice(currentDevice)) {
          const device = await finalizeFoundDevice(client, currentDevice, fingerprint);
          return { device, fingerprint };
        }
        if (isPendingDevice(currentDevice)) pendingCandidate = currentDevice;
      }

      const machineDevice = await findByIdentityHash(client, profile, club, 'machine_id_hash', fingerprint.machineIdHash);
      if (machineDevice) {
        if (isApprovedDevice(machineDevice) || isBlockedDevice(machineDevice)) {
          const device = await finalizeFoundDevice(client, machineDevice, fingerprint);
          return { device, fingerprint };
        }
        if (!pendingCandidate && isPendingDevice(machineDevice)) pendingCandidate = machineDevice;
      }

      const installationDevice = await findByIdentityHash(client, profile, club, 'installation_id_hash', fingerprint.installationIdHash);
      if (installationDevice) {
        if (isApprovedDevice(installationDevice) || isBlockedDevice(installationDevice)) {
          const device = await finalizeFoundDevice(client, installationDevice, fingerprint);
          return { device, fingerprint };
        }
        if (!pendingCandidate && isPendingDevice(installationDevice)) pendingCandidate = installationDevice;
      }

      const legacyDevice = await findLegacyDevice(client, profile, club, fingerprint);
      if (legacyDevice) {
        if (isApprovedDevice(legacyDevice) || isBlockedDevice(legacyDevice)) {
          const device = await finalizeFoundDevice(client, legacyDevice, fingerprint);
          return { device, fingerprint };
        }
        if (!pendingCandidate && isPendingDevice(legacyDevice)) pendingCandidate = legacyDevice;
      }

      if (pendingCandidate) return { device: pendingCandidate, fingerprint };
      return { device: null, fingerprint };
    },

    /**
     * @param {{id: string}} profile
     * @param {{id: string}} club
     * @param {{firstName?: string, lastName?: string, age?: number, role?: string, isPlayer?: boolean, position?: string}} [personalInfo]
     * @returns {Promise<{device: object, fingerprint: object, profile: object}>}
     */
    async registerPendingDevice(profile, club, personalInfo = null) {
      const client = await resolveClient(clientSource);
      const fingerprint = await getFingerprint();
      const updatedProfile = personalInfo
        ? (await this.updatePersonalProfile(profile, personalInfo)).profile
        : profile;
      const identityPayload = buildIdentityPayload(fingerprint);
      const inserted = await client
        .from('devices')
        .insert({
          club_id: club.id,
          user_id: profile.id,
          fingerprint_hash: identityPayload.p_fingerprint_hash,
          device_fingerprint: identityPayload.p_fingerprint_hash,
          fingerprint_version: DEVICE_FINGERPRINT_VERSION,
          installation_id_hash: identityPayload.p_installation_id_hash,
          machine_id_hash: identityPayload.p_machine_id_hash,
          device_name: fingerprint.deviceName,
          display_name: fingerprint.deviceName,
          platform: fingerprint.platform,
          app_version: fingerprint.appVersion,
          owner_first_name: updatedProfile.first_name,
          owner_last_name: updatedProfile.last_name,
          owner_age: updatedProfile.age,
          owner_role: updatedProfile.app_role,
          owner_is_player: updatedProfile.is_player,
          owner_position: updatedProfile.position,
          status: 'pending',
        })
        .select('*')
        .single();

      if (inserted.error) throw inserted.error;
      return { device: inserted.data, fingerprint, profile: updatedProfile };
    },
  };
}

export const deviceService = createDeviceService();
