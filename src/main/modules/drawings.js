// @ts-check
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDataPath, getMatchDataPath, getMatchById, updateMatch } = require('./storage');
const { updateEvent } = require('./events');

const MAX_FRAME_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FRAME_DRAWINGS_PER_MATCH = 250;
const MAX_PDF_FRAME_ATTACHMENTS = 80;

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
 * @param {number|null|undefined} value
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
 * @param {Array<object>} strokes
 * @returns {Array<object>}
 */
function cloneStrokes(strokes = []) {
  return JSON.parse(JSON.stringify(Array.isArray(strokes) ? strokes : []));
}

/**
 * @param {object} step
 * @param {number} index
 * @param {number} fallbackDuration
 * @returns {object}
 */
function normalizeSequenceStep(step = {}, index = 0, fallbackDuration = 3) {
  return {
    id: sanitizeFilePart(step.id || `step-${index + 1}`),
    label: String(step.label || `Etapa ${index + 1}`).trim().slice(0, 40) || `Etapa ${index + 1}`,
    durationSeconds: normalizeStepDuration(step.durationSeconds, fallbackDuration),
    strokes: cloneStrokes(step.strokes),
  };
}

/**
 * @param {object} data
 * @param {number} [fallbackDuration]
 * @returns {Array<object>}
 */
function normalizeSequenceSteps(data = {}, fallbackDuration = 3) {
  const sourceSteps = Array.isArray(data.steps)
    ? data.steps
    : Array.isArray(data.sequence?.steps)
      ? data.sequence.steps
      : [];

  if (sourceSteps.length > 0) {
    return sourceSteps.map((step, index) => normalizeSequenceStep(step, index));
  }

  const stepDuration = Number.isFinite(Number(data.durationSeconds))
    ? Number(data.durationSeconds)
    : fallbackDuration;
  return [
    normalizeSequenceStep({
      id: 'step-1',
      label: 'Etapa 1',
      durationSeconds: stepDuration,
      strokes: data.strokes,
    }, 0, stepDuration),
  ];
}

/**
 * @param {Array<object>} steps
 * @returns {number}
 */
function getSequenceDurationSeconds(steps = []) {
  const timedSteps = steps.length > 1 ? steps.slice(0, -1) : steps;
  const total = timedSteps.reduce((sum, step) => sum + normalizeStepDuration(step.durationSeconds), 0);
  return Math.round(total * 10) / 10;
}

/**
 * @param {object} drawing
 * @returns {Array<object>}
 */
function getSequencePreviewStrokes(drawing = {}) {
  const steps = Array.isArray(drawing.steps) ? drawing.steps : [];
  if (steps.length > 0) return cloneStrokes(steps[0].strokes);
  return cloneStrokes(drawing.strokes);
}

/**
 * @param {string} dataUrl
 * @returns {Buffer}
 */
function pngDataUrlToBuffer(dataUrl) {
  const match = /^data:image\/(png);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(String(dataUrl || '').trim());
  if (!match) throw new Error('Imagen PNG base64 invalida.');
  const base64 = match[2];
  if (base64.length % 4 !== 0) throw new Error('Imagen base64 invalida.');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_FRAME_IMAGE_BYTES) throw new Error('Imagen tamano demasiado grande.');
  const isPng = buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a;
  if (!isPng) throw new Error('PNG invalido.');
  return buffer;
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
 * @param {unknown} value
 * @returns {string}
 */
function normalizeBackgroundImage(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(text)) return text;
  if (/^https:\/\/[^\s]+$/i.test(text)) return text;
  return '';
}

/**
 * @param {object} marker
 * @returns {string}
 */
function getLiveDrawingFileName(marker = {}) {
  const markerFile = path.basename(String(marker.file || ''));
  if (markerFile.toLowerCase().endsWith('.json')) {
    return `${sanitizeFilePart(markerFile.slice(0, -5))}.json`;
  }
  return `${sanitizeFilePart(marker.id)}.json`;
}

/**
 * @param {string} matchId
 * @param {object} marker
 * @returns {Promise<object>}
 */
