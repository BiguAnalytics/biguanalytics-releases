// @ts-check
const fs = require('fs/promises');
const os = require('os');
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
const DEFAULT_CLIP_OUTPUT_MODE = 'combined';
const MAX_CLIP_EDGE_SECONDS = 60;
const COMBINED_SEPARATOR_SECONDS = 2.85;
const CONCAT_WIDTH = 1920;
const CONCAT_HEIGHT = 1080;
const CONCAT_FPS = 30;
const DEFAULT_MAX_COMBINED_PARALLEL_EXPORTS = 3;

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
 * @returns {{clipPreRollSeconds: number, clipPostRollSeconds: number, clipOutputModeDefault: 'combined'|'separate', clipExportQuality: string}}
 */
function normalizeClipSettings(settings = {}) {
  return {
    clipPreRollSeconds: normalizeClipSeconds(settings.clipPreRollSeconds, DEFAULT_CLIP_PRE_ROLL_SECONDS, 0),
    clipPostRollSeconds: normalizeClipSeconds(settings.clipPostRollSeconds, DEFAULT_CLIP_POST_ROLL_SECONDS, 1),
    clipOutputModeDefault: settings.clipOutputModeDefault === 'separate' ? 'separate' : DEFAULT_CLIP_OUTPUT_MODE,
    clipExportQuality: settings.clipExportQuality === 'copy' ? 'copy' : 'reencode',
  };
}

/**
 * @param {object} settings
 * @param {object} payload
 * @returns {{clipPreRollSeconds: number, clipPostRollSeconds: number, clipOutputModeDefault: 'combined'|'separate', clipExportQuality: string}}
 */
function getEffectiveClipSettings(settings = {}, payload = {}) {
  return normalizeClipSettings({
    ...settings,
    clipPreRollSeconds: payload.clipPreRollSeconds ?? settings.clipPreRollSeconds,
    clipPostRollSeconds: payload.clipPostRollSeconds ?? settings.clipPostRollSeconds,
  });
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeParallelLimit(value) {
  const fallback = Math.min(DEFAULT_MAX_COMBINED_PARALLEL_EXPORTS, Math.max(1, os.cpus().length - 1));
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(4, Math.round(numeric)));
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function optionalSeconds(value) {
  if (value === null || value === undefined || value === '') return Number.NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

/**
 * @param {unknown} value
 * @param {'combined'|'separate'} fallback
 * @returns {'combined'|'separate'}
 */
function normalizeOutputMode(value, fallback = DEFAULT_CLIP_OUTPUT_MODE) {
  if (value === 'combined' || value === 'separate') return value;
  return fallback === 'separate' ? 'separate' : DEFAULT_CLIP_OUTPUT_MODE;
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
  const fromSeconds = optionalSeconds(filters.fromSeconds);
  const toSeconds = optionalSeconds(filters.toSeconds);
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
 * @param {number|string|null|undefined} seconds
 * @returns {string}
 */
function formatTimestampForSeparator(seconds) {
  return `Tiempo ${formatTimestampForFile(seconds).replace(/-/g, ':')}`;
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
 * @param {object} match
 * @returns {string}
 */
function buildCombinedClipFileName(match) {
  return `${buildBatchFolderName(match)}.mp4`;
}

/**
 * @param {string} jobId
 * @returns {string}
 */
function buildCombinedTempFolderName(jobId) {
  return `_tmp_${sanitizeNamePart(jobId, { preserveCase: true, allowHyphen: true })}`;
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
 * @returns {string}
 */
function getDefaultLogoPath() {
  return path.resolve(__dirname, '../../../LOGO.svg');
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
 * @param {{inputPath: string, outputPath: string, range: {start: number, duration: number}, quality: string, normalizeForConcat?: boolean}} job
 * @returns {Array<string>}
 */
function buildClipFfmpegArgs(job) {
  if (job.quality === 'reencode') {
    const args = [
      '-y',
      '-i',
      job.inputPath,
      '-ss',
      String(job.range.start),
      '-t',
      String(job.range.duration),
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
    ];
    if (job.normalizeForConcat) {
      args.push(
        '-vf',
        `scale=${CONCAT_WIDTH}:${CONCAT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${CONCAT_WIDTH}:${CONCAT_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${CONCAT_FPS},format=yuv420p`,
      );
    }
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
      job.outputPath,
    );
    return args;
  }

  return [
    '-y',
    '-ss',
    String(job.range.start),
    '-i',
    job.inputPath,
    '-t',
    String(job.range.duration),
    '-c',
    'copy',
    '-avoid_negative_ts',
    'make_zero',
    job.outputPath,
  ];
}

/**
 * Uses stream copy only when explicitly selected. The reencode mode is slower but avoids keyframe black starts.
 * @param {{inputPath: string, outputPath: string, range: {start: number, duration: number}, quality: string, state: object, normalizeForConcat?: boolean, ffmpegPath?: string}} job
 * @returns {Promise<void>}
 */
async function defaultRunClip(job) {
  const ffmpegPath = job.ffmpegPath || getDefaultFfmpegPath();
  const args = buildClipFfmpegArgs(job);
  return runFfmpegArgs(ffmpegPath, args, job.state, 'ffmpeg no pudo exportar el clip.');
}

/**
 * @param {string} ffmpegPath
 * @param {Array<string>} args
 * @param {object} state
 * @param {string} fallbackMessage
 * @returns {Promise<void>}
 */
function runFfmpegArgs(ffmpegPath, args, state, fallbackMessage) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    state.activeProcess = child;
    state.activeProcesses?.add?.(child);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      state.activeProcesses?.delete?.(child);
      state.activeProcess = null;
      if (state.cancelled) {
        const error = new Error('Exportación cancelada.');
        error.canceled = true;
        reject(error);
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr.trim().slice(0, 320) || fallbackMessage));
        return;
      }
      resolve();
    });
  });
}

