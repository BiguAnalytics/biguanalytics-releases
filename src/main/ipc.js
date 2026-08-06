const { BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { getStartupTimer } = require('./modules/startup-timing');

const allowedOpenPaths = new Map();
const allowedImportPaths = new Map();
const allowedVideoPaths = new Map();
const moduleCache = new Map();

const AUTHORIZED_PATH_TTL_MS = 15 * 60 * 1000;
const MAX_AUTHORIZED_PATHS = 256;
const MAX_MATCH_DTO_BYTES = 8 * 1024 * 1024;
const MAX_DTO_DEPTH = 8;
const MAX_DTO_KEYS = 64;
const MAX_DTO_ARRAY_ITEMS = 10000;
const MAX_DTO_STRING_LENGTH = 200000;
const MAX_MATCH_EVENTS = 10000;
const MAX_MATCH_DRAWINGS = 1000;
const MAX_MATCH_SEQUENCES = 5000;
const MAX_MATCH_ROSTER = 1000;
const MAX_PENDING_SYNC_OPERATIONS = 1000;
const MAX_PENDING_SYNC_IDS = 1000;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi']);
const MATCH_DTO_KEYS = new Set([
  'id', 'homeTeam', 'awayTeam', 'localTeam', 'rivalTeam', 'date', 'matchDate', 'competition', 'venue',
  'video', 'roster', 'status', 'events', 'drawings', 'sequences', 'possession', 'coachNotes',
  'scoreAdjustment', 'scoreOverride', 'cloud', 'createdAt', 'updatedAt', 'homeScore', 'awayScore',
  'score', 'scoreContext', 'eventCount', 'sequenceCount', 'corrupt', 'recoverable', 'filePath', 'error',
]);
const MATCH_UPDATE_KEYS = new Set([...MATCH_DTO_KEYS].filter(key => key !== 'id' && key !== 'corrupt' && key !== 'recoverable' && key !== 'filePath' && key !== 'error'));
const VIDEO_KEYS = new Set([
  'type', 'sourceType', 'url', 'embedUrl', 'videoId', 'path', 'fileUrl', 'name', 'size', 'fingerprintHash',
  'duration', 'durationStatus', 'startOffsetMs', 'needsLocalFile', 'localFileName', 'localFileSize',
  'localDurationMs', 'localFingerprintHash', 'youtubeUrl', 'youtubeVideoId',
]);
const PENDING_SYNC_KEYS = new Set([
  'id', 'status', 'createdAt', 'updatedAt', 'matchId', 'entity', 'action', 'dedupeKey', 'payload',
  'recoveredFromCorruptQueue',
]);
const PENDING_SYNC_ENTITIES = new Set(['matches', 'video_references', 'match_events', 'match_possessions', 'match_sequences', 'match_notes']);
const PENDING_SYNC_ACTIONS = new Set(['upsert', 'replace', 'delete']);
const CLOUD_EVENT_KEYS = new Set([
  'id', 'match_id', 'club_id', 'created_by', 'timestamp_ms', 'event_type', 'team', 'result', 'subtype',
  'zone', 'note', 'payload', 'created_at', 'updated_at',
]);

function invalidIpcDto(message) {
  throw new Error(`DTO IPC invalido: ${message}`);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidIpcDto(`${label} debe ser un objeto.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalidIpcDto(`${label} contiene un objeto no permitido.`);
}

function assertJsonValue(value, label = 'DTO', depth = 0, seen = new Set()) {
  if (depth > MAX_DTO_DEPTH) invalidIpcDto(`${label} supera la profundidad maxima.`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    if (typeof value === 'string' && value.length > MAX_DTO_STRING_LENGTH) invalidIpcDto(`${label} supera el largo maximo.`);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidIpcDto(`${label} contiene un numero invalido.`);
    return;
  }
  if (typeof value !== 'object') invalidIpcDto(`${label} contiene un tipo no permitido.`);
  if (seen.has(value)) invalidIpcDto(`${label} contiene una referencia circular.`);
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_DTO_ARRAY_ITEMS) invalidIpcDto(`${label} supera el limite de elementos.`);
    value.forEach((item, index) => assertJsonValue(item, `${label}[${index}]`, depth + 1, seen));
  } else {
    const keys = Object.keys(value);
    if (keys.length > MAX_DTO_KEYS) invalidIpcDto(`${label} supera el limite de campos.`);
    keys.forEach((key) => {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') invalidIpcDto(`${label} contiene un campo no permitido.`);
      if (key.length > 100) invalidIpcDto(`${label} contiene un nombre de campo demasiado largo.`);
      assertJsonValue(value[key], `${label}.${key}`, depth + 1, seen);
    });
  }
  seen.delete(value);
}

function assertDtoSize(value, label) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalidIpcDto(`${label} no es serializable.`);
  }
  if (Buffer.byteLength(serialized || '', 'utf8') > MAX_MATCH_DTO_BYTES) invalidIpcDto(`${label} supera el tamano maximo.`);
}

function assertAllowedKeys(value, allowedKeys, label) {
  const unknown = Object.keys(value).find(key => !allowedKeys.has(key));
  if (unknown) invalidIpcDto(`${label} contiene el campo no permitido ${unknown}.`);
}

function assertOptionalString(value, label, maxLength = 2000) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || value.length > maxLength) invalidIpcDto(`${label} invalido.`);
}

function assertOptionalFiniteNumber(value, label, { min = Number.NEGATIVE_INFINITY } = {}) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) invalidIpcDto(`${label} invalido.`);
}

function isSupportedVideoPath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return false;
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function cleanupAuthorizedPaths(registry, now = Date.now()) {
  for (const [filePath, expiresAt] of registry) {
    if (expiresAt <= now) registry.delete(filePath);
  }
}

function registerAuthorizedPath(registry, filePath) {
  const resolved = path.resolve(filePath);
  const now = Date.now();
  cleanupAuthorizedPaths(registry, now);
  registry.delete(resolved);
  while (registry.size >= MAX_AUTHORIZED_PATHS) {
    const oldest = registry.keys().next().value;
    if (oldest === undefined) break;
    registry.delete(oldest);
  }
  registry.set(resolved, now + AUTHORIZED_PATH_TTL_MS);
  return resolved;
}

function isAuthorizedPath(registry, filePath, now = Date.now()) {
  cleanupAuthorizedPaths(registry, now);
  const expiresAt = registry.get(filePath);
  if (expiresAt === undefined || expiresAt <= now) {
    registry.delete(filePath);
    return false;
  }
  return true;
}

function resolveAuthorizedPath(registry, filePath, errorMessage) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error(errorMessage);
  }
  const resolved = path.resolve(filePath);
  const now = Date.now();
  if (!isAuthorizedPath(registry, resolved, now)) {
    throw new Error(errorMessage);
  }
  registerAuthorizedPath(registry, resolved);
  return resolved;
}

function registerAllowedVideoPath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim() || !path.isAbsolute(filePath) || !isSupportedVideoPath(filePath)) {
    throw new Error('Ruta de video o extension no permitida.');
  }
  return registerAuthorizedPath(allowedVideoPaths, filePath);
}

function isAllowedVideoPath(filePath) {
  if (!isSupportedVideoPath(filePath)) return false;
  return isAuthorizedPath(allowedVideoPaths, path.resolve(filePath));
}

function resolveAllowedVideoPath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim() || !path.isAbsolute(filePath)) {
    throw new Error('Ruta de video no autorizada.');
  }
  const resolved = path.resolve(filePath);
  if (!isSupportedVideoPath(resolved) || !isAuthorizedPath(allowedVideoPaths, resolved)) {
    throw new Error('Ruta de video no autorizada o no registrada.');
  }
  registerAuthorizedPath(allowedVideoPaths, resolved);
  return resolved;
}

function registerVideoFromMatch(match) {
  const videoPath = match?.video?.path;
  if (!videoPath) return;
  try {
    registerAllowedVideoPath(videoPath);
  } catch {
    // Invalid legacy cache paths remain readable as metadata, but cannot be used by metadata IPC.
  }
}

function validateVideoDto(video) {
  if (video === undefined || video === null) return video;
  assertPlainObject(video, 'video');
  assertAllowedKeys(video, VIDEO_KEYS, 'video');
  assertOptionalString(video.type, 'video.type', 40);
  assertOptionalString(video.sourceType, 'video.sourceType', 40);
  ['url', 'embedUrl', 'fileUrl', 'name', 'fingerprintHash', 'localFileName', 'youtubeUrl', 'youtubeVideoId']
    .forEach(key => assertOptionalString(video[key], `video.${key}`, 4096));
  if (video.path !== undefined && video.path !== null && video.path !== '') {
    if (!isSupportedVideoPath(video.path)) invalidIpcDto('video.path debe usar una extension de video permitida.');
  }
  ['size', 'duration', 'startOffsetMs', 'localFileSize', 'localDurationMs'].forEach(key => assertOptionalFiniteNumber(video[key], `video.${key}`, { min: 0 }));
  if (video.needsLocalFile !== undefined && typeof video.needsLocalFile !== 'boolean') invalidIpcDto('video.needsLocalFile invalido.');
  return video;
}

function normalizeMatchEvents(events) {
  if (events === undefined) return undefined;
  if (!Array.isArray(events)) invalidIpcDto('events debe ser un array.');
  if (events.length > MAX_MATCH_EVENTS) invalidIpcDto('events supera el limite de elementos.');
  const eventModule = lazyRequire('./modules/events');
  return events.map((event, index) => {
    try {
      return eventModule.validateEventPayload(event);
    } catch (error) {
      invalidIpcDto(`events[${index}] invalido: ${error instanceof Error ? error.message : 'error de validacion'}`);
    }
  });
}

function validateMatchDto(payload, allowedKeys, label, { requireId = false } = {}) {
  assertPlainObject(payload, label);
  assertAllowedKeys(payload, allowedKeys, label);
  assertJsonValue(payload, label);
  assertDtoSize(payload, label);
  if (requireId || payload.id !== undefined) validateIpcMatchId(payload.id);
  ['homeTeam', 'awayTeam', 'localTeam', 'rivalTeam', 'date', 'matchDate', 'competition', 'status', 'coachNotes', 'createdAt', 'updatedAt', 'filePath', 'error']
    .forEach(key => assertOptionalString(payload[key], `${label}.${key}`, key === 'coachNotes' ? 100000 : 4096));
  ['homeScore', 'awayScore', 'eventCount', 'sequenceCount'].forEach(key => assertOptionalFiniteNumber(payload[key], `${label}.${key}`, { min: 0 }));
  if (payload.venue !== undefined && payload.venue !== 'home' && payload.venue !== 'away') invalidIpcDto(`${label}.venue invalido.`);
  if (payload.roster !== undefined) {
    if (!Array.isArray(payload.roster) || payload.roster.length > MAX_MATCH_ROSTER) invalidIpcDto(`${label}.roster supera el limite.`);
  }
  if (payload.drawings !== undefined && (!Array.isArray(payload.drawings) || payload.drawings.length > MAX_MATCH_DRAWINGS)) invalidIpcDto(`${label}.drawings supera el limite.`);
  if (payload.sequences !== undefined && (!Array.isArray(payload.sequences) || payload.sequences.length > MAX_MATCH_SEQUENCES)) invalidIpcDto(`${label}.sequences supera el limite.`);
  validateVideoDto(payload.video);
  const events = normalizeMatchEvents(payload.events);
  return events === undefined ? { ...payload } : { ...payload, events };
}

function validateMatchCreatePayload(payload) {
  return validateMatchDto(payload, MATCH_DTO_KEYS, 'match', { requireId: false });
}

function validateMatchUpdatePayload(payload) {
  return validateMatchDto(payload, MATCH_UPDATE_KEYS, 'match update');
}

function validateMatchCachePayload(payload) {
  return validateMatchDto(payload, MATCH_DTO_KEYS, 'match cache', { requireId: true });
}

function normalizeCloudEventRow(row) {
  assertPlainObject(row, 'match_events payload');
  assertAllowedKeys(row, CLOUD_EVENT_KEYS, 'match_events payload');
  if (row.payload !== undefined) {
    assertPlainObject(row.payload, 'match_events.payload');
    const normalized = lazyRequire('./modules/events').validateEventPayload({
      ...row.payload,
      id: row.payload.id || row.id,
      type: row.payload.type || row.event_type,
      timestamp: row.payload.timestamp ?? (Number.isFinite(Number(row.timestamp_ms)) ? Number(row.timestamp_ms) / 1000 : null),
      team: row.payload.team ?? row.team,
      result: row.payload.result ?? row.result,
      subtype: row.payload.subtype ?? row.subtype,
      note: row.payload.note ?? row.note,
      zone: row.payload.zone ?? row.zone,
    });
    return { ...row, payload: normalized };
  }
  return { ...row };
}

function validatePendingSyncOperation(operation) {
  assertPlainObject(operation, 'pending sync');
  assertAllowedKeys(operation, PENDING_SYNC_KEYS, 'pending sync');
  assertJsonValue(operation, 'pending sync');
  assertDtoSize(operation, 'pending sync');
  ['id', 'createdAt', 'updatedAt', 'dedupeKey'].forEach(key => assertOptionalString(operation[key], `pending sync.${key}`, 4096));
  if (operation.matchId !== undefined && operation.matchId !== null && operation.matchId !== '') validateIpcMatchId(operation.matchId);
  if (operation.entity !== undefined && !PENDING_SYNC_ENTITIES.has(operation.entity)) invalidIpcDto('pending sync.entity invalido.');
  if (operation.action !== undefined && !PENDING_SYNC_ACTIONS.has(operation.action)) invalidIpcDto('pending sync.action invalido.');
  if (operation.status !== undefined && operation.status !== 'pending_sync') invalidIpcDto('pending sync.status invalido.');
  if (operation.recoveredFromCorruptQueue !== undefined && typeof operation.recoveredFromCorruptQueue !== 'boolean') invalidIpcDto('pending sync.recoveredFromCorruptQueue invalido.');
  if (operation.entity === 'match_events' && operation.payload !== undefined) {
    if (Array.isArray(operation.payload)) {
      if (operation.payload.length > MAX_PENDING_SYNC_OPERATIONS) invalidIpcDto('pending sync.payload supera el limite.');
      return { ...operation, payload: operation.payload.map(normalizeCloudEventRow) };
    }
    return { ...operation, payload: normalizeCloudEventRow(operation.payload) };
  }
  return { ...operation };
}

function validatePendingSyncFilters(filters) {
  if (filters === undefined || filters === null) return {};
  assertPlainObject(filters, 'pending sync filters');
  assertAllowedKeys(filters, new Set(['matchId']), 'pending sync filters');
  assertJsonValue(filters, 'pending sync filters');
  if (filters.matchId !== undefined && filters.matchId !== null && filters.matchId !== '') validateIpcMatchId(filters.matchId);
  return { ...filters };
}

function validatePendingSyncIds(ids) {
  if (ids === undefined || ids === null) return [];
  if (!Array.isArray(ids) || ids.length > MAX_PENDING_SYNC_IDS) invalidIpcDto('pending sync ids supera el limite.');
  return ids.map((id) => {
    if (typeof id !== 'string' || !id.trim() || id.length > 120) invalidIpcDto('pending sync id invalido.');
    return id;
  });
}

function lazyRequire(modulePath) {
  if (!moduleCache.has(modulePath)) {
    const startupTimer = getStartupTimer();
    startupTimer.mark(`module:${modulePath}:load:start`);
    moduleCache.set(modulePath, require(modulePath));
    startupTimer.mark(`module:${modulePath}:load:end`);
  }
  return moduleCache.get(modulePath);
}

function getStorageModule() {
  return lazyRequire('./modules/storage');
}

function getAuthSessionKeysModule() {
  return lazyRequire('./modules/auth-session-keys');
}

function getDeviceIdentityModule() {
  return lazyRequire('./modules/device-fingerprint');
}

function getMatchTransferModule() {
  return lazyRequire('./modules/match-transfer');
}

function getPdfTemplatesModule() {
  return lazyRequire('./modules/pdf-templates');
}

function getUpdaterModule() {
  return lazyRequire('./modules/updater');
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getSafeErrorMessage(error) {
  const message = error instanceof Error ? error.message : 'Error desconocido.';
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer ***')
    .replace(/token[=:]\s*[^&\s]+/gi, 'token=***')
    .replace(/key[=:]\s*[^&\s]+/gi, 'key=***')
    .slice(0, 280);
}

/**
 * @param {unknown} matchId
 * @returns {string}
 */
function validateIpcMatchId(matchId) {
  try {
    return getStorageModule().validateMatchId(matchId);
  } catch {
    throw new Error('Match ID invalido.');
  }
}

/**
 * @param {unknown} payload
 * @returns {object}
 */
function validatePayloadMatchId(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, 'matchId')) return payload;
  return {
    ...payload,
    matchId: validateIpcMatchId(payload.matchId),
  };
}

/**
 * @param {unknown} filePath
 */
function registerOpenPath(filePath) {
  if (typeof filePath === 'string' && filePath.trim()) {
    registerAuthorizedPath(allowedOpenPaths, filePath);
  }
}

/**
 * @param {unknown} filePath
 */
function registerImportPath(filePath) {
  if (typeof filePath === 'string' && filePath.trim()) {
    registerAuthorizedPath(allowedImportPaths, filePath);
  }
}

/**
 * @param {unknown} result
 * @returns {unknown}
 */
function registerOpenResult(result) {
  if (!result || typeof result !== 'object') return result;
  registerOpenPath(result.filePath);
  registerOpenPath(result.outputPath);
  registerOpenPath(result.outputDir);
  if (Array.isArray(result.files)) {
    result.files.forEach(registerOpenPath);
  }
  return result;
}

/**
 * @param {unknown} filePath
 * @returns {string}
 */
function resolveAllowedOpenPath(filePath) {
  return resolveAuthorizedPath(allowedOpenPaths, filePath, 'Ruta no autorizada.');
}

/**
 * @param {unknown} filePath
 * @returns {string}
 */
function resolveAllowedImportPath(filePath) {
  return resolveAuthorizedPath(allowedImportPaths, filePath, 'Ruta no autorizada.');
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
function validateAIRequestMatchId(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Solicitud IA invalida.');
  }
  const keys = Object.keys(payload);
  if (keys.length > 2) throw new Error('Solicitud IA invalida.');
  return lazyRequire('./modules/ai/aiReports').validateAIRequestMatchId(payload.matchId);
}

/**
 * @param {unknown} history
 * @returns {Array<{role: string, content: string}>}
 */
function sanitizeAIChatHistory(history) {
  if (history === undefined || history === null) return [];
  if (!Array.isArray(history)) throw new Error('Historial IA invalido.');
  if (history.length > 8) throw new Error('Historial IA demasiado largo.');
  return history.map((item) => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: typeof item?.content === 'string' ? item.content.trim().slice(0, 1200) : '',
  })).filter(item => item.content);
}

/**
 * @param {unknown} payload
 * @param {{requireQuestion?: boolean}} [options]
 * @returns {{matchId?: string, question?: string, scope?: 'auto'|'match'|'season', history?: Array<object>}}
 */
function validateAIChatRequest(payload, options = {}) {
  const aiChatModule = lazyRequire('./modules/ai/aiChat');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Solicitud de chat IA invalida.');
  }
  const keys = Object.keys(payload);
  const allowedKeys = new Set(['matchId', 'question', 'scope', 'history']);
  if (keys.length > 4 || keys.some(key => !allowedKeys.has(key))) {
    throw new Error('Solicitud de chat IA invalida.');
  }
  const matchId = payload.matchId === undefined || payload.matchId === null || payload.matchId === ''
    ? undefined
    : lazyRequire('./modules/ai/aiReports').validateAIRequestMatchId(payload.matchId);
  const question = options.requireQuestion ? aiChatModule.validateAIChatQuestion(payload.question) : undefined;
  const scope = aiChatModule.validateAIChatScope(payload.scope);
  const history = sanitizeAIChatHistory(payload.history);
  return { matchId, question, scope, history };
}

/**
 * @param {function(): Promise<object>} handler
 * @returns {Promise<object>}
 */
async function runAIHandler(handler) {
  try {
    return await handler();
  } catch (error) {
    throw new Error(getSafeErrorMessage(error));
  }
}

function createRuntimeServices() {
  const startupTimer = getStartupTimer();
  let authSessionStore = null;
  let authAccessService = null;
  let clipExporter = null;
  let speechDictation = null;
  let aiBackendClient = null;
  let aiReports = null;
  let aiChat = null;

  function getAuthSessionStore() {
    if (!authSessionStore) {
      startupTimer.mark('auth-session-store:init:start');
      authSessionStore = lazyRequire('./modules/secure-session-store').createDefaultSecureSessionStore();
      startupTimer.mark('auth-session-store:init:end');
    }
    return authSessionStore;
  }

  function getAuthAccessService() {
    if (!authAccessService) {
      startupTimer.mark('auth-access-service:init:start');
      authAccessService = lazyRequire('./auth/auth-service').createDefaultAuthAccessService();
      startupTimer.mark('auth-access-service:init:end');
    }
    return authAccessService;
  }

  function getClipExporter() {
    if (!clipExporter) {
      startupTimer.mark('clip-exporter:init:start');
      clipExporter = lazyRequire('./modules/clip-exporter').createClipExporter();
      startupTimer.mark('clip-exporter:init:end');
    }
    return clipExporter;
  }

  function getSpeechDictation() {
    if (!speechDictation) {
      startupTimer.mark('speech-dictation:init:start');
      speechDictation = lazyRequire('./modules/speech-dictation').createSpeechDictationService();
      startupTimer.mark('speech-dictation:init:end');
    }
    return speechDictation;
  }

  function getAIBackendClient() {
    if (!aiBackendClient) {
      startupTimer.mark('ai:init:start');
      const { createAIBackendClient } = lazyRequire('./modules/ai/aiBackendClient');
      const { getStoredSupabaseAccessToken } = lazyRequire('./modules/ai/aiAuthSession');
      aiBackendClient = createAIBackendClient({
        getAuthToken: () => getStoredSupabaseAccessToken(getAuthSessionStore()),
      });
      startupTimer.mark('ai:init:end');
    }
    return aiBackendClient;
  }

  function getAIReports() {
    if (!aiReports) {
      aiReports = lazyRequire('./modules/ai/aiReports').createAIReports({
        provider: getAIBackendClient(),
      });
    }
    return aiReports;
  }

  function getAIChat() {
    if (!aiChat) {
      aiChat = lazyRequire('./modules/ai/aiChat').createAIChat({
        provider: getAIBackendClient(),
      });
    }
    return aiChat;
  }

  return {
    getAIBackendClient,
    getAIChat,
    getAIReports,
    getAuthAccessService,
    getAuthSessionStore,
    getClipExporter,
    getSpeechDictation,
  };
}

/**
 * Registers all IPC handlers
 */
function registerIpcHandlers() {
  const startupTimer = getStartupTimer();
  const services = createRuntimeServices();
  getUpdaterModule().registerUpdaterIpcHandlers();

  // License session and public config
  ipcMain.handle('auth:getAccessStatus', async () => startupTimer.timeAsync('auth:local-access-status', () => services.getAuthAccessService().getAccessStatus()));
  ipcMain.handle('auth:activateOnline', async (e, payload) => services.getAuthAccessService().activateOnline(payload));
  ipcMain.handle('auth:refreshOnline', async (e, payload) => services.getAuthAccessService().refreshOnline(payload));
  ipcMain.handle('auth:revokeLocalAccess', async (e, payload) => services.getAuthAccessService().revokeLocalAccess(payload));
  ipcMain.handle('auth:logout', async () => services.getAuthAccessService().logout());
  ipcMain.handle('account:clearLocalData', async () => getStorageModule().clearLocalAccountData());
  ipcMain.handle('authSession:get', async (e, key) => services.getAuthSessionStore().get(getAuthSessionKeysModule().validateAuthSessionKey(key)));
  ipcMain.handle('authSession:set', async (e, key, value) => {
    await services.getAuthSessionStore().set(getAuthSessionKeysModule().validateAuthSessionKey(key), value);
    return true;
  });
  ipcMain.handle('authSession:remove', async (e, key) => {
    await services.getAuthSessionStore().remove(getAuthSessionKeysModule().validateAuthSessionKey(key));
    return true;
  });
  ipcMain.handle('authSession:clear', async () => {
    await services.getAuthSessionStore().clear();
    return true;
  });
  ipcMain.handle('licenseConfig:get', async () => lazyRequire('./modules/env').getSupabaseConfig());
  ipcMain.handle('device:getFingerprint', async () => getDeviceIdentityModule().createDeviceFingerprint());
  ipcMain.handle('device:getCachedApprovedDevice', async () => getDeviceIdentityModule().createDefaultDeviceIdentityStore().getCachedApprovedDevice());
  ipcMain.handle('device:cacheApprovedDevice', async (e, payload) => getDeviceIdentityModule().createDefaultDeviceIdentityStore().cacheApprovedDevice(payload));
  ipcMain.handle('device:clearCachedApprovedDevice', async (e, payload) => getDeviceIdentityModule().createDefaultDeviceIdentityStore().clearCachedApprovedDevice(payload));

  // Matches
  ipcMain.handle('matches:create', async (e, data) => {
    const match = await getStorageModule().createMatch(validateMatchCreatePayload(data));
    registerVideoFromMatch(match);
    return match;
  });
  ipcMain.handle('matches:getAll', async () => startupTimer.timeAsync('data:matches-list', async () => {
    const matches = await getStorageModule().getAllMatches();
    matches.forEach(registerVideoFromMatch);
    return matches;
  }));
  ipcMain.handle('matches:getById', async (e, id) => {
    const match = await getStorageModule().getMatchById(validateIpcMatchId(id));
    registerVideoFromMatch(match);
    return match;
  });
  ipcMain.handle('matches:update', async (e, id, data) => {
    const match = await getStorageModule().updateMatch(validateIpcMatchId(id), validateMatchUpdatePayload(data));
    registerVideoFromMatch(match);
    return match;
  });
  ipcMain.handle('matches:delete', async (e, id) => getStorageModule().deleteMatch(validateIpcMatchId(id)));
  ipcMain.handle('matches:upsertCache', async (e, data) => {
    const match = await getStorageModule().upsertMatchCache(validateMatchCachePayload(data));
    registerVideoFromMatch(match);
    return match;
  });
  ipcMain.handle('matches:getPendingSync', async (e, filters) => getStorageModule().getPendingSync(validatePendingSyncFilters(filters)));
  ipcMain.handle('matches:enqueuePendingSync', async (e, operation) => getStorageModule().enqueuePendingSync(validatePendingSyncOperation(operation)));
  ipcMain.handle('matches:markPendingSyncApplied', async (e, ids) => getStorageModule().markPendingSyncApplied(validatePendingSyncIds(ids)));
  ipcMain.handle('matches:exportArchive', async (e, id) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    return registerOpenResult(await getMatchTransferModule().exportMatchArchive(validateIpcMatchId(id), { dialog, browserWindow }));
  });
  ipcMain.handle('matches:selectImportArchive', async (e) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    const result = await getMatchTransferModule().selectImportArchive({ dialog, browserWindow });
    registerImportPath(result.filePath);
    return result;
  });
  ipcMain.handle('matches:importArchive', async (e, filePath, options = {}) => (
    getMatchTransferModule().importMatchArchive(resolveAllowedImportPath(filePath), {
      duplicateStrategy: options?.duplicateStrategy,
    })
  ));
  ipcMain.handle('backup:exportLocal', async (e) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    return registerOpenResult(await getMatchTransferModule().exportLocalBackup({ dialog, browserWindow }));
  });

  // Events
  ipcMain.handle('events:add', async (e, matchId, eventData) => lazyRequire('./modules/events').addEvent(validateIpcMatchId(matchId), eventData));
  ipcMain.handle('events:update', async (e, matchId, eventId, updates) => lazyRequire('./modules/events').updateEvent(validateIpcMatchId(matchId), eventId, updates));
  ipcMain.handle('events:delete', async (e, matchId, eventId) => lazyRequire('./modules/events').deleteEvent(validateIpcMatchId(matchId), eventId));

  // Settings
  ipcMain.handle('settings:get', async () => startupTimer.timeAsync('settings:get', () => lazyRequire('./modules/settings').getSettings()));
  ipcMain.handle('settings:set', async (e, partial) => {
    const updated = await startupTimer.timeAsync('settings:set', () => lazyRequire('./modules/settings').updateSettings(partial));
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('settings:changed', updated);
    });
    return updated;
  });

  // PDF templates
  ipcMain.handle('pdfTemplates:list', async () => getPdfTemplatesModule().listPdfTemplates());
  ipcMain.handle('pdfTemplates:get', async (e, id) => getPdfTemplatesModule().getPdfTemplate(id));
  ipcMain.handle('pdfTemplates:create', async (e, data) => getPdfTemplatesModule().createPdfTemplate(data || {}));
  ipcMain.handle('pdfTemplates:update', async (e, id, data) => getPdfTemplatesModule().updatePdfTemplate(id, data || {}));
  ipcMain.handle('pdfTemplates:delete', async (e, id) => getPdfTemplatesModule().deletePdfTemplate(id));
  ipcMain.handle('pdfTemplates:duplicate', async (e, id, data) => getPdfTemplatesModule().duplicatePdfTemplate(id, data || {}));
  ipcMain.handle('pdfTemplates:setDefault', async (e, id) => getPdfTemplatesModule().setDefaultPdfTemplate(id));
  ipcMain.handle('pdfTemplates:export', async (e, id) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    return registerOpenResult(await getPdfTemplatesModule().exportPdfTemplate(id, { dialog, browserWindow }));
  });
  ipcMain.handle('pdfTemplates:import', async (e) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    return getPdfTemplatesModule().importPdfTemplate({ dialog, browserWindow });
  });

  // Analytics
  ipcMain.handle('analytics:getMatchStats', async (e, matchId, filters) => lazyRequire('./modules/analytics').getMatchStats(validateIpcMatchId(matchId), filters));
  ipcMain.handle('analytics:getSeasonStats', async (e, year) => lazyRequire('./modules/analytics').getSeasonStats(year));
  ipcMain.handle('analytics:exportPdf', async (e, matchId, printPayload) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    const { exportDashboardPdf } = lazyRequire('./modules/pdf-export');
    return registerOpenResult(await startupTimer.timeAsync('pdf:export', () => exportDashboardPdf(validateIpcMatchId(matchId), printPayload, { dialog, browserWindow })));
  });
  ipcMain.handle('analytics:previewPdf', async (e, matchId, printPayload) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    const { previewDashboardPdf } = lazyRequire('./modules/pdf-export');
    return registerOpenResult(await startupTimer.timeAsync('pdf:preview', () => previewDashboardPdf(matchId ? validateIpcMatchId(matchId) : '', printPayload, { browserWindow })));
  });

  // Clips
  ipcMain.handle('clips:export-single', async (e, payload) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    const { selectClipOutputDirectory } = lazyRequire('./modules/clip-exporter');
    try {
      return registerOpenResult(await services.getClipExporter().exportSingle(validatePayloadMatchId(payload), {
        selectOutputDirectory: () => selectClipOutputDirectory(dialog, browserWindow),
        notify: (channel, data) => {
          if (channel === 'clips:export-progress') e.sender.send('clips:export-progress', data);
          if (channel === 'clips:export-complete') e.sender.send('clips:export-complete', data);
          if (channel === 'clips:export-error') e.sender.send('clips:export-error', data);
        },
      }));
    } catch (error) {
      e.sender.send('clips:export-error', { message: getSafeErrorMessage(error) });
      throw error;
    }
  });
  ipcMain.handle('clips:export-batch', async (e, payload) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    const { selectClipOutputDirectory } = lazyRequire('./modules/clip-exporter');
    try {
      return registerOpenResult(await services.getClipExporter().exportBatch(validatePayloadMatchId(payload), {
        selectOutputDirectory: () => selectClipOutputDirectory(dialog, browserWindow),
        notify: (channel, data) => {
          if (channel === 'clips:export-progress') e.sender.send('clips:export-progress', data);
          if (channel === 'clips:export-complete') e.sender.send('clips:export-complete', data);
          if (channel === 'clips:export-error') e.sender.send('clips:export-error', data);
        },
      }));
    } catch (error) {
      e.sender.send('clips:export-error', { message: getSafeErrorMessage(error) });
      throw error;
    }
  });
  ipcMain.handle('clips:cancel-export', async () => services.getClipExporter().cancelExport());

  // Speech dictation
  ipcMain.handle('speech:start', async (e, options) => services.getSpeechDictation().start(e.sender, options));
  ipcMain.handle('speech:stop', async (e) => services.getSpeechDictation().stop(e.sender.id));

  // Drawings
  ipcMain.handle('drawings:saveLive', async (e, matchId, drawing) => lazyRequire('./modules/drawings').saveLiveDrawing(validateIpcMatchId(matchId), drawing));
  ipcMain.handle('drawings:updateLive', async (e, matchId, drawingId, drawing) => lazyRequire('./modules/drawings').updateLiveDrawing(validateIpcMatchId(matchId), drawingId, drawing));
  ipcMain.handle('drawings:deleteLive', async (e, matchId, drawingId) => lazyRequire('./modules/drawings').deleteLiveDrawing(validateIpcMatchId(matchId), drawingId));
  ipcMain.handle('drawings:saveFrame', async (e, matchId, eventId, drawing) => lazyRequire('./modules/drawings').saveFrameDrawing(validateIpcMatchId(matchId), eventId, drawing));
  ipcMain.handle('drawings:getForMatch', async (e, matchId) => lazyRequire('./modules/drawings').getMatchDrawings(validateIpcMatchId(matchId)));
  ipcMain.handle('drawings:exportPng', async (e, dataUrl, suggestedName) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    return registerOpenResult(await lazyRequire('./modules/drawings').exportPng(dataUrl, suggestedName, { dialog, browserWindow }));
  });

  // Tactical boards
  ipcMain.handle('tacticalBoards:list', async () => lazyRequire('./modules/tactical-boards').listTacticalBoards());
  ipcMain.handle('tacticalBoards:get', async (e, id) => lazyRequire('./modules/tactical-boards').getTacticalBoard(id));
  ipcMain.handle('tacticalBoards:create', async (e, data) => lazyRequire('./modules/tactical-boards').createTacticalBoard(data));
  ipcMain.handle('tacticalBoards:update', async (e, id, data) => lazyRequire('./modules/tactical-boards').updateTacticalBoard(id, data));
  ipcMain.handle('tacticalBoards:rename', async (e, id, name) => lazyRequire('./modules/tactical-boards').renameTacticalBoard(id, name));
  ipcMain.handle('tacticalBoards:delete', async (e, id) => lazyRequire('./modules/tactical-boards').deleteTacticalBoard(id));
  ipcMain.handle('tacticalBoards:exportPng', async (e, dataUrl, suggestedName) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    return registerOpenResult(await lazyRequire('./modules/tactical-boards').exportTacticalBoardPng(dataUrl, suggestedName, { dialog, browserWindow }));
  });

  // AI
  ipcMain.handle('ai:getMatchAnalysisStatus', async (e, payload) => runAIHandler(async () => {
    const matchId = validateAIRequestMatchId(payload);
    return services.getAIReports().getMatchAnalysisStatus(matchId);
  }));
  ipcMain.handle('ai:getMatchAnalysis', async (e, payload) => runAIHandler(async () => {
    const matchId = validateAIRequestMatchId(payload);
    return services.getAIReports().getMatchAnalysis(matchId);
  }));
  ipcMain.handle('ai:generateMatchAnalysis', async (e, payload) => runAIHandler(async () => {
    const matchId = validateAIRequestMatchId(payload);
    return services.getAIReports().generateMatchAnalysis(matchId);
  }));
  ipcMain.handle('ai:regenerateMatchAnalysis', async (e, payload) => runAIHandler(async () => {
    const matchId = validateAIRequestMatchId(payload);
    if (payload.confirm !== true) throw new Error('La regeneracion IA requiere confirmacion explicita.');
    return services.getAIReports().regenerateMatchAnalysis(matchId, { confirm: true });
  }));
  ipcMain.handle('ai:analyzeMatch', async (e, payload) => runAIHandler(async () => {
    const matchId = validateAIRequestMatchId(payload);
    const context = await lazyRequire('./modules/ai/aiContextBuilder').buildAIContext(matchId);
    return services.getAIBackendClient().analyzeMatch(context);
  }));
  ipcMain.handle('ai:generateSummary', async (e, payload) => runAIHandler(async () => {
    const matchId = validateAIRequestMatchId(payload);
    const context = await lazyRequire('./modules/ai/aiContextBuilder').buildAIContext(matchId);
    return services.getAIBackendClient().generateSummary(context);
  }));
  ipcMain.handle('ai:detectPatterns', async (e, payload) => runAIHandler(async () => {
    const matchId = validateAIRequestMatchId(payload);
    const context = await lazyRequire('./modules/ai/aiContextBuilder').buildAIContext(matchId);
    return services.getAIBackendClient().detectPatterns(context);
  }));
  ipcMain.handle('ai:getConfig', async () => lazyRequire('./modules/ai/aiConfig').getPublicAIConfig());
  ipcMain.handle('ai:setConfig', async (e, payload) => lazyRequire('./modules/ai/aiConfig').setAIConfig(payload || {}));
  ipcMain.handle('ai:testConnection', async () => startupTimer.timeAsync('ai:test-connection', () => services.getAIBackendClient().verifyToken()));
  ipcMain.handle('ai:chatStatus', async (e, payload = {}) => runAIHandler(async () => {
    const request = validateAIChatRequest(payload);
    return services.getAIChat().getStatus({ matchId: request.matchId });
  }));
  ipcMain.handle('ai:chatAsk', async (e, payload) => runAIHandler(async () => {
    const request = validateAIChatRequest(payload, { requireQuestion: true });
    return services.getAIChat().ask(request);
  }));

  // Media
  ipcMain.handle('media:selectLocalVideo', async (e) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    const selected = await lazyRequire('./modules/media').selectLocalVideo(dialog, browserWindow);
    if (selected?.path) registerAllowedVideoPath(selected.path);
    return selected;
  });
  ipcMain.handle('media:normalizeYouTube', async (e, url) => lazyRequire('./modules/media').normalizeYouTubeSource(url));
  ipcMain.handle('media:localVideoExists', async (e, filePath) => lazyRequire('./modules/media').localVideoExists(resolveAllowedVideoPath(filePath)));
  ipcMain.handle('media:getLocalVideoMetadata', async (e, filePath) => lazyRequire('./modules/media').getLocalVideoMetadata(resolveAllowedVideoPath(filePath)));

  // Files
  ipcMain.handle('exports:openPath', async (e, filePath) => shell.openPath(resolveAllowedOpenPath(filePath)));
}

module.exports = {
  isAllowedVideoPath,
  lazyRequire,
  registerImportPath,
  registerOpenPath,
  registerAllowedVideoPath,
  registerIpcHandlers,
  resolveAllowedImportPath,
  resolveAllowedOpenPath,
  resolveAllowedVideoPath,
  validateAIChatRequest,
  validateMatchCachePayload,
  validateMatchCreatePayload,
  validateMatchUpdatePayload,
  validatePendingSyncFilters,
  validatePendingSyncIds,
  validatePendingSyncOperation,
};
