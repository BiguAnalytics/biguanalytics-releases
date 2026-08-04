// @ts-check
import { getPrintLicensePayload, refreshAccessState } from '../auth/access-guard.js';
import { cloudMatchService } from '../cloud/cloud-match-service.js';
import { createKpiCard } from '../components/kpi-card.js';
import { MATCH_EDIT_ICON, getMatchSelectionItems } from '../components/match-selection.js';
import { openEditMatchModal } from '../components/new-match-form.js';
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { FOUR_SECTOR_FIELD_ZONES, normalizeFieldZone } from '../field-zones.js';
import { navigate } from '../router.js';
import { DEFAULT_EVENT_LABELS } from '../tagging/event-labels.js';
import { getEventLabel, getEventLabels } from '../tagging/event-labels.js';
import { ensureChartJs } from '../vendor-loader.js';

const VIEW_OPTIONS = [
  { id: 'bigua', label: 'Bigua' },
  { id: 'rival', label: 'Rival' },
  { id: 'compare', label: 'Comparado' },
];

const HEATMAP_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'penalties', label: 'Penales' },
  { id: 'lost-rucks', label: 'Rucks perdidos' },
  { id: 'tries', label: 'Tries' },
  { id: 'turnovers', label: 'Turnovers' },
  { id: 'break-lines', label: 'Break Lines' },
];

const SECTION_ORDER = [
  ['set-pieces', 'Set Pieces'],
  ['rucks', 'Rucks'],
  ['discipline', 'Disciplina'],
  ['kicks', 'Kicks'],
  ['break-lines', 'Break Lines'],
  ['custom-events', 'Custom'],
  ['possession', 'Posesion'],
  ['bip', 'BIP'],
  ['sequences', 'Secuencias'],
  ['heatmap', 'Heatmap'],
];

const SECTION_LABELS = Object.fromEntries(SECTION_ORDER);
const DEFAULT_SECTION_IDS = SECTION_ORDER.map(([id]) => id);

function getDashboardEventLabel(type, taggingLabels, fallback) {
  const configured = String(taggingLabels?.[type] || '').trim();
  return configured && configured !== DEFAULT_EVENT_LABELS[type]
    ? getEventLabel(type, taggingLabels)
    : fallback;
}

function getDashboardSectionLabels(taggingLabels = {}) {
  return {
    ...SECTION_LABELS,
    rucks: getDashboardEventLabel('ruck', taggingLabels, 'Rucks'),
    kicks: getDashboardEventLabel('kick', taggingLabels, 'Kicks'),
    'break-lines': getDashboardEventLabel('break-line', taggingLabels, 'Break Lines'),
  };
}

const TIME_FILTERS = [
  { id: 'all', label: 'Todo el partido' },
  { id: 'first-half', label: 'Primer tiempo' },
  { id: 'second-half', label: 'Segundo tiempo' },
  { id: '0-20', label: '0-20' },
  { id: '20-40', label: '20-40' },
  { id: '40-60', label: '40-60' },
  { id: '60-80', label: '60-80' },
  { id: '+80', label: '+80' },
];

const DASHBOARD_SECTION_EVENT_TYPES = {
  'set-pieces': ['scrum', 'lineout', 'maul'],
  rucks: ['ruck'],
  discipline: ['penal', 'card'],
  kicks: ['kick'],
  'break-lines': ['break-line'],
  'custom-events': ['custom:'],
  possession: [],
  bip: [],
  heatmap: [],
};

const DASHBOARD_EVENT_LINK_LIMIT = 6;

const PDF_TEMPLATES = [
  { id: 'complete', label: 'Completo' },
  { id: 'short', label: 'Resumen corto' },
  { id: 'alerts', label: 'Solo alertas' },
  { id: 'forwards', label: 'Forwards' },
];

const DEFAULT_DASHBOARD_PREFERENCES = {
  template: 'general',
  pdfTemplate: 'complete',
  selectedKpis: ['ruckWinPct', 'penalties', 'lineoutWinPct', 'breakLines'],
  sectionOrder: DEFAULT_SECTION_IDS,
  visibleSections: DEFAULT_SECTION_IDS,
  filters: {
    team: 'bigua',
    timeBand: 'all',
    zone: 'all',
  },
};

const SYSTEM_DEFAULT_PDF_TEMPLATE = {
  id: 'system-default',
  name: 'Default BiguAnalytics',
  isSystem: true,
  isDefault: true,
};

const KPI_IDS = [
  'ruckWinPct',
  'penalties',
  'lineoutWinPct',
  'scrumWinPct',
  'breakLines',
  'breakLinesConceded',
  'turnovers',
  'kicks',
  'kickEffectiveness',
  'possession',
  'territory',
  'killerInstinct',
  'cards',
];

const DASHBOARD_TEMPLATES = {
  general: {
    label: 'Resumen general',
    selectedKpis: ['ruckWinPct', 'penalties', 'lineoutWinPct', 'breakLines'],
    visibleSections: DEFAULT_SECTION_IDS,
  },
  forwards: {
    label: 'Forwards',
    selectedKpis: ['scrumWinPct', 'lineoutWinPct', 'ruckWinPct', 'penalties'],
    visibleSections: ['set-pieces', 'rucks', 'discipline', 'heatmap', 'sequences'],
  },
  discipline: {
    label: 'Disciplina',
    selectedKpis: ['penalties', 'cards', 'ruckWinPct', 'breakLinesConceded'],
    visibleSections: ['discipline', 'rucks', 'bip', 'heatmap'],
  },
  kicking: {
    label: 'Kicking game',
    selectedKpis: ['kicks', 'kickEffectiveness', 'possession', 'territory'],
    visibleSections: ['kicks', 'possession', 'bip', 'heatmap'],
  },
  opponent: {
    label: 'Post partido rival',
    selectedKpis: ['breakLinesConceded', 'penalties', 'territory', 'turnovers'],
    visibleSections: ['break-lines', 'discipline', 'kicks', 'possession', 'heatmap'],
  },
};

let cleanupDashboard = null;
const ZERO_WIDTH_FORMAT_MARKER = '\u200B';
const NOTE_FORMAT_COMMANDS = ['bold', 'italic', 'underline'];

/**
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * @param {number|null|undefined} value
 * @returns {string}
 */
function formatPct(value) {
  return `${Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0}%`;
}

/**
 * @param {number|null|undefined} value
 * @param {number|null|undefined} total
 * @returns {number}
 */
function calculatePercent(value, total) {
  const numericValue = Number(value);
  const numericTotal = Number(total);
  if (!Number.isFinite(numericValue) || !Number.isFinite(numericTotal) || numericTotal <= 0) return 0;
  return Math.round((numericValue / numericTotal) * 100);
}

/**
 * @param {number|null|undefined} value
 * @param {number} digits
 * @returns {number}
 */
function roundTo(value, digits = 2) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  const factor = 10 ** digits;
  return Math.round(numericValue * factor) / factor;
}

/**
 * @param {number|null|undefined} value
 * @returns {string}
 */
function formatNumber(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '0';
}

/**
 * @param {string} value
 * @returns {string}
 */
function formatLabel(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Sin dato';
}

/**
 * @param {number|null|undefined} seconds
 * @returns {string}
 */
function formatClipTimeInput(seconds) {
  if (seconds === null || seconds === undefined || seconds === '') return '';
  const totalSeconds = Number(seconds);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '';
  const rounded = Math.floor(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasValidClipTimestamp(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0;
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} view
 * @returns {'home'|'away'|null}
 */
function getSelectedTeam(stats, view) {
  if (view === 'compare') return null;
  return view === 'bigua' ? stats.teams.biguaTeam : stats.teams.rivalTeam;
}

/**
 * @param {object} stats
 * @param {'home'|'away'} team
 * @returns {string}
 */
function getTeamName(stats, team) {
  return stats.teams?.[team]?.name || (team === 'home' ? 'Bigua' : 'Rival');
}

/**
 * @param {object} stats
 * @returns {Record<string, object>}
 */
function KPI_DEFINITIONS(stats, taggingLabels = {}) {
  const ruckLabel = getDashboardEventLabel('ruck', taggingLabels, 'Rucks');
  const penalLabel = getDashboardEventLabel('penal', taggingLabels, 'Penales');
  const lineoutLabel = getDashboardEventLabel('lineout', taggingLabels, 'Line Outs');
  const scrumLabel = getDashboardEventLabel('scrum', taggingLabels, 'Scrums');
  const breakLineLabel = getDashboardEventLabel('break-line', taggingLabels, 'Break Lines');
  const turnoverLabel = getDashboardEventLabel('turnover', taggingLabels, 'Turnovers');
  const kickLabel = getDashboardEventLabel('kick', taggingLabels, 'Kicks');
  const bigua = stats.teams.biguaTeam;
  const rival = stats.teams.rivalTeam;
  const totalCards = stats.discipline[bigua].cards.amarilla + stats.discipline[bigua].cards.roja;
  const territory = stats.territory.available ? stats.territory.percentages[bigua] : null;
  return {
    ruckWinPct: {
      label: `% ${ruckLabel} ganados`,
      value: formatPct(stats.rucks[bigua].wonPct),
      delta: `${stats.rucks[bigua].won}/${stats.rucks[bigua].total} ${ruckLabel.toLowerCase()}`,
      metric: '% Rucks ganados',
      state: 'positive',
    },
    penalties: {
      label: `${penalLabel} totales`,
      value: formatNumber(stats.discipline[bigua].penalties.total),
      delta: `${stats.discipline[bigua].penalties.attack} ataque / ${stats.discipline[bigua].penalties.defense} defensa`,
      metric: 'Penales totales',
      state: 'normal',
    },
    lineoutWinPct: {
      label: `% ${lineoutLabel} ganados`,
      value: formatPct(stats.setPieces.lineouts[bigua].wonPct),
      delta: `${stats.setPieces.lineouts[bigua].won}/${stats.setPieces.lineouts[bigua].total} ${lineoutLabel.toLowerCase()}`,
      metric: '% Line Outs ganados',
      state: 'positive',
    },
    scrumWinPct: {
      label: `% ${scrumLabel} ganados`,
      value: formatPct(stats.setPieces.scrums[bigua].wonPct),
      delta: `${stats.setPieces.scrums[bigua].won}/${stats.setPieces.scrums[bigua].total} ${scrumLabel.toLowerCase()}`,
      metric: '% Scrums ganados',
      state: 'positive',
    },
    breakLines: {
      label: breakLineLabel,
      value: formatNumber(stats.breakLines[bigua].total),
      delta: `Killer instinct ${formatPct(stats.breakLines[bigua].killerInstinctPct)}`,
      state: 'normal',
    },
    breakLinesConceded: {
      label: `${breakLineLabel} concedidas`,
      value: formatNumber(stats.breakLines[rival].total),
      delta: `${getTeamName(stats, rival)} generadas`,
      metric: 'Break Lines concedidas',
      state: 'normal',
    },
    turnovers: {
      label: turnoverLabel,
      value: formatNumber(stats.totals[bigua].turnovers),
      delta: `${getTeamName(stats, rival)} ${stats.totals[rival].turnovers}`,
      state: 'normal',
    },
    kicks: {
      label: kickLabel,
      value: formatNumber(stats.kicks[bigua].total),
      delta: `${stats.kicks[bigua].favorable} favorables`,
      state: 'normal',
    },
    kickEffectiveness: {
      label: `% ${kickLabel} efectivos`,
      value: formatPct(stats.kicks[bigua].favorablePct),
      delta: `${stats.kicks[bigua].favorable}/${stats.kicks[bigua].total} favorables`,
      state: 'normal',
    },
    possession: {
      label: 'Posesion',
      value: formatPct(stats.possession.percentages[bigua]),
      delta: stats.possession.source === 'intervals' ? 'Intervalos reales' : 'Estimado por eventos',
      state: 'normal',
    },
    territory: {
      label: 'Territorio',
      value: territory === null ? 'N/D' : formatPct(territory),
      delta: territory === null ? 'Sin zonas' : 'Eventos con zona',
      state: 'normal',
    },
    killerInstinct: {
      label: 'Killer Instinct',
      value: formatPct(stats.breakLines[bigua].killerInstinctPct),
      delta: `${stats.breakLines[bigua].byResult.try} tries tras break`,
      state: 'normal',
    },
    cards: {
      label: 'Tarjetas',
      value: formatNumber(totalCards),
      delta: `${stats.discipline[bigua].cards.amarilla} amarillas / ${stats.discipline[bigua].cards.roja} rojas`,
      state: totalCards > 0 ? 'alert' : 'normal',
    },
  };
}

/**
 * @returns {object}
 */
function getChartColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    local: styles.getPropertyValue('--color-brand-red').trim() || '#C8102E',
    localLight: 'rgba(200, 16, 46, 0.28)',
    rival: styles.getPropertyValue('--tag-ataque').trim() || '#3B82F6',
    rivalLight: 'rgba(59, 130, 246, 0.28)',
    positive: styles.getPropertyValue('--tag-ganado').trim() || '#1DB954',
    negative: styles.getPropertyValue('--tag-perdido').trim() || '#C8102E',
    warning: styles.getPropertyValue('--tag-sucio').trim() || '#F59E0B',
    defense: styles.getPropertyValue('--tag-defensa').trim() || '#8B5CF6',
    text: styles.getPropertyValue('--color-text-secondary').trim() || '#8A9BB0',
    border: styles.getPropertyValue('--color-border').trim() || 'rgba(255,255,255,0.06)',
    tooltipBg: styles.getPropertyValue('--color-bg-elevated').trim() || '#122035',
  };
}

/**
 * @param {object} colors
 */
