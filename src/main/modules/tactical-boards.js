// @ts-check
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDataPath } = require('./storage');
const { exportPng } = require('./drawings');

const DEFAULT_CANVAS = {
  width: 1200,
  height: 720,
  backgroundColor: '#26405F',
  fieldTemplate: 'full',
};

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
 * @param {unknown} error
 * @returns {string}
 */
function summarizeError(error) {
  const message = error instanceof Error ? error.message : String(error || 'Error desconocido');
  return message.replace(/\s+/g, ' ').slice(0, 180);
}

/**
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
function normalizeStepDuration(value, fallback = 3) {
  const numeric = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 3;
  const base = Number.isFinite(numeric) ? numeric : safeFallback;
  return Math.max(0.5, Math.min(10, Math.round(base * 10) / 10));
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeThumbnailNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

/**
 * @param {Array<object>} strokes
 * @returns {Array<object>}
 */
function cloneStrokes(strokes = []) {
  return JSON.parse(JSON.stringify(Array.isArray(strokes) ? strokes : []));
}

/**
 * @param {object} frame
 * @param {number} index
 * @returns {object}
 */
function normalizeFrame(frame = {}, index = 0) {
  const elements = Array.isArray(frame.elements)
    ? frame.elements
    : Array.isArray(frame.strokes)
      ? frame.strokes
      : [];
  const durationSeconds = normalizeStepDuration(frame.durationSeconds ?? frame.duration);
  return {
    id: sanitizeId(frame.id || `frame-${index + 1}`),
    name: String(frame.name || frame.label || `Frame ${index + 1}`).trim().slice(0, 60) || `Frame ${index + 1}`,
    order: Number.isFinite(Number(frame.order)) ? Number(frame.order) : index,
    duration: durationSeconds,
    durationSeconds,
    elements: cloneStrokes(elements),
    thumbnail: String(frame.thumbnail || ''),
    thumbnailWidth: normalizeThumbnailNumber(frame.thumbnailWidth),
    thumbnailHeight: normalizeThumbnailNumber(frame.thumbnailHeight),
    thumbnailVersion: normalizeThumbnailNumber(frame.thumbnailVersion),
  };
}

/**
 * @param {object} step
 * @param {number} index
 * @returns {object}
 */
function normalizeStep(step = {}, index = 0) {
  return {
    id: sanitizeId(step.id || `step-${index + 1}`),
    label: String(step.label || `Etapa ${index + 1}`).trim().slice(0, 40) || `Etapa ${index + 1}`,
    durationSeconds: normalizeStepDuration(step.durationSeconds),
    strokes: cloneStrokes(step.strokes),
    thumbnail: String(step.thumbnail || ''),
    thumbnailWidth: normalizeThumbnailNumber(step.thumbnailWidth),
    thumbnailHeight: normalizeThumbnailNumber(step.thumbnailHeight),
    thumbnailVersion: normalizeThumbnailNumber(step.thumbnailVersion),
  };
}

/**
 * @param {object} data
 * @param {object} [base]
 * @returns {Array<object>}
 */
function normalizeSteps(data = {}, base = {}) {
  if (Array.isArray(data.steps) && data.steps.length > 0) {
    return data.steps.map((step, index) => normalizeStep(step, index));
  }

  const strokes = Array.isArray(data.strokes)
    ? data.strokes
    : null;
  if (strokes) {
    return [
      normalizeStep({
        id: 'step-1',
        label: 'Etapa 1',
        durationSeconds: data.durationSeconds ?? base.durationSeconds ?? 3,
        strokes,
      }, 0),
    ];
  }

  if (Array.isArray(base.steps) && base.steps.length > 0) {
    return base.steps.map((step, index) => normalizeStep(step, index));
  }

  const fallbackStrokes = Array.isArray(base.strokes) ? base.strokes : [];
  return [
    normalizeStep({
      id: 'step-1',
      label: 'Etapa 1',
      durationSeconds: data.durationSeconds ?? base.durationSeconds ?? 3,
      strokes: fallbackStrokes,
    }, 0),
  ];
}

/**
 * @param {object} data
 * @param {object} [base]
 * @returns {Array<object>}
 */
