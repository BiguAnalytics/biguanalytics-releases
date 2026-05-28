// @ts-check
const fs = require('fs/promises');
const path = require('path');
const electron = require('electron');
const app = electron.app || electron.default?.app || (process.env.VITEST ? { getPath: () => path.join(process.cwd(), '.vitest-user-data') } : undefined);
const { v4: uuidv4 } = require('uuid');

/**
 * Gets the base data path
 * @returns {string}
 */
function getDataPath() {
  return path.join(app.getPath('userData'), 'data');
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
 * Creates a new match
 * @param {object} data
 * @returns {Promise<object>}
 */
async function createMatch(data) {
  const dataPath = await ensureDataPath();
  const id = uuidv4();
  const matchPath = path.join(dataPath, id);
  
  await fs.mkdir(matchPath, { recursive: true });

  const now = new Date().toISOString();
  const match = {
    id,
    homeTeam: data.homeTeam || 'Local',
    awayTeam: data.awayTeam || 'Visitante',
    date: data.date || now.split('T')[0],
    competition: data.competition || '',
    venue: data.venue || 'home',
    video: data.video || null,
    roster: Array.isArray(data.roster) ? data.roster : [],
    homeScore: 0,
    awayScore: 0,
    status: 'created',
    events: [],
    sequences: [],
    possession: [],
    coachNotes: '',
    createdAt: now,
    updatedAt: now
  };

  await fs.writeFile(path.join(matchPath, 'match.json'), JSON.stringify(match, null, 2), 'utf-8');
  return match;
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
        const matchFile = path.join(dataPath, dir, 'match.json');
        const content = await fs.readFile(matchFile, 'utf-8');
        const match = JSON.parse(content);
        
        // Return summary, avoid returning all events
        const summary = { ...match };
        delete summary.events;
        delete summary.sequences;
        delete summary.possession;
        
        matches.push(summary);
      } catch {
        // Skip invalid directories/files
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
  const matchPath = path.join(getDataPath(), id, 'match.json');
  try {
    const content = await fs.readFile(matchPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Match with ID ${id} not found`);
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
  const match = await getMatchById(id);
  const updatedMatch = {
    ...match,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  const matchPath = path.join(getDataPath(), id, 'match.json');
  await fs.writeFile(matchPath, JSON.stringify(updatedMatch, null, 2), 'utf-8');
  return updatedMatch;
}

/**
 * Deletes a match
 * @param {string} id
 */
async function deleteMatch(id) {
  const matchPath = path.join(getDataPath(), id);
  try {
    await fs.rm(matchPath, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = {
  createMatch,
  getAllMatches,
  getMatchById,
  updateMatch,
  deleteMatch
};
