import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(resolve(process.cwd(), 'src/main/main.js'), 'utf8');
const indexHtml = readFileSync(resolve(process.cwd(), 'src/renderer/index.html'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

function getRendererCsp() {
  const match = indexHtml.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  return match?.[1] || '';
}

function getIcoPngByWidth(iconBuffer, targetWidth) {
  const count = iconBuffer.readUInt16LE(4);

  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16;
    const width = iconBuffer.readUInt8(entryOffset) || 256;

    if (width === targetWidth) {
      const bytes = iconBuffer.readUInt32LE(entryOffset + 8);
      const imageOffset = iconBuffer.readUInt32LE(entryOffset + 12);
      return iconBuffer.subarray(imageOffset, imageOffset + bytes);
    }
  }

  throw new Error(`ICO image ${targetWidth}px not found`);
}

function countVisiblePngPixels(pngBuffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks = [];

  while (offset < pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (type === 'IHDR') {
      width = pngBuffer.readUInt32BE(dataStart);
      height = pngBuffer.readUInt32BE(dataStart + 4);
      expect(pngBuffer.readUInt8(dataStart + 8)).toBe(8);
      expect(pngBuffer.readUInt8(dataStart + 9)).toBe(6);
      expect(pngBuffer.readUInt8(dataStart + 12)).toBe(0);
    }

    if (type === 'IDAT') {
      idatChunks.push(pngBuffer.subarray(dataStart, dataEnd));
    }

    offset = dataEnd + 4;
  }

  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  let inflatedOffset = 0;
  let visiblePixels = 0;
  let previousRow = Buffer.alloc(rowLength);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inflatedOffset];
    inflatedOffset += 1;
    const row = Buffer.alloc(rowLength);

    for (let x = 0; x < rowLength; x += 1) {
      const value = inflated[inflatedOffset];
      inflatedOffset += 1;
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previousRow[x] || 0;
      const upLeft = x >= bytesPerPixel ? previousRow[x - bytesPerPixel] : 0;
      const paeth = Math.abs(left + up - upLeft - left) <= Math.abs(left + up - upLeft - up)
        && Math.abs(left + up - upLeft - left) <= Math.abs(left + up - upLeft - upLeft)
        ? left
        : Math.abs(left + up - upLeft - up) <= Math.abs(left + up - upLeft - upLeft)
          ? up
          : upLeft;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      row[x] = (value + predictor) & 0xff;
    }

    for (let x = 3; x < rowLength; x += bytesPerPixel) {
      if (row[x] > 0) visiblePixels += 1;
    }

    previousRow = row;
  }

  return visiblePixels;
}

