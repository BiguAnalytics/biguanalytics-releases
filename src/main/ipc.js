const { BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { createDefaultSecureSessionStore } = require('./modules/secure-session-store');
const { createDeviceFingerprint } = require('./modules/device-fingerprint');
const { getSupabaseConfig } = require('./modules/env');
const { createMatch, getAllMatches, getMatchById, updateMatch, deleteMatch } = require('./modules/storage');
const { addEvent, updateEvent, deleteEvent } = require('./modules/events');
const { localVideoExists, normalizeYouTubeSource, selectLocalVideo } = require('./modules/media');
const { getSettings, updateSettings } = require('./modules/settings');
const { getMatchStats, getSeasonStats } = require('./modules/analytics');
const { exportDashboardPdf } = require('./modules/pdf-export');
const { saveLiveDrawing, saveFrameDrawing, getMatchDrawings, exportPng } = require('./modules/drawings');
const {
  createTacticalBoard,
  getTacticalBoard,
  listTacticalBoards,
  updateTacticalBoard,
  renameTacticalBoard,
  deleteTacticalBoard,
  exportTacticalBoardPng,
} = require('./modules/tactical-boards');
const {
  getMatchAnalysisStatus,
  getMatchAnalysis,
  generateMatchAnalysis,
  regenerateMatchAnalysis,
  validateAIRequestMatchId: validateAIReportMatchId,
} = require('./modules/ai/aiReports');
const {
  askAIChat,
  getAIChatStatus,
  validateAIChatQuestion,
  validateAIChatScope,
} = require('./modules/ai/aiChat');

/**
 * @param {unknown} error
 * @returns {string}
 */
function getSafeErrorMessage(error) {
  const message = error instanceof Error ? error.message : 'Error desconocido.';
  return message
    .replace(/GEMINI_API_KEY=[^\s]+/g, 'GEMINI_API_KEY=***')
    .replace(/key=[^&\s]+/g, 'key=***')
    .slice(0, 280);
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
function validateAIRequestMatchId(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Solicitud IA inválida.');
  }
  const keys = Object.keys(payload);
  if (keys.length > 2) throw new Error('Solicitud IA inválida.');
  return validateAIReportMatchId(payload.matchId);
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
    : validateAIReportMatchId(payload.matchId);
  const question = options.requireQuestion ? validateAIChatQuestion(payload.question) : undefined;
  const scope = validateAIChatScope(payload.scope);
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

/**
 * Registers all IPC handlers
 */
function registerIpcHandlers() {
  const licenseSessionStore = createDefaultSecureSessionStore();

  // License session and public config
  ipcMain.handle('licenseSession:get', async (e, key) => licenseSessionStore.get(key));
  ipcMain.handle('licenseSession:set', async (e, key, value) => {
    await licenseSessionStore.set(key, value);
    return true;
  });
  ipcMain.handle('licenseSession:remove', async (e, key) => {
    await licenseSessionStore.remove(key);
    return true;
  });
  ipcMain.handle('licenseSession:clear', async () => {
    await licenseSessionStore.clear();
    return true;
  });
  ipcMain.handle('licenseConfig:get', async () => getSupabaseConfig());
  ipcMain.handle('device:getFingerprint', async () => createDeviceFingerprint());

  // Matches
  ipcMain.handle('matches:create', async (e, data) => await createMatch(data));
  ipcMain.handle('matches:getAll', async () => await getAllMatches());
  ipcMain.handle('matches:getById', async (e, id) => await getMatchById(id));
  ipcMain.handle('matches:update', async (e, id, data) => await updateMatch(id, data));
  ipcMain.handle('matches:delete', async (e, id) => await deleteMatch(id));

  // Events
  ipcMain.handle('events:add', async (e, matchId, eventData) => await addEvent(matchId, eventData));
  ipcMain.handle('events:update', async (e, matchId, eventId, updates) => await updateEvent(matchId, eventId, updates));
  ipcMain.handle('events:delete', async (e, matchId, eventId) => await deleteEvent(matchId, eventId));

  // Settings
  ipcMain.handle('settings:get', async () => await getSettings());
  ipcMain.handle('settings:set', async (e, partial) => {
    const updated = await updateSettings(partial);
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('settings:changed', updated);
    });
    return updated;
  });

  // Analytics
  ipcMain.handle('analytics:getMatchStats', async (e, matchId, filters) => await getMatchStats(matchId, filters));
  ipcMain.handle('analytics:getSeasonStats', async (e, year) => await getSeasonStats(year));
  ipcMain.handle('analytics:exportPdf', async (e, matchId, printPayload) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    return exportDashboardPdf(matchId, printPayload, { dialog, browserWindow });
  });

  // Drawings
  ipcMain.handle('drawings:saveLive', async (e, matchId, drawing) => await saveLiveDrawing(matchId, drawing));
  ipcMain.handle('drawings:saveFrame', async (e, matchId, eventId, drawing) => await saveFrameDrawing(matchId, eventId, drawing));
  ipcMain.handle('drawings:getForMatch', async (e, matchId) => await getMatchDrawings(matchId));
  ipcMain.handle('drawings:exportPng', async (e, dataUrl, suggestedName) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    return exportPng(dataUrl, suggestedName, { dialog, browserWindow });
  });

  // Tactical boards
  ipcMain.handle('tacticalBoards:list', async () => await listTacticalBoards());
  ipcMain.handle('tacticalBoards:get', async (e, id) => await getTacticalBoard(id));
  ipcMain.handle('tacticalBoards:create', async (e, data) => await createTacticalBoard(data));
  ipcMain.handle('tacticalBoards:update', async (e, id, data) => await updateTacticalBoard(id, data));
  ipcMain.handle('tacticalBoards:rename', async (e, id, name) => await renameTacticalBoard(id, name));
  ipcMain.handle('tacticalBoards:delete', async (e, id) => await deleteTacticalBoard(id));
  ipcMain.handle('tacticalBoards:exportPng', async (e, dataUrl, suggestedName) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    return exportTacticalBoardPng(dataUrl, suggestedName, { dialog, browserWindow });
  });

  // AI
  ipcMain.handle('ai:getMatchAnalysisStatus', async (e, payload) => runAIHandler(async () => {
    const matchId = validateAIRequestMatchId(payload);
    return getMatchAnalysisStatus(matchId);
  }));
  ipcMain.handle('ai:getMatchAnalysis', async (e, payload) => runAIHandler(async () => {
    const matchId = validateAIRequestMatchId(payload);
    return getMatchAnalysis(matchId);
  }));
  ipcMain.handle('ai:generateMatchAnalysis', async (e, payload) => runAIHandler(async () => {
    const matchId = validateAIRequestMatchId(payload);
    return generateMatchAnalysis(matchId);
  }));
  ipcMain.handle('ai:regenerateMatchAnalysis', async (e, payload) => runAIHandler(async () => {
    const matchId = validateAIRequestMatchId(payload);
    if (payload.confirm !== true) throw new Error('La regeneración IA requiere confirmación explícita.');
    return regenerateMatchAnalysis(matchId, { confirm: true });
  }));
  ipcMain.handle('ai:chatStatus', async (e, payload = {}) => runAIHandler(async () => {
    const request = validateAIChatRequest(payload);
    return getAIChatStatus({ matchId: request.matchId });
  }));
  ipcMain.handle('ai:chatAsk', async (e, payload) => runAIHandler(async () => {
    const request = validateAIChatRequest(payload, { requireQuestion: true });
    return askAIChat(request);
  }));

  // Media
  ipcMain.handle('media:selectLocalVideo', async (e) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    return selectLocalVideo(dialog, browserWindow);
  });
  ipcMain.handle('media:normalizeYouTube', async (e, url) => normalizeYouTubeSource(url));
  ipcMain.handle('media:localVideoExists', async (e, filePath) => localVideoExists(filePath));

  // Files
  ipcMain.handle('files:open', async (e, filePath) => shell.openPath(filePath));
}

module.exports = {
  registerIpcHandlers,
  validateAIChatRequest,
};
