// @ts-check
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createSecureFileStore } = require('../auth/secure-file');

const SEED_FILE = 'device-seed';
const DEVICE_IDENTITY_FILE = path.join('auth', 'device-identity-v2.bin');
const DEVICE_IDENTITY_NAMESPACE = 'BiguAnalytics';
const DEVICE_FINGERPRINT_VERSION = 2;
const DEVICE_FINGERPRINT_SALT = 'bigu-device-identity-v2';

/**
 * @param {Record<string, string>} parts
 * @returns {string}
 */
function buildFingerprintSource(parts) {
  return [
    `seed=${parts.seed || ''}`,
    `machine=${parts.machineId || ''}`,
    `host=${parts.hostname || ''}`,
    `platform=${parts.platform || ''}`,
    `arch=${parts.arch || ''}`,
  ].join('|');
}

/**
 * @param {string} source
 * @returns {string}
 */
function hashFingerprintSource(source) {
  return crypto.createHash('sha256').update(String(source), 'utf8').digest('hex');
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 220);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeHash(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : '';
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function sanitizeFingerprintVersion(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

/**
 * @param {string} userDataPath
 * @returns {string}
 */
function readLocalSeed(userDataPath) {
  const seedPath = path.join(userDataPath, SEED_FILE);
  try {
    const existing = fs.readFileSync(seedPath, 'utf8').trim();
    if (existing) return existing;
  } catch {
    return '';
  }
  return '';
}

/**
 * @param {string} userDataPath
 * @returns {string}
 */
function getOrCreateLocalSeed(userDataPath) {
  const existing = readLocalSeed(userDataPath);
  if (existing) return existing;
  const seed = crypto.randomUUID();
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(path.join(userDataPath, SEED_FILE), seed, { encoding: 'utf8', flag: 'wx' });
  return seed;
}

/**
 * @returns {string}
 */
function readWindowsMachineGuid() {
  if (process.platform !== 'win32') return '';
  try {
    const output = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      timeout: 1000,
    });
    const line = output.split(/\r?\n/).find(value => value.includes('MachineGuid'));
    const match = line?.match(/\sREG_SZ\s+(.+)$/);
    return match?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * @param {string} installationId
 * @returns {string}
 */
function hashInstallationId(installationId) {
  return hashFingerprintSource([
    `namespace=${DEVICE_IDENTITY_NAMESPACE}`,
    'purpose=installation-id',
    `version=${DEVICE_FINGERPRINT_VERSION}`,
    `installation=${installationId}`,
  ].join('|'));
}

/**
 * @param {string} machineId
 * @returns {string}
 */
function hashMachineId(machineId) {
  const normalized = String(machineId || '').trim().toLowerCase();
  if (!normalized) return '';
  return hashFingerprintSource([
    `namespace=${DEVICE_IDENTITY_NAMESPACE}`,
    'purpose=machine-id',
    `version=${DEVICE_FINGERPRINT_VERSION}`,
    `machine=${normalized}`,
  ].join('|'));
}

/**
 * @param {{installationId: string, machineIdHash?: string, platform: string}} parts
 * @returns {string}
 */
function buildFingerprintSourceV2(parts) {
  return [
    `namespace=${DEVICE_IDENTITY_NAMESPACE}`,
    'purpose=device-identity',
    `version=${DEVICE_FINGERPRINT_VERSION}`,
    `salt=${DEVICE_FINGERPRINT_SALT}`,
    `installation=${parts.installationId || ''}`,
    `machine=${parts.machineIdHash || ''}`,
    `platform=${parts.platform || ''}`,
  ].join('|');
}

/**
 * @param {object|null|undefined} state
 * @returns {object}
 */
function normalizeIdentityState(state = {}) {
  const value = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  return {
    version: DEVICE_FINGERPRINT_VERSION,
    installation_id: sanitizeText(value.installation_id),
    device_id: sanitizeText(value.device_id),
    fingerprint_version: sanitizeFingerprintVersion(value.fingerprint_version),
    lastKnownDeviceName: sanitizeText(value.lastKnownDeviceName),
    lastVerifiedAt: sanitizeText(value.lastVerifiedAt),
    offlineGraceExpiresAt: sanitizeText(value.offlineGraceExpiresAt),
  };
}

/**
 * @param {object} state
 * @returns {{deviceId: string, fingerprintVersion: number, lastKnownDeviceName: string, lastVerifiedAt: string, offlineGraceExpiresAt: string}}
 */
function buildCachedApprovedDevice(state = {}) {
  const normalized = normalizeIdentityState(state);
  return {
    deviceId: normalized.device_id,
    fingerprintVersion: normalized.fingerprint_version,
    lastKnownDeviceName: normalized.lastKnownDeviceName,
    lastVerifiedAt: normalized.lastVerifiedAt,
    offlineGraceExpiresAt: normalized.offlineGraceExpiresAt,
  };
}

/**
 * @param {{app: {getPath: (name: string) => string}, safeStorage: object, cryptoModule?: typeof crypto}} deps
 */
function createDeviceIdentityStore(deps) {
  const cryptoModule = deps.cryptoModule || crypto;
  const store = createSecureFileStore({
    app: deps.app,
    safeStorage: deps.safeStorage,
    relativePath: DEVICE_IDENTITY_FILE,
  });

  async function readState() {
    try {
      return normalizeIdentityState(await store.readJson());
    } catch {
      return normalizeIdentityState();
    }
  }

  /**
   * @param {object} state
   */
  async function writeState(state) {
    await store.writeJson(normalizeIdentityState(state));
  }

  return {
    filePath: store.filePath,

    async getOrCreateInstallationId() {
      const state = await readState();
      if (state.installation_id) return state.installation_id;

      const installationId = cryptoModule.randomUUID();
      await writeState({
        ...state,
        installation_id: installationId,
        fingerprint_version: DEVICE_FINGERPRINT_VERSION,
      });
      return installationId;
    },

    async getCachedApprovedDevice() {
      return buildCachedApprovedDevice(await readState());
    },

    /**
     * @param {{deviceId?: string, fingerprintVersion?: number, lastKnownDeviceName?: string, lastVerifiedAt?: string, offlineGraceExpiresAt?: string}} payload
     */
    async cacheApprovedDevice(payload = {}) {
      const state = await readState();
      const next = {
        ...state,
        device_id: sanitizeText(payload.deviceId || state.device_id),
        fingerprint_version: sanitizeFingerprintVersion(payload.fingerprintVersion) || DEVICE_FINGERPRINT_VERSION,
        lastKnownDeviceName: sanitizeText(payload.lastKnownDeviceName || state.lastKnownDeviceName),
        lastVerifiedAt: sanitizeText(payload.lastVerifiedAt || state.lastVerifiedAt),
        offlineGraceExpiresAt: sanitizeText(payload.offlineGraceExpiresAt || state.offlineGraceExpiresAt),
      };
      await writeState(next);
      return buildCachedApprovedDevice(next);
    },

    /**
     * @param {{deviceId?: string}} [payload]
     */
    async clearCachedApprovedDevice(payload = {}) {
      const state = await readState();
      const requestedDeviceId = sanitizeText(payload.deviceId);
      if (requestedDeviceId && requestedDeviceId !== state.device_id) {
        return buildCachedApprovedDevice(state);
      }
      const next = {
        ...state,
        device_id: '',
        lastVerifiedAt: '',
        offlineGraceExpiresAt: '',
      };
      await writeState(next);
      return buildCachedApprovedDevice(next);
    },
  };
}

function createDefaultDeviceIdentityStore() {
  const { app, safeStorage } = require('electron');
  return createDeviceIdentityStore({ app, safeStorage });
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasHash(value) {
  return Boolean(sanitizeHash(value));
}

/**
 * @param {{
 *   app?: {getPath?: (name: string) => string, getVersion?: () => string},
 *   os?: {hostname?: () => string, arch?: () => string},
 *   processInfo?: {platform?: string},
 *   machineIdProvider?: () => string,
 *   seedProvider?: () => string,
 *   installationIdProvider?: () => string|Promise<string>,
 *   identityStore?: {getOrCreateInstallationId: () => Promise<string>},
 * }} [deps]
 * @returns {Promise<{fingerprintHash: string, fingerprintVersion: number, installationIdHash: string, machineIdHash: string|null, legacyFingerprintHash: string|null, deviceName: string, platform: string, appVersion: string}>}
 */
async function createDeviceFingerprint(deps = {}) {
  const electronApp = deps.app || require('electron').app;
  const osModule = deps.os || os;
  const processInfo = deps.processInfo || process;
  const userDataPath = electronApp.getPath?.('userData') || process.cwd();
  const machineId = deps.machineIdProvider ? deps.machineIdProvider() : readWindowsMachineGuid();
  const hostname = osModule.hostname?.() || 'Equipo BiguAnalytics';
  const arch = osModule.arch?.() || '';
  const platformName = processInfo.platform || process.platform;
  const platform = `${platformName}-${arch}`;
  const installationId = deps.installationIdProvider
    ? await deps.installationIdProvider()
    : await (deps.identityStore || createDefaultDeviceIdentityStore()).getOrCreateInstallationId();
  const machineIdHash = hashMachineId(machineId);
  const seed = deps.seedProvider ? deps.seedProvider() : readLocalSeed(userDataPath);
  const legacyFingerprintHash = seed
    ? hashFingerprintSource(buildFingerprintSource({
      seed,
      machineId,
      hostname,
      platform: platformName,
      arch,
    }))
    : null;
  const source = buildFingerprintSourceV2({
    installationId,
    machineIdHash,
    platform,
  });

  return {
    fingerprintHash: hashFingerprintSource(source),
    fingerprintVersion: DEVICE_FINGERPRINT_VERSION,
    installationIdHash: hashInstallationId(installationId),
    machineIdHash: hasHash(machineIdHash) ? machineIdHash : null,
    legacyFingerprintHash,
    deviceName: hostname,
    platform,
    appVersion: electronApp.getVersion?.() || '0.1.0',
  };
}

module.exports = {
  buildFingerprintSource,
  buildFingerprintSourceV2,
  createDefaultDeviceIdentityStore,
  createDeviceIdentityStore,
  createDeviceFingerprint,
  DEVICE_FINGERPRINT_VERSION,
  DEVICE_IDENTITY_FILE,
  hashFingerprintSource,
  hashInstallationId,
  hashMachineId,
  getOrCreateLocalSeed,
  readLocalSeed,
  readWindowsMachineGuid,
};