describe('Electron shell YouTube integration', () => {
  it('does not enable Electron webview for the YouTube player path', () => {
    expect(mainSource).toContain('webviewTag: false');
    expect(mainSource).not.toContain('webviewTag: true');
  });

  it('allows the official YouTube iframe API through a hardened renderer CSP', () => {
    const csp = getRendererCsp();

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' https://www.youtube.com https://s.ytimg.com");
    expect(indexHtml).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(indexHtml).not.toContain("'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: blob: https://*.ytimg.com");
    expect(csp).toContain("media-src 'self' file: blob:");
    expect(csp).toContain("connect-src 'self' https://www.youtube.com https://*.googlevideo.com https://*.ytimg.com https://*.supabase.co wss://*.supabase.co");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('frame-src https://www.youtube.com https://www.youtube-nocookie.com');
    expect(indexHtml).toContain('SEC-01');
    expect(indexHtml).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
    expect(indexHtml).not.toMatch(/<style[\s>]/i);
    expect(indexHtml).toContain('name="referrer" content="strict-origin-when-cross-origin"');
  });

  it('runs the renderer with Electron sandbox enabled', () => {
    expect(mainSource).toContain('sandbox: true');
  });

  it('enforces explicit Electron web security and blocks renderer navigation escapes', () => {
    expect(mainSource).toContain('webSecurity: true');
    expect(mainSource).toContain('allowRunningInsecureContent: false');
    expect(mainSource).toContain('setWindowOpenHandler');
    expect(mainSource).toContain("return { action: 'deny' };");
    expect(mainSource).toContain("mainWindow.webContents.on('will-navigate'");
    expect(mainSource).toContain('event.preventDefault();');
  });

  it('uses the BiguAnalytics icon for the Windows taskbar and packaged app', () => {
    const iconPath = 'build/icon.ico';

    expect(mainSource).toContain("const devIconPath = path.join(__dirname, '../../build/icon.ico');");
    expect(mainSource).toContain("const packagedIconPath = path.join(process.resourcesPath, 'icon.ico');");
    expect(mainSource).toContain('const appIconPath = app.isPackaged ? packagedIconPath : devIconPath;');
    expect(mainSource).toContain("const appUserModelId = 'com.biguanalytics.app';");
    expect(mainSource).toContain('app.setAppUserModelId(appUserModelId);');
    expect(mainSource).toMatch(/icon:\s*appIconPath/);
    expect(packageJson.build?.appId).toBe('com.biguanalytics.app');
    expect(packageJson.build?.directories?.buildResources).toBe('build');
    expect(packageJson.build?.win?.icon).toBe(iconPath);
    expect(packageJson.build?.extraResources).toContainEqual({
      from: iconPath,
      to: 'icon.ico',
    });
    expect(existsSync(resolve(process.cwd(), iconPath))).toBe(true);
    expect(countVisiblePngPixels(getIcoPngByWidth(readFileSync(resolve(process.cwd(), iconPath)), 256))).toBeGreaterThanOrEqual(12000);
  });

  it('opens the main application window maximized by default', () => {
    expect(mainSource).toContain('show: false');
    expect(mainSource).toContain('mainWindow.maximize();');
    expect(mainSource).toContain('mainWindow.show();');
    expect(mainSource).toContain("mainWindow.once('ready-to-show'");
    expect(mainSource.indexOf("mainWindow.once('ready-to-show'")).toBeLessThan(mainSource.indexOf("startupTimer.timeAsync('browser-window:loadFile'"));
    expect(mainSource.indexOf('function showMainWindow()')).toBeLessThan(mainSource.indexOf('mainWindow.show();'));
  });

  it('waits for bounded renderer save flushing before closing the window', () => {
    expect(mainSource).toContain('window.__biguFlushPendingSaves?.()');
    expect(mainSource).toContain('WINDOW_CLOSE_FLUSH_TIMEOUT_MS');
    expect(mainSource).toContain('Promise.race');
    expect(mainSource).toContain('windowToClose.close();');
  });

  it('handles Chromium microphone permission requests for voice dictation', () => {
    expect(mainSource).toContain('setPermissionRequestHandler');
    expect(mainSource).toContain("permission === 'media'");
    expect(mainSource).toContain("mediaTypes.includes('audio')");
    expect(mainSource).toContain("!mediaTypes.includes('video')");
  });

  it('registers a native Windows speech fallback through secure IPC', () => {
    const ipcSource = readFileSync(resolve(process.cwd(), 'src/main/ipc.js'), 'utf8');
    const preloadSource = readFileSync(resolve(process.cwd(), 'src/main/preload.js'), 'utf8');

    expect(ipcSource).toContain("lazyRequire('./modules/speech-dictation')");
    expect(ipcSource).toContain("ipcMain.handle('speech:start'");
    expect(ipcSource).toContain("ipcMain.handle('speech:stop'");
    expect(preloadSource).toContain('speech: {');
    expect(preloadSource).toContain("ipcRenderer.invoke('speech:start'");
    expect(preloadSource).toContain("ipcRenderer.invoke('speech:stop'");
    expect(preloadSource).toContain("ipcRenderer.on('speech:result'");
    expect(preloadSource).toContain("ipcRenderer.on('speech:error'");
  });

  it('enables Chromium Web Speech before Electron is ready', () => {
    expect(mainSource).toContain("app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI')");
    expect(mainSource.indexOf("app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI')"))
      .toBeLessThan(mainSource.indexOf('app.whenReady()'));
  });
});
