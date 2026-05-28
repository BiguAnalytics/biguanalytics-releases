// @ts-check
import { createKpiCard } from '../components/kpi-card.js';
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { navigate } from '../router.js';

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
  ['possession', 'Posesion'],
  ['bip', 'BIP'],
  ['sequences', 'Secuencias'],
  ['heatmap', 'Heatmap'],
];

let cleanupDashboard = null;

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
  window.Chart.defaults.plugins.legend.labels.color = colors.text;
  window.Chart.defaults.plugins.tooltip.backgroundColor = colors.tooltipBg;
  window.Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.12)';
  window.Chart.defaults.plugins.tooltip.borderWidth = 1;
  window.Chart.defaults.plugins.tooltip.titleColor = '#F0F4F8';
  window.Chart.defaults.plugins.tooltip.bodyColor = '#8A9BB0';
  window.Chart.defaults.plugins.tooltip.padding = 12;
  window.Chart.defaults.plugins.tooltip.cornerRadius = 8;
}

/**
 * @param {HTMLElement} container
 * @param {Array<object>} matches
 */
function renderDashboardSelection(container, matches) {
  setSidebarExpanded(false);
  updateTopbarContext('Dashboard');
  setTopbarActions([{ id: 'home', label: 'Inicio' }], () => navigate('home'));

  const sorted = [...matches].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
  container.innerHTML = `
    <section class="dashboard-view dashboard-select-view view-enter">
      <header class="dashboard-empty-header">
        <span>Dashboard</span>
        <h1>Elegir partido para analizar</h1>
        <p>Selecciona un partido con eventos taggeados para abrir el tablero.</p>
      </header>
      <div class="dashboard-match-grid">
        ${sorted.map(match => `
          <button class="dashboard-match-option" type="button" data-dashboard-match-id="${escapeHtml(match.id)}">
            <span>${escapeHtml(match.competition || 'Sin competencia')}</span>
            <strong>${escapeHtml(match.homeTeam || 'Bigua')} vs ${escapeHtml(match.awayTeam || 'Rival')}</strong>
            <em>${escapeHtml(match.date || 'Sin fecha')}</em>
          </button>
        `).join('')}
      </div>
    </section>
  `;

  container.querySelectorAll('[data-dashboard-match-id]').forEach(button => {
    button.addEventListener('click', () => navigate('dashboard', { matchId: button.dataset.dashboardMatchId }));
  });
}

/**
 * @param {object} stats
 * @returns {'victoria'|'derrota'|'empate'}
 */
function getResultBadge(stats) {
  const bigua = stats.teams.biguaTeam;
  const rival = stats.teams.rivalTeam;
  if (stats.score[bigua].total > stats.score[rival].total) return 'victoria';
  if (stats.score[bigua].total < stats.score[rival].total) return 'derrota';
  return 'empate';
}

/**
 * @param {object} stats
 * @returns {Array<object>}
 */
function buildKpis(stats) {
  const bigua = stats.teams.biguaTeam;
  const hasAlert = (metric) => stats.alerts.some(alert => alert.equipo === stats.teams.biguaName && alert.metrica === metric);
  return [
    {
      label: '% Rucks ganados',
      value: formatPct(stats.rucks[bigua].wonPct),
      delta: `${stats.rucks[bigua].won}/${stats.rucks[bigua].total} rucks`,
      state: hasAlert('% Rucks ganados') ? 'alert' : 'positive',
      size: 'large',
    },
    {
      label: 'Penales totales',
      value: formatNumber(stats.discipline[bigua].penalties.total),
      delta: `${stats.discipline[bigua].penalties.attack} ataque / ${stats.discipline[bigua].penalties.defense} defensa`,
      state: hasAlert('Penales totales') ? 'alert' : 'normal',
      size: 'large',
    },
    {
      label: '% Line Outs ganados',
      value: formatPct(stats.setPieces.lineouts[bigua].wonPct),
      delta: `${stats.setPieces.lineouts[bigua].won}/${stats.setPieces.lineouts[bigua].total} line outs`,
      state: hasAlert('% Line Outs ganados') ? 'alert' : 'positive',
      size: 'large',
    },
    {
      label: 'Break Lines',
      value: formatNumber(stats.breakLines[bigua].total),
      delta: `Killer instinct ${formatPct(stats.breakLines[bigua].killerInstinctPct)}`,
      state: 'normal',
      size: 'large',
    },
  ];
}

