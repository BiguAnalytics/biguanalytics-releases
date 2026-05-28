const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  matches: {
    create: (data) => ipcRenderer.invoke('matches:create', data),
    getAll: () => ipcRenderer.invoke('matches:getAll'),
    getById: (id) => ipcRenderer.invoke('matches:getById', id),
    update: (id, data) => ipcRenderer.invoke('matches:update', id, data),
    delete: (id) => ipcRenderer.invoke('matches:delete', id)
  },
  events: {
    add: (matchId, eventData) => ipcRenderer.invoke('events:add', matchId, eventData),
    update: (matchId, eventId, updates) => ipcRenderer.invoke('events:update', matchId, eventId, updates),
    delete: (matchId, eventId) => ipcRenderer.invoke('events:delete', matchId, eventId)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (partial) => ipcRenderer.invoke('settings:set', partial),
    onChanged: (callback) => {
      const listener = (event, settings) => callback(settings);
      ipcRenderer.on('settings:changed', listener);
      return () => ipcRenderer.removeListener('settings:changed', listener);
    }
  },
  analytics: {
    getMatchStats: (matchId) => ipcRenderer.invoke('analytics:getMatchStats', matchId),
    exportPdf: (matchId, printPayload) => ipcRenderer.invoke('analytics:exportPdf', matchId, printPayload)
  },
  media: {
    selectLocalVideo: () => ipcRenderer.invoke('media:selectLocalVideo'),
    normalizeYouTube: (url) => ipcRenderer.invoke('media:normalizeYouTube', url)
  },
  files: {
    open: (filePath) => ipcRenderer.invoke('files:open', filePath)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  }
});
