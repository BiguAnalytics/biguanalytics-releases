// @ts-check
const fs = require('fs/promises');
const path = require('path');

function canUseSafeStorage(safeStorage) {
  if (!safeStorage) return false;
  if (typeof safeStorage.isEncryptionAvailable === 'function') {
    return safeStorage.isEncryptionAvailable();
  }
  return typeof safeStorage.encryptString === 'function' || typeof safeStorage.encryptStringAsync === 'function';
}

/**
 * @param {object} safeStorage
 * @param {string} value
 * @returns {Promise<Buffer>}
 */
async function encryptString(safeStorage, value) {
  if (!canUseSafeStorage(safeStorage)) {
    throw new Error('Electron safeStorage no esta disponible.');
  }
  if (typeof safeStorage.encryptStringAsync === 'function') {
    return Buffer.from(await safeStorage.encryptStringAsync(String(value)));
  }
  return Buffer.from(safeStorage.encryptString(String(value)));
}

/**
 * @param {object} safeStorage
 * @param {Buffer} encrypted
 * @returns {Promise<string>}
 */
async function decryptString(safeStorage, encrypted) {
  if (!canUseSafeStorage(safeStorage)) {
    throw new Error('Electron safeStorage no esta disponible.');
  }
  if (typeof safeStorage.decryptStringAsync === 'function') {
    return safeStorage.decryptStringAsync(Buffer.from(encrypted));
  }
  return safeStorage.decryptString(Buffer.from(encrypted));
}

/**
 * @param {{app: {getPath: (name: string) => string}, safeStorage: object, relativePath: string}} deps
 */
function createSecureFileStore(deps) {
  const filePath = path.join(deps.app.getPath('userData'), deps.relativePath);

  return {
    filePath,

    async readJson() {
      let encrypted;
      try {
        encrypted = await fs.readFile(filePath);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          const missing = new Error('secure_file_not_found');
          missing.code = 'AUTH_FILE_NOT_FOUND';
          throw missing;
        }
        throw error;
      }

      try {
        return JSON.parse(await decryptString(deps.safeStorage, encrypted));
      } catch {
        const corrupt = new Error('secure_file_corrupt');
        corrupt.code = 'AUTH_FILE_CORRUPT';
        throw corrupt;
      }
    },

    /**
     * @param {object} value
     */
    async writeJson(value) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, await encryptString(deps.safeStorage, JSON.stringify(value)));
    },

    async remove() {
      await fs.rm(filePath, { force: true });
    },
  };
}

module.exports = {
  canUseSafeStorage,
  createSecureFileStore,
  decryptString,
  encryptString,
};
