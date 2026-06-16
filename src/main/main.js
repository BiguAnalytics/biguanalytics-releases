const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { createStartupTimer, setStartupTimer } = require('./modules/startup-timing');
const { registerIpcHandlers } = require('./ipc');

const startupTimer = createStartupTimer({ app });
setStartupTimer(startupTimer);
startupTimer.mark('main:start');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI');

const devIconPath = path.join(__dirname, '../../build/icon.ico');
const packagedIconPath = path.join(process.resourcesPath, 'icon.ico');
const appIconPath = app.isPackaged ? packagedIconPath : devIconPath;
const appUserModelId = 'com.biguanalytics.app';

if (process.platform === 'win32') {
  app.setAppUserModelId(appUserModelId);
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow;

function configureYouTubeEmbeds() {
  const { buildYouTubeRequestHeaders } = require('./modules/media');
  const filter = {
    urls: [
      '*://www.youtube.com/*',
      '*://youtube.com/*',
      '*://www.youtube-nocookie.com/*',
      '*://youtube-nocookie.com/*',
      '*://*.googlevideo.com/*',
      '*://*.ytimg.com/*',
    ],
  };

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    callback({
      requestHeaders: buildYouTubeRequestHeaders(details.requestHeaders, details.url),
    });
  });
}

function configureMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    if (permission === 'media') {
      const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
      callback(mediaTypes.includes('audio') && !mediaTypes.includes('video'));
      return;
    }
    callback(false);
  });
}

const createWindow = () => {
  startupTimer.mark('browser-window:create:start');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    frame: false, // Custom frame
    show: false,
    icon: appIconPath,
    backgroundColor: '#080E1A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  startupTimer.mark('browser-window:create:end');

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
    }
  });

  function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return;
    mainWindow.maximize();
    mainWindow.show();
    startupTimer.mark('browser-window:show');
  }

  mainWindow.once('ready-to-show', () => {
    startupTimer.mark('browser-window:ready-to-show');
    showMainWindow();
  });
  mainWindow.webContents.once('dom-ready', () => {
    startupTimer.mark('renderer:dom-ready');
  });
  mainWindow.webContents.once('did-finish-load', () => {
    startupTimer.mark('browser-window:did-finish-load');
  });

  startupTimer.timeAsync('browser-window:loadFile', () => mainWindow.loadFile(path.join(__dirname, '../renderer/index.html')))
    .catch(() => {});

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
};

app.whenReady().then(() => {
  startupTimer.mark('electron:ready');

  ipcMain.handle('startup:mark', async (e, label, detail = {}) => {
    startupTimer.mark(String(label || 'renderer:mark'), {
      source: 'renderer',
      detail: detail && typeof detail === 'object' ? detail : {},
    });
    return true;
  });

  createWindow();

  startupTimer.mark('ipc:register:start');
  registerIpcHandlers();
  startupTimer.mark('ipc:register:end');

  ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  
  ipcMain.on('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

  configureYouTubeEmbeds();
  startupTimer.mark('youtube-embeds:configured');
  configureMediaPermissions();
  startupTimer.mark('media-permissions:configured');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
