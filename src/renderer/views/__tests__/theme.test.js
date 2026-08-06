import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyAppTheme,
  normalizeTheme,
} from '../../theme.js';

describe('app theme support', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/app.js'), 'utf8');
  const sidebarSource = readFileSync(resolve(process.cwd(), 'src/renderer/components/sidebar.js'), 'utf8');
  const settingsSource = readFileSync(resolve(process.cwd(), 'src/renderer/views/settings.js'), 'utf8');
  const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const baseCss = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
  const layoutCss = readFileSync(resolve(process.cwd(), 'src/styles/layout.css'), 'utf8');
  const matchCardCss = readFileSync(resolve(process.cwd(), 'src/styles/components/match-card.css'), 'utf8');
  const modalCss = readFileSync(resolve(process.cwd(), 'src/styles/components/modal.css'), 'utf8');
  const timelineCss = readFileSync(resolve(process.cwd(), 'src/styles/components/timeline.css'), 'utf8');
  const sidebarCss = readFileSync(resolve(process.cwd(), 'src/styles/components/sidebar.css'), 'utf8');
  const dashboardSource = readFileSync(resolve(process.cwd(), 'src/renderer/views/dashboard.js'), 'utf8');
  const seasonSource = readFileSync(resolve(process.cwd(), 'src/renderer/views/season.js'), 'utf8');
  const topbarCss = readFileSync(resolve(process.cwd(), 'src/styles/components/topbar.css'), 'utf8');
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
    expect(appSource).toContain('loadAndApplyTheme().catch(() => {});');
  });

  it('exposes light and dark choices in settings and saves the selected theme', () => {
    expect(settingsSource).toContain('name="theme" value="dark"');
    expect(settingsSource).toContain('name="theme" value="light"');
    expect(settingsSource).toContain('theme: selectedTheme,');
    expect(settingsSource).toContain('applyAppTheme(selectedTheme);');
    expect(settingsSource).toContain("input.addEventListener('change'");
    expect(settingsSource).toContain('applyAppTheme(input.value);');
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

  it('uses a balanced restrained palette with red-blue brand accents', () => {
    expect(tokensCss).toContain('--color-bg-base:        #0D1726;');
    expect(tokensCss).toContain('--color-bg-surface:     #142033;');
    expect(tokensCss).toContain('--color-bg-elevated:    #1B2A43;');
    expect(tokensCss).toContain('--color-bg-hover:       #243752;');
    expect(tokensCss).toContain('--color-brand-blue:     #4F79AE;');
    expect(tokensCss).toContain('--gradient-brand:');
    expect(tokensCss).toContain('--gradient-brand-text:');
    expect(tokensCss).toContain('--color-text-secondary: #A8B4C4;');
    expect(tokensCss).toContain('--tag-neutral:');
    expect(tokensCss).toContain('--tag-success:');
    expect(tokensCss).toContain('--tag-warning:');
    expect(tokensCss).toContain('--tag-danger:');
    expect(tokensCss).toContain('--tag-ganado:     var(--color-brand-blue);');
    expect(tokensCss).toContain('--tag-sucio:      var(--tag-neutral);');
    expect(tokensCss).toContain('--tag-ataque:     var(--tag-neutral);');
    expect(tokensCss).not.toContain('#3B82F6');
    expect(tokensCss).not.toContain('#8B5CF6');
    expect(tokensCss).not.toContain('#06B6D4');
    expect(baseCss).not.toContain('rgba(59, 130, 246');
    expect(baseCss).toMatch(/\.club-gradient-text\s*{[^}]*background:\s*var\(--gradient-brand-text\);/s);
    expect(layoutCss).toMatch(/\.home-welcome span\s*{[^}]*background:\s*var\(--gradient-brand-text\);/s);
    expect(layoutCss).toMatch(/\.match-list-new-btn\s*{[^}]*background:\s*var\(--gradient-brand-text\);/s);
    expect(matchCardCss).not.toContain('rgba(53, 105, 180');
    expect(matchCardCss).not.toContain('rgba(245, 158, 11, 0.42');
    expect(matchCardCss).not.toContain('rgb(29, 185, 84)');
    expect(matchCardCss).not.toContain('rgb(59, 130, 246)');
    expect(matchCardCss).not.toContain('rgb(245, 158, 11)');
    expect(matchCardCss).not.toContain('--match-tone: rgba(132, 111, 74');
    expect(matchCardCss).toContain('--match-tone: rgba(64, 102, 158');
    expect(themeCss).not.toContain('--match-tone: rgba(132, 111, 74');
    expect(modalCss).not.toContain('var(--color-brand-navy)) border-box');
    expect(modalCss).toMatch(/\.btn-primary\s*{[^}]*background:\s*var\(--gradient-brand\);/s);
  });

  it('balances dark readability with the original red-blue atmosphere', () => {
    expect(tokensCss).toContain('--color-bg-base:        #0D1726;');
    expect(tokensCss).toContain('--color-bg-surface:     #142033;');
    expect(tokensCss).toContain('--color-bg-elevated:    #1B2A43;');
    expect(tokensCss).toContain('rgba(200, 16, 46, 0.16) 0%, transparent 46%');
    expect(tokensCss).toContain('--gradient-brand:       linear-gradient(110deg, #C8102E 0%, #26405F 48%, #C8102E 100%);');
    expect(layoutCss).toMatch(/\.home-header::before\s*{[^}]*rgba\(200,\s*16,\s*46,\s*0\.18\)/s);
    expect(themeCss).toMatch(/:root:not\(\[data-theme="light"\]\) \.main-content-body\s*{[^}]*background:\s*var\(--gradient-bg\);/s);
    expect(sidebarCss).toMatch(/\.sidebar-active-indicator\s*{[^}]*background:\s*var\(--gradient-brand\);/s);
    expect(matchCardCss).toMatch(/\.match-card\.loss\s*{[^}]*--match-tone-soft:\s*rgba\(200,\s*16,\s*46,\s*0\.19\)/s);
  });

  it('keeps charts and timeline states semantic without saturated rainbow colors', () => {
    expect(timelineCss).toContain('.timeline-block.won { background: var(--tag-success); }');
    expect(timelineCss).toContain('.timeline-block.attack { background: var(--tag-neutral); }');
    expect(timelineCss).not.toContain('rgba(59, 130, 246');
    expect(dashboardSource).toContain("styles.getPropertyValue('--tag-success-soft')");
    expect(dashboardSource).not.toContain("rivalLight: 'rgba(59, 130, 246, 0.28)'");
    expect(dashboardSource).toContain('stop-color="${colors.fieldNavy}"');
    expect(dashboardSource).toContain('stop-color="${colors.fieldBase}"');
    expect(dashboardSource).not.toContain('stop-color="#0B8F4E"');
    expect(seasonSource).toContain('backgroundColor: colors.area');
    expect(seasonSource).not.toContain("backgroundColor: 'rgba(59, 130, 246, 0.16)'");
  });

  it('keeps light-mode brand and playback controls high contrast', () => {
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.topbar-logo-text \.accent\s*{[^}]*background:\s*var\(--gradient-brand-text\);/s);
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.video-play-btn\s*{[^}]*background:\s*var\(--gradient-brand\);/s);
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.video-play-btn:hover\s*{[^}]*box-shadow:\s*0 16px 36px rgba\(200,\s*16,\s*46,\s*0\.26\);/s);
  });

  it('keeps the topbar divider themed and turns the logo vector line black in light mode', () => {
    expect(topbarCss).toMatch(/\.topbar-divider\s*{[^}]*background:\s*var\(--color-border\);/s);
    expect(sidebarSource).toContain('id="grafico-linea-nodos"');
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+#grafico-linea-nodos\s*{[^}]*fill:\s*#000000;/s);
  });

  it('keeps dashboard, chart and settings analysis surfaces light in light mode', () => {
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.tagging-match-card,[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.84\)/s);
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.dashboard-section,\s*:root\[data-theme="light"\]\s+\.chart-shell\s*{[^}]*rgba\(255,\s*255,\s*255,\s*0\.82\)/s);
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.settings-alert-row\s*{[^}]*rgba\(255,\s*255,\s*255,\s*0\.72\)/s);
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.dashboard-view-toggle\s*{[^}]*rgba\(255,\s*255,\s*255,\s*0\.86\)/s);
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.dashboard-notes-button\s*{[^}]*rgba\(255,\s*255,\s*255,\s*0\.96\)/s);
  });

  it('keeps light-mode surfaces neutral and match thumbnails semantically muted', () => {
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.main-content-body\s*{[^}]*background:\s*var\(--color-bg-base\);/s);
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.tagging-view\s*{[^}]*background:\s*var\(--color-bg-base\);/s);
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.match-card\.pending\s*{[^}]*rgba\(98,\s*123,\s*153,\s*0\.48\)/s);
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.match-card-thumbnail\s*{[^}]*rgba\(232,\s*239,\s*248,\s*0\.58\)/s);
  });
});
