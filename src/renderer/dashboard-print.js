// @ts-check
import { DEFAULT_PDF_TEMPLATE } from './pdf/default-template.js';
import { renderPdfTemplatePages, validateTemplateLayout } from './pdf/pdf-blocks.js';

window.__BIGU_PDF_READY__ = false;

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
 * @param {number|null|undefined} seconds
 * @returns {string}
 */
function formatClock(seconds) {
  if (!Number.isFinite(Number(seconds))) return '--:--';
  const safeSeconds = Math.max(0, Math.floor(Number(seconds)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
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
 * @returns {Promise<void>}
 */
function waitForAnimationFrames() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

/**
 * @param {HTMLImageElement} image
 * @returns {Promise<void>}
 */
function waitForImage(image) {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => {
      reject(new Error(`No se pudo cargar asset PDF: ${image.getAttribute('alt') || image.getAttribute('src') || 'imagen'}`));
    }, { once: true });
  });
}

/**
 * @returns {Promise<void>}
 */
async function waitForPdfAssets() {
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all(Array.from(document.images).map(waitForImage));
  await waitForAnimationFrames();
}

/**
 * @param {object|null|undefined} license
 * @returns {string}
 */
function printLicenseWatermark(license) {
  if (!license?.clubName || !license?.userEmail || !license?.clubSlug) return '';
  const clubName = escapeHtml(license.clubName);
  const userEmail = escapeHtml(license.userEmail);
  const clubSlug = escapeHtml(license.clubSlug);
  return `
    <footer class="print-license-watermark">
      BiguAnalytics · Licenciado a ${clubName} · ${userEmail} · ${clubSlug}
    </footer>
  `;
}

/**
 * @param {object} stats
 * @param {Array<string>} selectedKpis
 * @returns {Array<object>}
 */
function getKpis(stats, selectedKpis = []) {
  const bigua = stats.teams.biguaTeam;
  const rival = stats.teams.rivalTeam;
  const definitions = {
    ruckWinPct: { label: '% Rucks ganados', value: formatPct(stats.rucks[bigua].wonPct) },
    penalties: { label: 'Penales totales', value: stats.discipline[bigua].penalties.total },
    lineoutWinPct: { label: '% Line Outs ganados', value: formatPct(stats.setPieces.lineouts[bigua].wonPct) },
    scrumWinPct: { label: '% Scrums ganados', value: formatPct(stats.setPieces.scrums[bigua].wonPct) },
    breakLines: { label: 'Break Lines', value: stats.breakLines[bigua].total },
    breakLinesConceded: { label: 'Break Lines concedidas', value: stats.breakLines[rival].total },
    turnovers: { label: 'Turnovers', value: stats.totals[bigua].turnovers },
    kicks: { label: 'Kicks', value: stats.kicks[bigua].total },
    kickEffectiveness: { label: '% Kicks efectivos', value: formatPct(stats.kicks[bigua].favorablePct) },
    possession: { label: 'Posesion', value: formatPct(stats.possession.percentages[bigua]) },
    territory: { label: 'Territorio', value: stats.territory.available ? formatPct(stats.territory.percentages[bigua]) : 'N/D' },
    killerInstinct: { label: 'Killer Instinct', value: formatPct(stats.breakLines[bigua].killerInstinctPct) },
    cards: {
      label: 'Tarjetas',
      value: stats.discipline[bigua].cards.amarilla + stats.discipline[bigua].cards.roja,
    },
  };
  const fallback = [
    { label: '% Rucks ganados', value: formatPct(stats.rucks[bigua].wonPct) },
    { label: 'Penales totales', value: stats.discipline[bigua].penalties.total },
    { label: '% Line Outs ganados', value: formatPct(stats.setPieces.lineouts[bigua].wonPct) },
    { label: 'Break Lines', value: stats.breakLines[bigua].total },
  ];
  const mapped = selectedKpis.map(id => definitions[id]).filter(Boolean).slice(0, 4);
  return mapped.length === 4 ? mapped : fallback;
}

/**
 * @param {object} payload
 * @param {string} sectionId
 * @returns {boolean}
 */