function normalizeFrames(data = {}, base = {}) {
  const sequenceFrames = Array.isArray(data.drawingSequences?.[0]?.frames)
    ? data.drawingSequences[0].frames
    : [];
  if (Object.prototype.hasOwnProperty.call(data, 'frames') && Array.isArray(data.frames)) {
    return data.frames.map((frame, index) => normalizeFrame(frame, index));
  }
  if (sequenceFrames.length > 0) {
    return sequenceFrames.map((frame, index) => normalizeFrame(frame, index));
  }
  if (Array.isArray(data.steps) && data.steps.length > 0) {
    return data.steps.map((step, index) => normalizeFrame({
      id: step.id,
      name: step.label || `Frame ${index + 1}`,
      order: index,
      durationSeconds: step.durationSeconds,
      elements: step.strokes,
      thumbnail: step.thumbnail,
      thumbnailWidth: step.thumbnailWidth,
      thumbnailHeight: step.thumbnailHeight,
      thumbnailVersion: step.thumbnailVersion,
    }, index));
  }
  if (Array.isArray(data.strokes)) {
    return [normalizeFrame({
      id: 'frame-1',
      name: 'Frame 1',
      order: 0,
      durationSeconds: data.durationSeconds ?? base.durationSeconds ?? 3,
      elements: data.strokes,
      thumbnail: data.thumbnail,
    }, 0)];
  }
  if (Array.isArray(base.frames) && base.frames.length > 0) {
    return base.frames.map((frame, index) => normalizeFrame(frame, index));
  }
  if (Array.isArray(base.drawingSequences?.[0]?.frames) && base.drawingSequences[0].frames.length > 0) {
    return base.drawingSequences[0].frames.map((frame, index) => normalizeFrame(frame, index));
  }
  if (Array.isArray(base.steps) && base.steps.length > 0) {
    return base.steps.map((step, index) => normalizeFrame({
      id: step.id,
      name: step.label || `Frame ${index + 1}`,
      order: index,
      durationSeconds: step.durationSeconds,
      elements: step.strokes,
      thumbnail: step.thumbnail,
      thumbnailWidth: step.thumbnailWidth,
      thumbnailHeight: step.thumbnailHeight,
      thumbnailVersion: step.thumbnailVersion,
    }, index));
  }
  if (Array.isArray(base.strokes)) {
    return [normalizeFrame({
      id: 'frame-1',
      name: 'Frame 1',
      order: 0,
      durationSeconds: base.durationSeconds ?? 3,
      elements: base.strokes,
      thumbnail: base.thumbnail,
    }, 0)];
  }
  return [];
}

/**
 * @param {Array<object>} steps
 * @returns {number}
 */
function getDurationSeconds(steps = []) {
  const timedSteps = steps.length > 1 ? steps.slice(0, -1) : steps;
  return Math.round(timedSteps.reduce((sum, step) => sum + normalizeStepDuration(step.durationSeconds), 0) * 10) / 10;
}

/**
 * @param {Array<object>} frames
 * @returns {Array<object>}
 */
function framesToSteps(frames = []) {
  return frames.map((frame, index) => ({
    id: frame.id || `frame-${index + 1}`,
    label: frame.name || `Frame ${index + 1}`,
    durationSeconds: normalizeStepDuration(frame.durationSeconds ?? frame.duration),
    strokes: cloneStrokes(frame.elements),
    thumbnail: frame.thumbnail || '',
    thumbnailWidth: normalizeThumbnailNumber(frame.thumbnailWidth),
    thumbnailHeight: normalizeThumbnailNumber(frame.thumbnailHeight),
    thumbnailVersion: normalizeThumbnailNumber(frame.thumbnailVersion),
  }));
}

/**
 * @param {object} frame
 * @param {number} index
 * @returns {object}
 */
