// @ts-check

const DEFAULT_NOTE_MAX_CHARS = 500;
const MAX_ARRAY_ITEMS = 500;
const REMOVED_KEYS = new Set([
  'absolutePath',
  'filePath',
  'localPath',
  'path',
  'thumbnail',
  'thumbnailPath',
  'video',
  'videoPath',
  'youtubeUrl',
]);

/**
 * @param {string} key
 * @returns {boolean}
 */
function isSensitiveKey(key) {
  const value = String(key || '').toLowerCase();
  return REMOVED_KEYS.has(key)
    || value.includes('filepath')
    || value.includes('localpath')
    || value.includes('absolutepath')
    || value.includes('thumbnail');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function looksLikeLocalPathOrUrl(value) {
  if (typeof value !== 'string') return false;
  return /^[a-z]:[\\/]/i.test(value)
    || value.startsWith('\\\\')
    || /(?:youtube\.com|youtu\.be)/i.test(value);
}

/**
 * @param {unknown} value
 * @param {{includeCoachNotes?: boolean, noteMaxChars?: number}} options
 * @param {string} key
 * @returns {unknown}
 */
function sanitizeValue(value, options, key = '') {
  if (value === null || value === undefined) return undefined;
  if (isSensitiveKey(key) || looksLikeLocalPathOrUrl(value)) return undefined;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const max = options.noteMaxChars || DEFAULT_NOTE_MAX_CHARS;
    return key.toLowerCase().includes('note') ? trimmed.slice(0, max) : trimmed.slice(0, 1500);
  }

  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map(item => sanitizeValue(item, options))
      .filter(item => item !== undefined);
  }

  if (typeof value === 'object') {
    const output = {};
    Object.keys(value).sort().forEach((entryKey) => {
      if (entryKey === 'coachNotes' && options.includeCoachNotes !== true) return;
      const sanitized = sanitizeValue(value[entryKey], options, entryKey);
      if (sanitized !== undefined) output[entryKey] = sanitized;
    });
    return output;
  }

  return undefined;
}

/**
 * @param {unknown} matchData
 * @param {{includeCoachNotes?: boolean, noteMaxChars?: number}} [options]
 * @returns {object}
 */
function sanitizeMatchData(matchData, options = {}) {
  const sanitized = sanitizeValue(matchData, options);
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized) ? sanitized : {};
}

/**
 * @param {object} matchData
 * @returns {boolean}
 */
function hasEnoughMatchData(matchData) {
  const events = Array.isArray(matchData.events) ? matchData.events : [];
  const sequences = Array.isArray(matchData.sequences) ? matchData.sequences : [];
  const possessionIntervals = Array.isArray(matchData.possession?.intervals) ? matchData.possession.intervals : [];
  const stats = matchData.stats && typeof matchData.stats === 'object' ? Object.keys(matchData.stats) : [];
  return events.length > 0 || sequences.length > 0 || possessionIntervals.length > 0 || stats.length > 0;
}

module.exports = {
  hasEnoughMatchData,
  sanitizeMatchData,
};