function shouldPrintSection(payload, sectionId) {
  const pdfTemplate = payload.pdfTemplate || 'complete';
  const visibleSections = new Set(payload.visibleSections || []);
  const templateSections = {
    complete: null,
    short: ['set-pieces', 'rucks', 'discipline', 'kicks', 'break-lines'],
    alerts: [],
    forwards: ['set-pieces', 'rucks', 'discipline', 'heatmap', 'sequences'],
  };
  const allowedSections = templateSections[pdfTemplate] ?? templateSections.complete;
  const isVisible = visibleSections.size === 0 || visibleSections.has(sectionId);
  const isInTemplate = !allowedSections || allowedSections.includes(sectionId);
  return isVisible && isInTemplate;
}

/**
 * @param {object} frame
 * @returns {string|null}
 */
function frameSectionId(frame) {
  const type = String(frame?.type || '');
  if (['scrum', 'lineout', 'maul'].includes(type)) return 'set-pieces';
  if (type === 'ruck') return 'rucks';
  if (type === 'penal' || type === 'card') return 'discipline';
  if (type === 'kick') return 'kicks';
  if (type === 'break-line') return 'break-lines';
  if (type.startsWith('custom:')) return 'custom-events';
  return null;
}

/**
 * @param {Array<object>} frames
 * @param {string} sectionId
 * @returns {Array<object>}
 */
function framesForSection(frames, sectionId) {
  return (Array.isArray(frames) ? frames : []).filter(frame => frameSectionId(frame) === sectionId);
}

/**
 * @param {Array<object>} frames
 * @returns {string}
 */
function frameCards(frames = []) {
  if (!Array.isArray(frames) || frames.length === 0) return '';
  return `
    <div class="print-frame-grid inline">
      ${frames.map(frame => `
        <figure class="print-frame-card">
          <img src="${frame.imageDataUrl}" alt="Frame anotado ${escapeHtml(formatClock(frame.timestamp))}">
          <figcaption>Frame del minuto ${escapeHtml(formatClock(frame.timestamp))}</figcaption>
        </figure>
      `).join('')}
    </div>
  `;
}

/**
 * @param {string} title
 * @param {string} src
 * @param {Array<object>} frames
 * @returns {string}
 */
function chartBlock(title, src, frames = []) {
  return `
    <section class="print-chart">
      <h2 class="print-title">${escapeHtml(title)}</h2>
      ${src ? `<img src="${src}" alt="${escapeHtml(title)}">` : '<p>Grafico no disponible.</p>'}
      ${frameCards(frames)}
    </section>
  `;
}

/**
 * @param {object} stats
 * @returns {string}
 */
function sequencesTable(stats) {
  const rows = (stats.sequences.longest || []).map(sequence => `
    <tr>
      <td>${escapeHtml(sequence.name || sequence.id || 'Secuencia')}</td>
      <td>${escapeHtml(sequence.result || 'Sin resultado')}</td>
      <td>${escapeHtml(sequence.phases ?? 0)}</td>
      <td>${escapeHtml(sequence.duration ?? 0)}s</td>
    </tr>
  `).join('');

  return `
    <section class="print-chart">
      <h2 class="print-title">Secuencias</h2>
      <table class="print-table">
        <thead>
          <tr><th>Secuencia</th><th>Resultado</th><th>Fases</th><th>Duracion</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4">Sin secuencias registradas.</td></tr>'}</tbody>
      </table>
    </section>
  `;
}

/**
 * @param {Array<object>} items
 * @param {string} title
 * @returns {string}
 */
function aiList(title, items) {
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => {
      const source = item && typeof item === 'object' ? item : {};
      const drills = Array.isArray(source.drills) ? source.drills.map(value => String(value || '').trim()).filter(Boolean) : [];
      return {
        title: String(source.title || source.area || source.objective || '').trim(),
        detail: String(source.detail || source.reason || source.objective || drills.join(' ')).trim(),
      };
    })
    .filter(item => item.title && item.detail);
  return `
    <section class="print-ai-block">
      <h3>${escapeHtml(title)}</h3>
      ${rows.length > 0 ? rows.map(item => `
        <article>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.detail)}</p>
          ${Array.isArray(item.evidence) && item.evidence.length > 0 ? `<small>${item.evidence.map(escapeHtml).join(' · ')}</small>` : ''}
        </article>
      `).join('') : '<p>Sin datos suficientes.</p>'}
    </section>
  `;
}

/**
 * @param {object|null|undefined} analysis
 * @returns {string}
 */
