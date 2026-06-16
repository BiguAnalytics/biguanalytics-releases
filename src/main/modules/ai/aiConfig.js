// @ts-check
const { resolveAIBackendUrl } = require('./aiConstants');

const TOKEN_STORAGE_VERSION = 1;
const TOKEN_STORAGE_NONE = 'none';
const TOKEN_STORAGE_MEMORY = 'memory';
const TOKEN_STORAGE_SAFE_STORAGE = 'electron.safeStorage';

let aiConfigRepository;

/**
 * @param {string|null|undefined} value
 * @param {{env?: NodeJS.ProcessEnv|Record<string, string|undefined>, isPackaged?: boolean}} [options]
 * @returns {string}
 */
function normalizeAIBackendUrl(value, options = {}) {
  return resolveAIBackendUrl(value, options);
}

/**
 * @param {object} [config]
 * @param {{env?: NodeJS.ProcessEnv|Record<string, string|undefined>, isPackaged?: boolean}} [options]
 * @returns {{backendUrl: string, clientToken: string}}
 */
function mergeAIConfig(config = {}, options = {}) {
  return {
    backendUrl: normalizeAIBackendUrl(config.backendUrl, options),
    clientToken: String(config.clientToken || '').trim(),
  };
}

/**
 * @param {string|null|undefined} clientToken
 * @returns {string}
 */
function maskClientToken(clientToken) {
  const token = String(clientToken || '').trim();
  if (!token) return '';
  if (token.length <= 4) return '********';
  return `********${token.slice(-4)}`;
}

/**
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
function isMaskedClientToken(value) {
  return /^\*{8,}/.test(String(value || '').trim());
}

/**
 * @returns {object|null}
 */
function getElectronSafeStorage() {
  try {
    return require('electron').safeStorage || null;
  } catch {
    return null;
  }
}

/**
 * @param {object|null|undefined} safeStorage
 * @returns {boolean}
 */
function canUseSafeStorage(safeStorage) {
  try {
    return Boolean(safeStorage?.isEncryptionAvailable?.());
  } catch {
    return false;
  }
}

/**
 * @param {string} message
 */
function emitTokenStorageWarning(message) {
  if (typeof process?.emitWarning === 'function') {
    process.emitWarning(message, { code: 'BIGU_AI_TOKEN_STORAGE' });
  }
}

/**
 * @param {function(string): void} warn
 * @returns {function(string): void}
 */
function createWarnOnce(warn) {
  const emitted = new Set();
  return (message) => {
    if (emitted.has(message)) return;
    emitted.add(message);
    warn(message);
  };
}

/**
 * @param {object|null|undefined} stored
 * @returns {{provider: string, version: number}}
 */
function normalizeTokenStorageMetadata(stored) {
  const provider = stored?.provider === TOKEN_STORAGE_SAFE_STORAGE
    || stored?.provider === TOKEN_STORAGE_MEMORY
    || stored?.provider === TOKEN_STORAGE_NONE
    ? stored.provider
    : TOKEN_STORAGE_NONE;
  return {
    provider,
    version: Number(stored?.version) === TOKEN_STORAGE_VERSION ? TOKEN_STORAGE_VERSION : TOKEN_STORAGE_VERSION,
  };
}

/**
 * @param {object} storedConfig
 * @returns {{provider: string, encrypted: boolean}}
 */
function getPublicTokenStorageStatus(storedConfig = {}) {
  const metadata = normalizeTokenStorageMetadata(storedConfig.tokenStorage);
  return {
    provider: metadata.provider,
    encrypted: metadata.provider === TOKEN_STORAGE_SAFE_STORAGE && Boolean(storedConfig.clientTokenEncrypted),
  };
}

/**
 * @param {{backendUrl: string, clientToken: string}} config
 * @param {object} storedConfig
 * @param {{env?: NodeJS.ProcessEnv|Record<string, string|undefined>, isPackaged?: boolean}} [options]
 * @returns {{backendUrl: string, clientToken: string, hasClientToken: boolean, tokenStorage: {provider: string, encrypted: boolean}}}
 */
function toPublicAIConfig(config, storedConfig = {}, options = {}) {
  return {
    backendUrl: normalizeAIBackendUrl(config.backendUrl, options),
    clientToken: maskClientToken(config.clientToken),
    hasClientToken: Boolean(String(config.clientToken || '').trim()),
    tokenStorage: getPublicTokenStorageStatus(storedConfig),
  };
}

/**
 * @param {string} token
 * @param {object|null} safeStorage
 * @returns {string}
 */
function encryptClientToken(token, safeStorage) {
  const encrypted = safeStorage.encryptString(token);
  return Buffer.from(encrypted).toString('base64');
}

/**
 * @param {string} encryptedToken
 * @param {object|null} safeStorage
 * @returns {string}
 */
function decryptClientToken(encryptedToken, safeStorage) {
  return String(safeStorage.decryptString(Buffer.from(encryptedToken, 'base64')) || '').trim();
}

