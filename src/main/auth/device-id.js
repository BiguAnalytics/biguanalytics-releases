// @ts-check
const crypto = require('crypto');
const path = require('path');
const { createSecureFileStore } = require('./secure-file');

const DEVICE_ID_FILE = path.join('auth', 'device-id.bin');

/**
 * @param {{app: {getPath: (name: string) => string}, safeStorage: object, cryptoModule?: typeof crypto}} deps
 */
function createDeviceIdStore(deps) {
  const cryptoModule = deps.cryptoModule || crypto;
  const store = createSecureFileStore({
    app: deps.app,
    safeStorage: deps.safeStorage,
    relativePath: DEVICE_ID_FILE,
  });

  async function getOrCreateDeviceId() {
    try {
      const stored = await store.readJson();
      if (typeof stored.deviceId === 'string' && stored.deviceId) return stored.deviceId;
    } catch (error) {
      if (error?.code !== 'AUTH_FILE_NOT_FOUND' && error?.code !== 'AUTH_FILE_CORRUPT') throw error;
    }

    const deviceId = cryptoModule.randomUUID();
    await store.writeJson({ version: 1, deviceId });
    return deviceId;
  }

  async function getDeviceIdHash() {
    const deviceId = await getOrCreateDeviceId();
    return cryptoModule.createHash('sha256').update(deviceId, 'utf8').digest('hex');
  }

  return {
    filePath: store.filePath,
    getDeviceIdHash,
    getOrCreateDeviceId,
  };
}

module.exports = {
  DEVICE_ID_FILE,
  createDeviceIdStore,
};