/**
 * @param {object} stats
 * @param {object} match
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {string} heatmapFilter
 * @returns {string}
 */
function buildDashboardMarkup(stats, match, selectedView, heatmapFilter) {
  const badge = getResultBadge(stats);
  const kpis = buildKpis(stats);
  return `
    <section class="dashboard-view view-enter">
      <header class="dashboard-match-header">
        <div class="dashboard-match-meta">
          <span>${escapeHtml(stats.match.competition || 'Sin competencia')}</span>
          <span>${escapeHtml(stats.match.date || 'Sin fecha')}</span>
        </div>
        <div class="dashboard-scoreline" aria-label="Score final">
          <span>${escapeHtml(stats.match.homeTeam)}</span>
          <strong class="tabular-nums">${stats.score.home.total} - ${stats.score.away.total}</strong>
          <span>${escapeHtml(stats.match.awayTeam)}</span>
        </div>
        <div class="badge ${badge}">${badge}</div>
      </header>

      <div class="dashboard-kpi-row">
        ${kpis.map(kpi => `<div data-kpi>${createKpiCard(kpi).outerHTML}</div>`).join('')}
      </div>

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

      <div class="dashboard-sections">
        ${SECTION_ORDER.map(([id, title]) => buildSection(id, title, stats, selectedView, heatmapFilter)).join('')}
      </div>

      <button class="dashboard-notes-button${match.coachNotes ? ' has-notes' : ''}" type="button" data-notes-open aria-label="Notas del entrenador">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
        <span></span>
      </button>

      <aside class="dashboard-notes-drawer" id="dashboard-notes-drawer" aria-hidden="true">
        <div class="dashboard-notes-panel">
          <header>
            <div>
              <span>Notas del Entrenador</span>
              <h2>Conclusiones del partido</h2>
            </div>
            <button type="button" data-notes-close aria-label="Cerrar notas">x</button>
          </header>
          <textarea id="coach-notes" spellcheck="true" placeholder="Escribi conclusiones, decisiones tacticas o focos de entrenamiento.">${escapeHtml(match.coachNotes || '')}</textarea>
          <p>Ctrl+B aplica negrita. Las lineas que empiezan con - se exportan como lista.</p>
        </div>
      </aside>

      <div class="dashboard-toast" id="dashboard-toast" role="status" hidden></div>
    </section>
  `;
}

/**
 * @param {string} id
 * @param {string} title
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {string} heatmapFilter
 * @returns {string}
 */
function buildSection(id, title, stats, selectedView, heatmapFilter) {
  const body = {
    'set-pieces': '<div class="chart-shell"><canvas id="chart-set-pieces"></canvas></div>',
    rucks: '<div class="chart-shell chart-shell-compact"><canvas id="chart-rucks"></canvas></div>',
    discipline: '<div class="chart-shell"><canvas id="chart-discipline"></canvas></div>',
    kicks: '<div class="chart-shell"><canvas id="chart-kicks"></canvas></div>',
    'break-lines': '<div class="chart-shell"><canvas id="chart-break-lines"></canvas></div>',
    possession: buildPossessionBody(stats),
    bip: '<div class="chart-shell"><canvas id="chart-bip"></canvas></div>',
    sequences: buildSequencesBody(stats),
    heatmap: buildHeatmapBody(stats, selectedView, heatmapFilter),
  }[id];

  return `
    <section class="dashboard-section" data-dashboard-section="${id}">
      <button class="dashboard-section-header" type="button" data-section-toggle>
        <span class="dashboard-section-title">${title}</span>
        <span class="dashboard-section-chevron">›</span>
      </button>
      <div class="dashboard-section-body">
        ${body}
      </div>
    </section>
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
    <div class="chart-shell"><canvas id="chart-possession"></canvas></div>
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
      <canvas id="dashboard-heatmap" width="960" height="520" data-view="${selectedView}"></canvas>
      <p class="dashboard-heatmap-empty" id="dashboard-heatmap-empty" hidden>No hay datos de zona para este partido.</p>
    </div>
  `;
}

