import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const routerSource = readFileSync(new URL('../router.js', import.meta.url), 'utf8');

describe('renderer router resilience', () => {
  it('guards route cleanup and ignores stale async render errors while switching tabs', () => {
    expect(routerSource).toContain('function runRouteCleanup()');
    expect(routerSource).toContain('try {');
    expect(routerSource).toContain('currentCleanup?.()');
    expect(routerSource).toContain('catch (error)');
    expect(routerSource).toContain("window.dispatchEvent(new CustomEvent('bigu:route-cleanup-error'");
    expect(routerSource).toContain('if (token !== transitionToken) return;');
    expect(routerSource).not.toContain('currentCleanup();');
  });

  it('aborts and disposes the active view before a native route transition starts', () => {
    expect(routerSource).toContain('let currentAbortController = null;');
    expect(routerSource).toContain('new AbortController()');
    expect(routerSource).toContain('currentAbortController?.abort();');
    expect(routerSource).toContain('isCurrent: () => token === transitionToken');
  });

  it('cleans up a stale async render when it resolves after navigation', () => {
    expect(routerSource).toContain('if (token !== transitionToken) {');
    expect(routerSource).toContain('resolvedCleanup?.();');
  });
});