function configureChartDefaults(colors) {
  if (!window.Chart) return;
  window.Chart.defaults.color = colors.text;
  window.Chart.defaults.borderColor = colors.border;
  window.Chart.defaults.font.family = 'Arial, sans-serif';
  window.Chart.defaults.font.size = 11;
  window.Chart.defaults.animation = { duration: 600, easing: 'easeOutQuart' };
  if (prefersReducedMotion()) window.Chart.defaults.animation = { duration: 120, easing: 'linear' };
  window.Chart.defaults.plugins.legend.labels.color = colors.text;
  window.Chart.defaults.plugins.tooltip.backgroundColor = colors.tooltipBg;
  window.Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.12)';
  window.Chart.defaults.plugins.tooltip.borderWidth = 1;
  window.Chart.defaults.plugins.tooltip.titleColor = '#F0F4F8';
  window.Chart.defaults.plugins.tooltip.bodyColor = '#8A9BB0';
  window.Chart.defaults.plugins.tooltip.padding = 12;
  window.Chart.defaults.plugins.tooltip.cornerRadius = 8;
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * @param {number} progress
 * @returns {number}
 */
function easeOutQuart(progress) {
  return 1 - Math.pow(1 - progress, 4);
}

/**
 * @param {HTMLElement} container
 */
function animateDashboardKpis(container) {
  if (prefersReducedMotion()) return;
  const values = Array.from(container.querySelectorAll('[data-count-up-value]'));
  values.forEach((valueEl) => {
    const target = Number(valueEl.dataset.countUpValue);
    if (!Number.isFinite(target)) return;
    const suffix = valueEl.dataset.countUpSuffix || '';
    const decimals = Number(valueEl.dataset.countUpDecimals || 0);
    const start = performance.now();
    const duration = 600;

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const nextValue = target * easeOutQuart(progress);
      valueEl.textContent = `${nextValue.toFixed(decimals)}${suffix}`;
      if (progress < 1) window.requestAnimationFrame(tick);
    };

    valueEl.textContent = `${(0).toFixed(decimals)}${suffix}`;
    window.requestAnimationFrame(tick);
  });
}

/**
 * @param {HTMLElement} container
 * @param {Array<object>} matches
 * @param {'dashboard'|'heatmap'} [targetRoute]
 */
function renderDashboardSelection(container, matches, targetRoute = 'dashboard') {
  setSidebarExpanded(false);
  const heatmapMode = targetRoute === 'heatmap';
  const selectionModuleLabel = heatmapMode ? 'Heatmap' : 'Dashboard';
  updateTopbarContext(heatmapMode ? 'Heatmap' : 'Dashboard');
  setTopbarActions([{ id: 'home', label: 'Inicio' }], () => navigate('home'));

  const items = getMatchSelectionItems(matches);
  container.innerHTML = `
    <section class="tagging-match-select-view dashboard-select-view view-enter">
      <header class="tagging-match-select-header">
        <span>${heatmapMode ? 'Heatmap' : 'Dashboard'}</span>
        <h1>${heatmapMode ? 'Elegir partido para ver heatmap' : 'Elegir partido para analizar'}</h1>
        <p>${matches.length === 0 ? 'Todavia no hay partidos para analizar. Crea uno desde Inicio.' : heatmapMode ? 'Selecciona un partido con zonas taggeadas para abrir el heatmap.' : 'Selecciona un partido con eventos taggeados para abrir el tablero.'}</p>
      </header>
      <div class="tagging-match-select-grid" aria-label="Partidos disponibles para ${heatmapMode ? 'heatmap' : 'dashboard'}">
        ${items.length === 0 ? `
          <button class="tagging-match-card" type="button" data-dashboard-home aria-label="Crear primer partido">
            <span class="tagging-match-card-kicker">Sin partidos</span>
            <strong class="tagging-match-card-title">Crear primer partido</strong>
            <span class="tagging-match-card-video">Inicio abre el modal de Nuevo partido</span>
            <span class="tagging-match-card-footer">
              <span>Inicio</span>
              <span class="tabular-nums">0 - 0</span>
            </span>
          </button>
        ` : items.map(item => `
          <article class="tagging-match-card" data-dashboard-match-card-id="${escapeHtml(item.id)}" role="button" tabindex="0" aria-label="${escapeHtml(item.title)}">
            <button class="tagging-match-edit-button" type="button" data-dashboard-edit-match-id="${escapeHtml(item.id)}" aria-label="Editar partido ${escapeHtml(item.title)}" title="Editar partido">
              ${MATCH_EDIT_ICON}
            </button>
            <span class="tagging-match-card-kicker">${escapeHtml(selectionModuleLabel)}</span>
            <strong class="tagging-match-card-title">${escapeHtml(item.title)}</strong>
            <span class="tagging-match-card-video">${escapeHtml(item.videoLabel)}</span>
            <span class="tagging-match-card-footer">
              <span>${escapeHtml(item.dateLabel)}</span>
              <span class="tabular-nums">${escapeHtml(item.scoreLabel)}</span>
            </span>
            <span class="tagging-match-card-actions">
              <button class="btn btn-primary btn-sm" type="button" data-dashboard-match-id="${escapeHtml(item.id)}" aria-label="${heatmapMode ? 'Ver heatmap de' : 'Analizar'} ${escapeHtml(item.title)}">${heatmapMode ? 'Ver heatmap' : 'Analizar'}</button>
            </span>
          </article>
        `).join('')}
      </div>
    </section>
  `;

  container.querySelector('[data-dashboard-home]')?.addEventListener('click', () => navigate('home'));
  container.querySelectorAll('[data-dashboard-match-id]').forEach(button => {
    button.addEventListener('click', () => navigate(targetRoute, { matchId: button.dataset.dashboardMatchId }));
  });
  container.querySelectorAll('[data-dashboard-match-card-id]').forEach((card) => {
    const primaryAction = card.querySelector('[data-dashboard-match-id]');
    const openSelectedMatch = () => {
      primaryAction?.click();
    };
    card.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('button')) return;
      openSelectedMatch();
    });
    card.addEventListener('keydown', (event) => {
      if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      openSelectedMatch();
    });
  });
  container.querySelectorAll('[data-dashboard-edit-match-id]').forEach(button => {
    button.addEventListener('click', () => {
      const matchToEdit = matches.find(match => String(match.id) === String(button.dataset.dashboardEditMatchId));
      if (!matchToEdit) return;
      openEditMatchModal(matchToEdit, async () => {
        const updatedMatches = await cloudMatchService.listMatches();
        renderDashboardSelection(container, updatedMatches, targetRoute);
      });
    });
  });
}

/**
 * @param {object} stats
 * @param {object} match
 * @returns {'victoria'|'derrota'|'empate'}
 */
function getResultBadge(stats, match) {
  const score = getDashboardScore(stats, match);
  const biguaScore = stats.teams.biguaTeam === 'away' ? score.away : score.home;
  const rivalScore = stats.teams.rivalTeam === 'away' ? score.away : score.home;
  if (biguaScore > rivalScore) return 'victoria';
  if (biguaScore < rivalScore) return 'derrota';
  return 'empate';
}

/**
 * @param {number|string|null|undefined} value
 * @returns {number}
 */
function scoreNumber(value) {
  return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
}

/**
 * @param {object} stats
 * @param {object} match
 * @returns {{home: number, away: number}}
 */
function getDashboardScore(stats, match) {
  const statsScore = {
    home: scoreNumber(stats?.score?.home?.total),
    away: scoreNumber(stats?.score?.away?.total),
  };
  if (statsScore.home > 0 || statsScore.away > 0) return statsScore;

  const nestedScore = {
    home: scoreNumber(match?.score?.local ?? match?.score?.home),
    away: scoreNumber(match?.score?.rival ?? match?.score?.away),
  };
  if (nestedScore.home > 0 || nestedScore.away > 0 || ['win', 'loss', 'draw'].includes(match?.score?.resultForBigua)) return nestedScore;

  const directScore = {
    home: scoreNumber(match?.homeScore),
    away: scoreNumber(match?.awayScore),
  };
  if (directScore.home > 0 || directScore.away > 0) return directScore;

  const overrideScore = {
    home: scoreNumber(match?.scoreOverride?.homeScore),
    away: scoreNumber(match?.scoreOverride?.awayScore),
  };
  if (overrideScore.home > 0 || overrideScore.away > 0) return overrideScore;

  return {
    home: 0,
    away: 0,
  };
}

/**
 * @param {string|null|undefined} source
 * @returns {string}
 */
function getScoreSourceLabel(source) {
  if (source === 'events-manual') return 'Eventos + ajuste manual';
  if (source === 'manual') return 'Eventos + ajuste manual';
  if (source === 'legacy-manual') return 'Score manual legacy';
  return '';
}

/**
 * @param {string} text
 * @returns {string}
 */
function inlineMarkdownToHtml(text) {
  return escapeHtml(text)
    .replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, '<u>$1</u>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

/**
 * @param {string} text
 * @returns {string}
 */
function markdownToNoteHtml(text) {
  if (!String(text || '').trim()) return '';
  const lines = String(text || '').split('\n');
  const blocks = [];
  let listItems = [];
  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(`<ul><li>${listItems.map(inlineMarkdownToHtml).join('</li><li>')}</li></ul>`);
    listItems = [];
  };

  lines.forEach((line) => {
    if (line.startsWith('- ')) {
      listItems.push(line.slice(2));
      return;
    }
    flushList();
    blocks.push(line.trim() ? `<p>${inlineMarkdownToHtml(line)}</p>` : '<p><br></p>');
  });
  flushList();
  return blocks.join('') || '<p><br></p>';
}

/**
 * @param {string} text
 * @returns {string}
 */
function markdownToPrintHtml(text) {
  if (!String(text || '').trim()) return '';
  return markdownToNoteHtml(text);
}

/**
 * @param {Node} node
 * @returns {string}
 */
function nodeToInlineMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replaceAll(ZERO_WIDTH_FORMAT_MARKER, '');
  if (!(node instanceof HTMLElement)) return '';
  const content = Array.from(node.childNodes).map(nodeToInlineMarkdown).join('');
  const tag = node.tagName.toLowerCase();
  if (tag === 'strong' || tag === 'b') return `**${content}**`;
  if (tag === 'em' || tag === 'i') return `*${content}*`;
  if (tag === 'u') return `<u>${content}</u>`;
  if (tag === 'br') return '\n';
  return content;
}

/**
 * @param {HTMLElement} editor
 * @returns {string}
 */
function serializeCoachNotes(editor) {
  const lines = [];
  const appendBlock = (element) => {
    const tag = element.tagName.toLowerCase();
    if (tag === 'ul') {
      element.querySelectorAll(':scope > li').forEach((item) => {
        const content = nodeToInlineMarkdown(item).trim();
        if (content) lines.push(`- ${content}`);
      });
      return;
    }
    const content = nodeToInlineMarkdown(element).trim();
    if (content) lines.push(content);
  };

  Array.from(editor.children).forEach((child) => {
    if (child instanceof HTMLElement) appendBlock(child);
  });
  if (lines.length === 0) {
    const content = nodeToInlineMarkdown(editor).trim();
    if (content) lines.push(content);
  }
  return lines.join('\n');
}

/**
 * @param {HTMLElement} element
 */
function placeCaretAtEnd(element) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * @param {Node|null} node
 * @param {HTMLElement} root
 * @returns {HTMLElement}
 */
function getEditableBlock(node, root) {
  let current = node instanceof HTMLElement ? node : node?.parentElement;
  while (current && current !== root) {
    if (['P', 'DIV', 'LI'].includes(current.tagName)) return current;
    current = current.parentElement;
  }
  return root;
}

/**
 * @param {HTMLElement} editor
 */
function maybeConvertMarkdownList(editor) {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) return;
  const block = getEditableBlock(selection.anchorNode, editor);
  if (block.tagName === 'LI') return;
  const text = (block.textContent || '').replaceAll(ZERO_WIDTH_FORMAT_MARKER, '');
  if (!/^\s*-[\s\u00A0]/.test(text)) return;

  if (block === editor) {
    editor.innerHTML = `<ul><li>${escapeHtml(text.replace(/^\s*-[\s\u00A0]/, ''))}</li></ul>`;
    const item = editor.querySelector('li');
    if (item) placeCaretAtEnd(item);
    return;
  }

  block.textContent = text.replace(/^\s*-[\s\u00A0]/, '');
  placeCaretAtEnd(block);
  document.execCommand('insertUnorderedList', false, null);
}

/**
 * @param {HTMLElement} editor
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function handleMarkdownListShortcut(editor, event) {
  if (!(event.key === ' ' || event.code === 'Space') || event.ctrlKey || event.metaKey || event.altKey) return false;
  const selection = window.getSelection();
  if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) return false;
  const block = getEditableBlock(selection.anchorNode, editor);
  if (block.tagName === 'LI') return false;
  if ((block.textContent || '').replaceAll(ZERO_WIDTH_FORMAT_MARKER, '').trim() !== '-') return false;

  event.preventDefault();
  if (block === editor) {
    editor.innerHTML = '<ul><li><br></li></ul>';
    const item = editor.querySelector('li');
    if (item) placeCaretAtEnd(item);
    return true;
  }

  const list = document.createElement('ul');
  list.innerHTML = '<li><br></li>';
  block.replaceWith(list);
  const item = list.querySelector('li');
  if (item) placeCaretAtEnd(item);
  return true;
}

/**
 * @returns {{bold: boolean, italic: boolean, underline: boolean}}
 */
function createEmptyNoteFormats() {
  return {
    bold: false,
    italic: false,
    underline: false,
  };
}

/**
 * @param {object|null|undefined} formats
 * @returns {{bold: boolean, italic: boolean, underline: boolean}}
 */
function normalizeNoteFormats(formats) {
  return {
    bold: Boolean(formats?.bold),
    italic: Boolean(formats?.italic),
    underline: Boolean(formats?.underline),
  };
}

/**
 * @param {object|null|undefined} formats
 * @returns {boolean}
 */
function hasActiveNoteFormat(formats) {
  const normalized = normalizeNoteFormats(formats);
  return normalized.bold || normalized.italic || normalized.underline;
}

/**
 * @param {HTMLElement} container
 * @param {object|null} noteFormats
 */
