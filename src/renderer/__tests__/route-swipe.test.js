import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const appSource = readFileSync(resolve(root, 'src/renderer/app.js'), 'utf8');
const layoutCss = readFileSync(resolve(root, 'src/styles/layout.css'), 'utf8');

describe('route swipe navigation', () => {
  it('does not mount horizontal drag navigation between modules', () => {
    expect(existsSync(resolve(root, 'src/renderer/components/route-swipe.js'))).toBe(false);
    expect(appSource).not.toContain('route-swipe.js');
    expect(appSource).not.toContain('initRouteSwipe');
    expect(appSource).not.toContain('routeSwipeCleanup');
  });

  it('does not configure horizontal snap behavior for the main content viewport', () => {
    expect(layoutCss).not.toMatch(/scroll-snap-type\s*:/);
    expect(layoutCss).not.toMatch(/overscroll-behavior-x\s*:/);
    expect(layoutCss).not.toMatch(/\.main-content-body\.is-route-swipe/);
  });
});
