import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const readOptional = (path) => {
  try {
    return readFileSync(resolve(root, path), 'utf8');
  } catch {
    return '';
  }
};
const swipeSource = readOptional('src/renderer/components/route-swipe.js');
const appSource = readFileSync(resolve(root, 'src/renderer/app.js'), 'utf8');
const layoutCss = readFileSync(resolve(root, 'src/styles/layout.css'), 'utf8');

describe('route swipe navigation', () => {
  it('uses native Pointer Events with live drag feedback and route snapping', () => {
    expect(swipeSource).toContain('const SWIPE_THRESHOLD = 72;');
    expect(swipeSource).toContain("addEventListener('pointerdown'");
    expect(swipeSource).toContain("addEventListener('pointermove'");
    expect(swipeSource).toContain("addEventListener('pointerup'");
    expect(swipeSource).toContain('setPointerCapture');
    expect(swipeSource).toContain('--route-swipe-offset');
    expect(swipeSource).toContain('navigate(nextRoute)');
  });

  it('mounts and cleans up swipe navigation with the app shell', () => {
    expect(appSource).toContain("import { initRouteSwipe } from './components/route-swipe.js';");
    expect(appSource).toContain('initRouteSwipe(contentBody');
    expect(appSource).toContain('getCurrentRoute');
    expect(appSource).toContain('routeSwipeCleanup');
  });

  it('configures the main content viewport for horizontal snap behavior', () => {
    expect(layoutCss).toMatch(/\.main-content-body\s*{[^}]*scroll-snap-type:\s*x mandatory;/s);
    expect(layoutCss).toMatch(/\.main-content-body\s*{[^}]*overscroll-behavior-x:\s*contain;/s);
    expect(layoutCss).toMatch(/\.main-content-body\s*>\s*\*\s*{[^}]*scroll-snap-align:\s*start;/s);
    expect(layoutCss).toContain('.main-content-body.is-route-swiping');
  });
});