function frameToDrawingSequenceFrame(frame = {}, index = 0) {
  const duration = normalizeStepDuration(frame.durationSeconds ?? frame.duration);
  return {
    id: frame.id || `frame-${index + 1}`,
    name: frame.name || `Frame ${index + 1}`,
    order: Number.isFinite(Number(frame.order)) ? Number(frame.order) : index,
    duration,
    durationSeconds: duration,
    elements: cloneStrokes(frame.elements),
    thumbnail: frame.thumbnail || '',
    thumbnailWidth: normalizeThumbnailNumber(frame.thumbnailWidth),
    thumbnailHeight: normalizeThumbnailNumber(frame.thumbnailHeight),
    thumbnailVersion: normalizeThumbnailNumber(frame.thumbnailVersion),
  };
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
 * @param {{preserveTimestamps?: boolean}} [options]
 * @returns {object}
 */
function buildBoard(data = {}, base = {}, options = {}) {
  const now = new Date().toISOString();
  const id = base.id || sanitizeId(data.id || uuidv4());
  const name = String(data.name || base.name || 'Nuevo tablero').trim().slice(0, 80) || 'Nuevo tablero';
  const updatedAt = options.preserveTimestamps ? (data.updatedAt || base.updatedAt || now) : now;
  const canvas = {
    ...DEFAULT_CANVAS,
    ...(base.canvas || {}),
    ...(data.canvas || {}),
  };
  const frames = normalizeFrames(data, base);
  const hasFramePayload = Object.prototype.hasOwnProperty.call(data, 'frames')
    || Array.isArray(data.drawingSequences?.[0]?.frames);
  const steps = hasFramePayload || frames.length > 0 ? framesToSteps(frames) : normalizeSteps(data, base);
  const primaryThumbnail = data.thumbnail
    ?? frames.find(frame => frame.thumbnail)?.thumbnail
    ?? base.thumbnail
    ?? '';
  const sequenceMeta = Array.isArray(data.drawingSequences) && data.drawingSequences[0]
    ? data.drawingSequences[0]
    : Array.isArray(base.drawingSequences) && base.drawingSequences[0]
      ? base.drawingSequences[0]
      : {};
  return {
    id,
    kind: 'drawing-sequence',
    name,
    date: base.date || data.date || now,
    updatedAt,
    thumbnail: primaryThumbnail,
    canvas,
    durationSeconds: getDurationSeconds(steps),
    stepCount: steps.length,
    frameCount: frames.length,
    frames,
    drawingSequences: [
      {
        id,
        name,
        isOpen: sequenceMeta.isOpen !== false,
        createdAt: base.date || data.date || now,
        updatedAt,
        frames: frames.map(frameToDrawingSequenceFrame),
      },
    ],
    steps,
    strokes: cloneStrokes(steps[0]?.strokes),
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
    const board = JSON.parse(await fs.readFile(getBoardFilePath(id), 'utf-8'));
    return buildBoard(board, board, { preserveTimestamps: true });
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
      const filePath = path.join(getBoardsPath(), file);
      try {
        const board = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        boards.push({
          id: board.id,
          kind: board.kind || 'drawing-sequence',
          name: board.name,
          date: board.date,
          updatedAt: board.updatedAt,
          thumbnail: board.thumbnail || '',
          stepCount: Number(board.stepCount) || (Array.isArray(board.steps) ? board.steps.length : 1),
          frameCount: Number(board.frameCount) || (Array.isArray(board.frames) ? board.frames.length : Number(board.stepCount) || 0),
          isOpen: board.drawingSequences?.[0]?.isOpen !== false,
        });
      } catch (error) {
        if (error instanceof SyntaxError) {
          const stat = await fs.stat(filePath).catch(() => null);
          boards.push({
            id: sanitizeId(path.basename(file, '.json')),
            kind: 'drawing-sequence',
            name: 'Tablero corrupto',
            date: stat?.mtime?.toISOString?.() || new Date().toISOString(),
            updatedAt: stat?.mtime?.toISOString?.() || new Date().toISOString(),
            thumbnail: '',
            stepCount: 0,
            frameCount: 0,
            isOpen: false,
            status: 'corrupt',
            corrupt: true,
            recoverable: true,
            filePath,
            error: `JSON invalido: ${summarizeError(error)}`,
          });
        }
      }
    }
    return boards.sort((a, b) => {
      if (a.corrupt && !b.corrupt) return -1;
      if (!a.corrupt && b.corrupt) return 1;
      return new Date(b.updatedAt || b.date || 0).getTime() - new Date(a.updatedAt || a.date || 0).getTime();
    });
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
