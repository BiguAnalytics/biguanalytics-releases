const { BrowserWindow, dialog, ipcMain } = require('electron');
const { createMatch, getAllMatches, getMatchById, updateMatch, deleteMatch } = require('./modules/storage');
const { addEvent, updateEvent, deleteEvent } = require('./modules/events');
const { normalizeYouTubeSource, selectLocalVideo } = require('./modules/media');
const { getSettings, updateSettings } = require('./modules/settings');

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
  ipcMain.handle('settings:set', async (e, partial) => await updateSettings(partial));

  // Media
  ipcMain.handle('media:selectLocalVideo', async (e) => {
    const browserWindow = BrowserWindow.fromWebContents(e.sender);
    return selectLocalVideo(dialog, browserWindow);
  });
  ipcMain.handle('media:normalizeYouTube', async (e, url) => normalizeYouTubeSource(url));
}

module.exports = {
  registerIpcHandlers
};
