import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const rootPath = resolve(process.cwd());
const baseCss = readFileSync(resolve(rootPath, 'src/styles/base.css'), 'utf8');
const indexHtml = readFileSync(resolve(rootPath, 'src/renderer/index.html'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(rootPath, 'package.json'), 'utf8'));
const tsconfigPath = resolve(rootPath, 'tsconfig.json');
const tsconfig = existsSync(tsconfigPath)
  ? JSON.parse(readFileSync(tsconfigPath, 'utf8'))
  : { compilerOptions: {} };

function getBodyCss() {
  return baseCss.match(/body\s*\{([\s\S]*?)\n\}/)?.[1] || '';
}

function getRendererCsp() {
  return indexHtml.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] || '';
}

describe('residual maintenance configuration', () => {
  it('keeps normal document text selectable while restricting selection to interactive controls', () => {
    expect(getBodyCss()).not.toMatch(/user-select\s*:\s*none/);
    expect(baseCss).not.toMatch(/select,\s*button,\s*label\s*\{\s*user-select\s*:\s*none/);
    expect(baseCss).toMatch(/button:not\(:disabled\),[\s\S]*?select:not\(:disabled\),[\s\S]*?\[role="button"\]:not\(\[aria-disabled="true"\]\),[\s\S]*?\[role="tab"\]:not\(\[aria-disabled="true"\]\),[\s\S]*?\[role="option"\]:not\(\[aria-disabled="true"\]\),[\s\S]*?\[role="menuitem"\]:not\(\[aria-disabled="true"\]\)[\s\S]*?user-select:\s*none/);
    expect(baseCss).toMatch(/label:has\(input:not\(:disabled\)\)[\s\S]*?user-select:\s*none/);
  });

  it('keeps npm test side-effect free and exposes dependency installation separately', () => {
    expect(packageJson.scripts.test).toBe('vitest run');
    expect(packageJson.scripts.pretest).toBeUndefined();
    expect(packageJson.scripts['pretest:watch']).toBeUndefined();
    expect(packageJson.scripts['deps:install']).toContain('npm ci --ignore-scripts');
    expect(packageJson.scripts['deps:install']).toContain('npm run server:install');
  });

  it('provides a separate no-emit checkJs typecheck for the existing JavaScript', () => {
    expect(packageJson.scripts.typecheck).toBe('tsc -p tsconfig.json --noEmit');
    expect(packageJson.devDependencies.typescript).toBeTruthy();
    expect(tsconfig.compilerOptions.allowJs).toBe(true);
    expect(tsconfig.compilerOptions.checkJs).toBe(true);
    expect(tsconfig.compilerOptions.noEmit).toBe(true);
  });

  it('blocks inline script attributes while documenting the required style exception', () => {
    const csp = getRendererCsp();

    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(indexHtml).toContain('SEC-01');
    expect(indexHtml).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
  });

  it('does not retain unreferenced duplicate configuration or view modules', () => {
    expect(existsSync(resolve(rootPath, 'public-env.js'))).toBe(false);
    expect(existsSync(resolve(rootPath, 'src/renderer/views/under-construction.js'))).toBe(false);
  });
});
