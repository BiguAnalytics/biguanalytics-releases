import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const stylesRoot = resolve(process.cwd(), 'src/styles');
const baseCss = readFileSync(resolve(stylesRoot, 'base.css'), 'utf8');

function getCssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? getCssFiles(path) : path.endsWith('.css') ? [path] : [];
  });
}

describe('global motion system', () => {
  it('defines the shared timing tokens', () => {
    const tokens = readFileSync(resolve(stylesRoot, 'tokens.css'), 'utf8');

    expect(tokens).toContain('--duration-fast: 150ms;');
    expect(tokens).toContain('--duration-base: 220ms;');
    expect(tokens).toContain('--ease-smooth: cubic-bezier(0.16, 1, 0.3, 1);');
  });

  it('uses shared duration and easing tokens for every CSS transition', () => {
    const transitions = getCssFiles(stylesRoot)
      .flatMap((path) => readFileSync(path, 'utf8').match(/transition(?:-[a-z-]+)?\s*:[^;{}]+/g) || []);

      const unscopedTransitions = transitions.filter((transition) => {
        if (transition.startsWith('transition-name')) return false;
        if (transition.includes('transition: none') || /\b(?:0|1)ms\b/.test(transition)) return false;
      if (!transition.includes('var(--duration-')) return true;
      return /^\s*transition\s*:/.test(transition) && !transition.includes('var(--ease-smooth)');
    });

    expect(unscopedTransitions).toEqual([]);
  });

  it('gives enabled interactive controls a pointer cursor and hover feedback', () => {
    expect(baseCss).toMatch(/button:not\(:disabled\)/);
    expect(baseCss).toMatch(/:where\([\s\S]*button:not\(:disabled\)[\s\S]*\):hover/);
    expect(baseCss).toMatch(/\[role="button"\]:not\(\[aria-disabled="true"\]\)/);
  });
});
