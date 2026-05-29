// @ts-check
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDataPath, getMatchDataPath, getMatchById, updateMatch } = require('./storage');
const { updateEvent } = require('./events');

/**
 * @param {string} value
 * @returns {string}
 */
function sanitizeFilePart(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80) || uuidv4();
}

/**
 * @param {number|null|undefined} value
 * @returns {number}
 */
function normalizeDuration(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 3;
  return Math.max(0.5, Math.min(10, Math.round(numeric * 10) / 10));
}

/**
 * @param {string} dataUrl
 * @returns {Buffer}
 */
function pngDataUrlToBuffer(dataUrl) {
  const match = /^data:image\/png;base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) throw new Error('PNG invalido.');
  return Buffer.from(match[1], 'base64');
}

/**
 * @param {string} matchId
 * @param {string} directory
 * @returns {Promise<string>}
 */
async function ensureMatchSubdir(matchId, directory) {
  const target = path.join(getMatchDataPath(matchId), directory);
  await fs.mkdir(target, { recursive: true });
  return target;
}

/**
 * @param {object} data
 * @returns {{width: number|null, height: number|null}}
 */
function normalizeCanvas(data = {}) {
  return {
    width: Number.isFinite(Number(data.width)) ? Number(data.width) : null,
    height: Number.isFinite(Number(data.height)) ? Number(data.height) : null,
  };
}

/**
 * @param {string} matchId
 * @param {object} data
 * @returns {Promise<object>}
 */
async function saveLiveDrawing(matchId, data = {}) {
  const id = sanitizeFilePart(data.id || uuidv4());
  const timestamp = Math.max(0, Number(data.timestamp) || 0);
  const durationSeconds = normalizeDuration(data.durationSeconds);
  const now = new Date().toISOString();
  const drawing = {
    id,
    kind: 'live',
    matchId,
    timestamp,
    durationSeconds,
    canvas: normalizeCanvas(data.canvas),
    strokes: Array.isArray(data.strokes) ? data.strokes : [],
    createdAt: now,
  };
  const drawingsPath = await ensureMatchSubdir(matchId, 'drawings');
  await fs.writeFile(path.join(drawingsPath, `${id}.json`), JSON.stringify(drawing, null, 2), 'utf-8');

  const match = await getMatchById(matchId);
  const marker = {
    id,
    timestamp,
    durationSeconds,
    file: `drawings/${id}.json`,
    createdAt: now,
  };
  const nextMarkers = [
    ...(Array.isArray(match.drawings) ? match.drawings.filter(item => item.id !== id) : []),
    marker,
  ].sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
  await updateMatch(matchId, {
    drawings: nextMarkers,
    status: match.status === 'created' ? 'tagging' : match.status,
  });

  return drawing;
}

/**
 * @param {string} matchId
 * @param {string} eventId
 * @param {object} data
 * @returns {Promise<object>}
 */
async function saveFrameDrawing(matchId, eventId, data = {}) {
  const safeEventId = sanitizeFilePart(eventId);
  const match = await getMatchById(matchId);
  const event = (match.events || []).find(item => item.id === eventId);
  if (!event) throw new Error('Event not found');

  const framesPath = await ensureMatchSubdir(matchId, 'frames');
  const drawingsPath = await ensureMatchSubdir(matchId, 'drawings');
  await fs.writeFile(path.join(framesPath, `${safeEventId}.png`), pngDataUrlToBuffer(data.imageDataUrl));

  const drawing = {
    id: safeEventId,
    kind: 'frame',
    matchId,
    eventId,
    timestamp: Number(event.timestamp) || 0,
    durationSeconds: normalizeDuration(data.durationSeconds),
    frameFile: `frames/${safeEventId}.png`,
    canvas: normalizeCanvas(data.canvas),
    strokes: Array.isArray(data.strokes) ? data.strokes : [],
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(drawingsPath, `${safeEventId}.json`), JSON.stringify(drawing, null, 2), 'utf-8');
  const updatedEvent = await updateEvent(matchId, eventId, { drawingId: safeEventId });

  return {
    drawingId: safeEventId,
    event: updatedEvent,
    file: drawing.frameFile,
  };
}

/**
 * @param {string} matchId
 * @returns {Promise<{live: Array<object>, frames: Array<object>}>}
 */
async function getMatchDrawings(matchId) {
  const match = await getMatchById(matchId);
  const live = Array.isArray(match.drawings) ? match.drawings : [];
  const frames = (match.events || [])
    .filter(event => event.drawingId)
    .map(event => ({
      eventId: event.id,
      drawingId: event.drawingId,
      timestamp: event.timestamp,
      type: event.type,
      result: event.result,
      note: event.note,
      file: `frames/${sanitizeFilePart(event.drawingId)}.png`,
    }));
  return { live, frames };
}

/**
 * @param {string} matchId
 * @returns {Promise<Array<object>>}
 */
async function getAnnotatedFramesForPdf(matchId) {
  const match = await getMatchById(matchId);
  const attachments = [];

  for (const event of match.events || []) {
    if (!event.drawingId) continue;
    const filePath = path.join(getMatchDataPath(matchId), 'frames', `${sanitizeFilePart(event.drawingId)}.png`);
    try {
      const image = await fs.readFile(filePath);
      attachments.push({
        eventId: event.id,
        drawingId: event.drawingId,
        timestamp: Number(event.timestamp) || 0,
        type: event.type,
        result: event.result,
        note: event.note || '',
        imageDataUrl: `data:image/png;base64,${image.toString('base64')}`,
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  return attachments;
}

/**
 * @param {string} dataUrl
 * @param {string} suggestedName
 * @param {{dialog: object, browserWindow?: object|null}} options
 * @returns {Promise<{canceled: boolean, filePath?: string}>}
 */
async function exportPng(dataUrl, suggestedName = 'frame.png', options) {
  const saveResult = await options.dialog.showSaveDialog(options.browserWindow || null, {
    title: 'Exportar PNG',
    defaultPath: suggestedName,
    filters: [{ name: 'PNG', extensions: ['png'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return { canceled: true };
  await fs.mkdir(path.dirname(saveResult.filePath), { recursive: true });
  await fs.writeFile(saveResult.filePath, pngDataUrlToBuffer(dataUrl));
  return { canceled: false, filePath: saveResult.filePath };
}

module.exports = {
  saveLiveDrawing,
  saveFrameDrawing,
  getMatchDrawings,
  getAnnotatedFramesForPdf,
  exportPng,
  pngDataUrlToBuffer,
  getDataPath,
};
