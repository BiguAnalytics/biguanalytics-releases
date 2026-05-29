// @ts-check
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDataPath } = require('./storage');
const { exportPng } = require('./drawings');

/**
 * @returns {string}
 */
function getBoardsPath() {
  return path.join(getDataPath(), 'tactical-boards');
}

/**
 * @param {string} value
 * @returns {string}
 */
function sanitizeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || uuidv4();
}

/**
 * @returns {Promise<string>}
 */
async function ensureBoardsPath() {
  const boardsPath = getBoardsPath();
  await fs.mkdir(boardsPath, { recursive: true });
  return boardsPath;
}

/**
 * @param {string} id
 * @returns {string}
 */
function getBoardFilePath(id) {
  return path.join(getBoardsPath(), `${sanitizeId(id)}.json`);
}

/**
 * @param {object} data
 * @param {object} [base]
 * @returns {object}
 */
function buildBoard(data = {}, base = {}) {
  const now = new Date().toISOString();
  return {
    id: base.id || sanitizeId(data.id || uuidv4()),
    name: String(data.name || base.name || 'Nuevo tablero').trim().slice(0, 80) || 'Nuevo tablero',
    date: base.date || data.date || now,
    updatedAt: now,
    thumbnail: data.thumbnail ?? base.thumbnail ?? '',
    canvas: data.canvas || base.canvas || { width: 1200, height: 720 },
    strokes: Array.isArray(data.strokes) ? data.strokes : Array.isArray(base.strokes) ? base.strokes : [],
  };
}

/**
 * @param {object} data
 * @returns {Promise<object>}
 */
async function createTacticalBoard(data = {}) {
  const boardsPath = await ensureBoardsPath();
  const board = buildBoard(data);
  await fs.writeFile(path.join(boardsPath, `${board.id}.json`), JSON.stringify(board, null, 2), 'utf-8');
  return board;
}

/**
 * @param {string} id
 * @returns {Promise<object>}
 */
async function getTacticalBoard(id) {
  try {
    return JSON.parse(await fs.readFile(getBoardFilePath(id), 'utf-8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Tactical board not found');
    throw error;
  }
}

/**
 * @returns {Promise<Array<object>>}
 */
async function listTacticalBoards() {
  try {
    const files = await fs.readdir(getBoardsPath());
    const boards = [];
    for (const file of files.filter(item => item.endsWith('.json'))) {
      try {
        const board = JSON.parse(await fs.readFile(path.join(getBoardsPath(), file), 'utf-8'));
        boards.push({
          id: board.id,
          name: board.name,
          date: board.date,
          updatedAt: board.updatedAt,
          thumbnail: board.thumbnail || '',
        });
      } catch {
        // Ignore corrupt board files.
      }
    }
    return boards.sort((a, b) => new Date(b.updatedAt || b.date || 0).getTime() - new Date(a.updatedAt || a.date || 0).getTime());
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<object>}
 */
async function updateTacticalBoard(id, updates = {}) {
  await ensureBoardsPath();
  const current = await getTacticalBoard(id);
  const next = buildBoard(updates, current);
  await fs.writeFile(getBoardFilePath(id), JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

/**
 * @param {string} id
 * @param {string} name
 * @returns {Promise<object>}
 */
async function renameTacticalBoard(id, name) {
  return updateTacticalBoard(id, { name });
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteTacticalBoard(id) {
  await fs.rm(getBoardFilePath(id), { force: true });
}

module.exports = {
  createTacticalBoard,
  getTacticalBoard,
  listTacticalBoards,
  updateTacticalBoard,
  renameTacticalBoard,
  deleteTacticalBoard,
  exportTacticalBoardPng: exportPng,
};