function updateNoteToolbarState(container, noteFormats = null) {
  container.querySelectorAll('[data-note-command]').forEach((button) => {
    const command = button.dataset.noteCommand;
    const active = Boolean(command && (noteFormats ? noteFormats[command] : document.queryCommandState(command)));
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

/**
 * @param {string} command
 * @returns {string}
 */
function getFormatSelector(command) {
  if (command === 'bold') return 'strong,b';
  if (command === 'italic') return 'em,i';
  if (command === 'underline') return 'u';
  return '';
}

/**
 * @param {HTMLElement} editor
 * @returns {boolean}
 */
function canSyncNoteFormatsFromSelection(editor) {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) return false;
  if (!selection.isCollapsed) return true;
  const anchorElement = selection.anchorNode instanceof HTMLElement
    ? selection.anchorNode
    : selection.anchorNode.parentElement;
  return Boolean(anchorElement?.closest('strong,b,em,i,u'));
}

/**
 * @param {HTMLElement} editor
 * @returns {{bold: boolean, italic: boolean, underline: boolean}}
 */
function getNoteFormatsAtSelection(editor) {
  const selection = window.getSelection();
  const anchorElement = selection?.anchorNode instanceof HTMLElement
    ? selection.anchorNode
    : selection?.anchorNode?.parentElement;
  const containsAnchor = Boolean(anchorElement && editor.contains(anchorElement));
  return {
    bold: Boolean((containsAnchor && anchorElement.closest('strong,b')) || document.queryCommandState('bold')),
    italic: Boolean((containsAnchor && anchorElement.closest('em,i')) || document.queryCommandState('italic')),
    underline: Boolean((containsAnchor && anchorElement.closest('u')) || document.queryCommandState('underline')),
  };
}

/**
 * @param {string} text
 * @param {object} noteFormats
 * @returns {Node}
 */
function createFormattedTextNode(text, noteFormats) {
  let node = document.createTextNode(text);
  if (noteFormats.underline) {
    const wrapper = document.createElement('u');
    wrapper.append(node);
    node = wrapper;
  }
  if (noteFormats.italic) {
    const wrapper = document.createElement('em');
    wrapper.append(node);
    node = wrapper;
  }
  if (noteFormats.bold) {
    const wrapper = document.createElement('strong');
    wrapper.append(node);
    node = wrapper;
  }
  return node;
}

/**
 * @param {Node} first
 * @param {Node|null} second
 * @returns {boolean}
 */
function canMergeInlineNodes(first, second) {
  if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) return false;
  const mergeableTags = new Set(['STRONG', 'B', 'EM', 'I', 'U']);
  return first.tagName === second.tagName && mergeableTags.has(first.tagName);
}

/**
 * @param {HTMLElement} root
 */
function mergeAdjacentInlineFormatting(root) {
  let node = root.firstChild;
  while (node) {
    if (node instanceof HTMLElement) mergeAdjacentInlineFormatting(node);
    const next = node.nextSibling;
    if (canMergeInlineNodes(node, next)) {
      while (next.firstChild) node.append(next.firstChild);
      next.remove();
      if (node instanceof HTMLElement) mergeAdjacentInlineFormatting(node);
      continue;
    }
    node = next;
  }
  root.normalize();
}

/**
 * @param {HTMLElement} editor
 * @param {string} text
 * @param {object} noteFormats
 */
function insertFormattedText(editor, text, noteFormats) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.anchorNode || !editor.contains(selection.anchorNode)) {
    placeCaretAtEnd(editor);
  }
  const activeSelection = window.getSelection();
  if (!activeSelection?.rangeCount) return;

  const range = activeSelection.getRangeAt(0);
  range.deleteContents();
  const insertedNode = createFormattedTextNode(text, noteFormats);
  range.insertNode(insertedNode);

  const nextRange = document.createRange();
  if (insertedNode.parentNode) {
    nextRange.setStartAfter(insertedNode);
    nextRange.collapse(true);
    activeSelection.removeAllRanges();
    activeSelection.addRange(nextRange);
  }
  mergeAdjacentInlineFormatting(editor);
}

/**
 * @param {HTMLElement} editor
 * @param {InputEvent} event
 * @param {object} noteFormats
 * @returns {boolean}
 */
function handleFormattedTextInput(editor, event, noteFormats) {
  if (!hasActiveNoteFormat(noteFormats)) return false;
  if (event.inputType !== 'insertText' || typeof event.data !== 'string' || event.data.length === 0) return false;
  event.preventDefault();
  insertFormattedText(editor, event.data, noteFormats);
  return true;
}

/**
 * @param {Range} range
 * @param {HTMLElement} element
 * @param {'start'|'end'} boundary
 * @returns {boolean}
 */
function rangeIsAtElementBoundary(range, element, boundary) {
  const comparisonRange = document.createRange();
  if (boundary === 'start') {
    comparisonRange.setStart(element, 0);
    comparisonRange.setEnd(range.startContainer, range.startOffset);
  } else {
    comparisonRange.selectNodeContents(element);
    comparisonRange.setStart(range.startContainer, range.startOffset);
  }
  return comparisonRange.toString().replaceAll(ZERO_WIDTH_FORMAT_MARKER, '').trim() === '';
}

/**
 * @param {string} command
 * @param {HTMLElement} editor
 * @returns {boolean}
 */
function moveCaretOutsideActiveFormat(command, editor) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !selection.anchorNode || !editor.contains(selection.anchorNode)) return false;
  const selector = getFormatSelector(command);
  const anchorElement = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode.parentElement;
  const formatElement = selector ? anchorElement?.closest(selector) : null;
  if (!formatElement || !editor.contains(formatElement)) return false;

  const range = selection.getRangeAt(0);
  const marker = document.createTextNode(ZERO_WIDTH_FORMAT_MARKER);
  if (rangeIsAtElementBoundary(range, formatElement, 'start')) {
    formatElement.before(marker);
  } else if (rangeIsAtElementBoundary(range, formatElement, 'end')) {
    formatElement.after(marker);
  } else {
    return false;
  }

  const nextRange = document.createRange();
  nextRange.setStartAfter(marker);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  return true;
}

/**
 * @param {HTMLElement} editor
 * @returns {Range|null}
 */
function getCurrentNoteSelection(editor) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.anchorNode || !editor.contains(selection.anchorNode)) return null;
  return selection.getRangeAt(0).cloneRange();
}

/**
 * @param {Range|null} range
 */
