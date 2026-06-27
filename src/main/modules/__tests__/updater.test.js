import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
const updaterPath = resolve(process.cwd(), 'src/main/modules/updater.js');
const updaterSource = existsSync(updaterPath) ? readFileSync(updaterPath, 'utf8') : '';
const ipcSource = readFileSync(resolve(process.cwd(), 'src/main/ipc.js'), 'utf8');
const mainSource = readFileSync(resolve(process.cwd(), 'src/main/main.js'), 'utf8');
const preloadSource = readFileSync(resolve(process.cwd(), 'src/main/preload.js'), 'utf8');
const updateSafetyDoc = readFileSync(resolve(process.cwd(), 'docs/UPDATE_SAFETY.md'), 'utf8');

function compareVersions(version, baseline) {
  const left = String(version).split('.').map(part => Number(part) || 0);
  const right = String(baseline).split('.').map(part => Number(part) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

describe('auto updater packaging configuration', () => {
  it('bumps the app version past the incorrect 1.0.0 updater build', () => {
    expect(compareVersions(packageJson.version, '1.0.0')).toBeGreaterThan(0);
  });

  it('ships updater runtime dependencies in app dependencies', () => {
    expect(packageJson.dependencies['electron-updater']).toBeDefined();
    expect(packageJson.dependencies['electron-log']).toBeDefined();
    expect(packageJson.devDependencies['electron-updater']).toBeUndefined();
    expect(packageJson.devDependencies['electron-log']).toBeUndefined();
  });

  it('keeps NSIS and publishes GitHub Releases metadata for the public releases repository', () => {
    expect(packageJson.build.win.target).toContainEqual(expect.objectContaining({ target: 'nsis' }));
    expect(packageJson.build.publish).toEqual([
      {
        provider: 'github',
        owner: 'BiguAnalytics',
        repo: 'biguanalytics-releases',
        releaseType: 'release',
      },
    ]);
    expect(packageJson.build.artifactName).toBe('${productName}-Setup-${version}.${ext}');
    expect(JSON.stringify(packageJson)).not.toContain('TU_URL_DE_UPDATES');
    expect(JSON.stringify(packageJson)).not.toContain('GH_TOKEN');
  });
});

describe('main updater module', () => {
  it('exists with a fixed public GitHub releases config and no renderer-editable update host', () => {
    expect(existsSync(updaterPath)).toBe(true);
    expect(updaterSource).toContain("provider: 'github'");
    expect(updaterSource).toContain("owner: 'BiguAnalytics'");
    expect(updaterSource).toContain("repo: 'biguanalytics-releases'");
    expect(updaterSource).toContain("releaseType: 'release'");
    expect(updaterSource).toContain('autoUpdater.setFeedURL(UPDATE_PUBLISH_CONFIG)');
    expect(updaterSource).not.toContain('TU_URL_DE_UPDATES');
    expect(updaterSource).not.toContain('UPDATES_URL');
    expect(updaterSource).not.toContain('GH_TOKEN');
    expect(updaterSource).not.toContain('process.env.UPDATES_URL');
    expect(updaterSource).not.toContain('settings:get');
    expect(updaterSource).not.toContain('updater:setUrl');
  });

  it('uses electron-updater and electron-log without blocking app startup', () => {
    expect(updaterSource).toContain("require('electron-updater')");
    expect(updaterSource).toContain("require('electron-log')");
    expect(updaterSource).toContain('autoUpdater.logger');
    expect(updaterSource).toContain('startUpdaterBackgroundCheck');
    expect(updaterSource).toContain('setTimeout');
    expect(mainSource).toContain('startUpdaterBackgroundCheck');
    expect(mainSource.indexOf('mainWindow.show();')).toBeLessThan(mainSource.indexOf('startBackgroundUpdaterOnce();'));
  });

  it('does not auto-check in development or test unless BIGU_UPDATER_DEBUG is enabled', () => {
    expect(updaterSource).toContain('BIGU_UPDATER_DEBUG');
    expect(updaterSource).toContain("process.env.NODE_ENV === 'test'");
    expect(updaterSource).toContain('app.isPackaged');
  });

  it('registers updater IPC and forwards only safe updater events to the renderer', () => {
    [
      'update:checking',
      'update:available',
      'update:not-available',
      'update:download-progress',
      'update:downloaded',
      'update:error',
      'updater:check',
      'updater:download',
      'updater:install',
      'updater:getStatus',
    ].forEach((channel) => {
      expect(updaterSource).toContain(channel);
    });
    expect(ipcSource).toContain("lazyRequire('./modules/updater')");
    expect(ipcSource).toContain('registerUpdaterIpcHandlers');
    expect(preloadSource).toContain('updater: {');
    expect(preloadSource).toContain("ipcRenderer.invoke('updater:check')");
    expect(preloadSource).toContain("ipcRenderer.invoke('updater:download')");
    expect(preloadSource).toContain("ipcRenderer.invoke('updater:install')");
    expect(preloadSource).toContain("ipcRenderer.invoke('updater:getStatus')");
    expect(preloadSource).toContain('updaterEventChannels');
    expect(preloadSource).toContain('ipcRenderer.on(channel, listener)');
  });

  it('sanitizes updater errors before they reach the renderer', () => {
    expect(updaterSource).toContain('getSafeUpdaterErrorMessage');
    expect(updaterSource).toContain('stack');
    expect(updaterSource).toContain('No se pudo completar la actualizacion.');
    expect(updaterSource).not.toContain('GEMINI_API_KEY');
    expect(updaterSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('does not add AppData deletion behavior to install or update flows', () => {
    const combinedSource = [updaterSource, packageJson.build.nsis].join('\n');
    expect(combinedSource).not.toMatch(/deleteAppData|removeAppData|DeleteRegKey|RMDir\s+\/r|Remove-Item/i);
    expect(packageJson.build.nsis.deleteAppDataOnUninstall).toBeUndefined();
  });
});

describe('updater release documentation', () => {
  it('documents publishing files, provider replacements, unsigned app behavior and AppData preservation', () => {
    expect(updateSafetyDoc).toContain('GitHub Releases publico');
    expect(updateSafetyDoc).toContain('BiguAnalytics/biguanalytics-releases');
    expect(updateSafetyDoc).not.toContain('TU_URL_DE_UPDATES');
    expect(updateSafetyDoc).not.toContain('GH_TOKEN');
    expect(updateSafetyDoc).toContain('BiguAnalytics-Setup-<version>.exe');
    expect(updateSafetyDoc).toContain('BiguAnalytics-Setup-<version>.exe.blockmap');
    expect(updateSafetyDoc).toContain('latest.yml');
    expect(updateSafetyDoc).toContain('Windows puede seguir mostrando SmartScreen');
    expect(updateSafetyDoc).toContain('editor desconocido');
    expect(updateSafetyDoc).toContain('Supabase session');
    expect(updateSafetyDoc).toContain('offline grace');
    expect(updateSafetyDoc).toContain('npm run check:ai-secrets -- dist');
  });
});
