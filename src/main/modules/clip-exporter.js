// @ts-check
const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { getMatchById } = require('./storage');
const { getSettings } = require('./settings');

const YOUTUBE_CLIP_EXPORT_MESSAGE = 'La exportación de clips requiere tener cargado el archivo MP4 local del partido.';
const MISSING_VIDEO_MESSAGE = 'No se encontró el video original. Volvé a cargar el MP4 del partido.';
const MISSING_TIMESTAMP_MESSAGE = 'El evento no tiene timestamp válido para exportar.';
const EMPTY_EXPORT_MESSAGE = 'No hay clips para exportar con estos filtros.';
const DEFAULT_CLIP_PRE_ROLL_SECONDS = 5;
const DEFAULT_CLIP_POST_ROLL_SECONDS = 8;
const MAX_CLIP_EDGE_SECONDS = 60;

/**
 * @param {number|string|null|undefined} value
 * @param {number} fallback
 * @param {number} min
 * @returns {number}
 */
function normalizeClipSeconds(value, fallback, min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min) return fallback;
  return Math.min(MAX_CLIP_EDGE_SECONDS, Math.round(numeric));
}

/**
 * @param {object} [settings]
 * @returns {{clipPreRollSeconds: number, clipPostRollSeconds: number, clipExportQuality: string}}
 */
function normalizeClipSettings(settings = {}) {
  return {
    clipPreRollSeconds: normalizeClipSeconds(settings.clipPreRollSeconds, DEFAULT_CLIP_PRE_ROLL_SECONDS, 0),
    clipPostRollSeconds: normalizeClipSeconds(settings.clipPostRollSeconds, DEFAULT_CLIP_POST_ROLL_SECONDS, 1),
    clipExportQuality: settings.clipExportQuality === 'reencode' ? 'reencode' : 'copy',
  };
}

/**
 * @param {number|string|null|undefined} timestamp
 * @param {number|string|null|undefined} videoDuration
 * @param {object} [settings]
 * @returns {{start: number, end: number, duration: number}}
 */
function calculateClipRange(timestamp, videoDuration, settings = {}) {
  const eventTimestamp = Number(timestamp);
  const duration = Number(videoDuration);
  if (!Number.isFinite(eventTimestamp) || eventTimestamp < 0) throw new Error(MISSING_TIMESTAMP_MESSAGE);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('No se pudo leer la duración del video original.');

  const clipSettings = normalizeClipSettings(settings);
  const start = Math.max(0, eventTimestamp - clipSettings.clipPreRollSeconds);
  const end = Math.min(duration, eventTimestamp + clipSettings.clipPostRollSeconds);
  return {
    start: roundSeconds(start),
    end: roundSeconds(end),
    duration: roundSeconds(Math.max(0, end - start)),
  };
}

/**
 * @param {number} value
 * @returns {number}
 */
