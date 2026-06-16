// @ts-check
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { getDataPath, validateMatchId } = require('../storage');

const CHAT_PROMPT_VERSION = 'chat-v1';

/**
 * @param {unknown} question
 * @returns {string}
 */
function normalizeQuestion(question) {
  return String(question || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * @param {{question: string, contextHash: string, promptVersion?: string}} input
 * @returns {string}
 */
function calculateChatCacheKey(input) {
  const promptVersion = input.promptVersion || CHAT_PROMPT_VERSION;
  return crypto
    .createHash('sha256')
    .update(`${normalizeQuestion(input.question)}|${input.contextHash}|${promptVersion}`, 'utf8')
    .digest('hex');
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isNotFound(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'ENOENT');
}

/**
 * @param {string} basePath
 * @param {string} targetPath
 * @returns {boolean}
 */
function isPathInside(basePath, targetPath) {
  const relative = path.relative(basePath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * @param {{dataPath?: string, promptVersion?: string}} [options]
 */
function createAIChatCache(options = {}) {
  const dataPath = path.resolve(options.dataPath || getDataPath());
  const promptVersion = options.promptVersion || CHAT_PROMPT_VERSION;

  /**
   * @param {string|null|undefined} matchId
   * @returns {string}
   */
  function getCachePath(matchId) {
    if (!matchId) return path.resolve(dataPath, 'ai-chat-cache.json');
    const safeMatchId = validateMatchId(matchId);
    const cachePath = path.resolve(dataPath, safeMatchId, 'ai-chat-cache.json');
    if (!isPathInside(dataPath, cachePath)) throw new Error('matchId inválido.');
    return cachePath;
  }

  /**
   * @param {string|null|undefined} matchId
   * @returns {Promise<object>}
   */
  async function readStore(matchId) {
    try {
      const raw = await fs.readFile(getCachePath(matchId), 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && parsed.version === 1
        ? parsed
        : { version: 1, entries: {} };
    } catch (error) {
      if (isNotFound(error)) return { version: 1, entries: {} };
      return { version: 1, entries: {} };
    }
  }

  /**
   * @param {string|null|undefined} matchId
   * @param {object} store
   * @returns {Promise<void>}
   */
  async function writeStore(matchId, store) {
    const cachePath = getCachePath(matchId);
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    const tmpPath = `${cachePath}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(tmpPath, cachePath);
  }

  /**
   * @param {{matchId?: string, question: string, contextHash: string}} input
   * @returns {Promise<object|null>}
   */
  async function get(input) {
    const key = calculateChatCacheKey({ ...input, promptVersion });
    const store = await readStore(input.matchId);
    const entry = store.entries?.[key];
    return entry && entry.promptVersion === promptVersion && entry.contextHash === input.contextHash
      ? { ...entry, key }
      : null;
  }

  /**
   * @param {{matchId?: string, question: string, contextHash: string, entry: object}} input
   * @returns {Promise<object>}
   */
  async function set(input) {
    const key = calculateChatCacheKey({ ...input, promptVersion });
    const store = await readStore(input.matchId);
    const entry = {
      ...input.entry,
      key,
      contextHash: input.contextHash,
      promptVersion,
    };
    store.entries = store.entries && typeof store.entries === 'object' ? store.entries : {};
    store.entries[key] = entry;
    await writeStore(input.matchId, store);
    return entry;
  }

  return {
    get,
    getCachePath,
    set,
  };
}

module.exports = {
  CHAT_PROMPT_VERSION,
  calculateChatCacheKey,
  createAIChatCache,
  normalizeQuestion,
};
