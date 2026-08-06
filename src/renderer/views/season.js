// @ts-check
import { createKpiCard } from '../components/kpi-card.js';
import { cloudMatchService } from '../cloud/cloud-match-service.js';
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { navigate } from '../router.js';
import { DEFAULT_EVENT_LABELS, getEventLabel } from '../tagging/event-labels.js';
import { getEventLabels } from '../tagging/event-labels.js';
import { ensureChartJs } from '../vendor-loader.js';

const METRICS = [
  { id: 'rucks', canvasId: 'chart-season-rucks', label: '% Rucks ganados', key: 'ruckWinPct', threshold: 'ruckWinPctMin', thresholdMode: 'min' },
  { id: 'penalties', canvasId: 'chart-season-penalties', label: 'Penales totales', key: 'penalties', threshold: 'penaltiesMax', thresholdMode: 'max' },
  { id: 'lineouts', canvasId: 'chart-season-lineouts', label: '% Line Outs ganados', key: 'lineoutWinPct', threshold: 'lineoutWinPctMin', thresholdMode: 'min' },
  { id: 'breaklines', canvasId: 'chart-season-breaklines', label: 'Break Lines concedidas', key: 'breakLinesConceded', threshold: 'breakLinesConcededMax', thresholdMode: 'max' },
];

function getSeasonEventLabel(type, taggingLabels, fallback) {
  const configured = String(taggingLabels?.[type] || '').trim();
  return configured && configured !== DEFAULT_EVENT_LABELS[type]
    ? getEventLabel(type, taggingLabels)
    : fallback;
}

function getSeasonMetrics(taggingLabels = {}) {
  return METRICS.map(metric => ({
    ...metric,
    label: metric.id === 'rucks'
      ? `% ${getSeasonEventLabel('ruck', taggingLabels, 'Rucks')} ganados`
      : metric.id === 'penalties'
        ? `${getSeasonEventLabel('penal', taggingLabels, 'Penales')} totales`
        : metric.id === 'lineouts'
          ? `% ${getSeasonEventLabel('lineout', taggingLabels, 'Line Outs')} ganados`
          : `${getSeasonEventLabel('break-line', taggingLabels, 'Break Lines')} concedidas`,
  }));
}

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
 * @param {number} value
 * @returns {string}
 */
function formatMetric(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '0';
}

/**
 * @param {object} season
 * @returns {Array<object>}
 */
function buildSeasonKpis(season, taggingLabels = {}) {
  const averages = season.averages || {};
  const thresholds = season.thresholds || {};
  const metrics = getSeasonMetrics(taggingLabels);
  return [
    {
      label: metrics.find(metric => metric.id === 'rucks').label,
      value: `${formatMetric(averages.ruckWinPct)}%`,
      delta: `Umbral ${thresholds.ruckWinPctMin}%`,
      state: averages.ruckWinPct < thresholds.ruckWinPctMin ? 'alert' : 'positive',
      size: 'medium',
    },
    {
      label: getSeasonEventLabel('penal', taggingLabels, 'Penales'),
      value: formatMetric(averages.penalties),
      delta: `Max ${thresholds.penaltiesMax}`,
      state: averages.penalties > thresholds.penaltiesMax ? 'alert' : 'normal',
      size: 'medium',
    },
    {
      label: `% ${getSeasonEventLabel('lineout', taggingLabels, 'Line Outs')}`,
      value: `${formatMetric(averages.lineoutWinPct)}%`,
      delta: `Umbral ${thresholds.lineoutWinPctMin}%`,
      state: averages.lineoutWinPct < thresholds.lineoutWinPctMin ? 'alert' : 'positive',
      size: 'medium',
    },
    {
      label: `${getSeasonEventLabel('break-line', taggingLabels, 'Break Lines')} conc.`,
      value: formatMetric(averages.breakLinesConceded),
      delta: `Max ${thresholds.breakLinesConcededMax}`,
      state: averages.breakLinesConceded > thresholds.breakLinesConcededMax ? 'alert' : 'normal',
      size: 'medium',
    },
  ];
}

/**
 * @param {Array<object>} matches
 * @param {string} key
 * @param {'asc'|'desc'} direction
 * @returns {Array<object>}
 */
function sortMatches(matches, key, direction) {
  return [...matches].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    const result = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left || '').localeCompare(String(right || ''));
    return direction === 'asc' ? result : -result;
  });
}

/**
 * @param {object} colors
 */
