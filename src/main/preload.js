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
    getMatchStats: (matchId, filters) => ipcRenderer.invoke('analytics:getMatchStats', matchId, filters),
    getSeasonStats: (year) => ipcRenderer.invoke('analytics:getSeasonStats', year),
    exportPdf: (matchId, printPayload) => ipcRenderer.invoke('analytics:exportPdf', matchId, printPayload)
  },
  drawings: {
    saveLive: (matchId, drawing) => ipcRenderer.invoke('drawings:saveLive', matchId, drawing),
    saveFrame: (matchId, eventId, drawing) => ipcRenderer.invoke('drawings:saveFrame', matchId, eventId, drawing),
    getForMatch: (matchId) => ipcRenderer.invoke('drawings:getForMatch', matchId),
    exportPng: (dataUrl, suggestedName) => ipcRenderer.invoke('drawings:exportPng', dataUrl, suggestedName)
  },
  tacticalBoards: {
    list: () => ipcRenderer.invoke('tacticalBoards:list'),
    get: (id) => ipcRenderer.invoke('tacticalBoards:get', id),
    create: (data) => ipcRenderer.invoke('tacticalBoards:create', data),
    update: (id, data) => ipcRenderer.invoke('tacticalBoards:update', id, data),
    rename: (id, name) => ipcRenderer.invoke('tacticalBoards:rename', id, name),
    delete: (id) => ipcRenderer.invoke('tacticalBoards:delete', id),
    exportPng: (dataUrl, suggestedName) => ipcRenderer.invoke('tacticalBoards:exportPng', dataUrl, suggestedName)
  },
  licenseSession: {
    get: (key) => ipcRenderer.invoke('licenseSession:get', key),
    set: (key, value) => ipcRenderer.invoke('licenseSession:set', key, value),
    remove: (key) => ipcRenderer.invoke('licenseSession:remove', key),
    clear: () => ipcRenderer.invoke('licenseSession:clear')
  },
  licenseConfig: {
    get: () => ipcRenderer.invoke('licenseConfig:get')
  },
  device: {
    getFingerprint: () => ipcRenderer.invoke('device:getFingerprint')
  },
  media: {
    selectLocalVideo: () => ipcRenderer.invoke('media:selectLocalVideo'),
    normalizeYouTube: (url) => ipcRenderer.invoke('media:normalizeYouTube', url),
    localVideoExists: (filePath) => ipcRenderer.invoke('media:localVideoExists', filePath)
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

contextBridge.exposeInMainWorld('biguAI', {
  getMatchAnalysisStatus: (matchId) => ipcRenderer.invoke('ai:getMatchAnalysisStatus', { matchId }),
  getMatchAnalysis: (matchId) => ipcRenderer.invoke('ai:getMatchAnalysis', { matchId }),
  generateMatchAnalysis: (matchId) => ipcRenderer.invoke('ai:generateMatchAnalysis', { matchId }),
  regenerateMatchAnalysis: (matchId) => ipcRenderer.invoke('ai:regenerateMatchAnalysis', { matchId, confirm: true })
});

contextBridge.exposeInMainWorld('biguAIChat', {
  ask: (question, options = {}) => ipcRenderer.invoke('ai:chatAsk', {
    matchId: options.matchId,
    question,
    scope: options.scope,
    history: options.history
  }),
  status: (options = {}) => ipcRenderer.invoke('ai:chatStatus', {
    matchId: options.matchId
  })
});
