const { BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { getStartupTimer } = require('./modules/startup-timing');

const allowedOpenPaths = new Set();
const allowedImportPaths = new Set();
const moduleCache = new Map();

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
    allowedOpenPaths.add(path.resolve(filePath));
  }
}

/**
 * @param {unknown} filePath
 */
function registerImportPath(filePath) {
  if (typeof filePath === 'string' && filePath.trim()) {
    allowedImportPaths.add(path.resolve(filePath));
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
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Ruta no autorizada.');
  }
  const resolved = path.resolve(filePath);
  if (!allowedOpenPaths.has(resolved)) {
    throw new Error('Ruta no autorizada.');
  }
  return resolved;
}

/**
 * @param {unknown} filePath
 * @returns {string}
 */
function resolveAllowedImportPath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Ruta no autorizada.');
  }
  const resolved = path.resolve(filePath);
  if (!allowedImportPaths.has(resolved)) {
    throw new Error('Ruta no autorizada.');
  }
  return resolved;
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
  ipcMain.handle('matches:create', async (e, data) => getStorageModule().createMatch(data));
  ipcMain.handle('matches:getAll', async () => startupTimer.timeAsync('data:matches-list', () => getStorageModule().getAllMatches()));
  ipcMain.handle('matches:getById', async (e, id) => getStorageModule().getMatchById(validateIpcMatchId(id)));
  ipcMain.handle('matches:update', async (e, id, data) => getStorageModule().updateMatch(validateIpcMatchId(id), data));
  ipcMain.handle('matches:delete', async (e, id) => getStorageModule().deleteMatch(validateIpcMatchId(id)));
  ipcMain.handle('matches:upsertCache', async (e, data) => getStorageModule().upsertMatchCache(data));
  ipcMain.handle('matches:getPendingSync', async (e, filters) => getStorageModule().getPendingSync(filters));
  ipcMain.handle('matches:enqueuePendingSync', async (e, operation) => getStorageModule().enqueuePendingSync(operation));
  ipcMain.handle('matches:markPendingSyncApplied', async (e, ids) => getStorageModule().markPendingSyncApplied(ids));
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
    return lazyRequire('./modules/media').selectLocalVideo(dialog, browserWindow);
  });
  ipcMain.handle('media:normalizeYouTube', async (e, url) => lazyRequire('./modules/media').normalizeYouTubeSource(url));
  ipcMain.handle('media:localVideoExists', async (e, filePath) => lazyRequire('./modules/media').localVideoExists(filePath));
  ipcMain.handle('media:getLocalVideoMetadata', async (e, filePath) => lazyRequire('./modules/media').getLocalVideoMetadata(filePath));

  // Files
  ipcMain.handle('exports:openPath', async (e, filePath) => shell.openPath(resolveAllowedOpenPath(filePath)));
}

module.exports = {
  lazyRequire,
  registerIpcHandlers,
  validateAIChatRequest,
};
