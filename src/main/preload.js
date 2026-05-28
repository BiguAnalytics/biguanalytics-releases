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
    set: (partial) => ipcRenderer.invoke('settings:set', partial)
  },
  media: {
    selectLocalVideo: () => ipcRenderer.invoke('media:selectLocalVideo'),
    normalizeYouTube: (url) => ipcRenderer.invoke('media:normalizeYouTube', url)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  }
});