/**
 * @param {Record<string, object>} charts
 */
function destroyCharts(charts) {
  Object.values(charts).forEach(chart => chart?.destroy?.());
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
  charts[key] = new window.Chart(canvas, config);
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {Record<string, object>} charts
 */
function renderCharts(stats, selectedView, charts) {
  destroyCharts(charts);
  const colors = getChartColors();
  configureChartDefaults(colors);

  createSetPiecesChart(stats, selectedView, colors, charts);
  createRucksChart(stats, selectedView, colors, charts);
  createDisciplineChart(stats, selectedView, colors, charts);
  createKicksChart(stats, selectedView, colors, charts);
  createBreakLinesChart(stats, selectedView, colors, charts);
  createPossessionChart(stats, colors, charts);
  createBipChart(stats, colors, charts);
}

/**
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {object} colors
 * @param {Record<string, object>} charts
 */
function createSetPiecesChart(stats, selectedView, colors, charts) {
  const teams = selectedView === 'compare'
    ? ['home', 'away']
    : [getSelectedTeam(stats, selectedView)];
  const labels = teams.flatMap(team => [`${getTeamName(stats, team)} Scrum`, `${getTeamName(stats, team)} Line`]);
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
function createDisciplineChart(stats, selectedView, colors, charts) {
  const teams = selectedView === 'compare' ? ['home', 'away'] : [getSelectedTeam(stats, selectedView)];
  const labels = ['ruck', 'scrum', 'offside', 'maul', 'inconducta', 'otro'];
  createChart(document.getElementById('chart-discipline'), {
    type: 'bar',
    data: {
      labels: labels.map(formatLabel),
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
function createKicksChart(stats, selectedView, colors, charts) {
  const players = selectedView === 'compare'
    ? [...stats.kicks.home.byPlayer, ...stats.kicks.away.byPlayer]
    : stats.kicks[getSelectedTeam(stats, selectedView)].byPlayer;
  createChart(document.getElementById('chart-kicks'), {
    type: 'bar',
    data: {
      labels: players.map(player => player.player),
      datasets: [{
        label: 'Efectividad',
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
function createBreakLinesChart(stats, selectedView, colors, charts) {
  const teams = selectedView === 'compare' ? ['home', 'away'] : [getSelectedTeam(stats, selectedView)];
  const results = ['try', 'palos', 'turnover', 'pfk-favor', 'pfk-contra', 'juego'];
  const palette = [colors.positive, colors.warning, colors.negative, colors.rival, colors.defense, colors.localLight];
  createChart(document.getElementById('chart-break-lines'), {
    type: 'bar',
    data: {
      labels: teams.map(team => getTeamName(stats, team)),
      datasets: results.map((result, index) => ({
        label: formatLabel(result),
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
              return pct(home, total);
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
              return pct(away, total);
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
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 */
function drawRugbyField(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(10, 64, 42, 0.42)';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, width - 32, height - 32);
  for (let x = 1; x < 5; x += 1) {
    ctx.beginPath();
    ctx.moveTo(16 + ((width - 32) / 5) * x, 16);
    ctx.lineTo(16 + ((width - 32) / 5) * x, height - 16);
    ctx.stroke();
  }
  for (let y = 1; y < 3; y += 1) {
    ctx.beginPath();
    ctx.moveTo(16, 16 + ((height - 32) / 3) * y);
    ctx.lineTo(width - 16, 16 + ((height - 32) / 3) * y);
    ctx.stroke();
  }
}

/**
 * @param {HTMLCanvasElement|null} canvas
 * @param {HTMLElement|null} empty
 * @param {object} match
 * @param {object} stats
 * @param {'bigua'|'rival'|'compare'} selectedView
 * @param {string} heatmapFilter
 */
function renderHeatmap(canvas, empty, match, stats, selectedView, heatmapFilter) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  drawRugbyField(ctx, width, height);

  const team = getSelectedTeam(stats, selectedView);
  const zoneCounts = {};
  (match.events || [])
    .filter(event => event.zone && eventMatchesHeatmapFilter(event, heatmapFilter))
    .filter(event => !team || event.team === team)
    .forEach((event) => {
      zoneCounts[event.zone] = (zoneCounts[event.zone] || 0) + 1;
    });
  const max = Object.values(zoneCounts).reduce((value, count) => Math.max(value, count), 0);
  if (empty) empty.hidden = max > 0;
  if (max <= 0) return;

  const fieldX = 16;
  const fieldY = 16;
  const fieldW = width - 32;
  const fieldH = height - 32;
  const cellW = fieldW / 5;
  const cellH = fieldH / 3;

  for (let column = 0; column < 5; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      const zone = `Z${column * 3 + row + 1}`;
      const count = zoneCounts[zone] || 0;
      const intensity = count / max;
      ctx.fillStyle = `rgba(200, 16, 46, ${round(intensity, 2)})`;
      ctx.fillRect(fieldX + column * cellW, fieldY + row * cellH, cellW, cellH);
      ctx.fillStyle = 'rgba(240, 244, 248, 0.86)';
      ctx.font = '900 18px Arial';
      ctx.fillText(zone.replace('Z', ''), fieldX + column * cellW + 16, fieldY + row * cellH + 28);
      if (count > 0) {
        ctx.font = '400 13px Arial';
        ctx.fillText(String(count), fieldX + column * cellW + 16, fieldY + row * cellH + 50);
      }
    }
  }
}

/**
 * @param {HTMLTextAreaElement} textarea
 */
function applyBoldShortcut(textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || 'texto';
  textarea.setRangeText(`**${selected}**`, start, end, 'select');
}

/**
 * @param {string} text
 * @returns {string}
 */
function markdownToPrintHtml(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .split('\n')
    .map(line => line.startsWith('- ') ? `<li>${line.slice(2)}</li>` : `<p>${line}</p>`)
    .join('');
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

  container.querySelectorAll('[data-dashboard-view]').forEach(button => {
    button.addEventListener('click', () => {
      state.selectedView = button.dataset.dashboardView;
      renderLoadedDashboard(container, state);
    });
  });

  container.querySelectorAll('[data-heatmap-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.heatmapFilter = button.dataset.heatmapFilter || 'all';
      renderLoadedDashboard(container, state);
    });
  });

  const drawer = container.querySelector('#dashboard-notes-drawer');
  const textarea = /** @type {HTMLTextAreaElement|null} */ (container.querySelector('#coach-notes'));
  container.querySelector('[data-notes-open]')?.addEventListener('click', () => {
    drawer?.setAttribute('aria-hidden', 'false');
    textarea?.focus();
  });
  container.querySelector('[data-notes-close]')?.addEventListener('click', () => {
    drawer?.setAttribute('aria-hidden', 'true');
  });
  textarea?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      applyBoldShortcut(textarea);
    }
  });
  textarea?.addEventListener('blur', async () => {
    state.match = await window.api.matches.update(state.match.id, { coachNotes: textarea.value });
    const noteButton = container.querySelector('[data-notes-open]');
    noteButton?.classList.toggle('has-notes', Boolean(textarea.value.trim()));
  });
}

/**
 * @param {HTMLElement} container
 * @param {string} message
 * @param {string|null} filePath
 */
function showToast(container, message, filePath = null) {
  const toast = container.querySelector('#dashboard-toast');
  if (!toast) return;
  toast.hidden = false;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    ${filePath ? '<button type="button" data-open-export>Abrir archivo</button>' : ''}
  `;
  toast.querySelector('[data-open-export]')?.addEventListener('click', () => {
    window.api.files.open(filePath);
  });
  window.setTimeout(() => {
    toast.hidden = true;
  }, 5000);
}

/**
 * @param {object} state
 * @returns {object}
 */
function collectPrintPayload(state) {
  const chartImages = {};
  Object.entries(state.charts).forEach(([key, chart]) => {
    if (typeof chart.toBase64Image === 'function') {
      chartImages[key] = chart.toBase64Image();
    }
  });
  const heatmapCanvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('dashboard-heatmap'));
  return {
    chartImages,
    heatmapImage: heatmapCanvas ? heatmapCanvas.toDataURL('image/png') : '',
    notesHtml: markdownToPrintHtml(state.match.coachNotes || ''),
    selectedView: state.selectedView,
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
    const result = await window.api.analytics.exportPdf(state.match.id, collectPrintPayload(state));
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
function renderLoadedDashboard(container, state) {
  updateTopbarContext(`${state.match.homeTeam || 'Bigua'} vs ${state.match.awayTeam || 'Rival'}`);
  setTopbarActions([
    { id: 'tagging', label: '← Volver al tagging' },
    { id: 'export', label: 'Exportar PDF' },
  ], (id) => {
    if (id === 'tagging') navigate('tagging', { matchId: state.match.id });
    if (id === 'export') exportPdf(container, state);
  });

  container.innerHTML = buildDashboardMarkup(state.stats, state.match, state.selectedView, state.heatmapFilter);
  wireDashboard(container, state);
  renderCharts(state.stats, state.selectedView, state.charts);
  renderHeatmap(
    /** @type {HTMLCanvasElement|null} */ (container.querySelector('#dashboard-heatmap')),
    container.querySelector('#dashboard-heatmap-empty'),
    state.match,
    state.stats,
    state.selectedView,
    state.heatmapFilter
  );
}

/**
 * Renders the Dashboard view.
 * @param {HTMLElement} container
 * @param {{matchId?: string}} params
 */
export function renderDashboard(container, params = {}) {
  if (cleanupDashboard) cleanupDashboard();

  let disposed = false;
  const state = {
    match: null,
    stats: null,
    selectedView: 'bigua',
    heatmapFilter: 'all',
    charts: {},
    settingsCleanup: null,
  };

  cleanupDashboard = () => {
    disposed = true;
    destroyCharts(state.charts);
    state.settingsCleanup?.();
    state.settingsCleanup = null;
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
        const matches = await window.api.matches.getAll();
        if (!disposed) renderDashboardSelection(container, matches);
        return;
      }

      const [match, stats] = await Promise.all([
        window.api.matches.getById(params.matchId),
        window.api.analytics.getMatchStats(params.matchId),
      ]);
      if (disposed) return;
      state.match = match;
      state.stats = stats;
      state.settingsCleanup = window.api.settings.onChanged?.(async () => {
        if (disposed || !state.match?.id) return;
        state.stats = await window.api.analytics.getMatchStats(state.match.id);
        renderLoadedDashboard(container, state);
      });
      renderLoadedDashboard(container, state);
    } catch (error) {
      if (disposed) return;
      container.innerHTML = `
        <div class="error-state">
          <h3 class="error-state-title">Error al cargar dashboard</h3>
          <p class="error-state-text">${escapeHtml(error.message || 'No se pudo abrir el dashboard')}</p>
          <button class="btn btn-primary" id="dashboard-home-btn">Volver al inicio</button>
        </div>
      `;
      container.querySelector('#dashboard-home-btn')?.addEventListener('click', () => navigate('home'));
    }
  }
}
