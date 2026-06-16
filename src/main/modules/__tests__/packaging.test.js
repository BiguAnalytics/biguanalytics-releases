import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'));
const mainSource = readFileSync(new URL('../../main.js', import.meta.url), 'utf8');
const storageSource = readFileSync(new URL('../storage.js', import.meta.url), 'utf8');
const afterPackSource = readFileSync(new URL('../../../../scripts/after-pack.js', import.meta.url), 'utf8');
const windowsBuildCheckSource = readFileSync(new URL('../../../../scripts/check-windows-build.js', import.meta.url), 'utf8');

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
    expect(packageJson.devDependencies.resedit || packageJson.dependencies.resedit).toBeDefined();
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

  it('does not ship Puppeteer or require external Chrome for PDF export', () => {
    expect(packageJson.dependencies['puppeteer-core']).toBeUndefined();
    expect(packageJson.dependencies.puppeteer).toBeUndefined();
  });

  it('ships ffmpeg and ffprobe binaries for local clip export without relying on global installs', () => {
    expect(packageJson.dependencies['ffmpeg-static']).toBeDefined();
    expect(packageJson.dependencies['ffprobe-static']).toBeDefined();
    expect(packageJson.build.asarUnpack).toEqual(expect.arrayContaining([
      'node_modules/ffmpeg-static/**/*',
      'node_modules/ffprobe-static/**/*',
    ]));
  });

  it('excludes backend-only source and secret-bearing config from Electron app.asar', () => {
    expect(packageJson.build.files).toEqual(expect.arrayContaining([
      '!server/**',
      '!backend/**',
      '!docs/**',
      '!supabase/**',
      '!node_modules/supabase/**',
      '!node_modules/@supabase/cli-*/**',
      '!scripts/**',
      '!.env*',
    ]));
    expect(packageJson.dependencies['@google/genai']).toBeUndefined();
    expect(packageJson.dependencies.express).toBeUndefined();
  });

  it('provides a reproducible Windows build artifact validation script', () => {
    expect(packageJson.scripts['check:windows-build']).toBe('node scripts/check-windows-build.js');
    expect(windowsBuildCheckSource).toContain('BiguAnalytics.exe');
    expect(windowsBuildCheckSource).toContain('app.asar');
    expect(windowsBuildCheckSource).toContain('listPackage');
    expect(windowsBuildCheckSource).toContain('src/renderer/assets/bigu-logo.svg');
    expect(windowsBuildCheckSource).toContain('app.asar.unpacked');
    expect(windowsBuildCheckSource).toContain('ffmpeg-static');
    expect(windowsBuildCheckSource).toContain('ffprobe-static');
    expect(windowsBuildCheckSource).not.toContain('puppeteer-core');
    expect(windowsBuildCheckSource).toContain('preload.js');
    expect(windowsBuildCheckSource).toContain('icon.ico');
  });
});