function configureSeasonCharts(colors) {
  if (!window.Chart) return;
  window.Chart.defaults.color = colors.text;
  window.Chart.defaults.borderColor = colors.border;
  window.Chart.defaults.font.family = 'Arial, sans-serif';
  window.Chart.defaults.plugins.tooltip.backgroundColor = colors.tooltipBg;
  window.Chart.defaults.plugins.tooltip.titleColor = colors.tooltipTitle;
  window.Chart.defaults.plugins.tooltip.bodyColor = colors.tooltipBody;
}

/**
 * @returns {object}
 */
function getSeasonChartColors() {
  const styles = getComputedStyle(document.documentElement);
  const getToken = (name, fallback = 'currentColor') => styles.getPropertyValue(name).trim() || fallback;
  const tooltipTitle = styles.getPropertyValue('--color-text-primary').trim() || 'currentColor';
  const area = styles.getPropertyValue('--tag-neutral-soft').trim() || 'transparent';
  return {
    accent: getToken('--color-accent'),
    line: getToken('--tag-ataque'),
    text: getToken('--color-text-secondary'),
    border: getToken('--color-border'),
    tooltipBg: getToken('--color-bg-elevated'),
    tooltipTitle,
    tooltipBody: getToken('--color-text-secondary'),
    area,
  };
}

/**
 * @param {HTMLElement} container
 * @param {object} state
 */
