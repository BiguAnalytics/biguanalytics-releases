// @ts-check

/**
 * @param {string|number} value
 * @returns {{target: string, suffix: string, decimals: number}|null}
 */
function getCountUpParts(value) {
  const match = String(value ?? '').trim().match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  if (!match) return null;
  const decimalPart = match[1].split('.')[1] || '';
  return {
    target: match[1],
    suffix: match[2] || '',
    decimals: decimalPart.length,
  };
}

/**
 * @param {string|number} value
 * @returns {string}
 */
function getCountUpAttributes(value) {
  const parts = getCountUpParts(value);
  if (!parts) return '';
  return ` data-count-up-value="${parts.target}" data-count-up-suffix="${parts.suffix}" data-count-up-decimals="${parts.decimals}"`;
}

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
    <div class="kpi-value${sizeClass}"${getCountUpAttributes(value)}>${value}</div>
    ${delta ? `<div class="kpi-delta${deltaClass}">${delta}</div>` : ''}
  `;

  return card;
}
