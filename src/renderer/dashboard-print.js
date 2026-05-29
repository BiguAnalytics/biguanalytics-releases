// @ts-check

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
 * @param {object} stats
 * @returns {Array<object>}
 */
function getKpis(stats) {
  const bigua = stats.teams.biguaTeam;
  return [
    { label: '% Rucks ganados', value: formatPct(stats.rucks[bigua].wonPct) },
    { label: 'Penales totales', value: stats.discipline[bigua].penalties.total },
    { label: '% Line Outs ganados', value: formatPct(stats.setPieces.lineouts[bigua].wonPct) },
    { label: 'Break Lines', value: stats.breakLines[bigua].total },
  ];
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
 * @param {object} payload
 */
window.renderDashboardPrint = function renderDashboardPrint(payload) {
  const root = document.getElementById('print-root');
  const stats = payload.stats;
  const chartImages = payload.chartImages || {};
  const notesHtml = payload.notesHtml || '';
  const drawingFrames = payload.pdfTemplate === 'alerts' ? [] : payload.drawingFrames || [];
  const pages = [];

  pages.push(`
    <section class="print-page">
      <header class="print-brand">
        <div class="print-logo">Bigu<span>Analytics</span></div>
        <div class="print-meta">
          <div>${escapeHtml(stats.match.competition || 'Sin competencia')}</div>
          <div>${escapeHtml(stats.match.date || 'Sin fecha')}</div>
        </div>
      </header>
      <div class="print-score">
        <span>${escapeHtml(stats.match.homeTeam)}</span>
        <strong>${stats.score.home.total} - ${stats.score.away.total}</strong>
        <span>${escapeHtml(stats.match.awayTeam)}</span>
      </div>
      <div class="print-grid-4">
        ${getKpis(stats).map(kpi => `
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
            <strong>${escapeHtml(alert.equipo)} · ${escapeHtml(alert.metrica)}</strong>
            <p>Valor ${escapeHtml(alert.valor)} contra umbral ${escapeHtml(alert.umbral)}</p>
          </div>
        `).join('') || '<div class="print-card"><span>Alertas</span><strong>Sin alertas activas</strong></div>'}
      </div>
    </section>
  `);

  pages.push(`
    <section class="print-page">
      <div class="print-grid-2">
        ${chartBlock('Set Pieces', chartImages.setPieces, framesForSection(drawingFrames, 'set-pieces'))}
        ${chartBlock('Rucks', chartImages.rucks, framesForSection(drawingFrames, 'rucks'))}
      </div>
    </section>
  `);

  pages.push(`
    <section class="print-page">
      <div class="print-grid-3">
        ${chartBlock('Disciplina', chartImages.discipline, framesForSection(drawingFrames, 'discipline'))}
        ${chartBlock('Kicks', chartImages.kicks, framesForSection(drawingFrames, 'kicks'))}
        ${chartBlock('Break Lines', chartImages.breakLines, framesForSection(drawingFrames, 'break-lines'))}
      </div>
    </section>
  `);

  pages.push(`
    <section class="print-page">
      <div class="print-grid-3">
        ${chartBlock('BIP', chartImages.bip)}
        ${chartBlock('Posesion', chartImages.possession)}
        ${sequencesTable(stats)}
      </div>
    </section>
  `);

  if (payload.heatmapImage && stats.heatmap?.available) {
    pages.push(`
      <section class="print-page print-heatmap">
        <h2 class="print-title">Heatmap</h2>
        <img src="${payload.heatmapImage}" alt="Heatmap del partido">
      </section>
    `);
  }

  pages.push(annotatedFramesPage(unsectionedFrames(drawingFrames)));

  if (notesHtml.trim()) {
    pages.push(`
      <section class="print-page">
        <h2 class="print-title">Notas del Entrenador</h2>
        <div class="print-notes">${notesHtml}</div>
      </section>
    `);
  }

  root.innerHTML = pages.filter(Boolean).join('');
};