function restoreNoteSelection(range) {
  if (!range) return;
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * @param {string} command
 * @param {HTMLElement|null} editor
 * @param {Range|null} range
 * @param {object|null} noteFormats
 */
function toggleNoteCommand(command, editor = null, range = null, noteFormats = null) {
  editor?.focus();
  restoreNoteSelection(range);
  if (!NOTE_FORMAT_COMMANDS.includes(command)) return;

  const selection = window.getSelection();
  const hasSelection = Boolean(
    editor
    && selection?.rangeCount
    && !selection.getRangeAt(0).collapsed
    && selection.anchorNode
    && editor.contains(selection.anchorNode)
  );

  if (hasSelection) {
    document.execCommand(command, false, null);
    if (editor && noteFormats) Object.assign(noteFormats, getNoteFormatsAtSelection(editor));
    return;
  }

  if (noteFormats) {
    noteFormats[command] = !noteFormats[command];
    if (editor && !noteFormats[command]) moveCaretOutsideActiveFormat(command, editor);
    return;
  }

  document.execCommand(command, false, null);
}

/**
 * @param {Array<string>} values
 * @param {Array<string>} fallback
 * @returns {Array<string>}
 */
function normalizeIdList(values, fallback) {
  const valid = new Set([...DEFAULT_SECTION_IDS, ...Object.keys(DASHBOARD_TEMPLATES), ...KPI_IDS]);
  const normalized = Array.isArray(values) ? values.filter(id => valid.has(id)) : [];
  return normalized.length > 0 ? [...new Set(normalized)] : [...fallback];
}

/**
 * @param {object} preferences
 * @returns {object}
 */
function normalizeDashboardPreferences(preferences = {}) {
  const selectedKpis = normalizeIdList(preferences.selectedKpis, DEFAULT_DASHBOARD_PREFERENCES.selectedKpis).slice(0, 4);
  while (selectedKpis.length < 4) {
    selectedKpis.push(DEFAULT_DASHBOARD_PREFERENCES.selectedKpis[selectedKpis.length]);
  }
  const baseSectionOrder = normalizeIdList(preferences.sectionOrder, DEFAULT_SECTION_IDS);
  const sectionOrder = baseSectionOrder.concat(DEFAULT_SECTION_IDS.filter(id => !baseSectionOrder.includes(id)));
  const visibleSections = normalizeIdList(preferences.visibleSections, DEFAULT_SECTION_IDS)
    .filter(id => sectionOrder.includes(id));
  const pdfTemplate = PDF_TEMPLATES.some(template => template.id === preferences.pdfTemplate)
    ? preferences.pdfTemplate
    : DEFAULT_DASHBOARD_PREFERENCES.pdfTemplate;
  const template = DASHBOARD_TEMPLATES[preferences.template] ? preferences.template : DEFAULT_DASHBOARD_PREFERENCES.template;
  const rawZone = preferences.filters?.zone || 'all';
  const zone = rawZone === 'all' ? 'all' : normalizeFieldZone(rawZone)?.id || 'all';
  return {
    template,
    pdfTemplate,
    selectedKpis,
    sectionOrder,
    visibleSections,
    filters: {
      team: ['bigua', 'rival', 'compare', 'all'].includes(preferences.filters?.team) ? preferences.filters.team : 'bigua',
      timeBand: TIME_FILTERS.some(filter => filter.id === preferences.filters?.timeBand) ? preferences.filters.timeBand : 'all',
      zone,
    },
  };
}

/**
 * @param {object} preferences
 * @returns {Array<string>}
 */
function getVisibleSections(preferences) {
  const normalized = normalizeDashboardPreferences(preferences);
  return normalized.sectionOrder.filter(id => normalized.visibleSections.includes(id));
}

/**
 * @param {object} preferences
 * @param {string} templateId
 * @returns {object}
 */
function applyDashboardTemplate(preferences, templateId) {
  const template = DASHBOARD_TEMPLATES[templateId] || DASHBOARD_TEMPLATES.general;
  return normalizeDashboardPreferences({
    ...preferences,
    template: DASHBOARD_TEMPLATES[templateId] ? templateId : 'general',
    selectedKpis: template.selectedKpis,
    visibleSections: template.visibleSections,
  });
}

/**
 * @param {object} match
 * @returns {Array<string>}
 */
function getZoneOptions(match) {
  const sectors = new Set();
  const legacy = new Map();
  (match.events || []).forEach((event) => {
    const zone = normalizeFieldZone(event);
    if (!zone) return;
    if (FOUR_SECTOR_FIELD_ZONES.some(sector => sector.id === zone.id)) {
      sectors.add(zone.id);
      return;
    }
    legacy.set(zone.id, zone.label);
  });
  return [
    ...FOUR_SECTOR_FIELD_ZONES
      .filter(zone => sectors.has(zone.id))
      .map(zone => ({ id: zone.id, label: zone.label })),
    ...Array.from(legacy.entries()).map(([id, label]) => ({ id, label })),
  ];
}

/**
 * @param {Array<{id: string, label: string}>} options
 * @param {string} selected
 * @returns {string}
 */
function renderOptions(options, selected) {
  return options.map(option => `
    <option value="${escapeHtml(option.id)}"${option.id === selected ? ' selected' : ''}>${escapeHtml(option.label)}</option>
  `).join('');
}

/**
 * @param {Array<object>} templates
 * @param {string} selected
 * @returns {string}
 */
function renderPdfTemplateExportOptions(templates = [], selected = 'system-default') {
  const source = templates.length > 0
    ? templates
    : [{ id: 'system-default', name: 'Default BiguAnalytics', isDefault: true }];
  return source.map(template => `
    <option value="${escapeHtml(template.id)}"${template.id === selected ? ' selected' : ''}${template.corrupt || template.invalid ? ' disabled' : ''}>
      ${escapeHtml(template.name || template.id)}${template.isDefault ? ' (default)' : ''}
    </option>
  `).join('');
}

/**
 * @param {object} api
 * @returns {Promise<Array<object>>}
 */
export async function loadPdfTemplatesForExport(api = window.api) {
  try {
    const templates = await api?.pdfTemplates?.list?.();
    return Array.isArray(templates) && templates.length > 0 ? templates : [SYSTEM_DEFAULT_PDF_TEMPLATE];
  } catch {
    return [SYSTEM_DEFAULT_PDF_TEMPLATE];
  }
}

/**
 * @param {Array<object>} templates
 * @returns {string}
 */
export function getDefaultExportTemplateId(templates = []) {
  return templates.find(template => template.isDefault && !template.corrupt && !template.invalid)?.id || SYSTEM_DEFAULT_PDF_TEMPLATE.id;
}

/**
 * @param {object} stats
 * @param {object} match
 * @param {object} preferences
 * @param {boolean} customizerOpen
 * @param {Array<object>} exportTemplates
 * @param {string} exportTemplateId
 * @returns {string}
 */
function buildDashboardControls(stats, match, preferences, customizerOpen, exportTemplates = [], exportTemplateId = 'system-default', taggingLabels = {}) {
  const normalized = normalizeDashboardPreferences(preferences);
  const zones = getZoneOptions(match);
  const kpiDefinitions = KPI_DEFINITIONS(stats, taggingLabels);
  const sectionLabels = getDashboardSectionLabels(taggingLabels);
  const kpiOptions = KPI_IDS.map(id => ({ id, label: kpiDefinitions[id]?.label || id }));
  return `
    <div class="dashboard-controls">
      <label class="dashboard-control">
        <span>Plantilla</span>
        <select data-dashboard-template>
          ${renderOptions(Object.entries(DASHBOARD_TEMPLATES).map(([id, template]) => ({ id, label: template.label })), normalized.template)}
        </select>
      </label>
      <label class="dashboard-control">
        <span>Periodo</span>
        <select data-filter-time>
          ${renderOptions(TIME_FILTERS, normalized.filters.timeBand)}
        </select>
      </label>
      <label class="dashboard-control">
        <span>Zona</span>
        <select data-filter-zone>
          ${renderOptions([{ id: 'all', label: 'Todas' }, ...zones], normalized.filters.zone)}
        </select>
      </label>
      <label class="dashboard-control">
        <span>PDF</span>
        <select data-pdf-template>
          ${renderOptions(PDF_TEMPLATES, normalized.pdfTemplate)}
        </select>
      </label>
      <label class="dashboard-control">
        <span>Plantilla PDF</span>
        <select data-export-template-id>
          ${renderPdfTemplateExportOptions(exportTemplates, exportTemplateId)}
        </select>
      </label>
      <button class="dashboard-customize-btn" type="button" data-manage-pdf-templates>Plantillas PDF</button>
      <button class="dashboard-customize-btn" type="button" data-customizer-toggle>${customizerOpen ? 'Cerrar personalizacion' : 'Personalizar'}</button>
    </div>

    <div class="dashboard-customizer" ${customizerOpen ? '' : 'hidden'}>
      <section>
        <h2>KPIs principales</h2>
        <div class="dashboard-kpi-picker">
          ${normalized.selectedKpis.map((selectedKpi, index) => `
            <label class="dashboard-control">
              <span>KPI ${index + 1}</span>
              <select data-kpi-slot="${index}">
                ${renderOptions(kpiOptions, selectedKpi)}
              </select>
            </label>
          `).join('')}
        </div>
      </section>
      <section>
        <h2>Secciones</h2>
        <div class="dashboard-section-picker">
          ${normalized.sectionOrder.map((sectionId, index) => `
            <div class="dashboard-section-picker-row">
              <label>
                <input type="checkbox" data-section-visible="${sectionId}" ${normalized.visibleSections.includes(sectionId) ? 'checked' : ''}>
                <span>${escapeHtml(sectionLabels[sectionId] || sectionId)}</span>
              </label>
              <div>
                <button type="button" data-section-up="${sectionId}" ${index === 0 ? 'disabled' : ''}>Subir</button>
                <button type="button" data-section-down="${sectionId}" ${index === normalized.sectionOrder.length - 1 ? 'disabled' : ''}>Bajar</button>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    </div>
  `;
}

/**
 * @param {object} stats
 * @param {Array<string>} selectedKpis
 * @returns {Array<object>}
 */
function buildKpis(stats, selectedKpis = DEFAULT_DASHBOARD_PREFERENCES.selectedKpis, taggingLabels = {}) {
  const definitions = KPI_DEFINITIONS(stats, taggingLabels);
  const hasAlert = (metric) => metric && stats.alerts.some(alert => alert.equipo === stats.teams.biguaName && alert.metrica === metric);
  return normalizeIdList(selectedKpis, DEFAULT_DASHBOARD_PREFERENCES.selectedKpis)
    .slice(0, 4)
    .map((id) => {
      const definition = definitions[id] || definitions.ruckWinPct;
      return {
        label: definition.label,
        value: definition.value,
        delta: definition.delta,
        state: hasAlert(definition.metric) ? 'alert' : definition.state,
        size: 'large',
      };
    });
}

const AI_SECTION_EMPTY_TEXT = 'No hay datos suficientes para esta sección.';

/**
 * @param {unknown} value
 * @returns {string}
 */
function cleanAIText(value) {
  return String(value || '').trim();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeAITextKey(value) {
  return cleanAIText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * @param {unknown} value
 * @returns {Array<object>}
 */
function filterAIItemsForDisplay(value) {
  const genericTitles = new Set(['hallazgo', 'sin titulo', 'area']);
  return (Array.isArray(value) ? value : [])
    .map((item) => {
      const source = item && typeof item === 'object' ? item : {};
      const drills = Array.isArray(source.drills) ? source.drills.map(cleanAIText).filter(Boolean) : [];
      return {
        title: cleanAIText(source.title || source.area || source.objective),
        detail: cleanAIText(source.detail || source.reason || source.objective || drills.join(' ')),
        metricRef: cleanAIText(source.metricRef || source.metric || source.metric_ref) || null,
        priority: cleanAIText(source.priority || 'medium'),
      };
    })
    .filter(item => item.title && item.detail && !genericTitles.has(normalizeAITextKey(item.title)));
}

/**
 * @param {unknown} value
 * @returns {Array<{title: string, detail: string}>}
 */
function filterAIWarningsForDisplay(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => {
      const source = item && typeof item === 'object' ? item : {};
      return {
        title: cleanAIText(source.title || 'Limitacion de datos'),
        detail: cleanAIText(source.detail || source.description || source.interpretation || item),
      };
    })
    .filter(item => item.title && item.detail);
}

/**
 * @param {object|null|undefined} result
 * @returns {object}
 */
function normalizeAIAnalysisResultForDisplay(result = {}) {
  const source = result || {};
  return {
    summary: cleanAIText(source.summary),
    scoreContext: source.scoreContext || null,
    keyFindings: filterAIItemsForDisplay(source.keyFindings || source.key_findings),
    strengths: filterAIItemsForDisplay(source.strengths),
    weaknesses: filterAIItemsForDisplay(source.weaknesses),
    trainingRecommendations: filterAIItemsForDisplay(source.trainingRecommendations || source.training_recommendations),
    dataQualityWarnings: filterAIWarningsForDisplay(source.dataQualityWarnings || source.data_quality_warnings || source.missing_data),
    confidence: Number.isFinite(Number(source.confidence)) ? Math.max(0, Math.min(1, Number(source.confidence))) : 0,
  };
}

/**
 * @param {object|null|undefined} scoreContext
 * @returns {string}
 */
function getBiguaResultLabel(scoreContext) {
  if (scoreContext?.resultForBigua === 'win') return 'Ganó';
  if (scoreContext?.resultForBigua === 'loss') return 'Perdió';
  if (scoreContext?.resultForBigua === 'draw') return 'Empató';
  return 'Sin dato';
}

/**
 * @param {object|null|undefined} scoreContext
 * @returns {string}
 */
function renderAIScoreContext(scoreContext) {
  if (!scoreContext) return '';
  return `
    <div class="dashboard-ai-score-context" aria-label="Marcador IA validado">
      <span>Marcador <strong>${escapeHtml(scoreContext.scoreLabel || '')}</strong></span>
      <span>Resultado Bigua <strong>${escapeHtml(getBiguaResultLabel(scoreContext))}</strong></span>
    </div>
  `;
}

/**
 * @param {Array<object>} warnings
 * @returns {string}
 */
function renderAIDataQualityWarnings(warnings) {
  const rows = Array.isArray(warnings) ? warnings : [];
  if (rows.length === 0) return '';
  return `
    <section class="dashboard-ai-warning dashboard-ai-data-quality">
      <strong>Advertencias de calidad de datos</strong>
      ${rows.map(warning => `<p><b>${escapeHtml(warning.title)}</b>: ${escapeHtml(warning.detail)}</p>`).join('')}
    </section>
  `;
}

/**
 * @param {Array<object>} items
 * @param {string} title
 * @param {string} emptyText
 * @returns {string}
 */
function renderAIEvidenceList(items, title, emptyText = AI_SECTION_EMPTY_TEXT) {
  const rows = filterAIItemsForDisplay(items);
  return `
    <section class="dashboard-ai-block">
      <h3>${escapeHtml(title)}</h3>
      ${rows.length > 0 ? `
        <div class="dashboard-ai-list">
          ${rows.map(item => `
            <article>
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.detail)}</p>
              ${Array.isArray(item.evidence) && item.evidence.length > 0 ? `
                <ul class="dashboard-ai-evidence">
                  ${item.evidence.map(evidence => `<li>${escapeHtml(evidence)}</li>`).join('')}
                </ul>
              ` : ''}
            </article>
          `).join('')}
        </div>
      ` : `<p class="dashboard-ai-muted">${escapeHtml(emptyText)}</p>`}
    </section>
  `;
}

/**
 * @param {Array<object>} items
 * @returns {string}
 */
function renderAIRecommendations(items) {
  const rows = filterAIItemsForDisplay(items);
  return `
    <section class="dashboard-ai-block dashboard-ai-wide">
      <h3>Recomendaciones de entrenamiento</h3>
      ${rows.length > 0 ? `
        <div class="dashboard-ai-recommendations">
          ${rows.map(item => `
            <article>
              <span class="dashboard-ai-priority ${escapeHtml(item.priority || 'medium')}">${escapeHtml(item.priority || 'medium')}</span>
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.detail)}</p>
              ${Array.isArray(item.drills) && item.drills.length > 0 ? `
                <ul>
                  ${item.drills.map(drill => `<li>${escapeHtml(drill)}</li>`).join('')}
                </ul>
              ` : ''}
            </article>
          `).join('')}
        </div>
      ` : `<p class="dashboard-ai-muted">${escapeHtml(AI_SECTION_EMPTY_TEXT)}</p>`}
    </section>
  `;
}

/**
 * @param {object|null|undefined} aiState
 * @returns {object|null}
 */
function getAIAnalysisEntry(aiState) {
  return aiState?.analysis || (aiState?.result ? aiState : null);
}

/**
 * @param {object|null|undefined} aiState
 * @param {boolean} aiLoading
 * @param {boolean} collapsed
 * @returns {string}
 */
function buildAIAnalysisPanel(aiState = {}, aiLoading = false, collapsed = false) {
  const status = aiLoading ? 'loading' : (aiState?.status || 'missing');
  const analysis = getAIAnalysisEntry(aiState);
  const result = analysis?.result || aiState?.result || null;
  const displayResult = normalizeAIAnalysisResultForDisplay(result);
  const generatedAt = analysis?.generatedAt || aiState?.generatedAt || '';
  const model = analysis?.model || aiState?.model || '';
  const staleWarning = 'Los hitos, eventos, notas, metadatos o métricas cambiaron desde el último análisis.';
  const badgeLabel = {
    loading: 'Analizando',
    valid: 'Análisis guardado',
    stale: 'Desactualizado',
    error: 'Error',
    missing: 'Pendiente',
  }[status] || 'Pendiente';

  return `
    <section class="dashboard-ai-panel${collapsed ? ' collapsed' : ''}" data-ai-panel data-tour-id="ai-panel" data-ai-status="${escapeHtml(status)}">
      <header class="dashboard-ai-header">
        <div>
          <span>Análisis IA</span>
          <h2>Lectura post-partido</h2>
        </div>
        <div class="dashboard-panel-header-actions">
          <strong class="dashboard-ai-badge ${escapeHtml(status)}">${escapeHtml(badgeLabel)}</strong>
          <button class="dashboard-panel-toggle" type="button" data-ai-panel-toggle aria-expanded="${collapsed ? 'false' : 'true'}">
            ${collapsed ? 'Expandir' : 'Contraer'}
          </button>
        </div>
      </header>

      <div class="dashboard-ai-panel-body">
      ${status === 'loading' ? `
        <div class="dashboard-ai-empty">
          <strong>Analizando datos del partido...</strong>
          <p>Se está usando el contexto estructurado local. No cierres el dashboard hasta que termine.</p>
        </div>
      ` : ''}

      ${status === 'missing' ? `
        <div class="dashboard-ai-empty">
          <strong>Todavía no se generó un análisis para este partido.</strong>
          <p>El botón consulta el backend IA sólo cuando no existe un análisis guardado válido.</p>
        </div>
      ` : ''}

      ${status === 'error' ? `
        <div class="dashboard-ai-empty dashboard-ai-warning">
          <strong>No se pudo generar el análisis IA.</strong>
          <p>${escapeHtml(aiState?.error || 'Revisá la configuración de IA e intentá nuevamente.')}</p>
        </div>
      ` : ''}

      ${status === 'stale' ? `
        <div class="dashboard-ai-warning">
          <strong>Desactualizado</strong>
          <p>${staleWarning}</p>
        </div>
      ` : ''}

      ${result ? `
        <div class="dashboard-ai-summary">
          <p>${escapeHtml(displayResult.summary || 'Sin resumen disponible.')}</p>
          ${renderAIScoreContext(displayResult.scoreContext)}
        </div>
        <div class="dashboard-ai-grid">
          ${renderAIEvidenceList(displayResult.keyFindings, 'Hallazgos clave')}
          ${renderAIEvidenceList(displayResult.strengths, 'Fortalezas')}
          ${renderAIEvidenceList(displayResult.weaknesses, 'Debilidades')}
          ${renderAIRecommendations(displayResult.trainingRecommendations)}
        </div>
        ${renderAIDataQualityWarnings(displayResult.dataQualityWarnings)}
        <footer class="dashboard-ai-meta">
          ${generatedAt ? `<span>Generado ${escapeHtml(new Date(generatedAt).toLocaleString())}</span>` : ''}
          ${model ? `<span>Modelo ${escapeHtml(model)}</span>` : ''}
          <span>Confianza ${formatPct(displayResult.confidence * 100)}</span>
        </footer>
      ` : ''}
      </div>

      <div class="dashboard-ai-actions">
        <button class="dashboard-ai-button primary" type="button" data-ai-generate ${aiLoading ? 'disabled' : ''}>Generar Análisis</button>
        ${status === 'stale' ? `<button class="dashboard-ai-button secondary" type="button" data-ai-regenerate ${aiLoading ? 'disabled' : ''}>Volver a generar análisis</button>` : ''}
      </div>
    </section>
  `;
}

/**
 * @param {object} stats
 * @param {object} match
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {string} heatmapFilter
 * @param {object} preferences
 * @param {boolean} customizerOpen
 * @param {object} aiState
 * @param {boolean} aiLoading
 * @param {boolean} aiPanelCollapsed
 * @param {Array<object>} exportTemplates
 * @param {string} exportTemplateId
 * @returns {string}
 */
function buildDashboardMarkup(stats, match, selectedView, heatmapFilter, preferences, customizerOpen = false, aiState = {}, aiLoading = false, aiPanelCollapsed = false, exportTemplates = [], exportTemplateId = 'system-default', eventLinkLimits = {}, taggingLabels = {}) {
  const displayScore = getDashboardScore(stats, match);
  const scoreSourceLabel = getScoreSourceLabel(stats?.score?.source);
  const badge = getResultBadge(stats, match);
  const normalized = normalizeDashboardPreferences(preferences);
  const kpis = buildKpis(stats, normalized.selectedKpis, taggingLabels);
  const visibleSections = getVisibleSections(normalized);
  const sectionLabels = getDashboardSectionLabels(taggingLabels);
  return `
    <section class="dashboard-view view-enter">
      <header class="dashboard-match-header">
        <div class="dashboard-match-meta">
          <span>${escapeHtml(stats.match.competition || 'Sin competencia')}</span>
          <span>${escapeHtml(stats.match.date || 'Sin fecha')}</span>
        </div>
        <div class="dashboard-scoreline" aria-label="Score final">
          <span>${escapeHtml(stats.match.homeTeam)}</span>
          <strong class="tabular-nums">${displayScore.home} - ${displayScore.away}</strong>
          ${scoreSourceLabel ? `<span class="dashboard-score-source">${escapeHtml(scoreSourceLabel)}</span>` : ''}
          <span>${escapeHtml(stats.match.awayTeam)}</span>
        </div>
        <div class="badge ${badge}">${badge}</div>
      </header>

      <div class="dashboard-kpi-row">
        ${kpis.map((kpi, index) => `<div data-kpi style="--kpi-index:${index}">${createKpiCard(kpi).outerHTML}</div>`).join('')}
      </div>

      ${buildDashboardControls(stats, match, normalized, customizerOpen, exportTemplates, exportTemplateId, taggingLabels)}

      <div class="dashboard-view-toggle" role="tablist" aria-label="Vista dashboard">
        ${VIEW_OPTIONS.map(option => `
          <button class="dashboard-toggle-btn${selectedView === option.id ? ' active' : ''}" type="button" data-dashboard-view="${option.id}">
            ${option.label}
          </button>
        `).join('')}
      </div>

      <div class="dashboard-alerts" ${stats.alerts.length === 0 ? 'hidden' : ''}>
        ${stats.alerts.map(alert => `
          <span class="dashboard-alert-pill">
            <strong>${escapeHtml(alert.equipo)}</strong>
            ${escapeHtml(alert.metrica)} ${escapeHtml(alert.valor)} / ${escapeHtml(alert.umbral)}
          </span>
        `).join('')}
      </div>

      ${buildAIAnalysisPanel(aiState, aiLoading, aiPanelCollapsed)}

      <div class="dashboard-sections">
        ${visibleSections.map(id => buildSection(id, sectionLabels[id] || id, stats, match, selectedView, heatmapFilter, eventLinkLimits[id], taggingLabels)).join('') || '<div class="dashboard-empty-sections">No hay secciones visibles en esta vista.</div>'}
      </div>

      <div class="dashboard-toast" id="dashboard-toast" role="status" hidden></div>
    </section>
  `;
}

function removeDashboardFloatingActions() {
  document.querySelector('[data-dashboard-floating-actions]')?.remove();
}

function removeDashboardNotesDrawer() {
  document.body.classList.remove('has-dashboard-notes-open');
  document.querySelector('[data-dashboard-notes-drawer]')?.remove();
}

/**
 * @param {object} match
 */
function renderDashboardNotesDrawer(match) {
  removeDashboardNotesDrawer();
  const drawer = document.createElement('aside');
  drawer.className = 'dashboard-notes-drawer';
  drawer.id = 'dashboard-notes-drawer';
  drawer.dataset.dashboardNotesDrawer = 'true';
  drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = `
    <div class="dashboard-notes-panel">
      <header>
        <div>
          <span>Notas del Entrenador</span>
          <h2>Conclusiones del partido</h2>
        </div>
        <button type="button" data-notes-close aria-label="Cerrar notas">x</button>
      </header>
      <div class="dashboard-note-toolbar" role="toolbar" aria-label="Formato de notas">
        <button type="button" data-note-command="bold" aria-label="Negrita" aria-pressed="false"><strong>B</strong></button>
        <button type="button" data-note-command="italic" aria-label="Italica" aria-pressed="false"><em>I</em></button>
        <button type="button" data-note-command="underline" aria-label="Subrayado" aria-pressed="false"><u>U</u></button>
      </div>
      <div
        id="coach-notes"
        class="dashboard-notes-editor"
        data-coach-notes-editor
        contenteditable="true"
        tabindex="0"
        role="textbox"
        aria-multiline="true"
        spellcheck="true"
        data-placeholder="Escribi conclusiones, decisiones tacticas o focos de entrenamiento."
      >${markdownToNoteHtml(match.coachNotes || '')}</div>
      <p>Ctrl+B negrita. Ctrl+I italica. Ctrl+U subrayado. Escribir "- " inicia una lista.</p>
    </div>
  `;
  document.body.appendChild(drawer);
}

/**
 * @param {object} match
 */
function renderDashboardFloatingActions(match) {
  removeDashboardFloatingActions();
  const floatingActions = document.createElement('div');
  floatingActions.className = 'dashboard-floating-actions';
  floatingActions.dataset.dashboardFloatingActions = 'true';
  floatingActions.setAttribute('aria-label', 'Acciones del dashboard');
  floatingActions.innerHTML = `
    <button class="dashboard-notes-button${match.coachNotes ? ' has-notes' : ''}" type="button" data-notes-open aria-label="Notas del entrenador">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
      <span></span>
    </button>
  `;
  document.body.appendChild(floatingActions);
}

/**
 * @param {object} event
 * @param {string} sectionId
 * @returns {boolean}
 */
function eventBelongsToDashboardSection(event, sectionId) {
  const types = DASHBOARD_SECTION_EVENT_TYPES[sectionId];
  if (!Array.isArray(types)) return false;
  if (types.length === 0) {
    if (sectionId === 'bip') return hasValidClipTimestamp(event?.timestamp);
    if (sectionId === 'heatmap') return Boolean(normalizeFieldZone(event));
    return false;
  }
  const eventType = String(event?.type || '');
  return types.some(type => (type.endsWith(':') ? eventType.startsWith(type) : eventType === type));
}

/**
 * @param {object} event
 * @param {object} stats
 * @returns {string}
 */
function getDashboardEventTeamLabel(event, stats) {
  if (event?.team === 'away') return stats?.teams?.away?.name || 'Rival';
  if (event?.team === 'home') return stats?.teams?.home?.name || 'Bigua';
  return 'Sin equipo';
}

/**
 * @param {Array<object>} events
 * @param {string} sectionId
 * @returns {Array<object>}
 */
function getDashboardSectionEvents(events = [], sectionId) {
  return (Array.isArray(events) ? events : [])
    .filter(event => eventBelongsToDashboardSection(event, sectionId))
    .sort((a, b) => {
      const aTime = hasValidClipTimestamp(a.timestamp) ? Number(a.timestamp) : Number.POSITIVE_INFINITY;
      const bTime = hasValidClipTimestamp(b.timestamp) ? Number(b.timestamp) : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });
}

/**
 * @param {object} match
 * @param {object} stats
 * @param {string} sectionId
 * @param {number} [visibleLimit]
 * @returns {string}
 */
export function buildDashboardEventLinks(match, stats, sectionId, visibleLimit = DASHBOARD_EVENT_LINK_LIMIT, taggingLabels = {}) {
  const events = getDashboardSectionEvents(match?.events || [], sectionId);
  if (events.length === 0) return '';
  const normalizedLimit = Math.max(DASHBOARD_EVENT_LINK_LIMIT, Number(visibleLimit) || DASHBOARD_EVENT_LINK_LIMIT);
  const visibleEvents = events.slice(0, normalizedLimit);
  const hiddenCount = events.length - visibleEvents.length;
  const eventCountLabel = hiddenCount > 0 ? `${visibleEvents.length} de ${events.length}` : `${events.length}`;
  const nextLimit = normalizedLimit + DASHBOARD_EVENT_LINK_LIMIT;

  return `
    <div class="dashboard-event-links" aria-label="Eventos vinculados">
      <header>
        <strong>Eventos</strong>
        <span>${escapeHtml(eventCountLabel)} - click abre Tagging</span>
      </header>
      <div>
        ${visibleEvents.map((event, index) => {
          const timestamp = hasValidClipTimestamp(event.timestamp) ? Number(event.timestamp) : null;
          const eventId = event.id || `${event.type || 'event'}-${index}`;
          const result = formatLabel(event.result || event.subtype || 'registrado');
          const eventLabel = getEventLabel(event.type || 'Evento', taggingLabels);
          const title = `${eventLabel} - ${result} - ${timestamp === null ? 'sin timestamp' : formatClipTimeInput(timestamp)}`;
          return `
            <button
              class="dashboard-event-link${timestamp === null ? ' is-untimed' : ''}"
              type="button"
              data-dashboard-seek-event="${escapeHtml(eventId)}"
              data-dashboard-event-timestamp="${timestamp === null ? '' : timestamp}"
              title="${escapeHtml(title)}"
              aria-label="${escapeHtml(title)}"
            >
              <span>${timestamp === null ? 'Sin tiempo' : escapeHtml(formatClipTimeInput(timestamp))}</span>
              <strong>${escapeHtml(eventLabel)}</strong>
              <em>${escapeHtml(result)} · ${escapeHtml(getDashboardEventTeamLabel(event, stats))}</em>
            </button>
          `;
        }).join('')}
        ${hiddenCount > 0 ? `
          <button
            class="dashboard-event-overflow"
            type="button"
            data-dashboard-show-more-events="${escapeHtml(sectionId)}"
            data-dashboard-next-event-limit="${nextLimit}"
          >
            Mostrar mas <span>+${hiddenCount} eventos</span>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * @param {string} id
 * @param {string} title
 * @param {object} stats
 * @param {object} match
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {string} heatmapFilter
 * @param {number} [eventLinkLimit]
 * @returns {string}
 */
function buildSection(id, title, stats, match, selectedView, heatmapFilter, eventLinkLimit, taggingLabels = {}) {
  const body = {
    'set-pieces': '<div class="chart-shell"><canvas id="chart-set-pieces" data-chart-key="setPieces"></canvas></div>',
    rucks: '<div class="chart-shell chart-shell-compact"><canvas id="chart-rucks" data-chart-key="rucks"></canvas></div>',
    discipline: '<div class="chart-shell"><canvas id="chart-discipline" data-chart-key="discipline"></canvas></div>',
    kicks: '<div class="chart-shell"><canvas id="chart-kicks" data-chart-key="kicks"></canvas></div>',
    'break-lines': '<div class="chart-shell"><canvas id="chart-break-lines" data-chart-key="breakLines"></canvas></div>',
    'custom-events': buildCustomEventsBody(stats),
    possession: buildPossessionBody(stats),
    bip: '<div class="chart-shell"><canvas id="chart-bip" data-chart-key="bip"></canvas></div>',
    sequences: buildSequencesBody(stats),
    heatmap: buildHeatmapBody(stats, selectedView, heatmapFilter),
  }[id];

  return `
    <section class="dashboard-section" data-dashboard-section="${id}">
      <header class="dashboard-section-header">
        <button class="dashboard-section-toggle" type="button" data-section-toggle>
          <span class="dashboard-section-title">${title}</span>
          <span class="dashboard-section-chevron">›</span>
        </button>
      </header>
      <div class="dashboard-section-body">
        ${body}
        ${buildDashboardEventLinks(match, stats, id, eventLinkLimit, taggingLabels)}
      </div>
    </section>
  `;
}

/**
 * @param {object} stats
 * @returns {string}
 */
function buildCustomEventsBody(stats) {
  const items = Object.values(stats.customEvents?.byType || {})
    .filter(item => item.total > 0)
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  if (items.length === 0) {
    return `
      <div class="dashboard-empty-sections">
        No hay atajos personalizados registrados en este partido.
      </div>
    `;
  }

  return `
    <div class="dashboard-custom-events-summary">
      ${items.slice(0, 4).map(item => `
        <div>
          <span>${escapeHtml(item.hotkey || 'Custom')}</span>
          <strong class="tabular-nums">${formatNumber(item.total)}</strong>
          <em>${escapeHtml(item.label)}</em>
        </div>
      `).join('')}
    </div>
    <div class="chart-shell"><canvas id="chart-custom-events" data-chart-key="customEvents"></canvas></div>
  `;
}

/**
 * @param {object} stats
 * @returns {string}
 */
function buildPossessionBody(stats) {
  return `
    <div class="dashboard-stat-strip">
      <span>${escapeHtml(stats.teams.home.name)} <strong>${formatPct(stats.possession.percentages.home)}</strong></span>
      <span>${escapeHtml(stats.teams.away.name)} <strong>${formatPct(stats.possession.percentages.away)}</strong></span>
      <em>${stats.possession.source === 'intervals' ? 'Intervalos reales' : 'Estimado por eventos'}</em>
    </div>
    <div class="chart-shell"><canvas id="chart-possession" data-chart-key="possession"></canvas></div>
    ${stats.territory.available ? `
      <div class="dashboard-territory-readout">
        Territorio: ${escapeHtml(stats.teams.home.name)} ${formatPct(stats.territory.percentages.home)} - ${formatPct(stats.territory.percentages.away)} ${escapeHtml(stats.teams.away.name)}
      </div>
    ` : ''}
  `;
}

/**
 * @param {object} stats
 * @returns {string}
 */
function buildSequencesBody(stats) {
  const longest = stats.sequences.longest || [];
  return `
    <div class="dashboard-sequence-grid">
      <div class="dashboard-sequence-card">
        <span>Promedio fases</span>
        <strong class="tabular-nums">${stats.sequences.averagePhases}</strong>
      </div>
      <div class="dashboard-sequence-card">
        <span>Total secuencias</span>
        <strong class="tabular-nums">${stats.sequences.total}</strong>
      </div>
      <div class="dashboard-sequence-card">
        <span>Mas larga</span>
        <strong class="tabular-nums">${longest[0]?.phases ?? 0}</strong>
      </div>
    </div>
    <div class="dashboard-sequence-list">
      ${longest.map(sequence => `
        <div>
          <strong>${escapeHtml(sequence.name || sequence.id || 'Secuencia')}</strong>
          <span>${formatNumber(sequence.phases)} fases · ${formatLabel(sequence.result)}</span>
        </div>
      `).join('') || '<p>No hay secuencias registradas.</p>'}
    </div>
  `;
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {string} heatmapFilter
 * @returns {string}
 */
function buildHeatmapBody(stats, selectedView, heatmapFilter) {
  return `
    <div class="dashboard-heatmap-filters">
      ${HEATMAP_FILTERS.map(filter => `
        <button class="heatmap-filter-chip${heatmapFilter === filter.id ? ' active' : ''}" type="button" data-heatmap-filter="${filter.id}">
          ${filter.label}
        </button>
      `).join('')}
    </div>
    <div class="dashboard-heatmap-shell">
      <svg id="dashboard-heatmap" viewBox="0 0 960 520" data-view="${selectedView}" role="img" aria-label="Heatmap por zonas del campo de rugby"></svg>
      <p class="dashboard-heatmap-empty" id="dashboard-heatmap-empty" hidden><strong>Sin zonas cargadas todavia</strong><span>Selecciona zonas en los popups de tagging para activar este heatmap.</span></p>
    </div>
  `;
}

/**
 * @param {Record<string, object>} charts
 */
function destroyCharts(charts) {
  charts.__observer?.disconnect?.();
  Object.entries(charts).forEach(([key, chart]) => {
    if (key !== '__observer') chart?.destroy?.();
  });
  Object.keys(charts).forEach(key => delete charts[key]);
}

/**
 * @param {HTMLCanvasElement|null} canvas
 * @param {object} config
 * @param {Record<string, object>} charts
 * @param {string} key
 */
function createChart(canvas, config, charts, key) {
  if (!canvas || !window.Chart) return;
  charts[key]?.destroy?.();
  const chart = new window.Chart(canvas, config);
  charts[key] = chart;
  chart.update('none');
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {object} colors
 * @param {Record<string, object>} charts
 * @returns {Record<string, function(): void>}
 */
function createLazyChartRenderer(stats, selectedView, colors, charts, taggingLabels = {}) {
  return {
    setPieces: () => createSetPiecesChart(stats, selectedView, colors, charts, taggingLabels),
    rucks: () => createRucksChart(stats, selectedView, colors, charts),
    discipline: () => createDisciplineChart(stats, selectedView, colors, charts, taggingLabels),
    kicks: () => createKicksChart(stats, selectedView, colors, charts, taggingLabels),
    breakLines: () => createBreakLinesChart(stats, selectedView, colors, charts, taggingLabels),
    customEvents: () => createCustomEventsChart(stats, selectedView, colors, charts),
    possession: () => createPossessionChart(stats, colors, charts),
    bip: () => createBipChart(stats, colors, charts),
  };
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {Record<string, object>} charts
 */
async function renderAllDashboardCharts(stats, selectedView, charts, taggingLabels = {}) {
  await ensureChartJs();
  const colors = getChartColors();
  configureChartDefaults(colors);
  const renderers = createLazyChartRenderer(stats, selectedView, colors, charts, taggingLabels);
  Object.values(renderers).forEach(render => render());
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {Record<string, object>} charts
 */
async function renderCharts(stats, selectedView, charts, taggingLabels = {}) {
  await ensureChartJs();
  destroyCharts(charts);
  const colors = getChartColors();
  configureChartDefaults(colors);
  const renderers = createLazyChartRenderer(stats, selectedView, colors, charts, taggingLabels);
  const canvases = Array.from(document.querySelectorAll('[data-chart-key]'));

  if (!('IntersectionObserver' in window)) {
    canvases.forEach(canvas => renderers[canvas.dataset.chartKey]?.());
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const canvas = /** @type {HTMLCanvasElement} */ (entry.target);
      renderers[canvas.dataset.chartKey]?.();
      observer.unobserve(canvas);
    });
  }, { root: document.querySelector('.main-content-body'), rootMargin: '160px 0px' });

  charts.__observer = observer;
  canvases.forEach((canvas) => {
    observer.observe(canvas);
  });
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {object} colors
 * @param {Record<string, object>} charts
 */
function createSetPiecesChart(stats, selectedView, colors, charts, taggingLabels = {}) {
  const teams = selectedView === 'compare'
    ? ['home', 'away']
    : [getSelectedTeam(stats, selectedView)];
  const labels = teams.flatMap(team => [`${getTeamName(stats, team)} ${getEventLabel('scrum', taggingLabels)}`, `${getTeamName(stats, team)} ${getEventLabel('lineout', taggingLabels)}`]);
  const values = (key) => teams.flatMap(team => [stats.setPieces.scrums[team][key], stats.setPieces.lineouts[team][key]]);
  createChart(document.getElementById('chart-set-pieces'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Ganado', data: values('won'), backgroundColor: colors.positive },
        { label: 'Perdido', data: values('lost'), backgroundColor: colors.negative },
        { label: 'Sucio', data: values('dirty'), backgroundColor: colors.warning },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  }, charts, 'setPieces');
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {object} colors
 * @param {Record<string, object>} charts
 */
function createRucksChart(stats, selectedView, colors, charts) {
  const team = getSelectedTeam(stats, selectedView) || stats.teams.biguaTeam;
  if (selectedView === 'compare') {
    createChart(document.getElementById('chart-rucks'), {
      type: 'bar',
      data: {
        labels: ['Ganado', 'Perdido', 'Sucio'],
        datasets: [
          { label: getTeamName(stats, 'home'), data: [stats.rucks.home.won, stats.rucks.home.lost, stats.rucks.home.dirty], backgroundColor: colors.local },
          { label: getTeamName(stats, 'away'), data: [stats.rucks.away.won, stats.rucks.away.lost, stats.rucks.away.dirty], backgroundColor: colors.rival },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    }, charts, 'rucks');
    return;
  }

  createChart(document.getElementById('chart-rucks'), {
    type: 'doughnut',
    data: {
      labels: ['Ganado', 'Perdido', 'Sucio'],
      datasets: [{
        data: [stats.rucks[team].won, stats.rucks[team].lost, stats.rucks[team].dirty],
        backgroundColor: [colors.positive, colors.negative, colors.warning],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        tooltip: {
          callbacks: {
            footer: () => `Total ${stats.rucks[team].total}`,
          },
        },
      },
    },
  }, charts, 'rucks');
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {object} colors
 * @param {Record<string, object>} charts
 */
function createDisciplineChart(stats, selectedView, colors, charts, taggingLabels = {}) {
  const teams = selectedView === 'compare' ? ['home', 'away'] : [getSelectedTeam(stats, selectedView)];
  const labels = ['ruck', 'scrum', 'offside', 'maul', 'inconducta', 'otro'];
  createChart(document.getElementById('chart-discipline'), {
    type: 'bar',
    data: {
      labels: labels.map(type => getEventLabel(type, taggingLabels)),
      datasets: teams.flatMap(team => [
        {
          label: `${getTeamName(stats, team)} ataque`,
          data: labels.map(type => stats.discipline[team].penalties.byTypePhase?.[type]?.ataque || 0),
          backgroundColor: colors.rival,
          stack: team,
        },
        {
          label: `${getTeamName(stats, team)} defensa`,
          data: labels.map(type => stats.discipline[team].penalties.byTypePhase?.[type]?.defensa || 0),
          backgroundColor: colors.defense,
          stack: team,
        },
      ]),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: { x: { stacked: true }, y: { stacked: true } },
    },
  }, charts, 'discipline');
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {object} colors
 * @param {Record<string, object>} charts
 */
function createKicksChart(stats, selectedView, colors, charts, taggingLabels = {}) {
  const players = selectedView === 'compare'
    ? [...stats.kicks.home.byPlayer, ...stats.kicks.away.byPlayer]
    : stats.kicks[getSelectedTeam(stats, selectedView)].byPlayer;
  createChart(document.getElementById('chart-kicks'), {
    type: 'bar',
    data: {
      labels: players.map(player => player.player),
      datasets: [{
        label: `${getEventLabel('kick', taggingLabels)} · efectividad`,
        data: players.map(player => player.favorablePct),
        backgroundColor: players.map(player => player.favorablePct >= 50 ? colors.positive : colors.negative),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: { x: { min: 0, max: 100, ticks: { callback: value => `${value}%` } } },
    },
  }, charts, 'kicks');
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {object} colors
 * @param {Record<string, object>} charts
 */
function createBreakLinesChart(stats, selectedView, colors, charts, taggingLabels = {}) {
  const teams = selectedView === 'compare' ? ['home', 'away'] : [getSelectedTeam(stats, selectedView)];
  const results = ['try', 'palos', 'turnover', 'pfk-favor', 'pfk-contra', 'juego'];
  const palette = [colors.positive, colors.warning, colors.negative, colors.rival, colors.defense, colors.localLight];
  createChart(document.getElementById('chart-break-lines'), {
    type: 'bar',
    data: {
      labels: teams.map(team => getTeamName(stats, team)),
      datasets: results.map((result, index) => ({
        label: getEventLabel(result, taggingLabels),
        data: teams.map(team => stats.breakLines[team].byResult[result] || 0),
        backgroundColor: palette[index],
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true } },
    },
  }, charts, 'breakLines');
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {object} colors
 * @param {Record<string, object>} charts
 */
function createCustomEventsChart(stats, selectedView, colors, charts) {
  const items = Object.values(stats.customEvents?.byType || {})
    .filter(item => item.total > 0)
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  const labels = items.map(item => item.label);
  const selectedTeam = getSelectedTeam(stats, selectedView);
  const datasets = selectedView === 'compare'
    ? [
      {
        label: getTeamName(stats, 'home'),
        data: items.map(item => item.home || 0),
        backgroundColor: colors.local,
      },
      {
        label: getTeamName(stats, 'away'),
        data: items.map(item => item.away || 0),
        backgroundColor: colors.rival,
      },
    ]
    : [{
      label: getTeamName(stats, selectedTeam),
      data: items.map(item => item[selectedTeam] || 0),
      backgroundColor: colors.local,
    }];

  createChart(document.getElementById('chart-custom-events'), {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  }, charts, 'customEvents');
}

/**
 * @param {object} stats
 * @param {object} colors
 * @param {Record<string, object>} charts
 */
function createPossessionChart(stats, colors, charts) {
  const hasIntervals = stats.possession.segments.length > 0;
  createChart(document.getElementById('chart-possession'), {
    type: hasIntervals ? 'line' : 'bar',
    data: hasIntervals
      ? {
        labels: stats.possession.segments.map(segment => `${Math.round(segment.end / 60)}'`),
        datasets: [
          {
            label: getTeamName(stats, 'home'),
            data: stats.possession.segments.map((segment, index) => {
              const observed = stats.possession.segments.slice(0, index + 1);
              const home = observed.filter(item => item.team === 'home').reduce((sum, item) => sum + item.end - item.start, 0);
              const total = observed.reduce((sum, item) => sum + item.end - item.start, 0);
              return calculatePercent(home, total);
            }),
            fill: true,
            borderColor: colors.local,
            backgroundColor: colors.localLight,
            tension: 0.25,
          },
          {
            label: getTeamName(stats, 'away'),
            data: stats.possession.segments.map((segment, index) => {
              const observed = stats.possession.segments.slice(0, index + 1);
              const away = observed.filter(item => item.team === 'away').reduce((sum, item) => sum + item.end - item.start, 0);
              const total = observed.reduce((sum, item) => sum + item.end - item.start, 0);
              return calculatePercent(away, total);
            }),
            fill: true,
            borderColor: colors.rival,
            backgroundColor: colors.rivalLight,
            tension: 0.25,
          },
        ],
      }
      : {
        labels: [getTeamName(stats, 'home'), getTeamName(stats, 'away')],
        datasets: [{ label: 'Posesion', data: [stats.possession.percentages.home, stats.possession.percentages.away], backgroundColor: [colors.local, colors.rival] }],
      },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 100, ticks: { callback: value => `${value}%` } } },
      plugins: {
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: ${context.parsed.y ?? context.parsed}%`,
            footer: () => `${stats.teams.home.name} ${stats.possession.percentages.home}% - ${stats.teams.away.name} ${stats.possession.percentages.away}%`,
          },
        },
      },
    },
  }, charts, 'possession');
}

/**
 * @param {object} stats
 * @param {object} colors
 * @param {Record<string, object>} charts
 */
function createBipChart(stats, colors, charts) {
  createChart(document.getElementById('chart-bip'), {
    type: 'bar',
    data: {
      labels: stats.bip.bands.map(band => band.label),
      datasets: [{ label: 'Eventos', data: stats.bip.bands.map(band => band.count), backgroundColor: colors.local }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  }, charts, 'bip');
}

/**
 * @param {object} event
 * @param {string} filter
 * @returns {boolean}
 */
function eventMatchesHeatmapFilter(event, filter) {
  if (filter === 'all') return true;
  if (filter === 'penalties') return event.type === 'penal';
  if (filter === 'lost-rucks') return event.type === 'ruck' && event.result === 'perdido';
  if (filter === 'tries') return (event.type === 'points' || event.type === 'break-line') && event.result === 'try';
  if (filter === 'turnovers') return event.type === 'turnover' || event.result === 'turnover';
  if (filter === 'break-lines') return event.type === 'break-line';
  return true;
}

/**
 * @param {number} timestamp
 * @param {string} timeBand
 * @returns {boolean}
 */
function timestampMatchesTimeBand(timestamp, timeBand) {
  if (!timeBand || timeBand === 'all') return true;
  if (!Number.isFinite(timestamp)) return false;
  const ranges = {
    'first-half': [0, 40 * 60],
    'second-half': [40 * 60, Number.POSITIVE_INFINITY],
    '0-20': [0, 20 * 60],
    '20-40': [20 * 60, 40 * 60],
    '40-60': [40 * 60, 60 * 60],
    '60-80': [60 * 60, 80 * 60],
    '+80': [80 * 60, Number.POSITIVE_INFINITY],
  };
  const range = ranges[timeBand];
  if (!range) return true;
  return timestamp >= range[0] && timestamp < range[1];
}

function getHeatmapGeometry() {
  const x = 54;
  const y = 34;
  const width = 852;
  const height = 452;
  return {
    x,
    y,
    width,
    height,
    sectorW: width / 4,
  };
}

/**
 * @param {object} zoneCounts
 * @param {number} max
 * @returns {string}
 */
function drawRugbyFieldSvg(zoneCounts = {}, max = 0) {
  const field = getHeatmapGeometry();
  const verticalLines = Array.from({ length: 5 }, (_, index) => field.x + field.sectorW * index);
  const hashRows = [field.y + field.height * 0.18, field.y + field.height * 0.50, field.y + field.height * 0.82];
  const hashColumns = verticalLines.slice(1, -1);
  const zones = FOUR_SECTOR_FIELD_ZONES.map((zone, index) => {
    const count = zoneCounts[zone.id] || 0;
    const intensity = max > 0 ? roundTo(count / max, 2) : 0;
    const x = field.x + index * field.sectorW;
    const labelY = field.y + field.height / 2 - 8;
    return `
      <g class="heatmap-zone" data-zone="${zone.id}">
        <rect x="${x}" y="${field.y}" width="${field.sectorW}" height="${field.height}" fill="#C8102E" fill-opacity="${intensity}" />
        <text class="heatmap-zone-number" x="${x + field.sectorW / 2}" y="${labelY}" text-anchor="middle">${escapeHtml(zone.label)}</text>
        ${count > 0 ? `<text class="heatmap-zone-count" x="${x + field.sectorW / 2}" y="${labelY + 30}" text-anchor="middle">${count}</text>` : ''}
      </g>
    `;
  });

  return `
    <defs>
      <linearGradient id="heatmap-field-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0B8F4E" />
        <stop offset="52%" stop-color="#087E45" />
        <stop offset="100%" stop-color="#066C3C" />
      </linearGradient>
    </defs>
    <style>
      .heatmap-zone-number { fill: rgba(255,255,255,0.88); font: 900 28px Arial Black, Arial, sans-serif; paint-order: stroke; stroke: rgba(0,0,0,0.12); stroke-width: 2px; }
      .heatmap-zone-count { fill: rgba(255,255,255,0.86); font: 900 18px Arial, sans-serif; }
    </style>
    <rect x="0" y="0" width="960" height="520" rx="0" fill="url(#heatmap-field-gradient)" />
    <rect x="28" y="24" width="904" height="472" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="5" vector-effect="non-scaling-stroke" />
    <rect x="40" y="36" width="880" height="448" fill="none" stroke="rgba(255,255,255,0.82)" stroke-width="3" vector-effect="non-scaling-stroke" />
    ${zones.join('')}
    <g class="heatmap-field-lines" fill="none" stroke="rgba(255,255,255,0.78)" stroke-width="2.4" vector-effect="non-scaling-stroke">
      ${verticalLines.map(x => `<line x1="${x}" y1="${field.y}" x2="${x}" y2="${field.y + field.height}" />`).join('')}
      <path d="M84 202 L30 184 M84 318 L30 336 M84 202 L84 318" />
      <path d="M876 202 L930 184 M876 318 L930 336 M876 202 L876 318" />
    </g>
    <g class="heatmap-hash-lines" fill="none" stroke="rgba(255,255,255,0.86)" stroke-width="3" vector-effect="non-scaling-stroke">
      ${hashRows.flatMap(y => hashColumns.map(x => `<line x1="${x - 8}" y1="${y}" x2="${x + 8}" y2="${y}" />`)).join('')}
      ${hashColumns.map(x => `<line x1="${x}" y1="${field.y + 122}" x2="${x}" y2="${field.y + 150}" stroke-dasharray="18 16" />`).join('')}
      ${hashColumns.map(x => `<line x1="${x}" y1="${field.y + field.height - 150}" x2="${x}" y2="${field.y + field.height - 122}" stroke-dasharray="18 16" />`).join('')}
    </g>
  `;
}

/**
 * @param {SVGSVGElement|null} svg
 * @param {HTMLElement|null} empty
 * @param {object} match
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {string} heatmapFilter
 * @param {object} dashboardFilters
 */
function renderHeatmap(svg, empty, match, stats, selectedView, heatmapFilter, dashboardFilters = {}) {
  if (!svg) return;
  const team = getSelectedTeam(stats, selectedView);
  const zoneCounts = {};
  (match.events || [])
    .filter(event => eventMatchesHeatmapFilter(event, heatmapFilter))
    .filter(event => !team || event.team === team)
    .filter(event => timestampMatchesTimeBand(Number(event.timestamp), dashboardFilters.timeBand))
    .map(event => ({ event, zone: normalizeFieldZone(event) }))
    .filter(({ zone }) => zone && FOUR_SECTOR_FIELD_ZONES.some(sector => sector.id === zone.id))
    .filter(({ zone }) => !dashboardFilters.zone || dashboardFilters.zone === 'all' || zone.id === dashboardFilters.zone)
    .forEach((event) => {
      zoneCounts[event.zone.id] = (zoneCounts[event.zone.id] || 0) + 1;
    });
  const max = Object.values(zoneCounts).reduce((value, count) => Math.max(value, count), 0);
  if (empty) empty.hidden = max > 0;
  svg.innerHTML = drawRugbyFieldSvg(zoneCounts, max);
}

/**
 * @param {object} preferences
 * @returns {'bigua'|'rival'|'compare'}
 */
function getViewFromPreferences(preferences) {
  const team = normalizeDashboardPreferences(preferences).filters.team;
  if (team === 'rival') return 'rival';
  if (team === 'compare' || team === 'all') return 'compare';
  return 'bigua';
}

/**
 * @param {Array<string>} items
 * @param {string} id
 * @param {-1|1} direction
 * @returns {Array<string>}
 */
function moveItem(items, id, direction) {
  const next = [...items];
  const index = next.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * @param {object} state
 * @returns {Promise<void>}
 */
async function reloadDashboardStats(state) {
  if (!state.match?.id) return;
  state.stats = await window.api.analytics.getMatchStats(state.match.id, state.preferences.filters);
}

/**
 * @param {object} state
 * @returns {Promise<void>}
 */
async function refreshAIAnalysis(state) {
  if (!state.match?.id || !window.biguAI?.getMatchAnalysis) return;
  try {
    state.ai = await window.biguAI.getMatchAnalysis(state.match.id);
  } catch (error) {
    state.ai = {
      status: 'error',
      hasAnalysis: false,
      error: error instanceof Error ? error.message : 'No se pudo cargar el análisis IA.',
    };
  }
}

/**
 * @param {HTMLElement} container
 * @param {object} state
 * @param {'generate'|'regenerate'} action
 * @returns {Promise<void>}
 */
async function runAIAnalysisAction(container, state, action) {
  if (state.aiLoading || !state.match?.id) return;
  if (action === 'regenerate') {
    const confirmed = window.confirm('Esto consumirá una nueva llamada a la IA. ¿Querés continuar?');
    if (!confirmed) return;
  }

  state.aiLoading = true;
  renderLoadedDashboard(container, state);
  try {
    state.ai = action === 'regenerate'
      ? await window.biguAI.regenerateMatchAnalysis(state.match.id)
      : await window.biguAI.generateMatchAnalysis(state.match.id);
  } catch (error) {
    state.ai = {
      status: 'error',
      hasAnalysis: false,
      error: error instanceof Error ? error.message : 'No se pudo generar el análisis IA.',
    };
  } finally {
    state.aiLoading = false;
    renderLoadedDashboard(container, state);
  }
}

/**
 * @param {HTMLElement} container
 * @param {object} state
 * @param {object} nextPreferences
 * @param {{reload?: boolean}} options
 */
async function updateDashboardPreferences(container, state, nextPreferences, options = {}) {
  state.preferences = normalizeDashboardPreferences(nextPreferences);
  state.selectedView = getViewFromPreferences(state.preferences);
  await window.api.settings.set({ dashboard: state.preferences });
  if (options.reload) await reloadDashboardStats(state);
  renderLoadedDashboard(container, state);
}

/**
 * @param {HTMLElement} container
 * @param {object} state
 */
function wireDashboard(container, state) {
  container.querySelectorAll('[data-section-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      button.closest('.dashboard-section')?.classList.toggle('collapsed');
    });
  });

  container.querySelectorAll('[data-dashboard-seek-event]').forEach(button => {
    button.addEventListener('click', () => {
      const timestamp = Number(button.dataset.dashboardEventTimestamp);
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        showToast(container, 'El evento no tiene timestamp para navegar al video.');
        return;
      }
      navigate('tagging', { matchId: state.match.id, seekTo: timestamp });
    });
  });

  container.querySelectorAll('[data-dashboard-show-more-events]').forEach(button => {
    button.addEventListener('click', () => {
      const sectionId = button.getAttribute('data-dashboard-show-more-events') || '';
      const nextLimit = Number(button.getAttribute('data-dashboard-next-event-limit')) || DASHBOARD_EVENT_LINK_LIMIT;
      state.eventLinkLimits[sectionId] = nextLimit;
      renderLoadedDashboard(container, state);
    });
  });

  container.querySelectorAll('[data-dashboard-view]').forEach(button => {
    button.addEventListener('click', () => {
      const view = button.dataset.dashboardView || 'bigua';
      updateDashboardPreferences(container, state, {
        ...state.preferences,
        filters: {
          ...state.preferences.filters,
          team: view,
        },
      }, { reload: true });
    });
  });

  container.querySelector('[data-dashboard-template]')?.addEventListener('change', (event) => {
    const select = /** @type {HTMLSelectElement} */ (event.currentTarget);
    updateDashboardPreferences(container, state, applyDashboardTemplate(state.preferences, select.value));
  });

  container.querySelector('[data-filter-time]')?.addEventListener('change', (event) => {
    const select = /** @type {HTMLSelectElement} */ (event.currentTarget);
    updateDashboardPreferences(container, state, {
      ...state.preferences,
      filters: { ...state.preferences.filters, timeBand: select.value },
    }, { reload: true });
  });

  container.querySelector('[data-filter-zone]')?.addEventListener('change', (event) => {
    const select = /** @type {HTMLSelectElement} */ (event.currentTarget);
    updateDashboardPreferences(container, state, {
      ...state.preferences,
      filters: { ...state.preferences.filters, zone: select.value },
    }, { reload: true });
  });

  container.querySelector('[data-pdf-template]')?.addEventListener('change', (event) => {
    const select = /** @type {HTMLSelectElement} */ (event.currentTarget);
    updateDashboardPreferences(container, state, {
      ...state.preferences,
      pdfTemplate: select.value,
    });
  });

  container.querySelector('[data-export-template-id]')?.addEventListener('change', (event) => {
    const select = /** @type {HTMLSelectElement} */ (event.currentTarget);
    state.exportTemplateId = select.value || 'system-default';
  });

  container.querySelector('[data-manage-pdf-templates]')?.addEventListener('click', () => {
    navigate('pdfTemplates', { matchId: state.match.id });
  });

  container.querySelector('[data-customizer-toggle]')?.addEventListener('click', () => {
    state.customizerOpen = !state.customizerOpen;
    renderLoadedDashboard(container, state);
  });

  container.querySelectorAll('[data-kpi-slot]').forEach(select => {
    select.addEventListener('change', () => {
      const slot = Number(select.dataset.kpiSlot);
      const selectedKpis = [...state.preferences.selectedKpis];
      selectedKpis[slot] = /** @type {HTMLSelectElement} */ (select).value;
      updateDashboardPreferences(container, state, { ...state.preferences, selectedKpis });
    });
  });

  container.querySelectorAll('[data-section-visible]').forEach(input => {
    input.addEventListener('change', () => {
      const sectionId = input.dataset.sectionVisible;
      const visible = new Set(state.preferences.visibleSections);
      if (/** @type {HTMLInputElement} */ (input).checked) visible.add(sectionId);
      else visible.delete(sectionId);
      updateDashboardPreferences(container, state, { ...state.preferences, visibleSections: Array.from(visible) });
    });
  });

  container.querySelectorAll('[data-section-up]').forEach(button => {
    button.addEventListener('click', () => {
      updateDashboardPreferences(container, state, {
        ...state.preferences,
        sectionOrder: moveItem(state.preferences.sectionOrder, button.dataset.sectionUp, -1),
      });
    });
  });

  container.querySelectorAll('[data-section-down]').forEach(button => {
    button.addEventListener('click', () => {
      updateDashboardPreferences(container, state, {
        ...state.preferences,
        sectionOrder: moveItem(state.preferences.sectionOrder, button.dataset.sectionDown, 1),
      });
    });
  });

  container.querySelectorAll('[data-heatmap-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.heatmapFilter = button.dataset.heatmapFilter || 'all';
      renderLoadedDashboard(container, state);
    });
  });

  container.querySelector('[data-ai-generate]')?.addEventListener('click', () => {
    runAIAnalysisAction(container, state, 'generate');
  });

  container.querySelector('[data-ai-regenerate]')?.addEventListener('click', () => {
    runAIAnalysisAction(container, state, 'regenerate');
  });

  container.querySelector('[data-ai-panel-toggle]')?.addEventListener('click', () => {
    state.aiPanelCollapsed = !state.aiPanelCollapsed;
    renderLoadedDashboard(container, state);
  });

  const drawer = document.querySelector('[data-dashboard-notes-drawer]');
  const editor = /** @type {HTMLElement|null} */ (drawer?.querySelector('[data-coach-notes-editor]') || null);
  state.noteFormats = normalizeNoteFormats(state.noteFormats);
  let lastNoteRange = null;
  const scheduleToolbarState = () => {
    window.requestAnimationFrame(() => {
      if (drawer) updateNoteToolbarState(/** @type {HTMLElement} */ (drawer), state.noteFormats);
    });
  };
  const closeNotesDrawer = () => {
    drawer?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-dashboard-notes-open');
  };
  const captureToolbarSelection = () => {
    if (!editor) return;
    const range = getCurrentNoteSelection(editor);
    if (range) lastNoteRange = range;
    if (canSyncNoteFormatsFromSelection(editor)) {
      Object.assign(state.noteFormats, getNoteFormatsAtSelection(editor));
    }
    if (drawer) updateNoteToolbarState(/** @type {HTMLElement} */ (drawer), state.noteFormats);
  };
  state.noteToolbarCleanup?.();
  document.addEventListener('selectionchange', captureToolbarSelection);
  state.noteToolbarCleanup = () => document.removeEventListener('selectionchange', captureToolbarSelection);

  document.querySelector('[data-dashboard-floating-actions] [data-notes-open]')?.addEventListener('click', () => {
    drawer?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-dashboard-notes-open');
    window.requestAnimationFrame(() => {
      editor?.focus();
      if (editor) placeCaretAtEnd(editor);
      lastNoteRange = editor ? getCurrentNoteSelection(editor) : null;
      scheduleToolbarState();
    });
  });
  drawer?.querySelector('[data-notes-close]')?.addEventListener('click', closeNotesDrawer);
  const runNoteToolbarCommand = (button) => {
    const command = button.dataset.noteCommand;
    if (!command) return;
    toggleNoteCommand(command, editor, lastNoteRange, state.noteFormats);
    lastNoteRange = editor ? getCurrentNoteSelection(editor) : null;
    scheduleToolbarState();
  };
  drawer?.querySelectorAll('[data-note-command]').forEach(button => {
    const clearNotePointerHandled = () => {
      window.setTimeout(() => {
        delete button.dataset.notePointerHandled;
      }, 0);
    };
    button.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      button.dataset.notePointerHandled = 'true';
      runNoteToolbarCommand(button);
      window.setTimeout(() => {
        delete button.dataset.notePointerHandled;
      }, 2000);
    });
    button.addEventListener('pointerup', clearNotePointerHandled);
    button.addEventListener('pointercancel', clearNotePointerHandled);
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (button.dataset.notePointerHandled === 'true') {
        delete button.dataset.notePointerHandled;
        return;
      }
      runNoteToolbarCommand(button);
    });
  });
  editor?.addEventListener('keydown', (event) => {
    if (handleMarkdownListShortcut(editor, event)) {
      lastNoteRange = getCurrentNoteSelection(editor);
      scheduleToolbarState();
      return;
    }
    const key = event.key.toLowerCase();
    const command = { b: 'bold', i: 'italic', u: 'underline' }[key];
    if ((event.ctrlKey || event.metaKey) && command) {
      event.preventDefault();
      toggleNoteCommand(command, editor, lastNoteRange, state.noteFormats);
      lastNoteRange = getCurrentNoteSelection(editor);
      scheduleToolbarState();
    }
  });
  editor?.addEventListener('beforeinput', (event) => {
    if (handleFormattedTextInput(editor, /** @type {InputEvent} */ (event), state.noteFormats)) {
      lastNoteRange = getCurrentNoteSelection(editor);
      scheduleToolbarState();
    }
  });
  editor?.addEventListener('keyup', scheduleToolbarState);
  editor?.addEventListener('mouseup', captureToolbarSelection);
  editor?.addEventListener('focus', captureToolbarSelection);
  editor?.addEventListener('input', () => {
    maybeConvertMarkdownList(editor);
    lastNoteRange = getCurrentNoteSelection(editor);
    scheduleToolbarState();
  });
  editor?.addEventListener('blur', async () => {
    const coachNotes = serializeCoachNotes(editor);
    const notesChanged = coachNotes !== (state.match.coachNotes || '');
    state.match = await cloudMatchService.updateMatch(state.match.id, { coachNotes });
    const noteButton = document.querySelector('[data-dashboard-floating-actions] [data-notes-open]');
    noteButton?.classList.toggle('has-notes', Boolean(coachNotes.trim()));
    closeNotesDrawer();
    if (notesChanged) {
      await refreshAIAnalysis(state);
      renderLoadedDashboard(container, state);
    }
  });
}

/**
 * @param {HTMLElement} container
 * @param {string} message
 * @param {string|null} filePath
 * @param {string} actionLabel
 */
function showToast(container, message, filePath = null, actionLabel = 'Abrir archivo') {
  const toast = container.querySelector('#dashboard-toast');
  if (!toast) return;
  window.clearTimeout(Number(toast.dataset.timer || 0));
  window.clearTimeout(Number(toast.dataset.closeTimer || 0));
  toast.hidden = false;
  toast.classList.remove('closing');
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    ${filePath ? `<button type="button" data-open-export>${escapeHtml(actionLabel)}</button>` : ''}
    <span class="dashboard-toast-progress" aria-hidden="true"></span>
  `;
  toast.querySelector('[data-open-export]')?.addEventListener('click', () => {
    window.api.files.open(filePath);
  });
  toast.dataset.timer = String(window.setTimeout(() => {
    toast.classList.add('closing');
    toast.dataset.closeTimer = String(window.setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove('closing');
    }, 200));
  }, 5000));
}

