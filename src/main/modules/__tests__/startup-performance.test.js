import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(resolve(process.cwd(), 'src/main/main.js'), 'utf8');
const ipcSource = readFileSync(resolve(process.cwd(), 'src/main/ipc.js'), 'utf8');
const indexHtml = readFileSync(resolve(process.cwd(), 'src/renderer/index.html'), 'utf8');
const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/app.js'), 'utf8');
const supabaseClientSource = readFileSync(resolve(process.cwd(), 'src/renderer/auth/supabase-client.js'), 'utf8');
const dashboardSource = readFileSync(resolve(process.cwd(), 'src/renderer/views/dashboard.js'), 'utf8');
const seasonSource = readFileSync(resolve(process.cwd(), 'src/renderer/views/season.js'), 'utf8');
const pdfExportSource = readFileSync(resolve(process.cwd(), 'src/main/modules/pdf-export.js'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

function getTopLevelRequires(source) {
  return source
    .split('\n')
    .filter(line => /^const\s+.+\s+=\s+require\(/.test(line.trim()))
    .join('\n');
}

describe('startup performance contract', () => {
  it('creates and loads the BrowserWindow before non-window startup work', () => {
    expect(mainSource).toContain("startupTimer.mark('main:start')");
    expect(mainSource).toContain("startupTimer.mark('browser-window:create:start')");
    expect(mainSource).toContain("startupTimer.timeAsync('browser-window:loadFile'");
    expect(mainSource).toContain("startupTimer.mark('browser-window:show')");
    expect(mainSource.indexOf('createWindow();')).toBeLessThan(mainSource.indexOf('configureYouTubeEmbeds();'));
    expect(mainSource.indexOf('createWindow();')).toBeLessThan(mainSource.indexOf('configureMediaPermissions();'));
  });

  it('does not expose a blank BrowserWindow before renderer content is ready', () => {
    expect(mainSource).toContain("mainWindow.once('ready-to-show'");
    expect(mainSource).toContain('showMainWindow();');
    expect(mainSource.indexOf("mainWindow.once('ready-to-show'"))
      .toBeLessThan(mainSource.indexOf("startupTimer.timeAsync('browser-window:loadFile'"));
    expect(mainSource.indexOf('function showMainWindow()'))
      .toBeLessThan(mainSource.indexOf('mainWindow.show();'));
    expect(mainSource).not.toContain('setTimeout(showMainWindow');
  });

  it('uses a single-instance lock so repeated launches focus the existing app window', () => {
    expect(mainSource).toContain('app.requestSingleInstanceLock()');
    expect(mainSource).toContain("app.on('second-instance'");
    expect(mainSource).toContain('mainWindow.restore();');
    expect(mainSource).toContain('mainWindow.focus();');
  });

  it('mounts the app shell before profile settings persistence or cloud sync', () => {
    expect(appSource).toContain('app.appendChild(layout);');
    expect(appSource).toContain('scheduleShellBackgroundWork(accessState);');
    expect(appSource.indexOf('app.appendChild(layout);'))
      .toBeLessThan(appSource.indexOf('scheduleShellBackgroundWork(accessState);'));
    expect(appSource.indexOf('app.appendChild(layout);'))
      .toBeLessThan(appSource.indexOf('initRouter();'));
    expect(appSource).not.toContain('await syncLicensedUserSettings(accessState);');
    expect(appSource).not.toContain('startBackgroundSyncIfAllowed(accessState);\n  app.innerHTML');
  });

  it('registers IPC without top-level loading AI, PDF, ffmpeg or storage modules', () => {
    const topLevelRequires = getTopLevelRequires(ipcSource);

    expect(ipcSource).toContain('function lazyRequire');
    expect(topLevelRequires).not.toContain("./modules/pdf-export");
    expect(topLevelRequires).not.toContain("./modules/clip-exporter");
    expect(topLevelRequires).not.toContain("./modules/ai/");
    expect(topLevelRequires).not.toContain("./modules/storage");
    expect(ipcSource).toContain("lazyRequire('./modules/pdf-export')");
    expect(ipcSource).toContain("lazyRequire('./modules/ai/aiBackendClient')");
  });

  it('uses Electron printToPDF without loading Puppeteer for PDF export', () => {
    expect(pdfExportSource).toContain('printToPDF');
    expect(getTopLevelRequires(pdfExportSource)).not.toContain("require('puppeteer-core')");
    expect(pdfExportSource).not.toContain("require('puppeteer-core')");
    expect(pdfExportSource).not.toContain("require('puppeteer')");
    expect(pdfExportSource).not.toContain('Target.createTarget');
  });

  it('loads Chart.js and Supabase lazily instead of blocking index.html startup scripts', () => {
    expect(indexHtml).not.toContain('vendor/chart.umd.js');
    expect(indexHtml).not.toContain('@supabase/supabase-js/dist/umd/supabase.js');
    expect(supabaseClientSource).toContain('ensureSupabaseJs');
    expect(dashboardSource).toContain('ensureChartJs');
    expect(seasonSource).toContain('ensureChartJs');
  });

  it('keeps ASAR enabled and unpacks only ffmpeg binaries for runtime video export', () => {
    expect(packageJson.build?.asar).not.toBe(false);
    expect(packageJson.build?.asarUnpack).toEqual([
      'node_modules/ffmpeg-static/**/*',
      'node_modules/ffprobe-static/**/*',
    ]);
  });
});
