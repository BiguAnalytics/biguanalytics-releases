const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./ipc');
const { buildYouTubeRequestHeaders } = require('./modules/media');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow;

function configureYouTubeEmbeds() {
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

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    frame: false, // Custom frame
    backgroundColor: '#080E1A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });

  // Load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open the DevTools if --dev flag is passed.
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
};

app.whenReady().then(() => {
  configureYouTubeEmbeds();

  // Register all IPC handlers for data and window management
  registerIpcHandlers();

  // Window handlers
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

  createWindow();

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
