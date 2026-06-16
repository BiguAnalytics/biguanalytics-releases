// @ts-check
const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { v4: uuidv4 } = require('uuid');
const {
  createMatch,
  deleteMatch,
  getAllMatches,
  getDataPath,
  getMatchDataPath,
  getMatchById,
  resolveMatchPath,
  updateMatch,
  validateMatchId,
} = require('./storage');
const { getSettings } = require('./settings');

const MATCH_EXPORT_SCHEMA_VERSION = 1;
const BACKUP_EXPORT_SCHEMA_VERSION = 1;
const MATCH_ARCHIVE_TYPE = 'biguanalytics.match';
const BACKUP_ARCHIVE_TYPE = 'biguanalytics.backup';
const VIDEO_EXPORT_WARNING = 'El video no se incluye en el export. Si queres moverlo a otra PC, copia tambien el archivo MP4.';
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const ZIP_DEFLATE_METHOD = 8;
const MAX_ARCHIVE_ENTRIES = 5000;
const MAX_ARCHIVE_ENTRY_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

const SENSITIVE_KEYS = new Set([
  'apikey',
  'authorization',
  'bearer',
  'clienttoken',
  'clienttokenencrypted',
  'cookie',
  'idtoken',
  'password',
  'refreshtoken',
  'secret',
  'servicerole',
  'servicerolekey',
  'session',
  'supabaserefreshtoken',
]);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm']);

let crcTable = null;

/**
 * @returns {number[]}
 */
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    return crc >>> 0;
  });
  return crcTable;
}

/**
 * @param {Buffer} buffer
 * @returns {number}
 */
function crc32(buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = table[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * @param {Date} date
 * @returns {{time: number, date: number}}
 */
function toDosDateTime(date) {
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date();
  const year = Math.max(1980, safeDate.getFullYear());
  return {
    time: (safeDate.getHours() << 11) | (safeDate.getMinutes() << 5) | Math.floor(safeDate.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((safeDate.getMonth() + 1) << 5) | safeDate.getDate(),
  };
}

/**
 * @param {unknown} filePath
 * @returns {string}
 */
function normalizeArchivePath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.length > 240) throw new Error('Ruta de archivo invalida.');
  if (normalized.includes('\0')) throw new Error('Ruta de archivo invalida.');
  if (/^[A-Za-z]:/.test(normalized)) throw new Error('Ruta de archivo invalida.');
  if (normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Ruta de archivo invalida.');
  }
  return normalized;
}

/**
 * @param {unknown} value
 * @returns {Buffer}
 */
function toEntryBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value ?? ''), 'utf8');
}

/**
 * @param {Array<{path: string, data: Buffer|string|Uint8Array}>} entries
 * @param {string} outputPath
 * @param {{now?: function(): string}} [options]
 * @returns {Promise<void>}
 */
