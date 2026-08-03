import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as dashboard from '../dashboard.js';

const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../dashboard.js', import.meta.url), 'utf8');
const clipPlayerSource = readFileSync(new URL('../clip-player.js', import.meta.url), 'utf8');
const clipPlayerCss = readFileSync(new URL('../../../styles/components/clip-player.css', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../../../main/preload.js', import.meta.url), 'utf8');
const printSource = readFileSync(new URL('../../dashboard-print.js', import.meta.url), 'utf8');
const dashboardCss = readFileSync(new URL('../../../styles/components/dashboard.css', import.meta.url), 'utf8');
const taggingSource = readFileSync(new URL('../tagging.js', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../settings.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('dashboard phase 3 renderer wiring', () => {
  it('downloads cloud match detail before rendering stats and syncs coach notes through cloudMatchService', () => {
    expect(dashboardSource).toContain("import { cloudMatchService } from '../cloud/cloud-match-service.js';");
    expect(dashboardSource).toContain("cloudMatchService.getMatchById(params.matchId, { localFirst: true })");
    expect(dashboardSource).toContain('cloudMatchService.updateMatch(state.match.id, { coachNotes })');
    expect(dashboardSource).not.toContain('window.api.matches.update(state.match.id, { coachNotes })');
  });

  it('routes dashboard to a real view and loads Chart.js from a local vendor bundle', () => {
    expect(routerSource).toContain("import { renderDashboard } from './views/dashboard.js';");
    expect(routerSource).toContain("import { renderClipPlayer } from './views/clip-player.js';");
    expect(routerSource).toContain('dashboard: renderDashboard');
    expect(routerSource).toContain('clips: renderClipPlayer');
    expect(indexHtml).not.toContain('vendor/chart.umd.js');
    expect(dashboardSource).toContain("import { ensureChartJs } from '../vendor-loader.js';");
    expect(dashboardSource).toContain('await ensureChartJs();');
    expect(indexHtml).toContain('../styles/components/clip-player.css');
  });

  it('renders the dashboard shell before optional AI analysis finishes', () => {
    expect(dashboardSource).toContain('renderLoadedDashboard(container, state);\n      void refreshAIAnalysis(state)');
  });

  it('adds tagging to dashboard navigation for the active match', () => {
    expect(taggingSource).toContain("id: 'dashboard'");
    expect(taggingSource).toContain("navigate('dashboard', { matchId: match.id })");
  });

  it('wires dashboard event rows back to Tagging with exact seek timestamps', () => {
    expect(dashboardSource).toContain('function buildDashboardEventLinks');
    expect(dashboardSource).toContain('data-dashboard-seek-event');
    expect(dashboardSource).toContain('data-dashboard-event-timestamp');
    expect(dashboardSource).not.toContain('.slice(0, 8)');
    expect(dashboardSource).toContain("navigate('tagging', { matchId: state.match.id, seekTo: timestamp })");
    expect(dashboardSource).toContain("showToast(container, 'El evento no tiene timestamp para navegar al video.')");
    expect(taggingSource).toContain('const initialSeekSeconds = normalizeSeekParam(params.seekTo)');
  });

  it('caps dashboard linked events per stat section and shows overflow context', () => {
    const events = Array.from({ length: 14 }, (_, index) => ({
      id: `ruck-${index + 1}`,
      type: 'ruck',
      team: index % 2 === 0 ? 'home' : 'away',
      result: 'ganado',
      timestamp: 60 + index,
    }));
    const html = dashboard.buildDashboardEventLinks({
      events,
    }, {
      teams: {
        home: { name: 'Bigua' },
        away: { name: 'Rival' },
      },
    }, 'rucks');

    expect((html.match(/data-dashboard-seek-event/g) || [])).toHaveLength(6);
    expect(html).toContain('6 de 14');
    expect(html).toContain('Mostrar mas');
    expect(html).toContain('data-dashboard-show-more-events="rucks"');
    expect(html).toContain('data-dashboard-next-event-limit="12"');

    const expandedHtml = dashboard.buildDashboardEventLinks({
      events,
    }, {
      teams: {
        home: { name: 'Bigua' },
        away: { name: 'Rival' },
      },
    }, 'rucks', 12);

    expect((expandedHtml.match(/data-dashboard-seek-event/g) || [])).toHaveLength(12);
    expect(expandedHtml).toContain('12 de 14');
    expect(expandedHtml).toContain('data-dashboard-next-event-limit="18"');
  });

  it('wires show more event controls to release linked dashboard events in batches', () => {
    expect(dashboardSource).toContain('eventLinkLimits');
    expect(dashboardSource).toContain('data-dashboard-show-more-events');
    expect(dashboardSource).toContain('data-dashboard-next-event-limit');
    expect(dashboardSource).toContain('state.eventLinkLimits[sectionId] = nextLimit');
    expect(dashboardSource).toContain('renderLoadedDashboard(container, state)');
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
    expect(dashboardSource).toContain('Custom');
    expect(dashboardSource).toContain('dashboard-notes-drawer');
    expect(dashboardSource).toContain('coachNotes');
    expect(dashboardSource).toContain('data-heatmap-filter');
    expect(dashboardSource).toContain('toBase64Image');
    expect(dashboardSource).toContain('window.api.analytics.exportPdf');
    expect(dashboardSource).toContain('exporting');
    expect(dashboardSource).toContain('Abrir archivo');
  });

  it('keeps clip filtering and export controls out of the dashboard', () => {
    expect(dashboardSource).not.toContain("import { openModal } from '../components/modal.js';");
    expect(dashboardSource).not.toContain('CLIP_NO_VIDEO_MESSAGE');
    expect(dashboardSource).not.toContain('getPlayableVideo');
    expect(dashboardSource).not.toContain("const clipActionLabel = 'Reproducir clips';");
    expect(dashboardSource).not.toContain("{ id: 'clips', label: clipActionLabel }");
    expect(dashboardSource).not.toContain('data-dashboard-clip-module');
    expect(dashboardSource).not.toContain('data-open-clip-module');
    expect(dashboardSource).not.toContain('data-clip-module-preset');
    expect(dashboardSource).not.toContain("{ type: 'scrum', label: 'Scrums' }");
    expect(dashboardSource).not.toContain('Módulo de clips');
    expect(dashboardCss).not.toContain('.dashboard-clip-module');
    expect(dashboardSource).not.toContain('data-section-export-clips');
    expect(dashboardCss).not.toContain('.dashboard-section-export');
    expect(dashboardSource).not.toContain('data-clip-filter-time-preset');
    expect(dashboardSource).toContain('Todo el partido');
    expect(dashboardSource).not.toContain("const timePreset = /** @type {HTMLSelectElement|null} */ (host.querySelector('[data-clip-filter-time-preset]'))?.value || 'all';");
    expect(dashboardSource).not.toContain("fromSeconds: timePreset === 'custom'");
    expect(dashboardSource).not.toContain('Se reproducirán');
    expect(dashboardSource).not.toContain('CLIP_NO_VIDEO_MESSAGE');
    expect(dashboardSource).not.toContain('CLIP_NO_EVENTS_MESSAGE');
    expect(dashboardSource).not.toContain('CLIP_MISSING_TIMESTAMPS_MESSAGE');
    expect(dashboardSource).not.toContain('getPlayableVideo(state.match?.video)');
    expect(dashboardSource).toContain("navigate('clips', {");
    expect(dashboardSource).not.toContain('window.api.clips.exportBatch({ matchId: state.match.id');
    expect(dashboardSource).not.toContain('window.api.clips.cancelExport');
    expect(preloadSource).toContain('clips: {');
    expect(preloadSource).toContain("ipcRenderer.invoke('clips:export-batch'");
    expect(preloadSource).toContain("ipcRenderer.on('clips:export-progress'");
  });

  it('routes the dashboard topbar clips action directly to the Clips screen', () => {
    expect(dashboardSource).toContain("{ id: 'clips', label: 'Clips' }");
    expect(dashboardSource).toContain("if (id === 'clips') navigate('clips', { matchId: state.match.id });");
    expect(dashboardSource).not.toContain("const primaryLabel = 'Reproducir clips';");
    expect(dashboardSource).not.toContain("const sourceLabel = isYouTube ? 'YouTube' : match?.video?.type === 'local' ? 'MP4 local' : 'Sin video';");
    expect(dashboardSource).not.toContain('Video YouTube asociado.');
    expect(clipPlayerSource).toContain('data-associate-local-mp4');
    expect(clipPlayerSource).toContain('Asociar MP4 local');
    expect(clipPlayerSource).toContain('Exportar clips seleccionados');
    expect(clipPlayerSource).toContain('data-clip-export-selected');
    expect(clipPlayerSource).toContain('window.api.clips.exportBatch');
    expect(dashboardSource).not.toContain('Asociar MP4 local');
    expect(dashboardSource).not.toContain('Se reproducirán');
    expect(dashboardSource).toContain("navigate('clips', {");
    expect(dashboardSource).not.toContain("clipMode: 'youtube-clips'");
    expect(dashboardSource).not.toContain("sourceType === 'youtube' ? 'Reproducir clips' : 'Exportar clips'");
    expect(dashboardSource).not.toContain('La exportación MP4 requiere video local.');
    expect(dashboardSource).not.toContain('window.api.media.selectLocalVideo()');
    expect(dashboardSource).not.toContain('yt-dlp');
    expect(dashboardSource).not.toContain('youtube-dl');
  });

  it('does not keep the old dashboard clips modal implementation', () => {
    expect(dashboardSource).not.toContain('function buildClipExportModalBody');
    expect(dashboardSource).not.toContain('function readClipExportFilters');
    expect(dashboardSource).not.toContain("host.querySelector('[data-clip-export-cancel]')");
    expect(dashboardSource).not.toContain('window.api.clips.cancelExport()');
  });

  it('makes the AI dashboard panel collapsible without a dashboard clips panel', () => {
    expect(dashboardSource).toContain('aiPanelCollapsed');
    expect(dashboardSource).toContain('data-ai-panel-toggle');
    expect(dashboardSource).toContain('state.aiPanelCollapsed = !state.aiPanelCollapsed');
    expect(dashboardSource).not.toContain('clipModuleCollapsed');
    expect(dashboardSource).not.toContain('data-clip-module-toggle');
    expect(dashboardCss).toContain('.dashboard-ai-panel.collapsed');
    expect(dashboardCss).not.toContain('.dashboard-clip-module.collapsed');
    expect(dashboardCss).toContain('.dashboard-panel-toggle');
  });

  it('renders YouTube clips in a dedicated standalone player instead of the tagging screen', () => {
    expect(clipPlayerSource).toContain('export function renderClipPlayer');
    expect(clipPlayerSource).toContain('clip-player-view');
    expect(clipPlayerSource).toContain('<h1>Clips</h1>');
    expect(clipPlayerSource).toContain('Reproducí segmentos del partido filtrados por evento.');
    expect(clipPlayerSource).toContain('clip-player-stage');
    expect(clipPlayerSource).toContain('data-clip-player-queue');
    expect(clipPlayerSource).toContain('data-clip-filter-type');
    expect(clipPlayerSource).toContain('data-clip-player-source');
    expect(clipPlayerSource).toContain('youtubePlayer.seekTo(activeClip.start, true)');
    expect(clipPlayerSource).toContain('advanceClipQueue');
    expect(clipPlayerSource).toContain("navigate('dashboard', { matchId: match.id })");
    expect(clipPlayerCss).toContain('.clip-player-view');
    expect(clipPlayerCss).toContain('.clip-player-stage');
  });

  it('lazy-renders Chart.js canvases only when sections enter the viewport', () => {
    expect(dashboardSource).toContain('IntersectionObserver');
    expect(dashboardSource).toContain('createLazyChartRenderer');
    expect(dashboardSource).toContain('data-chart-key');
    expect(dashboardSource).toContain('observer.observe(canvas)');
    expect(dashboardSource).not.toContain('createSetPiecesChart(stats, selectedView, colors, charts);\n  createRucksChart');
  });

  it('renders configured custom hotkey events with their own dashboard chart', () => {
    expect(dashboardSource).toContain("['custom-events', 'Custom']");
    expect(dashboardSource).toContain('chart-custom-events');
    expect(dashboardSource).toContain('data-chart-key="customEvents"');
    expect(dashboardSource).toContain('buildCustomEventsBody(stats)');
    expect(dashboardSource).toContain('createCustomEventsChart(stats, selectedView, colors, charts)');
    expect(dashboardSource).toContain('stats.customEvents?.byType');
    expect(dashboardCss).toContain('.dashboard-custom-events-summary');
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
    expect(dashboardSource).toContain('tabindex="0"');
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

  it('activates coach note formatting on pointerdown before the editor can blur', () => {
    const notesClose = dashboardSource.indexOf("drawer?.querySelector('[data-notes-close]')");
    const toolbarStart = notesClose;
    const toolbarEnd = dashboardSource.indexOf("editor?.addEventListener('keydown'", toolbarStart);
    const toolbarSource = dashboardSource.slice(toolbarStart, toolbarEnd);

    expect(toolbarSource).toContain('const runNoteToolbarCommand = (button) => {');
    expect(toolbarSource).toContain("button.addEventListener('pointerdown'");
    expect(toolbarSource).toContain('event.preventDefault();');
    expect(toolbarSource).toContain("button.dataset.notePointerHandled = 'true';");
    expect(toolbarSource).toContain('runNoteToolbarCommand(button);');
    expect(toolbarSource).toContain("button.dataset.notePointerHandled === 'true'");
    expect(toolbarSource).toContain('delete button.dataset.notePointerHandled;');
  });

  it('keeps normal coach note typing native and places formatted caret after inserted text', () => {
    const handleStart = dashboardSource.indexOf('function handleFormattedTextInput');
    const handleEnd = dashboardSource.indexOf('function rangeIsAtElementBoundary', handleStart);
    const handleSource = dashboardSource.slice(handleStart, handleEnd);
    const insertStart = dashboardSource.indexOf('function insertFormattedText');
    const insertEnd = dashboardSource.indexOf('function handleFormattedTextInput', insertStart);
    const insertSource = dashboardSource.slice(insertStart, insertEnd);

    expect(dashboardSource).toContain('function hasActiveNoteFormat');
    expect(handleSource).toContain('if (!hasActiveNoteFormat(noteFormats)) return false;');
    expect(insertSource).toContain('const insertedNode = createFormattedTextNode(text, noteFormats);');
    expect(insertSource).toContain('nextRange.setStartAfter(insertedNode);');
    expect(insertSource).not.toContain('setStartBefore(marker)');
  });

  it('does not overwrite pending coach note formats from a collapsed plain caret', () => {
    const syncStart = dashboardSource.indexOf('function canSyncNoteFormatsFromSelection');
    const syncEnd = dashboardSource.indexOf('function getNoteFormatsAtSelection', syncStart);
    const syncSource = dashboardSource.slice(syncStart, syncEnd);

    expect(syncSource).toContain('if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) return false;');
    expect(syncSource).toContain('if (!selection.isCollapsed) return true;');
    expect(syncSource).toContain("anchorElement?.closest('strong,b,em,i,u')");
  });

  it('keeps the coach notes pencil floating directly above the chatbot button', () => {
    expect(dashboardSource).toContain('function renderDashboardFloatingActions(match)');
    expect(dashboardSource).toContain("document.querySelector('[data-dashboard-floating-actions]')?.remove();");
    expect(dashboardSource).toContain('document.body.appendChild(floatingActions);');
    expect(dashboardSource).toContain('renderDashboardFloatingActions(state.match);');
    expect(dashboardSource).toContain("document.querySelector('[data-dashboard-floating-actions] [data-notes-open]')");
    expect(dashboardSource).not.toContain('<div class="dashboard-floating-actions" aria-label="Acciones del dashboard">');
    expect(dashboardSource).toContain("window.requestAnimationFrame(() => {\n      editor?.focus();");
    expect(dashboardCss).toMatch(/\.dashboard-floating-actions\s*{[^}]*position:\s*fixed;[^}]*right:\s*20px;[^}]*bottom:\s*92px;[^}]*z-index:\s*87;/s);
    expect(dashboardCss).toMatch(/\.dashboard-notes-button\s*{[^}]*width:\s*56px;[^}]*height:\s*56px;[^}]*radial-gradient\(circle at 32% 18%, rgba\(255,\s*255,\s*255,\s*0\.12\), transparent 38%\)[^}]*var\(--color-bg-surface\)/s);
    expect(dashboardCss).toMatch(/\.dashboard-notes-button\s*{[^}]*box-shadow:\s*0 18px 42px rgba\(0,\s*0,\s*0,\s*0\.28\), 0 0 0 4px var\(--color-accent-muted\)/s);
    expect(dashboardCss).toMatch(/@media \(max-width: 760px\)\s*{[\s\S]*\.dashboard-floating-actions\s*{[^}]*right:\s*20px;[^}]*bottom:\s*92px;/s);
    expect(dashboardCss).not.toMatch(/\.dashboard-floating-actions\s*{[^}]*position:\s*absolute;/s);
    expect(dashboardCss).not.toMatch(/\.dashboard-notes-button\s*{[^}]*position:\s*fixed;/s);
  });

  it('mounts coach notes as a full-height body drawer and hides chatbot while open', () => {
    expect(dashboardSource).toContain('function renderDashboardNotesDrawer(match)');
    expect(dashboardSource).toContain('document.body.appendChild(drawer);');
    expect(dashboardSource).toContain("document.body.classList.add('has-dashboard-notes-open')");
    expect(dashboardSource).toContain("document.body.classList.remove('has-dashboard-notes-open')");
    expect(dashboardSource).toContain("document.querySelector('[data-dashboard-notes-drawer]')?.remove();");

    expect(dashboardCss).toMatch(/\.dashboard-notes-drawer\s*{[^}]*position:\s*fixed;[^}]*top:\s*calc\(var\(--titlebar-height\) \+ var\(--topbar-height\)\);[^}]*height:\s*calc\(100dvh - var\(--titlebar-height\) - var\(--topbar-height\)\);/s);
    expect(dashboardCss).not.toContain('inset: calc(var(--titlebar-height) + var(--topbar-height)) 0 0 auto;');
    expect(dashboardCss).toMatch(/\.dashboard-notes-panel\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(dashboardCss).toMatch(/\.dashboard-note-toolbar\s*{[^}]*flex-shrink:\s*0;/s);
    expect(dashboardCss).toMatch(/\.dashboard-notes-editor\s*{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
    expect(dashboardCss).toMatch(/body\.has-dashboard-notes-open\s+\.ai-chatbot-root\s*{[^}]*display:\s*none;/s);
  });

  it('uses analytics score as the dashboard header source of truth', () => {
    expect(dashboardSource).toContain('function getDashboardScore');
    expect(dashboardSource).toContain('const displayScore = getDashboardScore(stats, match)');
    expect(dashboardSource).toContain('${displayScore.home} - ${displayScore.away}');
    expect(dashboardSource).toContain('getResultBadge(stats, match)');
    expect(dashboardSource).not.toContain('const hasPersistedScore = manual.home > 0 || manual.away > 0');
    expect(dashboardSource).toContain('getScoreSourceLabel(stats?.score?.source)');
    expect(dashboardSource).toContain("if (source === 'events-manual') return 'Eventos + ajuste manual';");
  });

  it('falls back to the persisted match score when dashboard stats do not carry a final score', () => {
    const helperStart = dashboardSource.indexOf('function scoreNumber');
    const helperEnd = dashboardSource.indexOf('function getScoreSourceLabel', helperStart);
    const helpers = new Function(`${dashboardSource.slice(helperStart, helperEnd)} return { getDashboardScore };`)();

    expect(helpers.getDashboardScore({
      score: {
        home: { total: 0 },
        away: { total: 0 },
      },
    }, {
      homeScore: 4,
      awayScore: 2,
    })).toEqual({ home: 4, away: 2 });

    expect(helpers.getDashboardScore({
      score: {
        home: { total: 0 },
        away: { total: 0 },
      },
    }, {
      scoreOverride: {
        enabled: true,
        homeScore: 3,
        awayScore: 1,
      },
    })).toEqual({ home: 3, away: 1 });
  });

  it('uses the tagging match selector surface when dashboard opens without a match', () => {
    expect(dashboardSource).toContain("import { MATCH_EDIT_ICON, getMatchSelectionItems } from '../components/match-selection.js';");
    expect(dashboardSource).toContain("import { openEditMatchModal } from '../components/new-match-form.js';");
    expect(dashboardSource).toContain('const items = getMatchSelectionItems(matches);');
    expect(dashboardSource).toContain('class="tagging-match-select-view dashboard-select-view view-enter"');
    expect(dashboardSource).toContain('class="tagging-match-select-header"');
    expect(dashboardSource).toContain('class="tagging-match-select-grid"');
    expect(dashboardSource).toContain('data-dashboard-match-id');
    expect(dashboardSource).toContain('data-dashboard-edit-match-id');
    expect(dashboardSource).toContain('class="tagging-match-edit-button"');
    expect(dashboardSource).toContain('aria-label="Editar partido');
    expect(dashboardSource).toContain('openEditMatchModal(matchToEdit, async () => {');
    expect(dashboardSource).toContain('class="tagging-match-card-kicker"');
    expect(dashboardSource).toContain('class="tagging-match-card-video"');
    expect(dashboardSource).toContain('class="tagging-match-card-footer"');
    expect(dashboardSource).not.toContain('>Editar</button>');
    expect(dashboardCss).not.toContain('.dashboard-match-grid');
    expect(dashboardCss).not.toContain('.dashboard-match-option');
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

  it('draws dashboard heatmap from four normalized field sectors', () => {
    expect(dashboardSource).toContain("import { FOUR_SECTOR_FIELD_ZONES, normalizeFieldZone } from '../field-zones.js';");
    expect(dashboardSource).toContain('FOUR_SECTOR_FIELD_ZONES.map((zone, index)');
    expect(dashboardSource).toContain('data-zone="${zone.id}"');
    expect(dashboardSource).toContain('normalizeFieldZone(event)');
    expect(dashboardSource).not.toContain('for (let column = 0; column < 5; column += 1)');
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

  it('renders AI analysis from the deterministic camelCase contract without empty cards', () => {
    expect(dashboardSource).toContain('normalizeAIAnalysisResultForDisplay');
    expect(dashboardSource).toContain('filterAIItemsForDisplay');
    expect(dashboardSource).toContain('scoreContext');
    expect(dashboardSource).toContain('dataQualityWarnings');
    expect(dashboardSource).toContain('Resultado Bigua');
    expect(dashboardSource).toContain('No hay datos suficientes para esta sección.');
    expect(dashboardSource).not.toContain("item.title || item.area || 'Sin titulo'");
    expect(dashboardSource).not.toContain("item.area || 'Area'");
    expect(dashboardSource).not.toContain("'Hallazgo'");
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
