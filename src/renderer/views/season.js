// @ts-check
import { createKpiCard } from '../components/kpi-card.js';
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { navigate } from '../router.js';

const METRICS = [
  { id: 'rucks', canvasId: 'chart-season-rucks', label: '% Rucks ganados', key: 'ruckWinPct', threshold: 'ruckWinPctMin', thresholdMode: 'min' },
  { id: 'penalties', canvasId: 'chart-season-penalties', label: 'Penales totales', key: 'penalties', threshold: 'penaltiesMax', thresholdMode: 'max' },
  { id: 'lineouts', canvasId: 'chart-season-lineouts', label: '% Line Outs ganados', key: 'lineoutWinPct', threshold: 'lineoutWinPctMin', thresholdMode: 'min' },
  { id: 'breaklines', canvasId: 'chart-season-breaklines', label: 'Break Lines concedidas', key: 'breakLinesConceded', threshold: 'breakLinesConcededMax', thresholdMode: 'max' },
];

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
function buildSeasonKpis(season) {
  const averages = season.averages || {};
  const thresholds = season.thresholds || {};
  return [
    {
      label: '% Rucks ganados',
      value: `${formatMetric(averages.ruckWinPct)}%`,
      delta: `Umbral ${thresholds.ruckWinPctMin}%`,
      state: averages.ruckWinPct < thresholds.ruckWinPctMin ? 'alert' : 'positive',
      size: 'medium',
    },
    {
      label: 'Penales',
      value: formatMetric(averages.penalties),
      delta: `Max ${thresholds.penaltiesMax}`,
      state: averages.penalties > thresholds.penaltiesMax ? 'alert' : 'normal',
      size: 'medium',
    },
    {
      label: '% Line Outs',
      value: `${formatMetric(averages.lineoutWinPct)}%`,
      delta: `Umbral ${thresholds.lineoutWinPctMin}%`,
      state: averages.lineoutWinPct < thresholds.lineoutWinPctMin ? 'alert' : 'positive',
      size: 'medium',
    },
    {
      label: 'Break Lines conc.',
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
  window.Chart.defaults.plugins.tooltip.titleColor = '#F0F4F8';
  window.Chart.defaults.plugins.tooltip.bodyColor = '#8A9BB0';
}

/**
 * @returns {object}
 */
function getSeasonChartColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    accent: styles.getPropertyValue('--color-accent').trim() || '#C8102E',
    line: styles.getPropertyValue('--tag-ataque').trim() || '#3B82F6',
    text: styles.getPropertyValue('--color-text-secondary').trim() || '#8A9BB0',
    border: styles.getPropertyValue('--color-border').trim() || 'rgba(255,255,255,0.08)',
    tooltipBg: styles.getPropertyValue('--color-bg-elevated').trim() || '#122035',
  };
}

/**
 * @param {HTMLElement} container
 * @param {object} state
 */
function renderSeasonCharts(container, state) {
  const colors = getSeasonChartColors();
  configureSeasonCharts(colors);
  state.charts.forEach(chart => chart.destroy());
  state.charts = [];
  if (!window.Chart) return;

  const labels = state.filteredMatches.map(match => `${match.rival} ${String(match.date || '').slice(5)}`);
  METRICS.forEach((metric) => {
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
            backgroundColor: 'rgba(59, 130, 246, 0.16)',
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
export function renderSeason(container) {
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
  };

  container.innerHTML = `
    <section class="season-view view-enter">
      <div class="season-loading">Cargando temporada...</div>
    </section>
  `;

  load();

  return () => {
    state.charts.forEach(chart => chart.destroy());
  };

  async function load() {
    state.season = await window.api.analytics.getSeasonStats(year);
    applyFilters();
    render();
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
            <h1>Evolution historica</h1>
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
          ${buildSeasonKpis(season).map(kpi => createKpiCard(kpi).outerHTML).join('')}
        </div>
        <section class="season-table-panel">
          <table class="season-table">
            <thead>
              <tr>
                ${[
                  ['date', 'Fecha'],
                  ['rival', 'Rival'],
                  ['score', 'Resultado'],
                  ['competition', 'Competencia'],
                  ['ruckWinPct', '% Rucks'],
                  ['penalties', 'Penales'],
                  ['lineoutWinPct', '% Line Outs'],
                  ['breakLinesConceded', 'Break Lines'],
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
              `).join('') || '<tr><td colspan="8">Sin partidos para esta temporada.</td></tr>'}
            </tbody>
          </table>
        </section>
        <section class="season-chart-grid">
          ${METRICS.map(metric => `
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
    renderSeasonCharts(container, state);
  }
}
