import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'));
const mainSource = readFileSync(new URL('../../main.js', import.meta.url), 'utf8');
const storageSource = readFileSync(new URL('../storage.js', import.meta.url), 'utf8');
const afterPackSource = readFileSync(new URL('../../../../scripts/after-pack.js', import.meta.url), 'utf8');

describe('windows packaging readiness', () => {
  it('builds a Windows NSIS installer with icon and desktop shortcut', () => {
    expect(packageJson.build.win.target).toContainEqual(expect.objectContaining({ target: 'nsis' }));
    expect(packageJson.build.nsis).toEqual(expect.objectContaining({
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      installerIcon: 'build/icon.ico',
      uninstallerIcon: 'build/icon.ico',
    }));
    expect(packageJson.build.win.icon).toBe('build/icon.ico');
    expect(packageJson.build.afterPack).toBe('scripts/after-pack.js');
    expect(packageJson.build.win.signAndEditExecutable).toBe(false);
    expect(packageJson.build.artifactName).toContain('${ext}');
  });

  it('patches the packaged executable icon without invoking legacy winCodeSign', () => {
    expect(afterPackSource).toContain('IconGroupEntry.replaceIconsForResource');
    expect(afterPackSource).toContain('build\', \'icon.ico');
    expect(afterPackSource).toContain('setProductVersion');
  });

  it('keeps runtime data under app userData and switches resource paths when packaged', () => {
    expect(storageSource).toContain("app.getPath('userData')");
    expect(storageSource).not.toContain("path.join(process.cwd(), 'data')");
    expect(mainSource).toContain('app.isPackaged');
    expect(mainSource).toContain('process.resourcesPath');
  });

  it('ships puppeteer-core instead of downloading Chromium with Puppeteer', () => {
    expect(packageJson.dependencies['puppeteer-core']).toBeDefined();
    expect(packageJson.dependencies.puppeteer).toBeUndefined();
  });
});