async function writePortableArchive(entries, outputPath, options = {}) {
  const nowDate = new Date(options.now?.() || new Date().toISOString());
  const dos = toDosDateTime(nowDate);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const rawEntry of entries) {
    const entryPath = normalizeArchivePath(rawEntry.path);
    const name = Buffer.from(entryPath, 'utf8');
    const data = toEntryBuffer(rawEntry.data);
    if (data.length > MAX_ARCHIVE_ENTRY_BYTES) throw new Error('Archivo demasiado grande para exportar.');
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(ZIP_LOCAL_FILE_HEADER, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(ZIP_UTF8_FLAG, 6);
    localHeader.writeUInt16LE(ZIP_STORE_METHOD, 8);
    localHeader.writeUInt16LE(dos.time, 10);
    localHeader.writeUInt16LE(dos.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_HEADER, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(ZIP_UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(ZIP_STORE_METHOD, 10);
    centralHeader.writeUInt16LE(dos.time, 12);
    centralHeader.writeUInt16LE(dos.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, Buffer.concat([...localParts, centralDirectory, end]));
}

/**
 * @param {Buffer} archive
 * @returns {number}
 */
function findEndOfCentralDirectory(archive) {
  const minOffset = Math.max(0, archive.length - 65557);
  for (let offset = archive.length - 22; offset >= minOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error('Archivo BiguAnalytics invalido.');
}

/**
 * @param {string} filePath
 * @returns {Promise<{entries: Array<{path: string, data: Buffer}>}>}
 */
async function readPortableArchive(filePath) {
  const archive = await fs.readFile(filePath);
  const eocdOffset = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralSize = archive.readUInt32LE(eocdOffset + 12);
  let centralOffset = archive.readUInt32LE(eocdOffset + 16);
  if (entryCount > MAX_ARCHIVE_ENTRIES) throw new Error('Archivo BiguAnalytics demasiado grande.');
  if (centralOffset + centralSize > archive.length) throw new Error('Archivo BiguAnalytics invalido.');

  const entries = [];
  let totalBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(centralOffset) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      throw new Error('Archivo BiguAnalytics invalido.');
    }
    const method = archive.readUInt16LE(centralOffset + 10);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const entryPath = normalizeArchivePath(archive.slice(centralOffset + 46, centralOffset + 46 + nameLength).toString('utf8'));
    if (uncompressedSize > MAX_ARCHIVE_ENTRY_BYTES) throw new Error('Archivo BiguAnalytics demasiado grande.');
    totalBytes += uncompressedSize;
    if (totalBytes > MAX_ARCHIVE_TOTAL_BYTES) throw new Error('Archivo BiguAnalytics demasiado grande.');
    if (archive.readUInt32LE(localOffset) !== ZIP_LOCAL_FILE_HEADER) throw new Error('Archivo BiguAnalytics invalido.');
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) throw new Error('Archivo BiguAnalytics invalido.');
    const compressed = archive.slice(dataStart, dataEnd);
    const data = method === ZIP_STORE_METHOD
      ? compressed
      : method === ZIP_DEFLATE_METHOD
        ? zlib.inflateRawSync(compressed)
        : null;
    if (!data) throw new Error('Compresion de ZIP no soportada.');
    if (data.length !== uncompressedSize) throw new Error('Archivo BiguAnalytics invalido.');
    entries.push({ path: entryPath, data });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return { entries };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function safeFilePart(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return normalized || 'partido';
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function isSensitiveKey(key) {
  const normalized = String(key || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return SENSITIVE_KEYS.has(normalized) || normalized.endsWith('token') || normalized.endsWith('secret');
}

/**
 * @returns {string}
 */
function getDefaultAppVersion() {
  try {
    return require(path.resolve(__dirname, '../../../package.json')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * @param {object} match
 * @returns {string}
 */
function buildMatchArchiveFileName(match) {
  return `BiguAnalytics-${safeFilePart(match.homeTeam || 'Bigua')}-vs-${safeFilePart(match.awayTeam || 'Rival')}-${safeFilePart(match.date || new Date().toISOString().slice(0, 10))}.biguanalytics`;
}

/**
 * @param {string} prefix
 * @param {string} timestamp
 * @returns {string}
 */
function buildTimestampFileName(prefix, timestamp) {
  return `${prefix}-${safeFilePart(timestamp.slice(0, 19))}.zip`;
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function sanitizeForArchive(value) {
  if (Array.isArray(value)) return value.map(sanitizeForArchive);
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).reduce((next, [key, item]) => {
    if (isSensitiveKey(key)) return next;
    next[key] = sanitizeForArchive(item);
    return next;
  }, {});
}

/**
 * @param {object|null|undefined} video
 * @returns {{video: object|null, warning: string}}
 */
function sanitizeVideo(video) {
  if (!video || typeof video !== 'object') return { video: null, warning: '' };
  const type = video.sourceType === 'youtube' || video.type === 'youtube' ? 'youtube' : video.sourceType === 'local_mp4' || video.type === 'local' ? 'local' : video.type || '';
  if (type === 'local') {
    return {
      warning: VIDEO_EXPORT_WARNING,
      video: sanitizeForArchive({
        type: 'local',
        sourceType: 'local_mp4',
        name: video.name || (video.path ? path.basename(String(video.path)) : ''),
        size: Number(video.size) || 0,
        duration: Number.isFinite(Number(video.duration)) ? Number(video.duration) : null,
        fingerprintHash: video.fingerprintHash || '',
        startOffsetMs: Number(video.startOffsetMs) || 0,
        needsLocalFile: true,
        originalPath: video.path || '',
      }),
    };
  }
  return {
    warning: '',
    video: sanitizeForArchive(video),
  };
}

/**
 * @param {object} match
 * @returns {{match: object, videoWarning: string}}
 */
function sanitizeMatchForArchive(match) {
  const sanitized = sanitizeForArchive(match);
  const video = sanitizeVideo(match.video);
  return {
    videoWarning: video.warning,
    match: {
      ...sanitized,
      video: video.video,
    },
  };
}

/**
 * @param {unknown} value
 * @returns {Buffer}
 */
function jsonBuffer(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * @param {string} root
 * @returns {Promise<Array<string>>}
 */
async function listFilesRecursive(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) files.push(...await listFilesRecursive(fullPath));
      if (entry.isFile()) files.push(fullPath);
    }
    return files;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isVideoFile(filePath) {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * @param {string} basePath
 * @param {string} filePath
 * @returns {string}
 */
function relativeArchivePath(basePath, filePath) {
  return path.relative(basePath, filePath).split(path.sep).join('/');
}

/**
 * @param {string} filePath
 * @returns {Promise<Buffer>}
 */
async function readSanitizedFile(filePath) {
  if (path.extname(filePath).toLowerCase() !== '.json') return fs.readFile(filePath);
  const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
  return jsonBuffer(sanitizeForArchive(parsed));
}

/**
 * @param {string} matchId
 * @param {{includeVideo?: boolean}} [options]
 * @returns {Promise<Array<{path: string, data: Buffer}>>}
 */
async function collectMatchSidecarEntries(matchId, options = {}) {
  const matchPath = getMatchDataPath(matchId);
  const files = await listFilesRecursive(matchPath);
  const entries = [];
  for (const filePath of files) {
    const relativePath = relativeArchivePath(matchPath, filePath);
    if (relativePath === 'match.json') continue;
    if (!options.includeVideo && isVideoFile(filePath)) continue;
    entries.push({
      path: `match/${relativePath}`,
      data: await readSanitizedFile(filePath),
    });
  }
  return entries;
}

/**
 * @param {{dialog?: object, browserWindow?: object|null, defaultPath: string, filters: Array<object>, outputPath?: string}} options
 * @returns {Promise<{canceled: boolean, filePath?: string}>}
 */
async function resolveOutputPath(options) {
  if (options.outputPath) return { canceled: false, filePath: path.resolve(options.outputPath) };
  if (!options.dialog?.showSaveDialog) throw new Error('No hay dialog de exportacion disponible.');
  const result = await options.dialog.showSaveDialog(options.browserWindow || null, {
    title: 'Exportar BiguAnalytics',
    defaultPath: options.defaultPath,
    filters: options.filters,
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  return { canceled: false, filePath: result.filePath };
}

/**
 * @param {string} matchId
 * @param {{dialog?: object, browserWindow?: object|null, outputPath?: string, includeVideo?: boolean, now?: function(): string, appVersion?: string}} [options]
 * @returns {Promise<object>}
 */
async function exportMatchArchive(matchId, options = {}) {
  const safeMatchId = validateMatchId(matchId);
  const exportedAt = options.now?.() || new Date().toISOString();
  const appVersion = options.appVersion || getDefaultAppVersion();
  const match = await getMatchById(safeMatchId);
  const { match: exportMatch, videoWarning } = sanitizeMatchForArchive(match);
  const output = await resolveOutputPath({
    dialog: options.dialog,
    browserWindow: options.browserWindow,
    outputPath: options.outputPath,
    defaultPath: buildMatchArchiveFileName(exportMatch),
    filters: [
      { name: 'BiguAnalytics Match', extensions: ['biguanalytics'] },
      { name: 'ZIP', extensions: ['zip'] },
    ],
  });
  if (output.canceled) return { canceled: true };

  const manifest = sanitizeForArchive({
    type: MATCH_ARCHIVE_TYPE,
    schemaVersion: MATCH_EXPORT_SCHEMA_VERSION,
    exportedAt,
    appVersion,
    matchId: exportMatch.id,
    match: {
      homeTeam: exportMatch.homeTeam,
      awayTeam: exportMatch.awayTeam,
      date: exportMatch.date,
    },
    videoReference: exportMatch.video || null,
    videoIncluded: options.includeVideo === true,
    videoWarning,
  });
  const entries = [
    { path: 'manifest.json', data: jsonBuffer(manifest) },
    { path: 'match/match.json', data: jsonBuffer(exportMatch) },
    ...await collectMatchSidecarEntries(safeMatchId, { includeVideo: options.includeVideo }),
  ];
  await writePortableArchive(entries, output.filePath, { now: () => exportedAt });
  return {
    canceled: false,
    filePath: output.filePath,
    fileName: path.basename(output.filePath),
    videoWarning,
  };
}

/**
 * @param {string} filePath
 * @param {string} entryPath
 * @returns {boolean}
 */
function shouldRestoreMatchEntry(filePath, entryPath) {
  if (!entryPath.startsWith('match/')) return false;
  const relativePath = entryPath.slice('match/'.length);
  if (relativePath === 'match.json') return false;
  if (isVideoFile(relativePath)) return false;
  normalizeArchivePath(relativePath);
  void filePath;
  return true;
}

/**
 * @param {{entries: Array<{path: string, data: Buffer}>}} archive
 * @returns {object}
 */
function readManifest(archive) {
  const entry = archive.entries.find(item => item.path === 'manifest.json');
  if (!entry) throw new Error('Export BiguAnalytics sin manifest.');
  return JSON.parse(entry.data.toString('utf8'));
}

/**
 * @param {{entries: Array<{path: string, data: Buffer}>}} archive
 * @returns {object}
 */
function readArchivedMatch(archive) {
  const entry = archive.entries.find(item => item.path === 'match/match.json');
  if (!entry) throw new Error('Export BiguAnalytics sin match.json.');
  return JSON.parse(entry.data.toString('utf8'));
}

/**
 * @param {object} manifest
 * @param {object} match
 */
function validateMatchArchivePayload(manifest, match) {
  if (manifest.type !== MATCH_ARCHIVE_TYPE) throw new Error('El archivo no es un export de partido BiguAnalytics.');
  if (Number(manifest.schemaVersion) !== MATCH_EXPORT_SCHEMA_VERSION) throw new Error('Version de schema no soportada.');
  validateMatchId(match.id);
  if (!Array.isArray(match.events)) throw new Error('match.json invalido: eventos faltantes.');
  if (!Array.isArray(match.sequences)) throw new Error('match.json invalido: secuencias faltantes.');
}

/**
 * @param {string} matchId
 * @returns {Promise<boolean>}
 */
async function matchExists(matchId) {
  try {
    await getMatchById(matchId);
    return true;
  } catch (error) {
    if (/not found/i.test(error.message || '')) return false;
    throw error;
  }
}

/**
 * @param {{entries: Array<{path: string, data: Buffer}>}} archive
 * @param {string} targetMatchId
 * @returns {Promise<void>}
 */
async function restoreMatchSidecars(archive, targetMatchId) {
  const matchPath = getMatchDataPath(targetMatchId);
  for (const entry of archive.entries) {
    if (!shouldRestoreMatchEntry(matchPath, entry.path)) continue;
    const relativePath = entry.path.slice('match/'.length);
    const outputPath = resolveMatchPath(targetMatchId, ...relativePath.split('/'));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, entry.data);
  }
}

/**
 * @param {object} match
 * @param {string} sourceMatchId
 * @param {string} importedAt
 * @param {boolean} asCopy
 * @returns {object}
 */
function buildImportedMatch(match, sourceMatchId, importedAt, asCopy) {
  return {
    ...sanitizeForArchive(match),
    id: asCopy ? uuidv4() : validateMatchId(match.id),
    importedFromMatchId: asCopy ? sourceMatchId : match.importedFromMatchId,
    importedAt,
    updatedAt: importedAt,
    video: match.video?.sourceType === 'local_mp4' || match.video?.type === 'local'
      ? {
        ...match.video,
        path: '',
        fileUrl: '',
        needsLocalFile: true,
      }
      : match.video,
  };
}

/**
 * @param {string} archivePath
 * @param {{duplicateStrategy?: 'replace'|'copy'|'cancel', now?: function(): string}} [options]
 * @returns {Promise<object>}
 */
async function importMatchArchive(archivePath, options = {}) {
  const archive = await readPortableArchive(archivePath);
  const manifest = readManifest(archive);
  const archivedMatch = readArchivedMatch(archive);
  validateMatchArchivePayload(manifest, archivedMatch);

  const sourceMatchId = validateMatchId(archivedMatch.id);
  const exists = await matchExists(sourceMatchId);
  const duplicateStrategy = exists ? options.duplicateStrategy : 'replace';
  if (duplicateStrategy === 'cancel') return { canceled: true, action: 'cancel' };
  if (exists && !duplicateStrategy) {
    return {
      needsDecision: true,
      existingMatchId: sourceMatchId,
      incoming: {
        id: sourceMatchId,
        homeTeam: archivedMatch.homeTeam,
        awayTeam: archivedMatch.awayTeam,
        date: archivedMatch.date,
      },
    };
  }
  if (duplicateStrategy !== 'replace' && duplicateStrategy !== 'copy') {
    throw new Error('Estrategia de importacion invalida.');
  }

  const importedAt = options.now?.() || new Date().toISOString();
  const asCopy = exists && duplicateStrategy === 'copy';
  const nextMatch = buildImportedMatch(archivedMatch, sourceMatchId, importedAt, asCopy);
  if (exists && duplicateStrategy === 'replace') await deleteMatch(sourceMatchId);
  const created = await createMatch(nextMatch);
  await updateMatch(created.id, nextMatch);
  await restoreMatchSidecars(archive, created.id);
  return {
    canceled: false,
    action: asCopy ? 'copy' : exists ? 'replace' : 'import',
    sourceMatchId,
    match: await getMatchById(created.id),
  };
}

/**
 * @param {{dialog?: object, browserWindow?: object|null}} [options]
 * @returns {Promise<{canceled: boolean, filePath?: string}>}
 */
async function selectImportArchive(options = {}) {
  if (!options.dialog?.showOpenDialog) throw new Error('No hay dialog de importacion disponible.');
  const result = await options.dialog.showOpenDialog(options.browserWindow || null, {
    title: 'Importar partido BiguAnalytics',
    properties: ['openFile'],
    filters: [
      { name: 'BiguAnalytics', extensions: ['biguanalytics', 'zip'] },
    ],
  });
  const filePath = result.filePaths?.[0];
  if (result.canceled || !filePath) return { canceled: true };
  return { canceled: false, filePath };
}

/**
 * @param {{includeVideo?: boolean}} [options]
 * @returns {Promise<Array<{path: string, data: Buffer}>>}
 */
async function collectBackupMatchEntries(options = {}) {
  const summaries = await getAllMatches();
  const entries = [];
  for (const summary of summaries) {
    if (!summary?.id || summary.status === 'corrupt') continue;
    const fullMatch = await getMatchById(summary.id);
    const { match: exportMatch } = sanitizeMatchForArchive(fullMatch);
    entries.push({
      path: `matches/${exportMatch.id}/match.json`,
      data: jsonBuffer(exportMatch),
    });
    const matchPath = getMatchDataPath(exportMatch.id);
    const files = await listFilesRecursive(matchPath);
    for (const filePath of files) {
      const relativePath = relativeArchivePath(matchPath, filePath);
      if (relativePath === 'match.json') continue;
      if (!options.includeVideo && isVideoFile(filePath)) continue;
      entries.push({
        path: `matches/${exportMatch.id}/${relativePath}`,
        data: await readSanitizedFile(filePath),
      });
    }
  }
  return entries;
}

/**
 * @param {{dialog?: object, browserWindow?: object|null, outputPath?: string, now?: function(): string, appVersion?: string, settings?: object}} [options]
 * @returns {Promise<object>}
 */
async function exportLocalBackup(options = {}) {
  const exportedAt = options.now?.() || new Date().toISOString();
  const output = await resolveOutputPath({
    dialog: options.dialog,
    browserWindow: options.browserWindow,
    outputPath: options.outputPath,
    defaultPath: buildTimestampFileName('BiguAnalytics-backup-local', exportedAt),
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  });
  if (output.canceled) return { canceled: true };

  const safeSettings = sanitizeForArchive(options.settings || await getSettings());
  const entries = [
    {
      path: 'manifest.json',
      data: jsonBuffer({
        type: BACKUP_ARCHIVE_TYPE,
        schemaVersion: BACKUP_EXPORT_SCHEMA_VERSION,
        exportedAt,
        appVersion: options.appVersion || getDefaultAppVersion(),
      }),
    },
    {
      path: 'settings.json',
      data: jsonBuffer(safeSettings),
    },
    ...await collectBackupMatchEntries(),
  ];
  await writePortableArchive(entries, output.filePath, { now: () => exportedAt });
  return {
    canceled: false,
    filePath: output.filePath,
    fileName: path.basename(output.filePath),
  };
}

module.exports = {
  BACKUP_ARCHIVE_TYPE,
  BACKUP_EXPORT_SCHEMA_VERSION,
  MATCH_ARCHIVE_TYPE,
  MATCH_EXPORT_SCHEMA_VERSION,
  VIDEO_EXPORT_WARNING,
  exportLocalBackup,
  exportMatchArchive,
  importMatchArchive,
  readPortableArchive,
  sanitizeForArchive,
  selectImportArchive,
  writePortableArchive,
};