async function renderSeasonCharts(container, state, isActive = () => true) {
  await ensureChartJs();
  if (!isActive()) return;
  const colors = getSeasonChartColors();
  configureSeasonCharts(colors);
  state.charts.forEach(chart => chart.destroy());
  state.charts = [];
  if (!window.Chart) return;

  const labels = state.filteredMatches.map(match => `${match.rival} ${String(match.date || '').slice(5)}`);
  getSeasonMetrics(state.eventLabels).forEach((metric) => {
    if (!isActive()) return;
    const canvas = /** @type {HTMLCanvasElement|null} */ (container.querySelector(`#${metric.canvasId}`));
    if (!canvas) return;
    const threshold = Number(state.season.thresholds?.[metric.threshold]) || 0;
    state.charts.push(new window.Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: metric.label,
            data: state.filteredMatches.map(match => Number(match[metric.key]) || 0),
            borderColor: colors.line,
            backgroundColor: colors.area,
            pointBackgroundColor: colors.line,
            tension: 0.32,
            fill: true,
          },
          {
            label: 'Umbral',
            data: state.filteredMatches.map(() => threshold),
            borderColor: colors.accent,
            borderDash: [6, 6],
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => state.filteredMatches[items[0]?.dataIndex]?.label || '',
              label: (item) => `${item.dataset.label}: ${item.formattedValue}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true },
        },
      },
    }));
  });
}

/**
 * @param {HTMLElement} container
 */
export function renderSeason(container, params = {}, lifecycle = {}) {
  let disposed = false;
  const isActive = () => !disposed
    && lifecycle?.isCurrent?.() !== false
    && lifecycle?.signal?.aborted !== true;
  setSidebarExpanded(false);
  const year = new Date().getFullYear();
  updateTopbarContext(`Temporada ${year}`);
  setTopbarActions([{ id: 'home', label: 'Inicio' }], () => navigate('home'));

  const state = {
    season: null,
    sortKey: 'date',
    sortDirection: 'asc',
    competition: 'all',
    filteredMatches: [],
    charts: [],
    eventLabels: getEventLabels(),
  };

  container.innerHTML = `
    <section class="season-view view-enter">
      <div class="season-loading">Cargando temporada...</div>
    </section>
  `;

  load();

  const cleanup = () => {
    disposed = true;
    state.charts.forEach(chart => chart.destroy());
    state.charts = [];
  };
  return cleanup;

  async function load() {
    try {
      await cloudMatchService.listMatches({ localFirst: true, refreshInBackground: true });
      if (!isActive()) return;
      const [settings, season] = await Promise.all([
        window.api.settings.get(),
        window.api.analytics.getSeasonStats(year),
      ]);
      if (!isActive()) return;
      state.eventLabels = getEventLabels(settings.tagging);
      state.season = season;
      applyFilters();
      render();
    } catch (error) {
      if (!isActive()) return;
      container.innerHTML = `
        <section class="season-view view-enter">
          <div class="error-state">
            <h3 class="error-state-title">No se pudo cargar la temporada</h3>
            <p class="error-state-text">${escapeHtml(error.message || 'Reintenta desde Inicio.')}</p>
            <button class="btn btn-primary" id="season-retry-btn">Reintentar</button>
          </div>
        </section>
      `;
      container.querySelector('#season-retry-btn')?.addEventListener('click', () => void load());
    }
  }

  function applyFilters() {
    const matches = state.competition === 'all'
      ? state.season.matches
      : state.season.matches.filter(match => match.competition === state.competition);
    state.filteredMatches = sortMatches(matches, state.sortKey, state.sortDirection);
  }

  function render() {
    const season = state.season;
    container.innerHTML = `
      <section class="season-view view-enter">
        <header class="season-header">
          <div>
            <span class="season-eyebrow">Temporada ${season.year}</span>
            <h1>Evolución histórica</h1>
          </div>
          <label class="season-filter">
            <span>Competencia</span>
            <select data-season-competition>
              <option value="all">Todas</option>
              ${season.competitions.map(competition => `<option value="${escapeHtml(competition)}"${state.competition === competition ? ' selected' : ''}>${escapeHtml(competition)}</option>`).join('')}
            </select>
          </label>
        </header>
        <div class="season-kpi-row">
          ${buildSeasonKpis(season, state.eventLabels).map(kpi => createKpiCard(kpi).outerHTML).join('')}
        </div>
        ${state.season.matches.length === 0 ? `
          <section class="season-empty-state">
            <span>Sin partidos</span>
            <h2>Todavia no hay datos de temporada</h2>
            <p>Cuando cargues partidos, esta pantalla va a mostrar evolucion, promedios y comparativas por competencia.</p>
            <button class="btn btn-primary" type="button" data-season-home>Crear partido</button>
          </section>
        ` : ''}
        <section class="season-table-panel">
          <table class="season-table">
            <thead>
              <tr>
                ${[
                  ['date', 'Fecha'],
                  ['rival', 'Rival'],
                  ['score', 'Resultado'],
                  ['competition', 'Competencia'],
                  ['ruckWinPct', `% ${getSeasonEventLabel('ruck', state.eventLabels, 'Rucks')}`],
                  ['penalties', getSeasonEventLabel('penal', state.eventLabels, 'Penales')],
                  ['lineoutWinPct', `% ${getSeasonEventLabel('lineout', state.eventLabels, 'Line Outs')}`],
                  ['breakLinesConceded', getSeasonEventLabel('break-line', state.eventLabels, 'Break Lines')],
                ].map(([key, label]) => `<th><button type="button" data-season-sort="${key}">${label}</button></th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${state.filteredMatches.map(match => `
                <tr data-season-match-id="${escapeHtml(match.id)}">
                  <td>${escapeHtml(match.date)}</td>
                  <td>${escapeHtml(match.rival)}</td>
                  <td>${escapeHtml(match.score)}</td>
                  <td>${escapeHtml(match.competition)}</td>
                  <td>${escapeHtml(match.ruckWinPct)}%</td>
                  <td>${escapeHtml(match.penalties)}</td>
                  <td>${escapeHtml(match.lineoutWinPct)}%</td>
                  <td>${escapeHtml(match.breakLinesConceded)}</td>
                </tr>
              `).join('') || '<tr><td colspan="8">Sin partidos para esta competencia. Cambia el filtro o carga un partido desde Inicio.</td></tr>'}
            </tbody>
          </table>
        </section>
        <section class="season-chart-grid" ${state.filteredMatches.length === 0 ? 'hidden' : ''}>
          ${getSeasonMetrics(state.eventLabels).map(metric => `
            <article class="season-chart-card">
              <h2>${escapeHtml(metric.label)}</h2>
              <div class="season-chart-shell"><canvas id="${metric.canvasId}"></canvas></div>
            </article>
          `).join('')}
        </section>
      </section>
    `;

    container.querySelector('[data-season-competition]')?.addEventListener('change', (event) => {
      state.competition = /** @type {HTMLSelectElement} */ (event.currentTarget).value;
      applyFilters();
      render();
    });
    container.querySelector('[data-season-home]')?.addEventListener('click', () => navigate('home'));
    container.querySelectorAll('[data-season-sort]').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-season-sort') || 'date';
        state.sortDirection = state.sortKey === key && state.sortDirection === 'asc' ? 'desc' : 'asc';
        state.sortKey = key;
        applyFilters();
        render();
      });
    });
    container.querySelectorAll('[data-season-match-id]').forEach(row => {
      row.addEventListener('click', () => navigate('dashboard', { matchId: row.getAttribute('data-season-match-id') }));
    });
    renderSeasonCharts(container, state, isActive).catch(() => {});
  }
}