/**
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function escapeDrawtext(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}

/**
 * @param {object} event
 * @returns {string}
 */
function getEventTypeLabel(event = {}) {
  return String(event.type || event.eventType || event.event_type || 'Evento')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, value => value.toUpperCase());
}

/**
 * @param {object} event
 * @returns {string}
 */
function getEventResultLabel(event = {}) {
  return String(event.result || event.outcome || event.subtype || 'Sin resultado')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, value => value.toUpperCase());
}

/**
 * @param {object} event
 * @returns {string}
 */
function getSeparatorTitle(event = {}) {
  return `${getEventTypeLabel(event)} / ${getEventResultLabel(event)}`;
}

/**
 * @param {{outputPath: string, clipNumber: number, totalClips: number, title: string, timestampLabel: string, logoPath?: string|null}} job
 * @param {boolean} [withLogo]
 * @returns {Array<string>}
 */
function buildSeparatorFfmpegArgs(job, withLogo = true) {
  const baseFilter = [
    'drawbox=x=0:y=0:w=iw:h=ih:color=0x0F2340@0.42:t=fill',
    'drawbox=x=0:y=0:w=iw:h=110:color=0x0F2340@0.82:t=fill',
    "drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':text='BIGUANALYTICS':fontcolor=white:fontsize=42:x=72:y=44",
    `drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':text='CLIP ${String(job.clipNumber).padStart(2, '0')} / ${job.totalClips}':fontcolor=white:fontsize=86:x=72:y=(h-text_h)/2-70`,
    `drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${escapeDrawtext(job.title)}':fontcolor=white@0.88:fontsize=42:x=78:y=(h-text_h)/2+28`,
    `drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${escapeDrawtext(job.timestampLabel)}':fontcolor=white@0.68:fontsize=28:x=78:y=(h-text_h)/2+92`,
    'format=yuv420p',
  ].join(',');

  if (withLogo && job.logoPath) {
    return [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=0x080E1A:s=${CONCAT_WIDTH}x${CONCAT_HEIGHT}:r=${CONCAT_FPS}:d=${COMBINED_SEPARATOR_SECONDS}`,
      '-f',
      'lavfi',
      '-i',
      `anullsrc=channel_layout=stereo:sample_rate=48000:d=${COMBINED_SEPARATOR_SECONDS}`,
      '-i',
      job.logoPath,
      '-filter_complex',
      `[0:v]${baseFilter}[base];[2:v]scale=170:-1[logo];[base][logo]overlay=W-w-76:76[v]`,
      '-map',
      '[v]',
      '-map',
      '1:a',
      '-t',
      String(COMBINED_SEPARATOR_SECONDS),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '21',
      '-c:a',
      'aac',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      job.outputPath,
    ];
  }

  return [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=0x080E1A:s=${CONCAT_WIDTH}x${CONCAT_HEIGHT}:r=${CONCAT_FPS}:d=${COMBINED_SEPARATOR_SECONDS}`,
    '-f',
    'lavfi',
    '-i',
    `anullsrc=channel_layout=stereo:sample_rate=48000:d=${COMBINED_SEPARATOR_SECONDS}`,
    '-vf',
    baseFilter,
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-t',
    String(COMBINED_SEPARATOR_SECONDS),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '21',
    '-c:a',
    'aac',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    job.outputPath,
  ];
}

/**
 * @param {{outputPath: string, clipNumber: number, totalClips: number, title: string, timestampLabel: string, logoPath?: string|null, state: object, ffmpegPath?: string}} job
 * @returns {Promise<void>}
 */
async function defaultRunSeparator(job) {
  const ffmpegPath = job.ffmpegPath || getDefaultFfmpegPath();
  try {
    await runFfmpegArgs(ffmpegPath, buildSeparatorFfmpegArgs(job, Boolean(job.logoPath)), job.state, 'ffmpeg no pudo crear el separador.');
  } catch (error) {
    if (job.state.cancelled || !job.logoPath) throw error;
    await runFfmpegArgs(ffmpegPath, buildSeparatorFfmpegArgs(job, false), job.state, 'ffmpeg no pudo crear el separador.');
  }
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function formatConcatFilePath(filePath) {
  return String(filePath).replace(/\\/g, '/').replace(/'/g, "'\\''");
}

/**
 * @param {{inputs: Array<string>, listPath: string, outputPath: string, state: object, ffmpegPath?: string}} job
 * @returns {Promise<void>}
 */
async function defaultRunConcat(job) {
  const ffmpegPath = job.ffmpegPath || getDefaultFfmpegPath();
  const list = job.inputs.map(input => `file '${formatConcatFilePath(input)}'`).join('\n');
  await fs.writeFile(job.listPath, list, 'utf8');
  await runFfmpegArgs(ffmpegPath, [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    job.listPath,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    job.outputPath,
  ], job.state, 'ffmpeg no pudo unir los clips.');
}

/**
 * @param {string} directory
 */
async function defaultCleanupTempDirectory(directory) {
  await fs.rm(directory, { recursive: true, force: true });
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
    activeProcesses: new Set(),
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
  state.active.activeProcesses?.forEach(process => process?.kill?.('SIGKILL'));
  state.active.activeProcess?.kill?.('SIGKILL');
  return { canceled: true };
}

/**
 * @template T
 * @template R
 * @param {Array<T>} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<Array<R|undefined>>}
 */
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, Math.max(1, limit));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }));

  return results;
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
  const settings = getEffectiveClipSettings(await deps.getSettings(), payload);
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
  const settings = getEffectiveClipSettings(await deps.getSettings(), payload);
  const video = await resolveLocalVideo(match, deps);
  const events = filterEventsForClipExport(match.events || [], payload.filters || {}, match);
  if (events.length === 0) throw new Error(EMPTY_EXPORT_MESSAGE);
  const outputMode = normalizeOutputMode(payload.outputMode, settings.clipOutputModeDefault);
  const selectedDir = payload.outputDir || await deps.selectOutputDirectory({ mode: 'batch', outputMode, match, filters: payload.filters || {} });
  if (!selectedDir) return { canceled: true };

  assertCanStart(deps.state);
  const outputDir = path.join(selectedDir, buildBatchFolderName(match));
  const jobId = `clips-${Date.now()}`;
  const active = startExportState(deps.state, jobId);
  const files = [];
  const errors = [];
  let exported = 0;
  let tempDir = null;

  try {
    await deps.ensureDirectory(outputDir);
    const isCombined = outputMode === 'combined';
    tempDir = isCombined ? path.join(outputDir, buildCombinedTempFolderName(jobId)) : null;
    if (tempDir) await deps.ensureDirectory(tempDir);
    const clipOutputDir = tempDir || outputDir;
    const jobs = events.map((event, index) => buildClipJob(event, index + 1, video.path, clipOutputDir, video.duration, settings));
    const concatInputs = [];
    const logoCandidatePath = deps.logoPath === null ? null : (deps.logoPath || getDefaultLogoPath());
    const logoPath = isCombined && logoCandidatePath && await deps.pathExists(logoCandidatePath) ? logoCandidatePath : null;

    if (isCombined) {
      const concatInputsByIndex = new Array(jobs.length);
      let started = 0;
      await runWithConcurrency(jobs, normalizeParallelLimit(deps.maxParallelClipExports), async (job, index) => {
        if (active.cancelled) return;
        started += 1;
        notify(deps, 'clips:export-progress', {
          jobId,
          total: jobs.length + 1,
          current: started,
          currentClipName: job.fileName,
          message: `Exportando ${started}/${jobs.length} clips`,
        });
        try {
          await deps.runClip({
            ...job,
            quality: 'reencode',
            normalizeForConcat: true,
            state: active,
            ffmpegPath: deps.ffmpegPath,
          });
          if (active.cancelled) return;
          const separatorPath = path.join(tempDir, `${String(index + 1).padStart(3, '0')}_separator.mp4`);
          await deps.runSeparator({
            outputPath: separatorPath,
            clipNumber: index + 1,
            totalClips: jobs.length,
            title: getSeparatorTitle(job.event),
            timestampLabel: formatTimestampForSeparator(job.event.timestamp),
            logoPath,
            state: active,
            ffmpegPath: deps.ffmpegPath,
          });
          concatInputsByIndex[index] = [separatorPath, job.outputPath];
          exported += 1;
        } catch (error) {
          if (active.cancelled) return;
          errors.push({
            eventId: job.event.id,
            fileName: job.fileName,
            message: error.message || 'ffmpeg no pudo exportar el clip.',
          });
        }
      });
      concatInputs.push(...concatInputsByIndex.flat().filter(Boolean));
    } else {
      for (let index = 0; index < jobs.length; index += 1) {
        if (active.cancelled) break;
        const job = jobs[index];
        notify(deps, 'clips:export-progress', {
          jobId,
          total: jobs.length,
          current: index + 1,
          currentClipName: job.fileName,
          message: `Exportando ${index + 1}/${jobs.length} clips`,
        });
        try {
          await deps.runClip({
            ...job,
            quality: settings.clipExportQuality,
            normalizeForConcat: false,
            state: active,
            ffmpegPath: deps.ffmpegPath,
          });
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
    }

    let outputFile = null;
    if (isCombined && !active.cancelled && concatInputs.length > 0) {
      outputFile = path.join(outputDir, buildCombinedClipFileName(match));
      notify(deps, 'clips:export-progress', {
        jobId,
        total: jobs.length + 1,
        current: jobs.length + 1,
        currentClipName: path.basename(outputFile),
        message: 'Armando video final...',
      });
      await deps.runConcat({
        inputs: concatInputs,
        listPath: path.join(tempDir, 'concat.txt'),
        outputPath: outputFile,
        state: active,
        ffmpegPath: deps.ffmpegPath,
      });
      files.push(outputFile);
    }

    const result = {
      canceled: active.cancelled,
      exported,
      failed: errors.length,
      total: jobs.length,
      outputMode,
      outputDir,
      outputFile,
      files,
      errors,
    };
    notify(deps, 'clips:export-complete', result);
    return result;
  } catch (error) {
    notify(deps, 'clips:export-error', { message: error.message || 'No se pudieron exportar los clips.' });
    throw error;
  } finally {
    if (tempDir) await deps.cleanupTempDirectory(tempDir);
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
    runSeparator: defaultRunSeparator,
    runConcat: defaultRunConcat,
    cleanupTempDirectory: defaultCleanupTempDirectory,
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
  buildClipFfmpegArgs,
  buildCombinedClipFileName,
  buildSeparatorFfmpegArgs,
  calculateClipRange,
  createClipExporter,
  filterEventsForClipExport,
  sanitizeClipFileName,
  selectClipOutputDirectory,
};