/**
 * @param {object} state
 * @returns {object}
 */
function collectPrintPayload(state, access = null) {
  const chartImages = {};
  Object.entries(state.charts).forEach(([key, chart]) => {
    if (typeof chart.toBase64Image === 'function') {
      chartImages[key] = chart.toBase64Image();
    }
  });
  const heatmapSvg = /** @type {SVGSVGElement|null} */ (document.getElementById('dashboard-heatmap'));
  const heatmapClone = heatmapSvg ? /** @type {SVGSVGElement} */ (heatmapSvg.cloneNode(true)) : null;
  heatmapClone?.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const serializedHeatmap = heatmapClone
    ? new XMLSerializer().serializeToString(heatmapClone)
    : '';
  return {
    chartImages,
    heatmapImage: serializedHeatmap ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializedHeatmap)}` : '',
    notesHtml: markdownToPrintHtml(state.match.coachNotes || ''),
    aiAnalysis: state.ai?.status === 'valid' ? state.ai.analysis : null,
    selectedView: state.selectedView,
    templateId: state.exportTemplateId,
    pdfTemplate: state.preferences.pdfTemplate,
    selectedKpis: state.preferences.selectedKpis,
    visibleSections: getVisibleSections(state.preferences),
    filters: state.preferences.filters,
    taggingLabels: state.taggingLabels,
    license: getPrintLicensePayload(access),
  };
}

/**
 * @param {HTMLElement} container
 * @param {object} state
 */
async function exportPdf(container, state) {
  const exportButton = document.querySelector('[data-action="export"]');
  exportButton?.classList.add('exporting');
  if (exportButton) exportButton.textContent = 'Generando...';

  try {
    const access = await refreshAccessState();
    if (access.state !== 'active') {
      window.dispatchEvent(new CustomEvent('bigu:access-denied', { detail: access }));
      showToast(container, 'No se pudo verificar la licencia para exportar.');
      return;
    }
    await renderAllDashboardCharts(state.stats, state.selectedView, state.charts, state.taggingLabels);
    const result = await window.api.analytics.exportPdf(state.match.id, collectPrintPayload(state, access));
    if (!result?.canceled) {
      showToast(container, 'PDF generado correctamente.', result.filePath);
    }
  } catch (error) {
    showToast(container, error.message || 'No se pudo exportar el PDF.');
  } finally {
    exportButton?.classList.remove('exporting');
    if (exportButton) exportButton.textContent = 'Exportar PDF';
  }
}

/**
 * @param {HTMLElement} container
 * @param {object} state
 */
async function exportMatchArchive(container, state) {
  const exportButton = document.querySelector('[data-action="export-match"]');
  exportButton?.classList.add('exporting');
  if (exportButton) exportButton.textContent = 'Exportando...';

  try {
    const result = await window.api.matches.exportArchive(state.match.id);
    if (!result?.canceled) {
      showToast(container, result.videoWarning || 'Partido exportado correctamente.', result.filePath);
    }
  } catch (error) {
    showToast(container, error.message || 'No se pudo exportar el partido.');
  } finally {
    exportButton?.classList.remove('exporting');
    if (exportButton) exportButton.textContent = 'Exportar partido';
  }
}

/**
 * @param {HTMLElement} container
 * @param {object} state
 */
function renderLoadedDashboard(container, state) {
  updateTopbarContext(`${state.match.homeTeam || 'Bigua'} vs ${state.match.awayTeam || 'Rival'}`);
  setTopbarActions([
    { id: 'tagging', label: '← Volver al tagging' },
    { id: 'clips', label: 'Clips' },
    { id: 'export-match', label: 'Exportar partido' },
    { id: 'export', label: 'Exportar PDF' },
  ], (id) => {
    if (id === 'tagging') navigate('tagging', { matchId: state.match.id });
    if (id === 'clips') navigate('clips', { matchId: state.match.id });
    if (id === 'export-match') exportMatchArchive(container, state);
    if (id === 'export') exportPdf(container, state);
  });

  container.innerHTML = buildDashboardMarkup(state.stats, state.match, state.selectedView, state.heatmapFilter, state.preferences, state.customizerOpen, state.ai, state.aiLoading, state.aiPanelCollapsed, state.exportTemplates, state.exportTemplateId, state.eventLinkLimits, state.taggingLabels);
  renderDashboardFloatingActions(state.match);
  renderDashboardNotesDrawer(state.match);
  wireDashboard(container, state);
  renderCharts(state.stats, state.selectedView, state.charts, state.taggingLabels).catch(() => {});
  renderHeatmap(
    /** @type {SVGSVGElement|null} */ (container.querySelector('#dashboard-heatmap')),
    container.querySelector('#dashboard-heatmap-empty'),
    state.match,
    state.stats,
    state.selectedView,
    state.heatmapFilter,
    state.preferences.filters
  );
  animateDashboardKpis(container);
  focusDashboardSection(container, state.focusSection);
}

/**
 * @param {HTMLElement} container
 * @param {string|null|undefined} sectionId
 */
function focusDashboardSection(container, sectionId) {
  if (!sectionId) return;
  const section = container.querySelector(`[data-dashboard-section="${sectionId}"]`);
  if (!section) return;
  section.classList.remove('collapsed');
  section.setAttribute('tabindex', '-1');
  section.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  section.focus?.({ preventScroll: true });
}

/**
 * Renders the Dashboard view.
 * @param {HTMLElement} container
 * @param {{matchId?: string, focusSection?: string}} params
 */
export function renderDashboard(container, params = {}) {
  if (cleanupDashboard) cleanupDashboard();
  container.classList.add('dashboard-content-body');

  let disposed = false;
  const state = {
    match: null,
    stats: null,
    selectedView: 'bigua',
    heatmapFilter: 'all',
    preferences: normalizeDashboardPreferences(DEFAULT_DASHBOARD_PREFERENCES),
    customizerOpen: false,
    aiPanelCollapsed: false,
    charts: {},
    ai: { status: 'missing', hasAnalysis: false },
    aiLoading: false,
    exportTemplates: [],
    exportTemplateId: 'system-default',
    eventLinkLimits: {},
    taggingLabels: getEventLabels(),
    noteFormats: createEmptyNoteFormats(),
    settingsCleanup: null,
    noteToolbarCleanup: null,
    focusSection: params.focusSection === 'heatmap' ? 'heatmap' : null,
  };

  cleanupDashboard = () => {
    disposed = true;
    container.classList.remove('dashboard-content-body');
    destroyCharts(state.charts);
    state.settingsCleanup?.();
    state.settingsCleanup = null;
    state.noteToolbarCleanup?.();
    state.noteToolbarCleanup = null;
    removeDashboardFloatingActions();
    removeDashboardNotesDrawer();
  };

  setSidebarExpanded(false);
  updateTopbarContext('Dashboard');
  setTopbarActions([{ id: 'home', label: 'Inicio' }], () => navigate('home'));
  container.innerHTML = `
    <section class="dashboard-view view-enter">
      <div class="dashboard-loading">Cargando dashboard...</div>
    </section>
  `;

  load();
  return cleanupDashboard;

  async function load() {
    try {
      if (!params.matchId) {
        const matches = await cloudMatchService.listMatches({ localFirst: true, refreshInBackground: true });
        if (!disposed) renderDashboardSelection(container, matches, state.focusSection === 'heatmap' ? 'heatmap' : 'dashboard');
        return;
      }

      const [match, settings, pdfTemplates] = await Promise.all([
        cloudMatchService.getMatchById(params.matchId, { localFirst: true }),
        window.api.settings.get(),
        loadPdfTemplatesForExport(),
      ]);
      if (disposed) return;
      state.match = match;
      state.taggingLabels = getEventLabels(settings.tagging);
      state.preferences = normalizeDashboardPreferences(settings.dashboard);
      state.exportTemplates = Array.isArray(pdfTemplates) ? pdfTemplates : [];
      state.exportTemplateId = getDefaultExportTemplateId(state.exportTemplates);
      state.selectedView = getViewFromPreferences(state.preferences);
      await reloadDashboardStats(state);
      if (disposed) return;
      state.settingsCleanup = window.api.settings.onChanged?.(async (nextSettings) => {
        if (disposed || !state.match?.id) return;
        state.taggingLabels = getEventLabels(nextSettings.tagging);
        state.preferences = normalizeDashboardPreferences(nextSettings.dashboard);
        state.selectedView = getViewFromPreferences(state.preferences);
        await reloadDashboardStats(state);
        await refreshAIAnalysis(state);
        renderLoadedDashboard(container, state);
      });
      renderLoadedDashboard(container, state);
      void refreshAIAnalysis(state).then(() => {
        if (!disposed) renderLoadedDashboard(container, state);
      });
    } catch (error) {
      if (disposed) return;
      const detail = error instanceof Error ? error.message : 'Error desconocido';
      container.innerHTML = `
        <div class="error-state">
          <h3 class="error-state-title">Error al cargar dashboard</h3>
          <p class="error-state-text">No se pudo abrir el dashboard. Detalle tecnico: ${escapeHtml(detail)}</p>
          <button class="btn btn-primary" id="dashboard-home-btn">Volver al inicio</button>
        </div>
      `;
      container.querySelector('#dashboard-home-btn')?.addEventListener('click', () => navigate('home'));
    }
  }
}
