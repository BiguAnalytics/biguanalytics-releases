// @ts-check

/**
 * Creates a KPI card DOM element.
 * @param {object} options
 * @param {string} options.label - KPI label
 * @param {string|number} options.value - KPI value
 * @param {string} [options.delta] - Delta text (e.g., "+5% vs anterior")
 * @param {'normal'|'alert'|'positive'} [options.state] - Card state
 * @param {'large'|'medium'|'small'} [options.size] - Value size
 * @returns {HTMLElement}
 */
export function createKpiCard({ label, value, delta = '', state = 'normal', size = 'medium' }) {
  const card = document.createElement('div');
  card.className = `kpi-card${state !== 'normal' ? ` ${state}` : ''}`;

  const sizeClass = size !== 'large' ? ` ${size}` : '';
  const deltaClass = delta.startsWith('+') ? ' positive' : delta.startsWith('-') ? ' negative' : '';

  card.innerHTML = `
    ${state === 'alert' ? '<div class="kpi-alert-badge"></div>' : ''}
    <div class="kpi-label">${label}</div>
    <div class="kpi-value${sizeClass}">${value}</div>
    ${delta ? `<div class="kpi-delta${deltaClass}">${delta}</div>` : ''}
  `;

  return card;
}