function aiAnalysisPage(analysis) {
  const result = analysis?.result;
  if (!result) return '';
  const scoreContext = result.scoreContext || null;
  return `
    <section class="print-page print-ai-page">
      <header class="print-brand">
        <div>
          <h2 class="print-title">Análisis IA</h2>
          <p class="print-ai-meta">Generado ${escapeHtml(analysis.generatedAt || 'sin fecha')} · ${escapeHtml(analysis.model || 'modelo IA')}</p>
        </div>
        <div class="print-ai-badge">Análisis guardado</div>
      </header>
      <div class="print-ai-summary">
        <p>${escapeHtml(result.summary || 'Sin resumen disponible.')}</p>
        ${scoreContext?.scoreLabel ? `<p>${escapeHtml(scoreContext.scoreLabel)} - Resultado Bigua: ${escapeHtml(scoreContext.resultForBigua || '')}</p>` : ''}
      </div>
      <div class="print-grid-2">
        ${aiList('Hallazgos clave', result.keyFindings || result.key_findings)}
        ${aiList('Fortalezas', result.strengths)}
        ${aiList('Debilidades', result.weaknesses)}
        ${aiList('Recomendaciones', result.trainingRecommendations || result.training_recommendations)}
      </div>
    </section>
  `;
}

/**
 * @param {object} payload
 * @param {Array<{id: string, html: string}>} blocks
 * @param {string} gridClass
 * @returns {string}
 */
function chartPage(payload, blocks, gridClass) {
  const printableBlocks = blocks.filter(block => shouldPrintSection(payload, block.id));
  if (printableBlocks.length === 0) return '';
  return `
    <section class="print-page">
      <div class="${gridClass}">
        ${printableBlocks.map(block => block.html).join('')}
      </div>
    </section>
  `;
}

/**
 * @param {Array<object>} frames
 * @returns {string}
 */
function annotatedFramesPage(frames = []) {
  if (!Array.isArray(frames) || frames.length === 0) return '';
  return `
    <section class="print-page print-drawing-frames">
      <h2 class="print-title">Frames anotados</h2>
      <div class="print-frame-grid">
        ${frames.map(frame => `
          <figure class="print-frame-card">
            <img src="${frame.imageDataUrl}" alt="Frame anotado ${escapeHtml(formatClock(frame.timestamp))}">
            <figcaption>Frame del minuto ${escapeHtml(formatClock(frame.timestamp))}</figcaption>
          </figure>
        `).join('')}
      </div>
    </section>
  `;
}

/**
 * @param {Array<object>} frames
 * @returns {Array<object>}
 */
function unsectionedFrames(frames = []) {
  return (Array.isArray(frames) ? frames : []).filter(frame => !frameSectionId(frame));
}

/**
 * @param {object} payload
 * @returns {string}
 */
function frameLimitWarning(payload) {
  if (!payload.drawingFrameWarning) return '';
  return `
    <section class="print-frame-limit-warning" role="note">
      ${escapeHtml(payload.drawingFrameWarning)}
    </section>
  `;
}

/**
 * @param {object} payload
 * @returns {string}
 */