async function readLiveDrawing(matchId, marker = {}) {
  const fileName = getLiveDrawingFileName(marker);
  const filePath = path.join(getMatchDataPath(matchId), 'drawings', fileName);

  try {
    const drawing = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    const timestamp = Math.max(0, Number(marker.timestamp ?? drawing.timestamp) || 0);
    const steps = normalizeSequenceSteps(drawing, normalizeDuration(marker.durationSeconds ?? drawing.durationSeconds));
    const durationSeconds = getSequenceDurationSeconds(steps);
    return {
      ...marker,
      ...drawing,
      id: marker.id || drawing.id,
      kind: 'live-sequence',
      timestamp,
      durationSeconds,
      stepCount: steps.length,
      file: marker.file || `drawings/${fileName}`,
      canvas: normalizeCanvas(drawing.canvas),
      backgroundImage: normalizeBackgroundImage(drawing.backgroundImage || marker.backgroundImage),
      steps,
      strokes: getSequencePreviewStrokes({ ...drawing, steps }),
    };
  } catch (error) {
    if (error.code === 'ENOENT') return marker;
    throw error;
  }
}

/**
 * @param {string} matchId
 * @param {object} data
 * @returns {Promise<object>}
 */
async function saveLiveDrawing(matchId, data = {}) {
  const id = sanitizeFilePart(data.id || uuidv4());
  const timestamp = Math.max(0, Number(data.timestamp) || 0);
  const steps = normalizeSequenceSteps(data, normalizeDuration(data.durationSeconds));
  const durationSeconds = getSequenceDurationSeconds(steps);
  const now = new Date().toISOString();
  const drawing = {
    id,
    kind: 'live-sequence',
    matchId,
    timestamp,
    durationSeconds,
    stepCount: steps.length,
    canvas: normalizeCanvas(data.canvas),
    backgroundImage: normalizeBackgroundImage(data.backgroundImage),
    steps,
    strokes: getSequencePreviewStrokes({ ...data, steps }),
    createdAt: now,
  };
  const drawingsPath = await ensureMatchSubdir(matchId, 'drawings');
  await fs.writeFile(path.join(drawingsPath, `${id}.json`), JSON.stringify(drawing, null, 2), 'utf-8');

  const match = await getMatchById(matchId);
  const marker = {
    id,
    kind: 'live-sequence',
    timestamp,
    durationSeconds,
    stepCount: steps.length,
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
 * @param {string} drawingId
 * @param {object} data
 * @returns {Promise<object>}
 */
async function updateLiveDrawing(matchId, drawingId, data = {}) {
  const match = await getMatchById(matchId);
  const safeId = sanitizeFilePart(drawingId);
  const marker = (Array.isArray(match.drawings) ? match.drawings : [])
    .find(item => item.id === drawingId || item.id === safeId);
  if (!marker) throw new Error('Drawing not found');

  const existing = await readLiveDrawing(matchId, marker);
  const timestamp = Number.isFinite(Number(data.timestamp))
    ? Math.max(0, Number(data.timestamp))
    : Math.max(0, Number(existing.timestamp) || 0);
  const steps = Array.isArray(data.steps)
    ? normalizeSequenceSteps(data, normalizeDuration(existing.durationSeconds))
    : Array.isArray(data.strokes)
      ? normalizeSequenceSteps(data, normalizeDuration(data.durationSeconds ?? existing.durationSeconds))
      : Array.isArray(existing.steps)
        ? existing.steps
        : normalizeSequenceSteps(existing, normalizeDuration(existing.durationSeconds));
  const durationSeconds = getSequenceDurationSeconds(steps);
  const updatedAt = new Date().toISOString();
  const drawing = {
    ...existing,
    id: marker.id,
    kind: 'live-sequence',
    matchId,
    timestamp,
    durationSeconds,
    stepCount: steps.length,
    canvas: normalizeCanvas(data.canvas ?? existing.canvas),
    backgroundImage: normalizeBackgroundImage(data.backgroundImage) || normalizeBackgroundImage(existing.backgroundImage),
    steps,
    strokes: getSequencePreviewStrokes({ ...existing, ...data, steps }),
    updatedAt,
  };
  const fileName = getLiveDrawingFileName(marker);
  const drawingsPath = await ensureMatchSubdir(matchId, 'drawings');
  await fs.writeFile(path.join(drawingsPath, fileName), JSON.stringify(drawing, null, 2), 'utf-8');

  const nextMarkers = (Array.isArray(match.drawings) ? match.drawings : [])
    .map(item => (item.id === marker.id ? {
      ...item,
      kind: 'live-sequence',
      timestamp,
      durationSeconds,
      stepCount: steps.length,
      file: item.file || `drawings/${fileName}`,
      updatedAt,
    } : item))
    .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
  await updateMatch(matchId, { drawings: nextMarkers });
  return drawing;
}

/**
 * @param {string} matchId
 * @param {string} drawingId
 * @returns {Promise<{deleted: boolean, id: string}>}
 */
async function deleteLiveDrawing(matchId, drawingId) {
  const match = await getMatchById(matchId);
  const safeId = sanitizeFilePart(drawingId);
  const marker = (Array.isArray(match.drawings) ? match.drawings : [])
    .find(item => item.id === drawingId || item.id === safeId);
  if (!marker) return { deleted: false, id: safeId };

  const fileName = getLiveDrawingFileName(marker);
  try {
    await fs.unlink(path.join(getMatchDataPath(matchId), 'drawings', fileName));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await updateMatch(matchId, {
    drawings: (Array.isArray(match.drawings) ? match.drawings : [])
      .filter(item => item.id !== marker.id),
  });
  return { deleted: true, id: marker.id };
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
  const existingFrameCount = (match.events || [])
    .filter(item => item.drawingId && item.id !== event.id)
    .length;
  if (!event.drawingId && existingFrameCount >= MAX_FRAME_DRAWINGS_PER_MATCH) {
    throw new Error('Limite de dibujos por partido alcanzado.');
  }
  const imageBuffer = pngDataUrlToBuffer(data.imageDataUrl);

  const framesPath = await ensureMatchSubdir(matchId, 'frames');
  const drawingsPath = await ensureMatchSubdir(matchId, 'drawings');
  await fs.writeFile(path.join(framesPath, `${safeEventId}.png`), imageBuffer);

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
  const live = await Promise.all((Array.isArray(match.drawings) ? match.drawings : [])
    .map(marker => readLiveDrawing(matchId, marker)));
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
 * @returns {Promise<{frames: Array<object>, omitted: {overLimit: number, oversized: number, missing: number}, limit: number, maxBytes: number, warning: string}>}
 */
async function getAnnotatedFramesForPdf(matchId) {
  const match = await getMatchById(matchId);
  const annotatedEvents = (match.events || []).filter(event => event.drawingId);
  const frames = [];
  const omitted = {
    overLimit: Math.max(0, annotatedEvents.length - MAX_PDF_FRAME_ATTACHMENTS),
    oversized: 0,
    missing: 0,
  };

  for (const event of annotatedEvents.slice(0, MAX_PDF_FRAME_ATTACHMENTS)) {
    const filePath = path.join(getMatchDataPath(matchId), 'frames', `${sanitizeFilePart(event.drawingId)}.png`);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_FRAME_IMAGE_BYTES) {
        omitted.oversized += 1;
        continue;
      }
      const image = await fs.readFile(filePath);
      frames.push({
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
      omitted.missing += 1;
    }
  }

  const omittedTotal = omitted.overLimit + omitted.oversized + omitted.missing;
  const warning = omittedTotal > 0
    ? `PDF: se incluyeron ${frames.length} frames anotados y se omitieron ${omittedTotal} por limite ${MAX_PDF_FRAME_ATTACHMENTS}, tamano o archivo faltante.`
    : '';

  return {
    frames,
    omitted,
    limit: MAX_PDF_FRAME_ATTACHMENTS,
    maxBytes: MAX_FRAME_IMAGE_BYTES,
    warning,
  };
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
  updateLiveDrawing,
  deleteLiveDrawing,
  saveFrameDrawing,
  getMatchDrawings,
  getAnnotatedFramesForPdf,
  exportPng,
  pngDataUrlToBuffer,
  getDataPath,
};
