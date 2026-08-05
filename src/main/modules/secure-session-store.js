// @ts-check
const fs = require('fs/promises');
const path = require('path');

const SESSION_FILE = 'license-session.json';
const SESSION_DIR = 'license-session';

function getBackupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * @param {string} key
 * @returns {string}
 */
function normalizeStorageKey(key) {
  const normalized = String(key || '').trim();
  if (!normalized) throw new Error('Clave de sesion invalida.');
  if (normalized.length > 160) throw new Error('Clave de sesion demasiado larga.');
  return normalized.replace(/[^\w:.-]/g, '_');
}

/**
 * @param {unknown} value
 * @returns {Record<string, {mode: string, value: string}>}
 */
function normalizeSessionFile(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidSessionFile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(record => (
    record
    && typeof record === 'object'
    && (record.mode === 'safeStorage' || record.mode === 'fallback-base64')
    && typeof record.value === 'string'
    && record.value.length > 0
  ));
}

/**
 * @param {Buffer} value
 * @returns {string}
 */
function encodeBuffer(value) {
  return value.toString('base64');
}

/**
 * @param {string} value
 * @returns {Buffer}
 */
function decodeBuffer(value) {
  return Buffer.from(String(value || ''), 'base64');
}

/**
 * @param {{app: {getPath: (name: string) => string}, safeStorage?: object, logger?: {warn: (message: string) => void}}} deps
 */
function createSecureSessionStore(deps) {
  const app = deps.app;
  const safeStorage = deps.safeStorage;
  const logger = deps.logger || console;
  const storeDir = path.join(app.getPath('userData'), SESSION_DIR);
  const storePath = path.join(app.getPath('userData'), SESSION_FILE);
  let corruptBackupPath = null;

  /**
   * @returns {boolean}
   */
  function canEncrypt() {
    return Boolean(safeStorage?.isEncryptionAvailable?.());
  }

  /**
   * @param {string} value
   * @returns {{mode: string, value: string}}
   */
  function encodeValue(value) {
    if (canEncrypt()) {
      return {
        mode: 'safeStorage',
        value: encodeBuffer(safeStorage.encryptString(String(value))),
      };
    }

    logger.warn('Electron safeStorage no esta disponible; la sesion se guarda con fallback local codificado.');
    return {
      mode: 'fallback-base64',
      value: encodeBuffer(Buffer.from(String(value), 'utf8')),
    };
  }

  /**
   * @param {{mode: string, value: string}|undefined} record
   * @returns {string|null}
   */
  function decodeValue(record) {
    if (!record?.value) return null;
    if (record.mode === 'safeStorage' && canEncrypt()) {
      return safeStorage.decryptString(decodeBuffer(record.value));
    }
    if (record.mode === 'fallback-base64') {
      return decodeBuffer(record.value).toString('utf8');
    }
    return null;
  }

  /**
   * @returns {Promise<Record<string, {mode: string, value: string}>>}
   */
  async function readStore() {
    try {
      const parsed = JSON.parse(await fs.readFile(storePath, 'utf8'));
      if (!isValidSessionFile(parsed)) {
        const error = new Error('Estructura de sesion invalida.');
        error.code = 'SESSION_FILE_CORRUPT';
        throw error;
      }
      return normalizeSessionFile(parsed);
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      if (error.code !== 'SESSION_FILE_CORRUPT' && !(error instanceof SyntaxError)) throw error;
      const backupPath = corruptBackupPath || `${storePath}.corrupt-${getBackupTimestamp()}.bak`;
      if (!corruptBackupPath) {
        await fs.copyFile(storePath, backupPath);
        corruptBackupPath = backupPath;
        logger.warn('Archivo de sesion corrupto preservado en backup local.');
      }
      const recoverable = new Error('Sesion local corrupta. Se preservo una copia de seguridad.');
      recoverable.recoverable = true;
      recoverable.code = 'SESSION_FILE_CORRUPT';
      recoverable.filePath = storePath;
      recoverable.backupPath = backupPath;
      recoverable.details = error.message;
      throw recoverable;
    }
  }

  /**
   * @param {Record<string, {mode: string, value: string}>} data
   */
  async function writeStore(data) {
    await fs.mkdir(storeDir, { recursive: true });
    await fs.writeFile(storePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    corruptBackupPath = null;
  }

  return {
    /**
     * @param {string} key
     * @returns {Promise<string|null>}
     */
    async get(key) {
      const data = await readStore();
      return decodeValue(data[normalizeStorageKey(key)]);
    },

    /**
     * @param {string} key
     * @param {string} value
     * @returns {Promise<void>}
     */
    async set(key, value) {
      const data = await readStore();
      data[normalizeStorageKey(key)] = encodeValue(value);
      await writeStore(data);
    },

    /**
     * @param {string} key
     * @returns {Promise<void>}
     */
    async remove(key) {
      const data = await readStore();
      delete data[normalizeStorageKey(key)];
      await writeStore(data);
    },

    async clear() {
      await fs.rm(storePath, { force: true });
      await fs.rm(storeDir, { recursive: true, force: true });
      corruptBackupPath = null;
    },
  };
}

function createDefaultSecureSessionStore() {
  const { app, safeStorage } = require('electron');
  return createSecureSessionStore({ app, safeStorage, logger: console });
}

module.exports = {
  createDefaultSecureSessionStore,
  createSecureSessionStore,
};
