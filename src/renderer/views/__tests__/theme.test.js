import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyAppTheme,
  normalizeTheme,
} from '../../theme.js';

describe('app theme support', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/app.js'), 'utf8');
  const settingsSource = readFileSync(resolve(process.cwd(), 'src/renderer/views/settings.js'), 'utf8');
  const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const themeCss = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');
  const indexHtml = readFileSync(resolve(process.cwd(), 'src/renderer/index.html'), 'utf8');

  it('normalizes unsupported theme values back to dark mode', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('system')).toBe('dark');
    expect(normalizeTheme(null)).toBe('dark');
  });

  it('applies the selected theme to the document root', () => {
    const root = { dataset: {}, style: {} };

    expect(applyAppTheme('light', root)).toBe('light');
    expect(root.dataset.theme).toBe('light');
    expect(root.style.colorScheme).toBe('light');

    expect(applyAppTheme('bad-value', root)).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
  });

  it('loads persisted theme during app boot', () => {
    expect(appSource).toContain("import { loadAndApplyTheme } from './theme.js';");
    expect(appSource).toContain('await loadAndApplyTheme();');
  });

  it('exposes light and dark choices in settings and saves the selected theme', () => {
    expect(settingsSource).toContain('name="theme" value="dark"');
    expect(settingsSource).toContain('name="theme" value="light"');
    expect(settingsSource).toContain('theme: selectedTheme,');
    expect(settingsSource).toContain('applyAppTheme(selectedTheme);');
  });

  it('defines a light token set and loads theme overrides after component CSS', () => {
    expect(tokensCss).toContain(':root[data-theme="light"]');
    expect(tokensCss).toContain('--theme-color-scheme: light;');
    expect(tokensCss).toContain('--color-bg-base:        #F4F7FB;');
    expect(themeCss).toContain(':root[data-theme="light"] .sidebar');
    expect(themeCss).toContain(':root[data-theme="light"] .tagging-view');
    expect(themeCss).toContain(':root[data-theme="light"] .timeline-host');

    const themeIndex = indexHtml.indexOf('../styles/theme.css');
    const lastComponentIndex = indexHtml.indexOf('../styles/charts.css');
    expect(themeIndex).toBeGreaterThan(lastComponentIndex);
  });
});