function renderLegacyDashboardPrint(payload) {
  const stats = payload.stats;
  const chartImages = payload.chartImages || {};
  const notesHtml = payload.notesHtml || '';
  const drawingFrames = payload.pdfTemplate === 'alerts' ? [] : payload.drawingFrames || [];
  const scoreSourceLabel = getScoreSourceLabel(stats.score?.source);
  const pages = [];

  pages.push(`
    <section class="print-page">
      <header class="print-brand">
        <div class="print-logo-lockup">
          <img class="print-logo-mark" src="assets/bigu-logo.svg" alt="Bigua Rugby Club">
          <div class="print-logo">Bigu<span>Analytics</span></div>
        </div>
        <div class="print-meta">
          <div>${escapeHtml(stats.match.competition || 'Sin competencia')}</div>
          <div>${escapeHtml(stats.match.date || 'Sin fecha')}</div>
        </div>
      </header>
      <div class="print-score">
        <span>${escapeHtml(stats.match.homeTeam)}</span>
        <strong>${stats.score.home.total} - ${stats.score.away.total}</strong>
        ${scoreSourceLabel ? `<em>${escapeHtml(scoreSourceLabel)}</em>` : ''}
        <span>${escapeHtml(stats.match.awayTeam)}</span>
      </div>
      <div class="print-grid-4">
        ${getKpis(stats, payload.selectedKpis || []).map(kpi => `
          <div class="print-card">
            <span>${escapeHtml(kpi.label)}</span>
            <strong>${escapeHtml(kpi.value)}</strong>
          </div>
        `).join('')}
      </div>
      <div class="print-alerts">
        ${(stats.alerts || []).map(alert => `
          <div class="print-alert">
            <span>Alerta activa</span>
            <strong>${escapeHtml(alert.equipo)} - ${escapeHtml(alert.metrica)}</strong>
            <p>Valor ${escapeHtml(alert.valor)} contra umbral ${escapeHtml(alert.umbral)}</p>
          </div>
        `).join('') || '<div class="print-card"><span>Alertas</span><strong>Sin alertas activas</strong></div>'}
      </div>
    </section>
  `);
  pages.push(frameLimitWarning(payload));

  pages.push(chartPage(payload, [
    { id: 'set-pieces', html: chartBlock('Set Pieces', chartImages.setPieces, framesForSection(drawingFrames, 'set-pieces')) },
    { id: 'rucks', html: chartBlock('Rucks', chartImages.rucks, framesForSection(drawingFrames, 'rucks')) },
  ], 'print-grid-2'));

  pages.push(chartPage(payload, [
    { id: 'discipline', html: chartBlock('Disciplina', chartImages.discipline, framesForSection(drawingFrames, 'discipline')) },
    { id: 'kicks', html: chartBlock('Kicks', chartImages.kicks, framesForSection(drawingFrames, 'kicks')) },
    { id: 'break-lines', html: chartBlock('Break Lines', chartImages.breakLines, framesForSection(drawingFrames, 'break-lines')) },
  ], 'print-grid-3'));

  pages.push(chartPage(payload, [
    { id: 'bip', html: chartBlock('BIP', chartImages.bip) },
    { id: 'possession', html: chartBlock('Posesion', chartImages.possession) },
    { id: 'sequences', html: sequencesTable(stats) },
    { id: 'custom-events', html: chartBlock('Custom', chartImages.customEvents, framesForSection(drawingFrames, 'custom-events')) },
  ], 'print-grid-3'));

  if (payload.heatmapImage && stats.heatmap?.available && shouldPrintSection(payload, 'heatmap')) {
    pages.push(`
      <section class="print-page print-heatmap">
        <h2 class="print-title">Heatmap</h2>
        <img src="${payload.heatmapImage}" alt="Heatmap del partido">
      </section>
    `);
  }

  pages.push(annotatedFramesPage(unsectionedFrames(drawingFrames)));

  if (payload.aiAnalysis && payload.pdfTemplate !== 'alerts') {
    pages.push(aiAnalysisPage(payload.aiAnalysis));
  }

  if (notesHtml.trim() && payload.pdfTemplate !== 'alerts') {
    pages.push(`
      <section class="print-page">
        <h2 class="print-title">Notas del Entrenador</h2>
        <div class="print-notes">${notesHtml}</div>
      </section>
    `);
  }

  return pages.filter(Boolean).join('');
}

/**
 * @param {object} payload
 * @returns {Promise<{ready: boolean, pageCount: number}>}
 */
window.renderDashboardPrint = async function renderDashboardPrint(payload) {
  window.__BIGU_PDF_READY__ = false;
  const root = document.getElementById('print-root');
  if (!root) throw new Error('Contenedor PDF no disponible.');

  const templateLayout = payload.pdfTemplateLayout || DEFAULT_PDF_TEMPLATE;
  const templateReport = validateTemplateLayout(templateLayout);
  root.innerHTML = templateReport.valid
    ? renderPdfTemplatePages(payload, templateLayout)
    : renderLegacyDashboardPrint(payload);

  const licenseFooter = printLicenseWatermark(payload.license);
  if (licenseFooter) {
    root.querySelectorAll('.print-page').forEach((page) => {
      page.insertAdjacentHTML('beforeend', licenseFooter);
    });
  }
  await waitForPdfAssets();
  window.__BIGU_PDF_READY__ = true;
  return {
    ready: true,
    pageCount: root.querySelectorAll('.print-page').length,
  };
};