/**
 * @param {string} backendUrl
 * @param {string} clientToken
 * @param {object|null} safeStorage
 * @param {function(string): void} warn
 * @param {function(string): void} setMemoryClientToken
 * @param {{env?: NodeJS.ProcessEnv|Record<string, string|undefined>, isPackaged?: boolean}} [options]
 * @returns {object}
 */
function buildStoredAIConfig(backendUrl, clientToken, safeStorage, warn, setMemoryClientToken, options = {}) {
  const normalizedBackendUrl = normalizeAIBackendUrl(backendUrl, options);
  const token = String(clientToken || '').trim();
  if (!token) {
    setMemoryClientToken('');
    return {
      backendUrl: normalizedBackendUrl,
      clientTokenEncrypted: '',
      tokenStorage: { provider: TOKEN_STORAGE_NONE, version: TOKEN_STORAGE_VERSION },
    };
  }

  if (canUseSafeStorage(safeStorage)) {
    setMemoryClientToken('');
    return {
      backendUrl: normalizedBackendUrl,
      clientTokenEncrypted: encryptClientToken(token, safeStorage),
      tokenStorage: { provider: TOKEN_STORAGE_SAFE_STORAGE, version: TOKEN_STORAGE_VERSION },
    };
  }

  setMemoryClientToken(token);
  warn('Electron safeStorage is unavailable; AI client token is kept only in memory for this session.');
  return {
    backendUrl: normalizedBackendUrl,
    clientTokenEncrypted: '',
    tokenStorage: { provider: TOKEN_STORAGE_MEMORY, version: TOKEN_STORAGE_VERSION },
  };
}

/**
 * @param {{get: function(string): object|undefined, set: function(string, object): void}} store
 * @param {{safeStorage?: object|null, warn?: function(string): void, env?: NodeJS.ProcessEnv|Record<string, string|undefined>, isPackaged?: boolean}} [options]
 */
function createAIConfigRepository(store, options = {}) {
  const safeStorage = Object.prototype.hasOwnProperty.call(options, 'safeStorage')
    ? options.safeStorage
    : getElectronSafeStorage();
  const warn = createWarnOnce(options.warn || emitTokenStorageWarning);
  let memoryClientToken = '';

  const setMemoryClientToken = (token) => {
    memoryClientToken = String(token || '').trim();
  };

  const persist = (config) => {
    const storedConfig = buildStoredAIConfig(
      config.backendUrl,
      config.clientToken,
      safeStorage,
      warn,
      setMemoryClientToken,
      options
    );
    store.set('aiConfig', storedConfig);
    return storedConfig;
  };

  return {
    async get() {
      const storedConfig = store.get('aiConfig') || {};
      const backendUrl = normalizeAIBackendUrl(storedConfig.backendUrl, options);
      const encryptedToken = String(storedConfig.clientTokenEncrypted || '').trim();

      if (encryptedToken) {
        if (!canUseSafeStorage(safeStorage)) {
          warn('Electron safeStorage is unavailable; stored AI client token cannot be decrypted.');
          return { backendUrl, clientToken: memoryClientToken };
        }

        try {
          return {
            backendUrl,
            clientToken: decryptClientToken(encryptedToken, safeStorage),
          };
        } catch {
          warn('Stored AI client token could not be decrypted with Electron safeStorage.');
          return { backendUrl, clientToken: memoryClientToken };
        }
      }

      const legacyPlainToken = String(storedConfig.clientToken || '').trim();
      if (legacyPlainToken) {
        persist({ backendUrl, clientToken: legacyPlainToken });
        return { backendUrl, clientToken: legacyPlainToken };
      }

      return {
        backendUrl,
        clientToken: memoryClientToken,
      };
    },
    async getPublic() {
      const config = await this.get();
      return toPublicAIConfig(config, store.get('aiConfig') || {}, options);
    },
    async set(partial) {
      const current = await this.get();
      const hasClientToken = Object.prototype.hasOwnProperty.call(partial || {}, 'clientToken');
      const incomingToken = String(partial?.clientToken || '').trim();
      const nextToken = hasClientToken
        ? isMaskedClientToken(incomingToken) && current.clientToken
          ? current.clientToken
          : incomingToken
        : current.clientToken;
      const next = mergeAIConfig({
        ...current,
        ...partial,
        clientToken: nextToken,
      }, options);
      const storedConfig = persist(next);
      return toPublicAIConfig(next, storedConfig, options);
    },
  };
}

function getAIConfigRepository() {
  if (!aiConfigRepository) {
    const Store = require('electron-store');
    const store = new Store({
      name: 'ai-settings',
      defaults: {
        aiConfig: mergeAIConfig(),
      },
    });
    aiConfigRepository = createAIConfigRepository(store);
  }
  return aiConfigRepository;
}

async function getAIConfig() {
  return getAIConfigRepository().get();
}

async function getPublicAIConfig() {
  return getAIConfigRepository().getPublic();
}

async function setAIConfig(partial) {
  return getAIConfigRepository().set(partial);
}

module.exports = {
  createAIConfigRepository,
  getAIConfig,
  getPublicAIConfig,
  maskClientToken,
  mergeAIConfig,
  normalizeAIBackendUrl,
  setAIConfig,
  toPublicAIConfig,
};
