const { BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { createMatch, getAllMatches, getMatchById, updateMatch, deleteMatch } = require('./modules/storage');
const { addEvent, updateEvent, deleteEvent } = require('./modules/events');
const { normalizeYouTubeSource, selectLocalVideo } = require('./modules/media');
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

/**
 * Registers all IPC handlers
 */
function registerIpcHandlers() {
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
  ipcMain.handle('analytics:getMatchStats', async (e, matchId) => await getMatchStats(matchId));
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

  // Media
  ipcMain.handle('media:selectLocalVideo', async (e) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    return selectLocalVideo(dialog, browserWindow);
  });
  ipcMain.handle('media:normalizeYouTube', async (e, url) => normalizeYouTubeSource(url));

  // Files
  ipcMain.handle('files:open', async (e, filePath) => shell.openPath(filePath));
}

module.exports = {
  registerIpcHandlers
};
