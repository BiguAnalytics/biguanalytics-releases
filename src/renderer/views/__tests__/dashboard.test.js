import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../dashboard.js', import.meta.url), 'utf8');
const printSource = readFileSync(new URL('../../dashboard-print.js', import.meta.url), 'utf8');
const dashboardCss = readFileSync(new URL('../../../styles/components/dashboard.css', import.meta.url), 'utf8');
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

  it('lazy-renders Chart.js canvases only when sections enter the viewport', () => {
    expect(dashboardSource).toContain('IntersectionObserver');
    expect(dashboardSource).toContain('createLazyChartRenderer');
    expect(dashboardSource).toContain('data-chart-key');
    expect(dashboardSource).toContain('observer.observe(canvas)');
    expect(dashboardSource).not.toContain('createSetPiecesChart(stats, selectedView, colors, charts);\n  createRucksChart');
  });

  it('uses contextual empty copy when the heatmap has no zone data', () => {
    expect(dashboardSource).toContain('Sin zonas cargadas todavia');
    expect(dashboardSource).toContain('Selecciona zonas en los popups de tagging para activar este heatmap.');
  });

  it('wires phase 3.5 dashboard personalization controls and persists dashboard preferences', () => {
    expect(dashboardSource).toContain('DASHBOARD_TEMPLATES');
    expect(dashboardSource).toContain('KPI_DEFINITIONS');
    expect(dashboardSource).toContain('PDF_TEMPLATES');
    expect(dashboardSource).toContain('data-dashboard-template');
    expect(dashboardSource).toContain('data-filter-time');
    expect(dashboardSource).toContain('data-filter-zone');
    expect(dashboardSource).toContain('data-kpi-slot');
    expect(dashboardSource).toContain('data-section-visible');
    expect(dashboardSource).toContain('data-section-up');
    expect(dashboardSource).toContain('data-section-down');
    expect(dashboardSource).toContain('data-pdf-template');
    expect(dashboardSource).toContain('window.api.settings.set({ dashboard: state.preferences })');
    expect(dashboardSource).toContain('window.api.analytics.getMatchStats(state.match.id, state.preferences.filters)');
  });

  it('passes PDF template and visible dashboard sections into the print renderer', () => {
    expect(dashboardSource).toContain('pdfTemplate: state.preferences.pdfTemplate');
    expect(dashboardSource).toContain('visibleSections: getVisibleSections(state.preferences)');
    expect(printSource).toContain('payload.pdfTemplate');
    expect(printSource).toContain('payload.visibleSections');
    expect(printSource).toContain('shouldPrintSection');
  });

  it('revalidates active license access before invoking dashboard PDF export', () => {
    expect(dashboardSource).toContain('refreshAccessState');
    expect(dashboardSource).toContain("access.state !== 'active'");
    expect(dashboardSource.indexOf('refreshAccessState')).toBeLessThan(dashboardSource.indexOf('window.api.analytics.exportPdf'));
    expect(dashboardSource).toContain('license: getPrintLicensePayload(access)');
  });

  it('uses a rich coach notes editor with bold italic underline and markdown list rendering', () => {
    expect(dashboardSource).toContain('contenteditable="true"');
    expect(dashboardSource).toContain('data-coach-notes-editor');
    expect(dashboardSource).toContain('data-note-command="bold"');
    expect(dashboardSource).toContain('data-note-command="italic"');
    expect(dashboardSource).toContain('data-note-command="underline"');
    expect(dashboardSource).toContain('document.execCommand(command');
    expect(dashboardSource).toContain('markdownToNoteHtml');
    expect(dashboardSource).toContain('serializeCoachNotes');
    expect(dashboardSource).toContain('<ul><li>');
    expect(dashboardSource).not.toContain('<textarea id="coach-notes"');
  });

  it('keeps coach note formatting buttons in sync and converts dash-space into a list immediately', () => {
    expect(dashboardSource).toContain('updateNoteToolbarState');
    expect(dashboardSource).toContain('document.queryCommandState(command)');
    expect(dashboardSource).toContain('aria-pressed');
    expect(dashboardSource).toContain('handleMarkdownListShortcut');
    expect(dashboardSource).toContain("event.key === ' '");
    expect(dashboardSource).toContain("event.code === 'Space'");
    expect(dashboardSource).toContain('<ul><li><br></li></ul>');
    expect(dashboardSource).toContain('restoreNoteSelection');
    expect(dashboardSource).toContain('toggleNoteCommand');
    expect(dashboardSource).toContain('moveCaretOutsideActiveFormat');
    expect(dashboardSource).toContain('state.noteFormats');
    expect(dashboardSource).toContain('handleFormattedTextInput');
    expect(dashboardSource).toContain("editor?.addEventListener('beforeinput'");
    expect(dashboardSource).toContain('noteFormats[command] = !noteFormats[command]');
    expect(dashboardSource).toContain('createFormattedTextNode');
    expect(dashboardSource).toContain('ZERO_WIDTH_FORMAT_MARKER');
    expect(dashboardCss).toContain('.dashboard-note-toolbar button.active');
    expect(dashboardCss).toContain('[aria-pressed="true"]');
    expect(dashboardCss).toContain('rgba(200, 16, 46, 0.14)');
  });

  it('uses the persisted match scoreboard for the dashboard header', () => {
    expect(dashboardSource).toContain('function getDashboardScore');
    expect(dashboardSource).toContain('const displayScore = getDashboardScore(stats, match)');
    expect(dashboardSource).toContain('${displayScore.home} - ${displayScore.away}');
    expect(dashboardSource).toContain('getResultBadge(stats, match)');
  });

  it('renders the heatmap field as vector SVG and exports it as an SVG image', () => {
    expect(dashboardSource).toContain('<svg id="dashboard-heatmap"');
    expect(dashboardSource).toContain('drawRugbyFieldSvg');
    expect(dashboardSource).toContain('heatmap-zone-number');
    expect(dashboardSource).toContain('vector-effect="non-scaling-stroke"');
    expect(dashboardSource).toContain('rx="0" fill="url(#heatmap-field-gradient)"');
    expect(dashboardSource).toContain('new XMLSerializer().serializeToString');
    expect(dashboardSource).not.toContain('getContext(\'2d\')');
  });

  it('hides the heatmap empty overlay and dashboard scrollbar thumb when they should not be visible', () => {
    expect(dashboardCss).toContain('.dashboard-heatmap-empty[hidden]');
    expect(dashboardCss).toMatch(/\.main-content-body\.dashboard-content-body\s*{[^}]*scrollbar-gutter:\s*auto;/s);
    expect(dashboardCss).toMatch(/\.main-content-body\.dashboard-content-body::-webkit-scrollbar\s*{[^}]*width:\s*0;/s);
    expect(dashboardCss).toMatch(/\.main-content-body\.dashboard-content-body::-webkit-scrollbar\s*{[^}]*display:\s*none;/s);
    expect(dashboardCss).toMatch(/\.main-content-body\.dashboard-content-body::-webkit-scrollbar-thumb\s*{[^}]*background:\s*transparent;/s);
    expect(dashboardCss).toMatch(/\.dashboard-toast\[hidden\]\s*{[^}]*display:\s*none;/s);
    expect(dashboardSource).toContain("container.classList.add('dashboard-content-body')");
    expect(dashboardSource).toContain("container.classList.remove('dashboard-content-body')");
  });

  it('wires AI analysis UI without automatic generation or duplicate requests', () => {
    expect(dashboardSource).toContain('Análisis IA');
    expect(dashboardSource).toContain('data-ai-generate');
    expect(dashboardSource).toContain('data-ai-regenerate');
    expect(dashboardSource).toContain('state.aiLoading');
    expect(dashboardSource).toContain('window.biguAI.getMatchAnalysis(state.match.id)');
    expect(dashboardSource).toContain('window.biguAI.generateMatchAnalysis(state.match.id)');
    expect(dashboardSource).toContain('window.biguAI.regenerateMatchAnalysis(state.match.id)');
    expect(dashboardSource).toContain('Esto consumirá una nueva llamada a la IA');
    expect(dashboardSource).toContain('Los hitos, eventos, notas, metadatos o métricas cambiaron desde el último análisis.');
  });

  it('passes only valid cached AI analysis to the print renderer', () => {
    expect(dashboardSource).toContain("state.ai?.status === 'valid'");
    expect(dashboardSource).toContain('aiAnalysis:');
    expect(printSource).toContain('Análisis IA');
    expect(printSource).toContain('payload.aiAnalysis');
  });

  it('keeps possession interval percent calculations inside the dashboard renderer', () => {
    expect(dashboardSource).toContain('function calculatePercent');
    expect(dashboardSource).not.toMatch(/\bpct\(/);
  });

  it('keeps heatmap intensity rounding inside the dashboard renderer', () => {
    expect(dashboardSource).toContain('function roundTo');
    expect(dashboardSource).not.toMatch(/(?<!\.)\bround\(/);
  });

  it('shows a clear dashboard load error with technical detail', () => {
    expect(dashboardSource).toContain('No se pudo abrir el dashboard');
    expect(dashboardSource).toContain('Detalle tecnico');
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
