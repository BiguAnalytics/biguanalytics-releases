const { contextBridge, ipcRenderer } = require('electron');

const updaterEventChannels = [
  'update:checking',
  'update:available',
  'update:not-available',
  'update:download-progress',
  'update:downloaded',
  'update:error',
];

contextBridge.exposeInMainWorld('api', {
  auth: {
    getAccessStatus: () => ipcRenderer.invoke('auth:getAccessStatus'),
    activateOnline: (payload) => ipcRenderer.invoke('auth:activateOnline', payload),
    refreshOnline: (payload) => ipcRenderer.invoke('auth:refreshOnline', payload),
    revokeLocalAccess: (payload) => ipcRenderer.invoke('auth:revokeLocalAccess', payload),
    logout: () => ipcRenderer.invoke('auth:logout')
  },
  account: {
    clearLocalData: () => ipcRenderer.invoke('account:clearLocalData')
  },
  matches: {
    create: (data) => ipcRenderer.invoke('matches:create', data),
    getAll: () => ipcRenderer.invoke('matches:getAll'),
    getById: (id) => ipcRenderer.invoke('matches:getById', id),
    update: (id, data) => ipcRenderer.invoke('matches:update', id, data),
    delete: (id) => ipcRenderer.invoke('matches:delete', id),
    upsertCache: (data) => ipcRenderer.invoke('matches:upsertCache', data),
    getPendingSync: (filters) => ipcRenderer.invoke('matches:getPendingSync', filters),
    enqueuePendingSync: (operation) => ipcRenderer.invoke('matches:enqueuePendingSync', operation),
    markPendingSyncApplied: (ids) => ipcRenderer.invoke('matches:markPendingSyncApplied', ids),
    exportArchive: (id) => ipcRenderer.invoke('matches:exportArchive', id),
    selectImportArchive: () => ipcRenderer.invoke('matches:selectImportArchive'),
    importArchive: (filePath, options) => ipcRenderer.invoke('matches:importArchive', filePath, options)
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
    exportPdf: (matchId, printPayload) => ipcRenderer.invoke('analytics:exportPdf', matchId, printPayload),
    previewPdf: (matchId, printPayload) => ipcRenderer.invoke('analytics:previewPdf', matchId, printPayload)
  },
  pdfTemplates: {
    list: () => ipcRenderer.invoke('pdfTemplates:list'),
    get: (id) => ipcRenderer.invoke('pdfTemplates:get', id),
    create: (data) => ipcRenderer.invoke('pdfTemplates:create', data),
    update: (id, data) => ipcRenderer.invoke('pdfTemplates:update', id, data),
    delete: (id) => ipcRenderer.invoke('pdfTemplates:delete', id),
    duplicate: (id, data) => ipcRenderer.invoke('pdfTemplates:duplicate', id, data),
    setDefault: (id) => ipcRenderer.invoke('pdfTemplates:setDefault', id),
    export: (id) => ipcRenderer.invoke('pdfTemplates:export', id),
    import: () => ipcRenderer.invoke('pdfTemplates:import')
  },
  clips: {
    exportSingle: (payload) => ipcRenderer.invoke('clips:export-single', payload),
    exportBatch: (payload) => ipcRenderer.invoke('clips:export-batch', payload),
    cancelExport: () => ipcRenderer.invoke('clips:cancel-export'),
    onProgress: (callback) => {
      const listener = (event, payload) => callback(payload);
      ipcRenderer.on('clips:export-progress', listener);
      return () => ipcRenderer.removeListener('clips:export-progress', listener);
    },
    onComplete: (callback) => {
      const listener = (event, payload) => callback(payload);
      ipcRenderer.on('clips:export-complete', listener);
      return () => ipcRenderer.removeListener('clips:export-complete', listener);
    },
    onError: (callback) => {
      const listener = (event, payload) => callback(payload);
      ipcRenderer.on('clips:export-error', listener);
      return () => ipcRenderer.removeListener('clips:export-error', listener);
    }
  },
  speech: {
    start: (options) => ipcRenderer.invoke('speech:start', options),
    stop: () => ipcRenderer.invoke('speech:stop'),
    onResult: (callback) => {
      const listener = (event, payload) => callback(payload);
      ipcRenderer.on('speech:result', listener);
      return () => ipcRenderer.removeListener('speech:result', listener);
    },
    onError: (callback) => {
      const listener = (event, payload) => callback(payload);
      ipcRenderer.on('speech:error', listener);
      return () => ipcRenderer.removeListener('speech:error', listener);
    },
    onStatus: (callback) => {
      const listener = (event, payload) => callback(payload);
      ipcRenderer.on('speech:status', listener);
      return () => ipcRenderer.removeListener('speech:status', listener);
    }
  },
  drawings: {
    saveLive: (matchId, drawing) => ipcRenderer.invoke('drawings:saveLive', matchId, drawing),
    updateLive: (matchId, drawingId, drawing) => ipcRenderer.invoke('drawings:updateLive', matchId, drawingId, drawing),
    deleteLive: (matchId, drawingId) => ipcRenderer.invoke('drawings:deleteLive', matchId, drawingId),
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
  authSession: {
    get: (key) => ipcRenderer.invoke('authSession:get', key),
    set: (key, value) => ipcRenderer.invoke('authSession:set', key, value),
    remove: (key) => ipcRenderer.invoke('authSession:remove', key),
    clear: () => ipcRenderer.invoke('authSession:clear')
  },
  licenseConfig: {
    get: () => ipcRenderer.invoke('licenseConfig:get')
  },
  device: {
    getFingerprint: () => ipcRenderer.invoke('device:getFingerprint'),
    getCachedApprovedDevice: () => ipcRenderer.invoke('device:getCachedApprovedDevice'),
    cacheApprovedDevice: (payload) => ipcRenderer.invoke('device:cacheApprovedDevice', payload),
    clearCachedApprovedDevice: (payload) => ipcRenderer.invoke('device:clearCachedApprovedDevice', payload)
  },
  media: {
    selectLocalVideo: () => ipcRenderer.invoke('media:selectLocalVideo'),
    normalizeYouTube: (url) => ipcRenderer.invoke('media:normalizeYouTube', url),
    localVideoExists: (filePath) => ipcRenderer.invoke('media:localVideoExists', filePath),
    getLocalVideoMetadata: (filePath) => ipcRenderer.invoke('media:getLocalVideoMetadata', filePath)
  },
  files: {
    open: (filePath) => ipcRenderer.invoke('exports:openPath', filePath)
  },
  backup: {
    exportLocal: () => ipcRenderer.invoke('backup:exportLocal')
  },
  startup: {
    mark: (label, detail = {}) => ipcRenderer.invoke('startup:mark', label, detail)
  },
  updater: {
    getStatus: () => ipcRenderer.invoke('updater:getStatus'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onEvent: (callback) => {
      const listeners = updaterEventChannels.map((channel) => {
        const listener = (event, payload) => callback({ type: channel, ...(payload || {}) });
        ipcRenderer.on(channel, listener);
        return { channel, listener };
      });
      return () => {
        listeners.forEach(({ channel, listener }) => ipcRenderer.removeListener(channel, listener));
      };
    }
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
  regenerateMatchAnalysis: (matchId) => ipcRenderer.invoke('ai:regenerateMatchAnalysis', { matchId, confirm: true }),
  analyzeMatch: (matchId) => ipcRenderer.invoke('ai:analyzeMatch', { matchId }),
  generateSummary: (matchId) => ipcRenderer.invoke('ai:generateSummary', { matchId }),
  detectPatterns: (matchId) => ipcRenderer.invoke('ai:detectPatterns', { matchId })
});

contextBridge.exposeInMainWorld('biguAIConfig', {
  get: () => ipcRenderer.invoke('ai:getConfig'),
  set: (payload) => ipcRenderer.invoke('ai:setConfig', payload),
  testConnection: () => ipcRenderer.invoke('ai:testConnection')
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
