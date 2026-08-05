// @ts-check
const fs = require('fs/promises');
const path = require('path');
const electron = require('electron');
const app = electron.app || electron.default?.app || (process.env.VITEST ? { getPath: () => path.join(process.cwd(), '.vitest-user-data') } : undefined);
const { v4: uuidv4 } = require('uuid');
const { normalizeMatchScore } = require('./score');

const PENDING_SYNC_FILE = 'pending-sync.json';
const MATCH_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;

/**
 * @param {unknown} error
 * @returns {string}
 */
function summarizeError(error) {
  const message = error instanceof Error ? error.message : String(error || 'Error desconocido');
  return message.replace(/\s+/g, ' ').slice(0, 180);
}

/**
 * @returns {string}
 */
function getBackupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function backupCorruptFile(filePath) {
  const backupPath = `${filePath}.corrupt-${getBackupTimestamp()}.bak`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

/**
 * @param {string} id
 * @param {string} filePath
 * @param {unknown} error
 * @returns {object}
 */
function buildCorruptMatchSummary(id, filePath, error) {
  const now = new Date().toISOString();
  return {
    id,
    homeTeam: 'Partido corrupto',
    awayTeam: 'Recuperable',
    date: now.split('T')[0],
    competition: 'Archivo local',
    venue: 'home',
    homeScore: 0,
    awayScore: 0,
    status: 'corrupt',
    corrupt: true,
    recoverable: true,
    filePath,
    error: `JSON invalido: ${summarizeError(error)}`,
    createdAt: now,
    updatedAt: now,
    eventCount: 0,
    sequenceCount: 0,
  };
}

/**
 * @param {string} id
 * @param {string} filePath
 * @param {unknown} error
 * @returns {Error & {recoverable?: boolean, code?: string, filePath?: string}}
 */
function buildCorruptMatchError(id, filePath, error) {
  const recoverable = new Error(`Match corrupto recuperable: ${id}.`);
  recoverable.recoverable = true;
  recoverable.code = 'MATCH_JSON_CORRUPT';
  recoverable.filePath = filePath;
  recoverable.details = summarizeError(error);
  return recoverable;
}

/**
 * @param {string} filePath
 * @param {string} backupPath
 * @param {unknown} error
 * @returns {Error & {recoverable?: boolean, code?: string, filePath?: string, backupPath?: string}}
 */
function buildPendingSyncCorruptError(filePath, backupPath, error) {
  const recoverable = new Error('Cola de sincronizacion corrupta. Se preservo una copia de seguridad.');
  recoverable.recoverable = true;
  recoverable.code = 'PENDING_SYNC_CORRUPT';
  recoverable.filePath = filePath;
  recoverable.backupPath = backupPath;
  recoverable.details = summarizeError(error);
  return recoverable;
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
 * @param {unknown} matchId
 * @returns {string}
 */
function validateMatchId(matchId) {
  if (typeof matchId !== 'string') throw new Error('Match ID invalido.');
  if (!MATCH_ID_RE.test(matchId)) throw new Error('Match ID invalido.');
  if (path.isAbsolute(matchId)) throw new Error('Match ID invalido.');
  return matchId;
}

/**
 * Gets the base data path
 * @returns {string}
 */
function getDataPath() {
  return path.resolve(app.getPath('userData'), 'data');
}

/**
 * @param {unknown} id
 * @param {...string} segments
 * @returns {string}
 */
function resolveMatchPath(id, ...segments) {
  const safeId = validateMatchId(id);
  const dataPath = getDataPath();
  const matchPath = path.resolve(dataPath, safeId);
  if (!isPathInside(dataPath, matchPath)) throw new Error('Match ID invalido.');
  if (segments.length === 0) return matchPath;

  const targetPath = path.resolve(matchPath, ...segments);
  if (!isPathInside(matchPath, targetPath)) throw new Error('Ruta de partido invalida.');
  return targetPath;
}

/**
 * Gets the data directory for a match.
 * @param {string} id
 * @returns {string}
 */
function getMatchDataPath(id) {
  return resolveMatchPath(id);
}

/**
 * @returns {string}
 */
function getPendingSyncPath() {
  return path.resolve(getDataPath(), PENDING_SYNC_FILE);
}

/**
 * Ensures the data directory exists
 */
async function ensureDataPath() {
  const dataPath = getDataPath();
  try {
    await fs.mkdir(dataPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return dataPath;
}

/**
 * Writes a file without exposing a partially-written target.
 * @param {string} filePath
 * @param {string} content
 * @returns {Promise<void>}
 */
async function writeFileAtomically(filePath, content) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fs.writeFile(temporaryPath, content, 'utf-8');
    const fileHandle = await fs.open(temporaryPath, 'r+');
    try {
      await fileHandle.sync();
    } finally {
      await fileHandle.close();
    }
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    try {
      await fs.rm(temporaryPath, { force: true });
    } catch {
      // Preserve the original write error; the previous target remains intact.
    }
    throw error;
  }
}

/**
 * @param {object} data
 * @param {string} id
 * @param {string} now
 * @returns {object}
 */
function buildDefaultMatch(data, id, now) {
  return normalizeMatchForStorage({
    id,
    homeTeam: data.homeTeam || data.localTeam || 'Local',
    awayTeam: data.awayTeam || data.rivalTeam || 'Visitante',
    date: data.date || data.matchDate || now.split('T')[0],
    competition: data.competition || '',
    venue: data.venue || 'home',
    video: data.video || null,
    roster: Array.isArray(data.roster) ? data.roster : [],
    homeScore: Number.isFinite(Number(data.homeScore)) ? Number(data.homeScore) : 0,
    awayScore: Number.isFinite(Number(data.awayScore)) ? Number(data.awayScore) : 0,
    status: data.status || 'created',
    events: Array.isArray(data.events) ? data.events : [],
    drawings: Array.isArray(data.drawings) ? data.drawings : [],
    sequences: Array.isArray(data.sequences) ? data.sequences : [],
    possession: data.possession ?? [],
    coachNotes: data.coachNotes || '',
    scoreAdjustment: data.scoreAdjustment || null,
    scoreOverride: data.scoreOverride || null,
    cloud: data.cloud || null,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  }, { now, preferPersistedScore: Boolean(data.score) });
}

/**
 * @param {object} match
 * @returns {boolean}
 */
function hasPointEvents(match) {
  return Array.isArray(match?.events) && match.events.some(event => event?.type === 'points');
}

/**
 * @param {object} match
 * @returns {object}
 */
function normalizeLegacyScoreOverride(match) {
  if (match?.scoreAdjustment || match?.scoreOverride || hasPointEvents(match)) return match;
  const homeScore = Math.max(0, Number(match?.homeScore) || 0);
  const awayScore = Math.max(0, Number(match?.awayScore) || 0);
  if (homeScore === 0 && awayScore === 0) return match;
  return {
    ...match,
    scoreOverride: {
      enabled: true,
      legacy: true,
      homeScore,
      awayScore,
      updatedAt: match.updatedAt || match.createdAt || new Date().toISOString(),
    },
  };
}

/**
 * @param {object} match
 * @param {{now?: string, preferPersistedScore?: boolean}} [options]
 * @returns {object}
 */
function normalizeMatchForStorage(match, options = {}) {
  const now = options.now || new Date().toISOString();
  const normalized = {
    ...match,
    id: match.id,
    homeTeam: match.homeTeam || match.localTeam || 'Bigua',
    awayTeam: match.awayTeam || match.rivalTeam || 'Rival',
    date: match.date || match.matchDate || now.split('T')[0],
    competition: match.competition || '',
    venue: match.venue === 'away' ? 'away' : 'home',
    video: match.video !== undefined ? match.video : null,
    roster: Array.isArray(match.roster) ? match.roster : [],
    status: match.status || 'created',
    events: Array.isArray(match.events) ? match.events : [],
    drawings: Array.isArray(match.drawings) ? match.drawings : [],
    sequences: Array.isArray(match.sequences) ? match.sequences : [],
    possession: match.possession ?? [],
    coachNotes: match.coachNotes || '',
    scoreAdjustment: match.scoreAdjustment || null,
    scoreOverride: match.scoreOverride || null,
    cloud: match.cloud || null,
    createdAt: match.createdAt || now,
    updatedAt: match.updatedAt || now,
  };
  return normalizeMatchScore(normalizeLegacyScoreOverride(normalized), {
    now,
    preferPersistedScore: options.preferPersistedScore,
  });
}

/**
 * Creates a new match
 * @param {object} data
 * @returns {Promise<object>}
 */
async function createMatch(data) {
  await ensureDataPath();
  const id = data.id ? validateMatchId(data.id) : uuidv4();
  const matchPath = resolveMatchPath(id);
  
  await fs.mkdir(matchPath, { recursive: true });

  const now = new Date().toISOString();
  const match = buildDefaultMatch(data, id, now);

  await writeFileAtomically(resolveMatchPath(id, 'match.json'), JSON.stringify(match, null, 2));
  return match;
}

/**
 * Upserts a match into the local JSON cache without deleting unrelated local data.
 * @param {object} data
 * @returns {Promise<object>}
 */
async function upsertMatchCache(data) {
  if (!data?.id) throw new Error('Match cache id is required');
  const id = validateMatchId(data.id);
  await ensureDataPath();
  const now = new Date().toISOString();
  const matchPath = getMatchDataPath(id);
  await fs.mkdir(matchPath, { recursive: true });

  let existing = null;
  try {
    existing = await getMatchById(id);
  } catch (error) {
    if (error?.recoverable) throw error;
    existing = null;
  }

  const base = existing || buildDefaultMatch(data, id, now);
  const next = normalizeMatchForStorage({
    ...base,
    ...data,
    id,
    homeTeam: data.homeTeam || base.homeTeam || 'Local',
    awayTeam: data.awayTeam || base.awayTeam || 'Visitante',
    date: data.date || base.date || now.split('T')[0],
    competition: data.competition ?? base.competition ?? '',
    venue: data.venue || base.venue || 'home',
    video: data.video !== undefined ? data.video : base.video || null,
    roster: Array.isArray(data.roster) ? data.roster : (Array.isArray(base.roster) ? base.roster : []),
    homeScore: data.homeScore !== undefined ? data.homeScore : (base.homeScore || 0),
    awayScore: data.awayScore !== undefined ? data.awayScore : (base.awayScore || 0),
    status: data.status || base.status || 'created',
    events: Array.isArray(data.events) ? data.events : (Array.isArray(base.events) ? base.events : []),
    drawings: Array.isArray(data.drawings) ? data.drawings : (Array.isArray(base.drawings) ? base.drawings : []),
    sequences: Array.isArray(data.sequences) ? data.sequences : (Array.isArray(base.sequences) ? base.sequences : []),
    possession: data.possession !== undefined ? data.possession : (base.possession ?? []),
    coachNotes: data.coachNotes !== undefined ? data.coachNotes : (base.coachNotes || ''),
    scoreAdjustment: data.scoreAdjustment !== undefined ? data.scoreAdjustment : (base.scoreAdjustment || null),
    scoreOverride: data.scoreOverride !== undefined ? data.scoreOverride : (base.scoreOverride || null),
    cloud: data.cloud !== undefined ? data.cloud : (base.cloud || null),
    createdAt: data.createdAt || base.createdAt || now,
    updatedAt: data.updatedAt || now
  }, { now, preferPersistedScore: data.score !== undefined });

  await writeFileAtomically(resolveMatchPath(id, 'match.json'), JSON.stringify(next, null, 2));
  return next;
}

/**
 * Gets all matches summaries
 * @returns {Promise<Array<object>>}
 */
async function getAllMatches() {
  const dataPath = getDataPath();
  try {
    const dirs = await fs.readdir(dataPath);
    const matches = [];

    for (const dir of dirs) {
      try {
        const matchFile = resolveMatchPath(dir, 'match.json');
        const content = await fs.readFile(matchFile, 'utf-8');
        const match = normalizeMatchForStorage(JSON.parse(content));
        
        // Return summary, avoid returning all events
        const summary = { ...match };
        summary.eventCount = Array.isArray(match.events) ? match.events.length : 0;
        summary.sequenceCount = Array.isArray(match.sequences) ? match.sequences.length : 0;
        delete summary.events;
        delete summary.sequences;
        delete summary.possession;
        
        matches.push(summary);
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        try {
          const safeId = validateMatchId(dir);
          const matchFile = resolveMatchPath(safeId, 'match.json');
          if (error instanceof SyntaxError) {
            matches.push(buildCorruptMatchSummary(safeId, matchFile, error));
          }
        } catch {
          // Skip non-match entries or unsafe directory names.
        }
      }
    }
    return matches;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Gets a full match by ID
 * @param {string} id
 * @returns {Promise<object>}
 */
async function getMatchById(id) {
  const safeId = validateMatchId(id);
  const matchPath = resolveMatchPath(safeId, 'match.json');
  try {
    const content = await fs.readFile(matchPath, 'utf-8');
    return normalizeMatchForStorage(JSON.parse(content));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Match not found');
    }
    if (error instanceof SyntaxError) {
      throw buildCorruptMatchError(safeId, matchPath, error);
    }
    throw error;
  }
}

/**
 * Updates a match
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<object>}
 */
async function updateMatch(id, updates) {
  const safeId = validateMatchId(id);
  const match = await getMatchById(safeId);
  const updatedMatch = normalizeMatchForStorage({
    ...match,
    ...updates,
    id: match.id,
    updatedAt: new Date().toISOString()
  }, { preferPersistedScore: updates.score !== undefined });

  const matchPath = resolveMatchPath(safeId, 'match.json');
  await writeFileAtomically(matchPath, JSON.stringify(updatedMatch, null, 2));
  return updatedMatch;
}

/**
 * Deletes a match
 * @param {string} id
 */
async function deleteMatch(id) {
  const matchPath = resolveMatchPath(id);
  try {
    await fs.rm(matchPath, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

/**
 * Clears only the local account data directory after a confirmed account deletion.
 * @returns {Promise<boolean>}
 */
async function clearLocalAccountData() {
  const dataPath = getDataPath();
  await fs.rm(dataPath, { recursive: true, force: true });
  await ensureDataPath();
  return true;
}

/**
 * @returns {Promise<Array<object>>}
 */
async function readPendingSync(options = {}) {
  const recover = options.recover === true;
  const pendingPath = getPendingSyncPath();
  try {
    const parsed = JSON.parse(await fs.readFile(pendingPath, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    if (error instanceof SyntaxError) {
      const backupPath = await backupCorruptFile(pendingPath);
      const recoverable = buildPendingSyncCorruptError(pendingPath, backupPath, error);
      if (!process.env.VITEST) {
        console.warn(`[BiguAnalytics] pending sync corrupta preservada: ${path.basename(backupPath)}`);
      }
      if (recover) {
        return { operations: [], recoverable };
      }
      throw recoverable;
    }
    throw error;
  }
}

/**
 * @param {Array<object>} operations
 */
async function writePendingSync(operations) {
  await ensureDataPath();
  await fs.writeFile(getPendingSyncPath(), JSON.stringify(operations, null, 2), 'utf-8');
}

/**
 * @param {object} operation
 * @returns {Promise<object>}
 */
async function enqueuePendingSync(operation) {
  const now = new Date().toISOString();
  const pendingState = await readPendingSync({ recover: true });
  const pending = Array.isArray(pendingState) ? pendingState : pendingState.operations;
  const matchId = operation.matchId ? validateMatchId(operation.matchId) : operation.matchId;
  const normalized = {
    id: operation.id || uuidv4(),
    status: 'pending_sync',
    createdAt: operation.createdAt || now,
    updatedAt: now,
    ...operation,
    matchId,
    recoveredFromCorruptQueue: Boolean(pendingState?.recoverable),
    status: 'pending_sync'
  };

  const existingIndex = normalized.dedupeKey
    ? pending.findIndex(item => item.dedupeKey === normalized.dedupeKey)
    : -1;

  if (existingIndex >= 0) {
    pending[existingIndex] = {
      ...pending[existingIndex],
      ...normalized,
      id: pending[existingIndex].id,
      createdAt: pending[existingIndex].createdAt || normalized.createdAt,
      updatedAt: now
    };
  } else {
    pending.push(normalized);
  }

  await writePendingSync(pending);
  return existingIndex >= 0 ? pending[existingIndex] : normalized;
}

/**
 * @param {{matchId?: string}} [filters]
 * @returns {Promise<Array<object>>}
 */
async function getPendingSync(filters = {}) {
  const pending = await readPendingSync();
  if (!filters.matchId) return pending;
  const matchId = validateMatchId(filters.matchId);
  return pending.filter(operation => operation.matchId === matchId);
}

/**
 * @param {Array<string>} ids
 * @returns {Promise<boolean>}
 */
async function markPendingSyncApplied(ids = []) {
  const applied = new Set(ids.map(String));
  const pending = (await readPendingSync()).filter(operation => !applied.has(String(operation.id)));
  await writePendingSync(pending);
  return true;
}

module.exports = {
  getDataPath,
  getMatchDataPath,
  validateMatchId,
  resolveMatchPath,
  createMatch,
  upsertMatchCache,
  getAllMatches,
  getMatchById,
  updateMatch,
  deleteMatch,
  clearLocalAccountData,
  enqueuePendingSync,
  getPendingSync,
  markPendingSyncApplied
};