function roundSeconds(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasValidTimestamp(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0;
}

/**
 * @param {object} match
 * @returns {'home'|'away'}
 */
function identifyBiguaTeam(match = {}) {
  if (String(match.homeTeam || '').toLowerCase().includes('bigua')) return 'home';
  if (String(match.awayTeam || '').toLowerCase().includes('bigua')) return 'away';
  return 'home';
}

/**
 * @param {string|null|undefined} team
 * @param {object} match
 * @returns {'home'|'away'|null}
 */
function resolveTeamFilter(team, match = {}) {
  const normalized = normalizeKey(team || 'all');
  if (!normalized || normalized === 'all' || normalized === 'todos') return null;
  if (normalized === 'home' || normalized === 'away') return normalized;
  const biguaTeam = identifyBiguaTeam(match);
  if (normalized === 'bigua') return biguaTeam;
  if (normalized === 'rival') return biguaTeam === 'home' ? 'away' : 'home';
  return null;
}

/**
 * @param {object} event
 * @param {string} resultFilter
 * @returns {boolean}
 */
function eventMatchesResult(event, resultFilter) {
  if (!resultFilter || resultFilter === 'all' || resultFilter === 'todos') return true;
  const normalized = normalizeKey(resultFilter);
  return [
    event.result,
    event.outcome,
    event.subtype,
  ].some(value => normalizeKey(value) === normalized);
}

/**
 * @param {Array<object>} events
 * @param {{type?: string, result?: string, team?: string, fromSeconds?: number|null, toSeconds?: number|null, eventIds?: Array<string|number>}} filters
 * @param {object} [match]
 * @returns {Array<object>}
 */
function filterEventsForClipExport(events = [], filters = {}, match = {}) {
  const type = normalizeKey(filters.type || 'all');
  const team = resolveTeamFilter(filters.team, match);
  const fromSeconds = Number(filters.fromSeconds);
  const toSeconds = Number(filters.toSeconds);
  const hasFrom = Number.isFinite(fromSeconds);
  const hasTo = Number.isFinite(toSeconds);
  const selectedIds = Array.isArray(filters.eventIds) && filters.eventIds.length > 0
    ? new Set(filters.eventIds.map(id => String(id)))
    : null;

  return (Array.isArray(events) ? events : [])
    .filter((event) => {
      if (!hasValidTimestamp(event?.timestamp)) return false;
      if (selectedIds && !selectedIds.has(String(event.id))) return false;
      const timestamp = Number(event.timestamp);
      if (type && type !== 'all' && normalizeKey(event.type) !== type) return false;
      if (!eventMatchesResult(event, filters.result || 'all')) return false;
      if (team && event.team !== team) return false;
      if (hasFrom && timestamp < fromSeconds) return false;
      if (hasTo && timestamp > toSeconds) return false;
      return true;
    })
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
}

/**
 * @param {string|number|null|undefined} value
 * @param {{preserveCase?: boolean, allowHyphen?: boolean}} [options]
 * @returns {string}
 */
function sanitizeNamePart(value, options = {}) {
  const allowedCharacters = options.allowHyphen ? /[^a-zA-Z0-9-]+/g : /[^a-zA-Z0-9]+/g;
  const text = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
    .replace(allowedCharacters, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const normalized = options.preserveCase ? text : text.toLowerCase();
  return normalized || 'sin_dato';
}

/**
 * @param {number|string|null|undefined} seconds
 * @returns {string}
 */
function formatTimestampForFile(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}-${String(minutes).padStart(2, '0')}-${String(remainder).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}-${String(remainder).padStart(2, '0')}`;
}

/**
 * @param {number} index
 * @param {object} event
 * @returns {string}
 */
function sanitizeClipFileName(index, event) {
  const ordinal = String(Math.max(1, Number(index) || 1)).padStart(3, '0');
  const type = sanitizeNamePart(event?.type || 'evento');
  const result = sanitizeNamePart(event?.result || event?.outcome || event?.subtype || 'sin_resultado');
  const timestamp = formatTimestampForFile(event?.timestamp);
  return `${ordinal}_${type}_${result}_${timestamp}.mp4`;
}

/**
 * @param {object} match
 * @returns {string}
 */
function buildBatchFolderName(match) {
  return [
    'BiguAnalytics_Clips',
    `${sanitizeNamePart(match.homeTeam || 'Bigua', { preserveCase: true })}_vs_${sanitizeNamePart(match.awayTeam || 'Rival', { preserveCase: true })}`,
    sanitizeNamePart(match.date || new Date().toISOString().slice(0, 10), { preserveCase: true, allowHyphen: true }),
  ].join('_');
}

/**
 * @param {string} executablePath
 * @returns {string}
 */
function resolveAsarUnpackedPath(executablePath) {
  return String(executablePath || '').replace('app.asar', 'app.asar.unpacked');
}

/**
 * @returns {string}
 */
function getDefaultFfmpegPath() {
  return resolveAsarUnpackedPath(require('ffmpeg-static'));
}

/**
 * @returns {string}
 */
function getDefaultFfprobePath() {
  const ffprobe = require('ffprobe-static');
  return resolveAsarUnpackedPath(typeof ffprobe === 'string' ? ffprobe : ffprobe.path);
}

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function defaultPathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} directory
 */
async function defaultEnsureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
}

/**
 * @param {string} inputPath
 * @param {object} deps
 * @returns {Promise<number>}
 */
async function defaultGetVideoDuration(inputPath, deps) {
  const ffprobePath = deps.ffprobePath || getDefaultFfprobePath();
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'No se pudo leer la duración del video original.'));
        return;
      }
      const duration = Number(stdout.trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('No se pudo leer la duración del video original.'));
        return;
      }
      resolve(duration);
    });
  });
}

/**
 * Uses stream copy by default for speed. The reencode mode is slower but more accurate around keyframes.
 * @param {{inputPath: string, outputPath: string, range: {start: number, duration: number}, quality: string, state: object}} job
 * @returns {Promise<void>}
 */
async function defaultRunClip(job) {
  const ffmpegPath = job.ffmpegPath || getDefaultFfmpegPath();
  const args = job.quality === 'reencode'
    ? [
      '-y',
      '-ss',
      String(job.range.start),
      '-i',
      job.inputPath,
      '-t',
      String(job.range.duration),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      job.outputPath,
    ]
    : [
      '-y',
      '-ss',
      String(job.range.start),
      '-i',
      job.inputPath,
      '-t',
      String(job.range.duration),
      '-c',
      'copy',
      job.outputPath,
    ];

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    job.state.activeProcess = child;
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      job.state.activeProcess = null;
      if (job.state.cancelled) {
        const error = new Error('Exportación cancelada.');
        error.canceled = true;
        reject(error);
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr.trim().slice(0, 320) || 'ffmpeg no pudo exportar el clip.'));
        return;
      }
      resolve();
    });
  });
}

/**
 * @param {object} deps
 * @param {string} channel
 * @param {object} payload
 */
function notify(deps, channel, payload) {
  if (typeof deps.notify === 'function') deps.notify(channel, payload);
}

/**
 * @param {object} match
 * @param {object} deps
 * @returns {Promise<{path: string, duration: number}>}
 */
async function resolveLocalVideo(match, deps) {
  if (match?.video?.type !== 'local' || !match.video.path) {
    throw new Error(YOUTUBE_CLIP_EXPORT_MESSAGE);
  }
  const exists = await (deps.pathExists || defaultPathExists)(match.video.path);
  if (!exists) throw new Error(MISSING_VIDEO_MESSAGE);
  const savedDuration = Number(match.video.duration);
  const duration = Number.isFinite(savedDuration) && savedDuration > 0
    ? savedDuration
    : await (deps.getVideoDuration || defaultGetVideoDuration)(match.video.path, deps);
  return { path: match.video.path, duration };
}

/**
 * @param {object} state
 */
function assertCanStart(state) {
  if (state.active) throw new Error('Ya hay una exportación de clips en curso.');
}

/**
 * @param {object} state
 * @param {string} jobId
 * @returns {object}
 */
function startExportState(state, jobId) {
  state.active = {
    jobId,
    cancelled: false,
    activeProcess: null,
  };
  return state.active;
}

/**
 * @param {object} state
 */
function finishExportState(state) {
  state.active = null;
}

/**
 * @param {object} state
 * @returns {{canceled: boolean}}
 */
function cancelActiveExport(state) {
  if (!state.active) return { canceled: false };
  state.active.cancelled = true;
  state.active.activeProcess?.kill?.('SIGKILL');
  return { canceled: true };
}

/**
 * @param {object} event
 * @param {number} index
 * @param {string} inputPath
 * @param {string} outputDir
 * @param {number} videoDuration
 * @param {object} settings
 * @returns {{event: object, fileName: string, outputPath: string, range: {start: number, end: number, duration: number}}}
 */
function buildClipJob(event, index, inputPath, outputDir, videoDuration, settings) {
  const fileName = sanitizeClipFileName(index, event);
  return {
    event,
    fileName,
    outputPath: path.join(outputDir, fileName),
    inputPath,
    range: calculateClipRange(event.timestamp, videoDuration, settings),
  };
}

/**
 * @param {object} payload
 * @param {object} deps
 * @returns {Promise<object>}
 */
async function exportSingle(payload, deps) {
  const match = await deps.getMatchById(payload.matchId);
  const settings = normalizeClipSettings(await deps.getSettings());
  const video = await resolveLocalVideo(match, deps);
  const event = (match.events || []).find(item => String(item.id) === String(payload.eventId));
  if (!event) throw new Error('Evento no encontrado.');
  if (!hasValidTimestamp(event.timestamp)) throw new Error(MISSING_TIMESTAMP_MESSAGE);
  const selectedDir = payload.outputDir || await deps.selectOutputDirectory({ mode: 'single', match, event });
  if (!selectedDir) return { canceled: true };

  assertCanStart(deps.state);
  const jobId = `clip-${Date.now()}`;
  const active = startExportState(deps.state, jobId);
  try {
    await deps.ensureDirectory(selectedDir);
    const clip = buildClipJob(event, 1, video.path, selectedDir, video.duration, settings);
    notify(deps, 'clips:export-progress', {
      jobId,
      total: 1,
      current: 1,
      currentClipName: clip.fileName,
      message: 'Exportando clip...',
    });
    await deps.runClip({ ...clip, quality: settings.clipExportQuality, state: active, ffmpegPath: deps.ffmpegPath });
    const result = {
      canceled: active.cancelled,
      exported: active.cancelled ? 0 : 1,
      failed: 0,
      total: 1,
      outputDir: selectedDir,
      files: active.cancelled ? [] : [clip.outputPath],
      errors: [],
    };
    notify(deps, 'clips:export-complete', result);
    return result;
  } catch (error) {
    notify(deps, 'clips:export-error', { message: error.message || 'No se pudo exportar el clip.' });
    throw error;
  } finally {
    finishExportState(deps.state);
  }
}

/**
 * @param {object} payload
 * @param {object} deps
 * @returns {Promise<object>}
 */
async function exportBatch(payload, deps) {
  const match = await deps.getMatchById(payload.matchId);
  const settings = normalizeClipSettings(await deps.getSettings());
  const video = await resolveLocalVideo(match, deps);
  const events = filterEventsForClipExport(match.events || [], payload.filters || {}, match);
  if (events.length === 0) throw new Error(EMPTY_EXPORT_MESSAGE);
  const selectedDir = payload.outputDir || await deps.selectOutputDirectory({ mode: 'batch', match, filters: payload.filters || {} });
  if (!selectedDir) return { canceled: true };

  assertCanStart(deps.state);
  const outputDir = path.join(selectedDir, buildBatchFolderName(match));
  const jobId = `clips-${Date.now()}`;
  const active = startExportState(deps.state, jobId);
  const files = [];
  const errors = [];
  let exported = 0;

  try {
    await deps.ensureDirectory(outputDir);
    const jobs = events.map((event, index) => buildClipJob(event, index + 1, video.path, outputDir, video.duration, settings));

    for (let index = 0; index < jobs.length; index += 1) {
      if (active.cancelled) break;
      const job = jobs[index];
      notify(deps, 'clips:export-progress', {
        jobId,
        total: jobs.length,
        current: index + 1,
        currentClipName: job.fileName,
        message: `Exportando ${index + 1} / ${jobs.length} clips`,
      });
      try {
        await deps.runClip({ ...job, quality: settings.clipExportQuality, state: active, ffmpegPath: deps.ffmpegPath });
        exported += 1;
        files.push(job.outputPath);
        if (active.cancelled) break;
      } catch (error) {
        if (active.cancelled) break;
        errors.push({
          eventId: job.event.id,
          fileName: job.fileName,
          message: error.message || 'ffmpeg no pudo exportar el clip.',
        });
      }
    }

    const result = {
      canceled: active.cancelled,
      exported,
      failed: errors.length,
      total: jobs.length,
      outputDir,
      files,
      errors,
    };
    notify(deps, 'clips:export-complete', result);
    return result;
  } catch (error) {
    notify(deps, 'clips:export-error', { message: error.message || 'No se pudieron exportar los clips.' });
    throw error;
  } finally {
    finishExportState(deps.state);
  }
}

/**
 * @param {object} [dependencies]
 * @returns {{exportSingle: function(object): Promise<object>, exportBatch: function(object): Promise<object>, cancelExport: function(): {canceled: boolean}}}
 */
function createClipExporter(dependencies = {}) {
  const state = { active: null };
  const baseDeps = {
    getMatchById,
    getSettings,
    selectOutputDirectory: async () => null,
    pathExists: defaultPathExists,
    ensureDirectory: defaultEnsureDirectory,
    getVideoDuration: defaultGetVideoDuration,
    runClip: defaultRunClip,
    ...dependencies,
    state,
  };

  return {
    exportSingle(payload, runtimeDeps = {}) {
      return exportSingle(payload, { ...baseDeps, ...runtimeDeps, state });
    },
    exportBatch(payload, runtimeDeps = {}) {
      return exportBatch(payload, { ...baseDeps, ...runtimeDeps, state });
    },
    cancelExport() {
      return cancelActiveExport(state);
    },
  };
}

/**
 * @param {{showOpenDialog: function(object, object): Promise<{canceled: boolean, filePaths: string[]}>}} dialog
 * @param {object} browserWindow
 * @returns {Promise<string|null>}
 */
async function selectClipOutputDirectory(dialog, browserWindow) {
  const result = await dialog.showOpenDialog(browserWindow, {
    title: 'Seleccionar carpeta destino',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  return result.filePaths[0];
}

module.exports = {
  EMPTY_EXPORT_MESSAGE,
  MISSING_TIMESTAMP_MESSAGE,
  MISSING_VIDEO_MESSAGE,
  YOUTUBE_CLIP_EXPORT_MESSAGE,
  buildBatchFolderName,
  calculateClipRange,
  createClipExporter,
  filterEventsForClipExport,
  sanitizeClipFileName,
  selectClipOutputDirectory,
};
