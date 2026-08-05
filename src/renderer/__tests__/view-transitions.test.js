import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const routerSource = readFileSync(resolve(root, 'src/renderer/router.js'), 'utf8');
const baseCss = readFileSync(resolve(root, 'src/styles/base.css'), 'utf8');

describe('native route view transitions', () => {
  it('wraps route DOM updates with the native API and has a direct fallback', () => {
    expect(routerSource).toContain('function runRouteViewTransition(update)');
    expect(routerSource).toContain("typeof document.startViewTransition !== 'function'");
    expect(routerSource).toContain('return update();');
    expect(routerSource).toContain('document.startViewTransition(() => update())');
  });

  it('assigns a dedicated route transition name and motion treatment', () => {
    expect(baseCss).toContain('view-transition-name: route-content;');
    expect(baseCss).toContain('::view-transition-old(route-content)');
    expect(baseCss).toContain('::view-transition-new(route-content)');
  });

  it('keeps native transition layers transparent to pointer input', () => {
    expect(baseCss).toMatch(/::view-transition-(group|image-pair|old|new)\([^)]*\)[\s\S]*pointer-events:\s*none;/s);
  });

  it('keeps the full native transition overlay transparent to pointer input', () => {
    expect(baseCss).toMatch(/::view-transition\s*{[\s\S]*pointer-events:\s*none;/s);
  });

  it('scopes native route transitions away from the app shell', () => {
    expect(baseCss).toMatch(/:root\s*{[\s\S]*view-transition-name:\s*none;/s);
    expect(baseCss).toMatch(/#main-content-body\s*{[\s\S]*view-transition-name:\s*route-content;/s);
  });

  it('keeps every native transition group transparent to pointer input', () => {
    expect(baseCss).toMatch(/::view-transition-group\(\*\),[\s\S]*pointer-events:\s*none;/s);
    expect(baseCss).toMatch(/::view-transition-image-pair\(\*\),[\s\S]*pointer-events:\s*none;/s);
  });

  it('interrupts an active route transition when the user navigates again', () => {
    expect(routerSource).toContain('let activeRouteViewTransition = null;');
    expect(routerSource).toContain('if (activeRouteViewTransition) return update();');
    expect(routerSource).toContain('activeRouteViewTransition = transition;');
  });
});
