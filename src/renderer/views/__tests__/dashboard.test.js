import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../dashboard.js', import.meta.url), 'utf8');
const taggingSource = readFileSync(new URL('../tagging.js', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../settings.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('dashboard phase 3 renderer wiring', () => {
  it('routes dashboard to a real view and loads Chart.js from a local vendor bundle', () => {
    expect(routerSource).toContain("import { renderDashboard } from './views/dashboard.js';");
    expect(routerSource).toContain('dashboard: renderDashboard');
    expect(indexHtml).toContain('vendor/chart.umd.js');
    expect(indexHtml.indexOf('vendor/chart.umd.js')).toBeLessThan(indexHtml.indexOf('src="app.js"'));
  });

  it('adds tagging to dashboard navigation for the active match', () => {
    expect(taggingSource).toContain("id: 'dashboard'");
    expect(taggingSource).toContain("navigate('dashboard', { matchId: match.id })");
  });

  it('renders dashboard controls, sections, notes drawer, heatmap filters and export flow', () => {
    expect(dashboardSource).toContain('Volver al tagging');
    expect(dashboardSource).toContain('Exportar PDF');
    expect(dashboardSource).toContain('Bigua');
    expect(dashboardSource).toContain('Rival');
    expect(dashboardSource).toContain('Comparado');
    expect(dashboardSource).toContain('Set Pieces');
    expect(dashboardSource).toContain('Rucks');
    expect(dashboardSource).toContain('Disciplina');
    expect(dashboardSource).toContain('Kicks');
    expect(dashboardSource).toContain('Break Lines');
    expect(dashboardSource).toContain('Posesion');
    expect(dashboardSource).toContain('BIP');
    expect(dashboardSource).toContain('Secuencias');
    expect(dashboardSource).toContain('Heatmap');
    expect(dashboardSource).toContain('dashboard-notes-drawer');
    expect(dashboardSource).toContain('coachNotes');
    expect(dashboardSource).toContain('data-heatmap-filter');
    expect(dashboardSource).toContain('toBase64Image');
    expect(dashboardSource).toContain('window.api.analytics.exportPdf');
    expect(dashboardSource).toContain('exporting');
    expect(dashboardSource).toContain('Abrir archivo');
  });

  it('adds editable alert thresholds to settings', () => {
    expect(settingsSource).toContain('Umbrales de alerta');
    expect(settingsSource).toContain('ruckWinPctMin');
    expect(settingsSource).toContain('penaltiesMax');
    expect(settingsSource).toContain('lineoutWinPctMin');
    expect(settingsSource).toContain('scrumWinPctMin');
    expect(settingsSource).toContain('breakLinesConcededMax');
    expect(settingsSource).toContain('data-alert-threshold');
  });
});
