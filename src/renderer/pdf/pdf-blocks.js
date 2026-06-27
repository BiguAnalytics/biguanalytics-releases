// @ts-check
import { PDF_BLOCK_TYPES, getPdfBlockMetadata } from './pdf-block-registry.js';

export const GRID_COLUMNS = 12;
export const GRID_ROWS = {
  landscape: 24,
  portrait: 32,
};

export const BLOCK_TYPES = PDF_BLOCK_TYPES;

const CHART_BLOCKS = {
  'possession-chart': { key: 'possession' },
  'set-pieces-chart': { key: 'setPieces' },
  'rucks-chart': { key: 'rucks' },
  'penalties-chart': { key: 'discipline' },
  'break-lines-chart': { key: 'breakLines' },
  'kicks-chart': { key: 'kicks' },
  'bip-sequences-chart': { key: 'bip' },
};

const KPI_DEFINITIONS = {
  ruckWinPct: { label: '% Rucks ganados', path: ['rucks'], fallback: '0%' },
  penalties: { label: 'Penales totales', path: ['discipline'], fallback: '0' },
  lineoutWinPct: { label: '% Line Outs ganados', path: ['lineouts'], fallback: '0%' },
  scrumWinPct: { label: '% Scrums ganados', path: ['scrums'], fallback: '0%' },
  breakLines: { label: 'Break Lines', path: ['breakLines'], fallback: '0' },
  kicks: { label: 'Kicks', path: ['kicks'], fallback: '0' },
  possession: { label: 'Posesión', path: ['possession'], fallback: '0%' },
  territory: { label: 'Territorio', path: ['territory'], fallback: 'N/D' },
};

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
 * @param {string|number|null|undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function gridNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function blocksOverlap(a, b) {
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;
}

/**
 * @param {object} template
 * @returns {{valid: boolean, errors: Array<object>, warnings: Array<object>}}
 */
export function validateTemplateLayout(template = {}) {
  const errors = [];
  const warnings = [];
  const orientation = template.orientation === 'portrait' ? 'portrait' : 'landscape';
  const maxRows = GRID_ROWS[orientation];
  if (!Array.isArray(template.pages) || template.pages.length === 0) {
    errors.push({ code: 'template-without-pages', message: 'La plantilla no tiene páginas.' });
    return { valid: false, errors, warnings };
  }

  template.pages.forEach((page, pageIndex) => {
    const blocks = Array.isArray(page.blocks) ? page.blocks : [];
    blocks.forEach((block, blockIndex) => {
      const ref = { pageId: page.id, pageIndex, blockId: block.id, blockIndex };
      if (!BLOCK_TYPES.includes(String(block.type || ''))) {
        errors.push({ ...ref, code: 'unknown-block', message: 'Bloque desconocido.' });
      }
      if (
        !Number.isFinite(Number(block.x))
        || !Number.isFinite(Number(block.y))
        || !Number.isFinite(Number(block.w))
        || !Number.isFinite(Number(block.h))
        || block.x < 0
        || block.y < 0
        || block.w <= 0
        || block.h <= 0
        || block.x + block.w > GRID_COLUMNS
        || block.y + block.h > maxRows
      ) {
        errors.push({ ...ref, code: 'out-of-page', message: 'Bloque fuera de página.' });
      }
      blocks.slice(blockIndex + 1).forEach((nextBlock, offset) => {
        if (blocksOverlap(block, nextBlock)) {
          errors.push({
            ...ref,
            blockId: nextBlock.id,
            blockIndex: blockIndex + offset + 1,
            comparedWithBlockId: block.id,
            comparedWithBlockIndex: blockIndex,
            code: 'overlap',
            message: 'Bloque superpuesto.',
          });
        }
      });
    });
  });

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * @param {{x?: number, y?: number, w?: number, h?: number}} block
 * @returns {string}
 */
export function getPdfBlockGridStyle(block = {}) {
  const x = Math.max(0, gridNumber(block.x, 0));
  const y = Math.max(0, gridNumber(block.y, 0));
  const w = Math.max(1, Math.min(GRID_COLUMNS, gridNumber(block.w, 3)));
  const h = Math.max(1, gridNumber(block.h, 4));
  return `grid-column: ${x + 1} / span ${w}; grid-row: ${y + 1} / span ${h};`;
}

/**
 * @param {object} stats
 * @returns {{homeName: string, awayName: string, homeScore: number, awayScore: number, biguaTeam: string, rivalTeam: string}}
 */
function getMatchContext(stats = {}) {
  return {
    homeName: stats.match?.homeTeam || stats.teams?.home?.name || 'Bigua',
    awayName: stats.match?.awayTeam || stats.teams?.away?.name || 'Rival',
    homeScore: Number(stats.score?.home?.total || 0),
    awayScore: Number(stats.score?.away?.total || 0),
    biguaTeam: stats.teams?.biguaTeam || 'home',
    rivalTeam: stats.teams?.rivalTeam || 'away',
  };
}

/**
 * @param {object} stats
 * @param {Array<string>} selectedKpis
 * @returns {Array<{label: string, value: string|number}>}
 */
function getKpis(stats = {}, selectedKpis = []) {
  const context = getMatchContext(stats);
  const values = {
    ruckWinPct: formatPct(stats.rucks?.[context.biguaTeam]?.wonPct),
    penalties: stats.discipline?.[context.biguaTeam]?.penalties?.total ?? 0,
    lineoutWinPct: formatPct(stats.setPieces?.lineouts?.[context.biguaTeam]?.wonPct),
    scrumWinPct: formatPct(stats.setPieces?.scrums?.[context.biguaTeam]?.wonPct),
    breakLines: stats.breakLines?.[context.biguaTeam]?.total ?? 0,
    kicks: stats.kicks?.[context.biguaTeam]?.total ?? 0,
    possession: formatPct(stats.possession?.percentages?.[context.biguaTeam]),
    territory: stats.territory?.available ? formatPct(stats.territory?.percentages?.[context.biguaTeam]) : 'N/D',
  };
  const fallback = ['ruckWinPct', 'penalties', 'lineoutWinPct', 'breakLines'];
  const ids = (Array.isArray(selectedKpis) && selectedKpis.length > 0 ? selectedKpis : fallback)
    .filter(id => KPI_DEFINITIONS[id])
    .slice(0, 6);
  return ids.map(id => ({
    label: KPI_DEFINITIONS[id].label,
    value: values[id] ?? KPI_DEFINITIONS[id].fallback,
  }));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function cleanText(value) {
  return String(value || '').trim();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.round(numeric)) : '0';
}

/**
 * @param {object} context
 * @returns {{biguaName: string, rivalName: string}}
 */
function getComparisonTeamLabels(context) {
  return {
    biguaName: context.biguaTeam === 'away' ? context.awayName : context.homeName,
    rivalName: context.rivalTeam === 'home' ? context.homeName : context.awayName,
  };
}

/**
 * @param {string} label
 * @param {unknown} biguaValue
 * @param {unknown} rivalValue
 * @param {'count'|'pct'|'text'} format
 * @returns {{label: string, bigua: string, rival: string}}
 */
function createChartSummaryRow(label, biguaValue, rivalValue, format = 'count') {
  const formatter = format === 'pct' ? formatPct : format === 'text' ? cleanText : formatCount;
  return {
    label,
    bigua: formatter(biguaValue),
    rival: formatter(rivalValue),
  };
}

/**
 * @param {object} stats
 * @param {object} context
 * @param {string} type
 * @returns {Array<{label: string, bigua: string, rival: string}>}
 */
function getChartSummaryRows(stats, context, type) {
  const bigua = context.biguaTeam;
  const rival = context.rivalTeam;
  if (type === 'possession-chart') {
    const possessionBigua = stats.possession?.percentages?.[bigua];
    const possessionRival = stats.possession?.percentages?.[rival] ?? (Number.isFinite(Number(possessionBigua)) ? 100 - Number(possessionBigua) : 0);
    return [
      createChartSummaryRow('Posesion', possessionBigua, possessionRival, 'pct'),
      createChartSummaryRow('Territorio', stats.territory?.percentages?.[bigua], stats.territory?.percentages?.[rival], 'pct'),
    ];
  }
  if (type === 'set-pieces-chart') {
    return [
      createChartSummaryRow('Lineouts ganados', stats.setPieces?.lineouts?.[bigua]?.wonPct, stats.setPieces?.lineouts?.[rival]?.wonPct, 'pct'),
      createChartSummaryRow('Scrums ganados', stats.setPieces?.scrums?.[bigua]?.wonPct, stats.setPieces?.scrums?.[rival]?.wonPct, 'pct'),
      createChartSummaryRow('Lineouts totales', stats.setPieces?.lineouts?.[bigua]?.total, stats.setPieces?.lineouts?.[rival]?.total),
    ];
  }
  if (type === 'rucks-chart') {
    return [
      createChartSummaryRow('Rucks ganados', stats.rucks?.[bigua]?.wonPct, stats.rucks?.[rival]?.wonPct, 'pct'),
      createChartSummaryRow('Rucks totales', stats.rucks?.[bigua]?.total, stats.rucks?.[rival]?.total),
      createChartSummaryRow('Rucks por posesion', stats.rucks?.[bigua]?.rucksPerPossession, stats.rucks?.[rival]?.rucksPerPossession),
    ];
  }
  if (type === 'penalties-chart') {
    return [
      createChartSummaryRow('Penales', stats.discipline?.[bigua]?.penalties?.total, stats.discipline?.[rival]?.penalties?.total),
      createChartSummaryRow('Penales en defensa', stats.discipline?.[bigua]?.penalties?.defense, stats.discipline?.[rival]?.penalties?.defense),
      createChartSummaryRow('Tarjetas', (stats.discipline?.[bigua]?.cards?.amarilla || 0) + (stats.discipline?.[bigua]?.cards?.roja || 0), (stats.discipline?.[rival]?.cards?.amarilla || 0) + (stats.discipline?.[rival]?.cards?.roja || 0)),
    ];
  }
  if (type === 'break-lines-chart') {
    return [
      createChartSummaryRow('Break lines', stats.breakLines?.[bigua]?.total, stats.breakLines?.[rival]?.total),
      createChartSummaryRow('Killer instinct', stats.breakLines?.[bigua]?.killerInstinctPct, stats.breakLines?.[rival]?.killerInstinctPct, 'pct'),
      createChartSummaryRow('Turnovers', stats.totals?.[bigua]?.turnovers, stats.totals?.[rival]?.turnovers),
    ];
  }
  if (type === 'kicks-chart') {
    return [
      createChartSummaryRow('Kicks efectivos', stats.kicks?.[bigua]?.favorablePct, stats.kicks?.[rival]?.favorablePct, 'pct'),
      createChartSummaryRow('Kicks totales', stats.kicks?.[bigua]?.total, stats.kicks?.[rival]?.total),
      createChartSummaryRow('Kicks favorables', stats.kicks?.[bigua]?.favorable, stats.kicks?.[rival]?.favorable),
    ];
  }
  if (type === 'bip-sequences-chart') {
    const longest = Array.isArray(stats.sequences?.longest) ? stats.sequences.longest[0] : null;
    return [
      createChartSummaryRow('Secuencias', stats.sequences?.total, '', 'count'),
      createChartSummaryRow('Promedio fases', stats.sequences?.averagePhases, '', 'count'),
      createChartSummaryRow('Secuencia mas larga', longest?.phases, longest?.duration ? `${longest.duration}s` : '', 'text'),
    ];
  }
  return [];
}

/**
 * @param {object} stats
 * @param {string} type
 * @returns {string}
 */
function renderChartSummary(stats, type) {
  const context = getMatchContext(stats);
  const labels = getComparisonTeamLabels(context);
  const rows = getChartSummaryRows(stats, context, type);
  return `
    <div class="print-template-chart-summary" role="table" aria-label="Resumen del grafico">
      <header role="row">
        <span></span>
        <strong>${escapeHtml(labels.biguaName)}</strong>
        <strong>${escapeHtml(labels.rivalName)}</strong>
      </header>
      ${rows.length > 0 ? rows.map(row => `
        <div role="row">
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.bigua)}</strong>
          <em>${escapeHtml(row.rival)}</em>
        </div>
      `).join('') : '<p>Sin datos suficientes.</p>'}
    </div>
  `;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function toMetricNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatDecimal(value) {
  const numeric = toMetricNumber(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

/**
 * @param {number} home
 * @param {number} away
 * @returns {{homePct: number, awayPct: number}}
 */
function splitPercentages(home, away) {
  const total = Math.max(0, home) + Math.max(0, away);
  if (total <= 0) return { homePct: 50, awayPct: 50 };
  return {
    homePct: Math.round((home / total) * 100),
    awayPct: Math.round((away / total) * 100),
  };
}

/**
 * @param {string} label
 * @param {unknown} home
 * @param {unknown} away
 * @param {'count'|'pct'|'decimal'} [format]
 * @returns {{label: string, home: number, away: number, homeText: string, awayText: string, homePct: number, awayPct: number}}
 */
function createBalanceRow(label, home, away, format = 'count') {
  const homeNumber = toMetricNumber(home);
  const awayNumber = toMetricNumber(away);
  const percentages = format === 'pct'
    ? { homePct: Math.round(homeNumber), awayPct: Math.round(awayNumber) }
    : splitPercentages(homeNumber, awayNumber);
  return {
    label,
    home: homeNumber,
    away: awayNumber,
    homeText: format === 'pct' ? formatPct(homeNumber) : format === 'decimal' ? formatDecimal(homeNumber) : formatCount(homeNumber),
    awayText: format === 'pct' ? formatPct(awayNumber) : format === 'decimal' ? formatDecimal(awayNumber) : formatCount(awayNumber),
    homePct: Math.max(0, Math.min(100, percentages.homePct)),
    awayPct: Math.max(0, Math.min(100, percentages.awayPct)),
  };
}

/**
 * @param {Array<ReturnType<typeof createBalanceRow>>} rows
 * @returns {string}
 */
function renderBalanceBars(rows) {
  return `
    <div class="print-template-balance-bars">
      ${rows.map(row => `
        <div class="print-template-balance-row" style="--home:${row.homePct};--away:${row.awayPct};">
          <span class="metric-label">${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.homeText)}</strong>
          <div class="metric-bar" aria-hidden="true">
            <span class="home">${row.homePct}%</span>
            <span class="away">${row.awayPct}%</span>
          </div>
          <em>${escapeHtml(row.awayText)}</em>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * @param {Array<{label: string, home: unknown, away: unknown}>} rows
 * @returns {string}
 */
function renderCompactComparison(rows) {
  return `
    <div class="print-template-comparison-list">
      ${rows.map(row => `
        <div>
          <strong>${escapeHtml(row.home)}</strong>
          <span>${escapeHtml(row.label)}</span>
          <em>${escapeHtml(row.away)}</em>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * @param {string} label
 * @param {object} metric
 * @returns {string}
 */
function renderDonutMetric(label, metric = {}) {
  const won = toMetricNumber(metric.wonPct);
  const lost = Math.max(0, 100 - won - toMetricNumber(metric.dirtyPct));
  const dirty = toMetricNumber(metric.dirtyPct);
  return `
    <article class="print-template-donut-card" style="--won:${won};--lost:${lost};--dirty:${dirty};">
      <strong>${escapeHtml(label)}</strong>
      <div class="print-template-donut" aria-hidden="true"></div>
      <ul>
        <li><span class="won"></span>Ganada ${escapeHtml(formatCount(metric.won))}</li>
        <li><span class="lost"></span>Perdida ${escapeHtml(formatCount(metric.lost))}</li>
        <li><span class="dirty"></span>Ganada sucia ${escapeHtml(formatCount(metric.dirty))}</li>
      </ul>
      <em>${escapeHtml(formatPct(won))}</em>
    </article>
  `;
}

/**
 * @param {object} stats
 * @param {string} type
 * @returns {string}
 */
function renderRugbyReportPanel(stats, type) {
  const context = getMatchContext(stats);
  const bigua = context.biguaTeam;
  const rival = context.rivalTeam;
  const titleByType = {
    'possession-chart': 'GENERALES',
    'penalties-chart': 'PENALES / FREE KICK',
    'rucks-chart': 'RUCKS',
    'set-pieces-chart': 'SCRUM / LINE OUT',
    'kicks-chart': 'SALIDAS',
    'break-lines-chart': 'BREAK LINE / KILLER',
    'bip-sequences-chart': 'SECUENCIAS',
  };

  if (type === 'possession-chart') {
    return `
      <div class="print-template-rugby-panel">
        <header><strong>${titleByType[type]}</strong></header>
        ${renderBalanceBars([
          createBalanceRow('POSESION', stats.possession?.percentages?.[bigua], stats.possession?.percentages?.[rival] ?? (100 - toMetricNumber(stats.possession?.percentages?.[bigua])), 'pct'),
          createBalanceRow('TERRITORIO', stats.territory?.percentages?.[bigua], stats.territory?.percentages?.[rival], 'pct'),
          createBalanceRow('TURNOVERS', stats.totals?.[bigua]?.turnovers, stats.totals?.[rival]?.turnovers),
          createBalanceRow('PENALES', stats.discipline?.[bigua]?.penalties?.total, stats.discipline?.[rival]?.penalties?.total),
          createBalanceRow('BREAK LINE', stats.breakLines?.[bigua]?.total, stats.breakLines?.[rival]?.total),
          createBalanceRow('KICKS', stats.kicks?.[bigua]?.total, stats.kicks?.[rival]?.total),
          createBalanceRow('TOTAL DE RUCKS', stats.rucks?.[bigua]?.total, stats.rucks?.[rival]?.total),
          createBalanceRow('RUCKS GANADOS', stats.rucks?.[bigua]?.won, stats.rucks?.[rival]?.won),
          createBalanceRow('RUCKS PERDIDOS', stats.rucks?.[bigua]?.lost, stats.rucks?.[rival]?.lost),
        ])}
      </div>
    `;
  }

  if (type === 'penalties-chart') {
    const homePenalties = stats.discipline?.[bigua]?.penalties || {};
    const awayPenalties = stats.discipline?.[rival]?.penalties || {};
    const penaltyTypes = ['ruck', 'scrum', 'off-side', 'maul', 'inconducta', 'otro'];
    return `
      <div class="print-template-rugby-panel">
        <header><strong>${titleByType[type]}</strong></header>
        ${renderCompactComparison([
          { label: 'PENALES EN ATAQUE', home: formatCount(homePenalties.attack), away: formatCount(awayPenalties.attack) },
          { label: 'PENALES EN DEFENSA', home: formatCount(homePenalties.defense), away: formatCount(awayPenalties.defense) },
          { label: 'TARJETA AMARILLA', home: formatCount(stats.discipline?.[bigua]?.cards?.amarilla), away: formatCount(stats.discipline?.[rival]?.cards?.amarilla) },
          { label: 'TARJETA ROJA', home: formatCount(stats.discipline?.[bigua]?.cards?.roja), away: formatCount(stats.discipline?.[rival]?.cards?.roja) },
          ...penaltyTypes.map(label => ({
            label: label.toUpperCase(),
            home: formatCount(homePenalties.byType?.[label]),
            away: formatCount(awayPenalties.byType?.[label]),
          })),
        ])}
      </div>
    `;
  }

  if (type === 'set-pieces-chart') {
    return `
      <div class="print-template-rugby-panel two-up">
        <header><strong>${titleByType[type]}</strong></header>
        <div class="print-template-donut-grid">
          ${renderDonutMetric('SCRUM BIGUA', stats.setPieces?.scrums?.[bigua])}
          ${renderDonutMetric('SCRUM RIVAL', stats.setPieces?.scrums?.[rival])}
          ${renderDonutMetric('LINE OUT BIGUA', stats.setPieces?.lineouts?.[bigua])}
          ${renderDonutMetric('LINE OUT RIVAL', stats.setPieces?.lineouts?.[rival])}
        </div>
      </div>
    `;
  }

  if (type === 'rucks-chart') {
    return `
      <div class="print-template-rugby-panel">
        <header><strong>${titleByType[type]}</strong></header>
        ${renderBalanceBars([
          createBalanceRow('RUCKS GANADOS', stats.rucks?.[bigua]?.wonPct, stats.rucks?.[rival]?.wonPct, 'pct'),
          createBalanceRow('TOTAL DE RUCKS', stats.rucks?.[bigua]?.total, stats.rucks?.[rival]?.total),
          createBalanceRow('RUCKS GANADOS', stats.rucks?.[bigua]?.won, stats.rucks?.[rival]?.won),
          createBalanceRow('RUCKS PERDIDOS', stats.rucks?.[bigua]?.lost, stats.rucks?.[rival]?.lost),
          createBalanceRow('KPI RUCK / POSESIONES', stats.rucks?.[bigua]?.rucksPerPossession, stats.rucks?.[rival]?.rucksPerPossession, 'decimal'),
        ])}
      </div>
    `;
  }

  if (type === 'kicks-chart') {
    return `
      <div class="print-template-rugby-panel">
        <header><strong>${titleByType[type]}</strong></header>
        ${renderBalanceBars([
          createBalanceRow('KICKS EFECTIVOS', stats.kicks?.[bigua]?.favorablePct, stats.kicks?.[rival]?.favorablePct, 'pct'),
          createBalanceRow('KICKS', stats.kicks?.[bigua]?.total, stats.kicks?.[rival]?.total),
          createBalanceRow('KICKS FAVORABLES', stats.kicks?.[bigua]?.favorable, stats.kicks?.[rival]?.favorable),
        ])}
      </div>
    `;
  }

  if (type === 'break-lines-chart') {
    const homeResults = stats.breakLines?.[bigua]?.byResult || {};
    const awayResults = stats.breakLines?.[rival]?.byResult || {};
    return `
      <div class="print-template-rugby-panel">
        <header><strong>${titleByType[type]}</strong></header>
        ${renderBalanceBars([
          createBalanceRow('% EFECTIVIDAD', stats.breakLines?.[bigua]?.killerInstinctPct, stats.breakLines?.[rival]?.killerInstinctPct, 'pct'),
          createBalanceRow('TRY', homeResults.try, awayResults.try),
          createBalanceRow('PALOS', homeResults.palos, awayResults.palos),
          createBalanceRow('TURNOVER', homeResults.turnover, awayResults.turnover),
          createBalanceRow('JUEGO', homeResults.juego, awayResults.juego),
        ])}
      </div>
    `;
  }

  if (type === 'bip-sequences-chart') {
    const bands = Array.isArray(stats.bip?.bands) ? stats.bip.bands : [];
    const maxCount = Math.max(1, ...bands.map(band => toMetricNumber(band.count)));
    return `
      <div class="print-template-rugby-panel">
        <header><strong>${titleByType[type]}</strong></header>
        <div class="print-template-bip-bars">
          ${bands.map(band => `
            <div style="--value:${Math.round((toMetricNumber(band.count) / maxCount) * 100)};">
              <strong>${escapeHtml(formatCount(band.count))}</strong>
              <span></span>
              <em>${escapeHtml(band.label)}</em>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  return renderChartSummary(stats, type);
}

/**
 * @param {object|null|undefined} analysis
 * @param {'summary'|'keyFindings'|'strengths'|'weaknesses'|'trainingRecommendations'} key
 * @returns {string}
 */
function renderAiContent(analysis, key) {
  const result = analysis?.result || {};
  if (key === 'summary') return `<p>${escapeHtml(result.summary || 'Sin análisis disponible.')}</p>`;
  const source = result[key] || result[key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)] || [];
  const items = Array.isArray(source) ? source : [];
  return items.length > 0
    ? `<ul>${items.map(item => {
      const title = cleanText(item?.title || item?.area || item?.objective || item);
      const detail = cleanText(item?.detail || item?.reason || item?.objective || '');
      return `<li><strong>${escapeHtml(title || 'Item')}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ''}</li>`;
    }).join('')}</ul>`
    : '<p>Sin datos suficientes.</p>';
}

/**
 * @param {object} payload
 * @param {object} block
 * @returns {string}
 */
function renderChartBlock(payload, block) {
  const chart = CHART_BLOCKS[block.type] || { key: '' };
  const title = block.settings?.title || getPdfBlockMetadata(block.type).label;
  const src = payload.chartImages?.[chart.key] || '';
  return `
    <h3>${escapeHtml(title)}</h3>
    <div class="print-template-chart-layout">
      ${src ? `<figure class="print-template-chart-visual"><img src="${src}" alt="${escapeHtml(title)}"></figure>` : ''}
      ${renderRugbyReportPanel(payload.stats || {}, block.type)}
      ${renderChartSummary(payload.stats || {}, block.type)}
    </div>
  `;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function getEventSeconds(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : null;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatEventTime(value) {
  if (typeof value === 'string' && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(value.trim())) return value.trim();
  const seconds = getEventSeconds(value);
  if (seconds === null) return 'Sin tiempo';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

const EVENT_LABEL_OVERRIDES = {
  bigua: 'Bigua',
  rival: 'Rival',
  home: 'Local',
  away: 'Visitante',
  ruck: 'Ruck',
  scrum: 'Scrum',
  lineout: 'Line Out',
  'line-out': 'Line Out',
  'break-line': 'Break Line',
  'break line': 'Break Line',
  ganada: 'Ganada',
  perdida: 'Perdida',
};

/**
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function formatEventLabel(value, fallback = 'Sin dato') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const normalized = raw
    .replace(/^custom:/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const key = normalized.toLowerCase();
  if (EVENT_LABEL_OVERRIDES[key]) return EVENT_LABEL_OVERRIDES[key];
  return normalized
    .split(' ')
    .filter(Boolean)
    .map(word => `${word.charAt(0).toLocaleUpperCase('es-AR')}${word.slice(1).toLocaleLowerCase('es-AR')}`)
    .join(' ') || fallback;
}

/**
 * @param {Map<string, number>} map
 * @param {string} label
 * @returns {void}
 */
function incrementEventBucket(map, label) {
  if (!label) return;
  map.set(label, (map.get(label) || 0) + 1);
}

/**
 * @param {Map<string, number>} map
 * @param {number} limit
 * @returns {Array<[string, number]>}
 */
function getTopEventBuckets(map, limit = 5) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

/**
 * @param {Array<[string, number]>} rows
 * @param {number} total
 * @param {string} emptyLabel
 * @returns {string}
 */
function renderEventSummaryRows(rows, total, emptyLabel) {
  if (!rows.length) return `<p>${escapeHtml(emptyLabel)}</p>`;
  return rows.map(([label, count]) => {
    const pct = total > 0 ? Math.max(4, Math.round((count / total) * 100)) : 0;
    return `
      <div class="print-template-events-row" style="--event-pct:${pct};">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(count)}</strong>
        <em aria-hidden="true"></em>
      </div>
    `;
  }).join('');
}

/**
 * @param {object} payload
 * @param {object} block
 * @returns {string}
 */
function renderEventsTable(payload, block) {
  const events = Array.isArray(payload.match?.events) ? payload.match.events : [];
  const typeBuckets = new Map();
  const teamBuckets = new Map();
  const resultBuckets = new Map();
  const times = [];

  events.forEach((event) => {
    incrementEventBucket(typeBuckets, formatEventLabel(event.type || event.category || event.name, 'Evento'));
    incrementEventBucket(teamBuckets, formatEventLabel(event.team || event.teamId, 'Sin equipo'));
    incrementEventBucket(resultBuckets, formatEventLabel(event.result || event.subtype || event.outcome, 'Sin resultado'));
    const seconds = getEventSeconds(event.timestamp ?? event.time ?? event.seconds);
    if (seconds !== null) times.push(seconds);
  });

  const firstTime = times.length ? Math.min(...times) : null;
  const lastTime = times.length ? Math.max(...times) : null;
  const timeLabel = firstTime !== null && lastTime !== null
    ? `${formatEventTime(firstTime)} - ${formatEventTime(lastTime)}`
    : 'Sin tiempos registrados';
  const totalLabel = `${events.length} ${events.length === 1 ? 'evento registrado' : 'eventos registrados'}`;

  return `
    <h3>${escapeHtml(block.settings?.title || getPdfBlockMetadata(block.type).label)}</h3>
    <div class="print-template-events-summary">
      <section class="print-template-events-hero">
        <span>Actividad del partido</span>
        <strong>${escapeHtml(totalLabel)}</strong>
        <em>${escapeHtml(timeLabel)}</em>
      </section>
      <section class="print-template-events-card wide">
        <header>
          <strong>Tipos principales</strong>
          <span>Top 6</span>
        </header>
        ${renderEventSummaryRows(getTopEventBuckets(typeBuckets, 6), events.length, 'Sin eventos registrados.')}
      </section>
      <section class="print-template-events-grid">
        <article class="print-template-events-card">
          <header>
            <strong>Equipos</strong>
            <span>Distribucion</span>
          </header>
          ${renderEventSummaryRows(getTopEventBuckets(teamBuckets, 4), events.length, 'Sin equipos registrados.')}
        </article>
        <article class="print-template-events-card">
          <header>
            <strong>Resultados</strong>
            <span>Distribucion</span>
          </header>
          ${renderEventSummaryRows(getTopEventBuckets(resultBuckets, 4), events.length, 'Sin resultados registrados.')}
        </article>
      </section>
    </div>
  `;
}

/**
 * @param {object} payload
 * @param {object} block
 * @returns {string}
 */
function renderTemplateBlock(payload, block) {
  const stats = payload.stats || {};
  const context = getMatchContext(stats);
  const title = block.settings?.showTitle === false ? '' : cleanText(block.settings?.title);
  const header = title ? `<h3>${escapeHtml(title)}</h3>` : '';

  if (CHART_BLOCKS[block.type]) return renderChartBlock(payload, block);
  if (block.type === 'score') {
    return `
      ${header}
      <div class="print-template-score">
        <span>${escapeHtml(context.homeName)}</span>
        <strong>${context.homeScore} - ${context.awayScore}</strong>
        <span>${escapeHtml(context.awayName)}</span>
      </div>
    `;
  }
  if (block.type === 'match-header') {
    return `
      <div class="print-logo-lockup">
        <img class="print-logo-mark" src="assets/bigu-logo.svg" alt="Bigua Rugby Club">
        <div class="print-logo">Bigu<span>Analytics</span></div>
      </div>
      <h3>${escapeHtml(context.homeName)} vs ${escapeHtml(context.awayName)}</h3>
      <p>${escapeHtml(stats.match?.competition || 'Sin competencia')} - ${escapeHtml(stats.match?.date || 'Sin fecha')}</p>
    `;
  }
  if (block.type === 'kpi-row') {
    const kpis = getKpis(stats, block.settings?.metrics || payload.selectedKpis || []);
    return `
      ${header}
      <div class="print-template-kpis">
        ${kpis.map(kpi => `
          <div class="print-card">
            <span>${escapeHtml(kpi.label)}</span>
            <strong>${escapeHtml(kpi.value)}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }
  if (block.type === 'heatmap') {
    return `
      ${header || `<h3>${escapeHtml(getPdfBlockMetadata(block.type).label)}</h3>`}
      ${payload.heatmapImage ? `<img src="${payload.heatmapImage}" alt="Heatmap del partido">` : '<p class="print-template-unavailable">Heatmap no disponible.</p>'}
    `;
  }
  if (block.type === 'coach-notes') {
    return `${header || `<h3>${escapeHtml(getPdfBlockMetadata(block.type).label)}</h3>`}<div class="print-notes">${payload.notesHtml || '<p>Sin notas.</p>'}</div>`;
  }
  if (block.type === 'events-table') return renderEventsTable(payload, block);
  if (block.type === 'section-title') return `<h2 class="print-template-section-title">${escapeHtml(block.settings?.text || block.settings?.title || 'Seccion')}</h2>`;
  if (block.type === 'text-block') return `<div class="print-template-text">${escapeHtml(block.settings?.text || 'Texto editable')}</div>`;
  if (block.type === 'ai-summary') return `${header || `<h3>${escapeHtml(getPdfBlockMetadata(block.type).label)}</h3>`}${renderAiContent(payload.aiAnalysis, 'summary')}`;
  if (block.type === 'ai-key-findings') return `${header || `<h3>${escapeHtml(getPdfBlockMetadata(block.type).label)}</h3>`}${renderAiContent(payload.aiAnalysis, 'keyFindings')}`;
  if (block.type === 'ai-strengths') return `${header || `<h3>${escapeHtml(getPdfBlockMetadata(block.type).label)}</h3>`}${renderAiContent(payload.aiAnalysis, 'strengths')}`;
  if (block.type === 'ai-weaknesses') return `${header || `<h3>${escapeHtml(getPdfBlockMetadata(block.type).label)}</h3>`}${renderAiContent(payload.aiAnalysis, 'weaknesses')}`;
  if (block.type === 'ai-training-recommendations') return `${header || `<h3>${escapeHtml(getPdfBlockMetadata(block.type).label)}</h3>`}${renderAiContent(payload.aiAnalysis, 'trainingRecommendations')}`;
  return '<p class="print-template-unavailable">Bloque desconocido.</p>';
}

/**
 * @param {object} payload
 * @param {object} template
 * @returns {string}
 */
export function renderPdfTemplatePages(payload = {}, template = {}) {
  const orientation = template.orientation === 'portrait' ? 'portrait' : 'landscape';
  const rowCount = GRID_ROWS[orientation];
  return (Array.isArray(template.pages) ? template.pages : []).map((page, pageIndex) => `
    <section class="print-page print-template-page print-template-${orientation}" data-pdf-page-id="${escapeHtml(page.id || `page-${pageIndex + 1}`)}">
      <div class="print-template-watermark" aria-hidden="true">BiguAnalytics</div>
      <header class="print-template-page-header">
        <span>Página ${pageIndex + 1}</span>
        <strong>${escapeHtml(page.title || `Página ${pageIndex + 1}`)}</strong>
      </header>
      <div class="print-template-grid" style="--pdf-template-rows: ${rowCount};">
        ${(Array.isArray(page.blocks) ? page.blocks : []).map(block => `
          <article
            class="print-template-block"
            data-pdf-block-id="${escapeHtml(block.id)}"
            data-pdf-block-type="${escapeHtml(block.type)}"
            style="${getPdfBlockGridStyle(block)}"
          >
            ${renderTemplateBlock(payload, block)}
          </article>
        `).join('')}
      </div>
    </section>
  `).join('');
}
