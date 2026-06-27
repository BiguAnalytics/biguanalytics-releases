// @ts-check
const { app, BrowserWindow, ipcMain } = require('electron');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

const UPDATE_PUBLISH_CONFIG = {
  provider: 'github',
  owner: 'BiguAnalytics',
  repo: 'biguanalytics-releases',
  releaseType: 'release',
};
const BACKGROUND_CHECK_DELAY_MS = 8000;
const UPDATE_EVENTS = [
  'update:checking',
  'update:available',
  'update:not-available',
  'update:download-progress',
  'update:downloaded',
  'update:error',
];

let configured = false;
let ipcRegistered = false;
let status = {
  state: 'idle',
  currentVersion: app.getVersion(),
  updateInfo: null,
  progress: null,
  error: '',
};

function isValidUpdatePublishConfig() {
  return UPDATE_PUBLISH_CONFIG.provider === 'github'
    && UPDATE_PUBLISH_CONFIG.owner === 'BiguAnalytics'
    && UPDATE_PUBLISH_CONFIG.repo === 'biguanalytics-releases';
}

function isUpdaterDebugEnabled() {
  return process.env.BIGU_UPDATER_DEBUG === 'true';
}

function shouldEnableUpdater() {
  if (!isValidUpdatePublishConfig()) return false;
  if (process.env.NODE_ENV === 'test' && !isUpdaterDebugEnabled()) return false;
  if (!app.isPackaged && !isUpdaterDebugEnabled()) return false;
  return true;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getSafeUpdaterErrorMessage(error) {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const hasStack = error instanceof Error && Boolean(error.stack);
  if (hasStack || /\n\s*at\s+/i.test(rawMessage)) {
    return 'No se pudo completar la actualizacion.';
  }
  return 'No se pudo completar la actualizacion.';
}

/**
 * @param {unknown} info
 * @returns {{version: string, releaseDate: string}}
 */
function getSafeUpdateInfo(info) {
  return {
    version: typeof info?.version === 'string' ? info.version : '',
    releaseDate: typeof info?.releaseDate === 'string' ? info.releaseDate : '',
  };
}

/**
 * @param {unknown} progress
 * @returns {{percent: number, bytesPerSecond: number, transferred: number, total: number}}
 */
function getSafeDownloadProgress(progress) {
  return {
    percent: Number.isFinite(Number(progress?.percent)) ? Math.max(0, Math.min(100, Number(progress.percent))) : 0,
    bytesPerSecond: Number.isFinite(Number(progress?.bytesPerSecond)) ? Number(progress.bytesPerSecond) : 0,
    transferred: Number.isFinite(Number(progress?.transferred)) ? Number(progress.transferred) : 0,
    total: Number.isFinite(Number(progress?.total)) ? Number(progress.total) : 0,
  };
}

function getPublicStatus() {
  return {
    ...status,
    enabled: shouldEnableUpdater(),
  };
}

/**
 * @param {string} channel
 * @param {object} payload
 */
function emitUpdaterEvent(channel, payload = {}) {
  if (!UPDATE_EVENTS.includes(channel)) return;
  const safePayload = {
    ...payload,
    status: getPublicStatus(),
  };
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, safePayload);
    }
  });
}

function configureUpdater() {
  if (configured) return;
  configured = true;

  log.transports.file.level = 'info';
  log.transports.console.level = false;
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  if (!app.isPackaged && isUpdaterDebugEnabled()) {
    autoUpdater.forceDevUpdateConfig = true;
  }
  autoUpdater.setFeedURL(UPDATE_PUBLISH_CONFIG);

  autoUpdater.on('checking-for-update', () => {
    status = { ...status, state: 'checking', error: '' };
    emitUpdaterEvent('update:checking');
  });

  autoUpdater.on('update-available', (info) => {
    status = {
      ...status,
      state: 'available',
      updateInfo: getSafeUpdateInfo(info),
      progress: null,
      error: '',
    };
    emitUpdaterEvent('update:available', { updateInfo: status.updateInfo });
  });

  autoUpdater.on('update-not-available', (info) => {
    status = {
      ...status,
      state: 'not-available',
      updateInfo: getSafeUpdateInfo(info),
      progress: null,
      error: '',
    };
    emitUpdaterEvent('update:not-available', { updateInfo: status.updateInfo });
  });

  autoUpdater.on('download-progress', (progress) => {
    status = {
      ...status,
      state: 'downloading',
      progress: getSafeDownloadProgress(progress),
      error: '',
    };
    emitUpdaterEvent('update:download-progress', { progress: status.progress });
  });

  autoUpdater.on('update-downloaded', (info) => {
    status = {
      ...status,
      state: 'downloaded',
      updateInfo: getSafeUpdateInfo(info),
      progress: { percent: 100, bytesPerSecond: 0, transferred: 0, total: 0 },
      error: '',
    };
    emitUpdaterEvent('update:downloaded', { updateInfo: status.updateInfo });
  });

  autoUpdater.on('error', (error) => {
    status = {
      ...status,
      state: 'error',
      error: getSafeUpdaterErrorMessage(error),
    };
    log.warn('[updater] safe error', status.error);
    emitUpdaterEvent('update:error', { message: status.error });
  });
}

async function checkForUpdates() {
  configureUpdater();
  if (!shouldEnableUpdater()) {
    status = {
      ...status,
      state: 'disabled',
      error: '',
    };
    return getPublicStatus();
  }
  try {
    await autoUpdater.checkForUpdates();
    return getPublicStatus();
  } catch (error) {
    status = {
      ...status,
      state: 'error',
      error: getSafeUpdaterErrorMessage(error),
    };
    emitUpdaterEvent('update:error', { message: status.error });
    return getPublicStatus();
  }
}

async function downloadUpdate() {
  configureUpdater();
  if (!shouldEnableUpdater()) return getPublicStatus();
  status = { ...status, state: 'downloading', error: '' };
  try {
    await autoUpdater.downloadUpdate();
    return getPublicStatus();
  } catch (error) {
    status = {
      ...status,
      state: 'error',
      error: getSafeUpdaterErrorMessage(error),
    };
    emitUpdaterEvent('update:error', { message: status.error });
    return getPublicStatus();
  }
}

function installUpdate() {
  configureUpdater();
  if (!shouldEnableUpdater()) return getPublicStatus();
  autoUpdater.quitAndInstall(false, true);
  return getPublicStatus();
}

function registerUpdaterIpcHandlers() {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.handle('updater:getStatus', async () => getPublicStatus());
  ipcMain.handle('updater:check', async () => checkForUpdates());
  ipcMain.handle('updater:download', async () => downloadUpdate());
  ipcMain.handle('updater:install', async () => installUpdate());
}

function startUpdaterBackgroundCheck(options = {}) {
  const delayMs = Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : BACKGROUND_CHECK_DELAY_MS;
  if (!shouldEnableUpdater()) return false;
  configureUpdater();
  setTimeout(() => {
    checkForUpdates().catch((error) => {
      status = {
        ...status,
        state: 'error',
        error: getSafeUpdaterErrorMessage(error),
      };
      emitUpdaterEvent('update:error', { message: status.error });
    });
  }, Math.max(0, delayMs));
  return true;
}

module.exports = {
  UPDATE_PUBLISH_CONFIG,
  getPublicStatus,
  getSafeUpdaterErrorMessage,
  registerUpdaterIpcHandlers,
  shouldEnableUpdater,
  startUpdaterBackgroundCheck,
};
