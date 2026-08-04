// @ts-check

export const DEFAULT_EVENT_LABELS = Object.freeze({
  ruck: 'Ruck',
  scrum: 'Scrum',
  lineout: 'Line Out',
  penal: 'Penal / Free Kick',
  points: 'Try y puntos',
  'break-line': 'Break Line',
  kick: 'Kick',
  maul: 'Maul',
  turnover: 'Turnover',
  card: 'Tarjeta',
  note: 'Nota libre',
});

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeEventLabelKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * @param {string} value
 * @returns {string}
 */
function humanizeEventLabel(value) {
  return String(value || '')
    .replace(/^custom:/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(word => `${word.charAt(0).toLocaleUpperCase('es-AR')}${word.slice(1).toLocaleLowerCase('es-AR')}`)
    .join(' ') || 'Sin dato';
}

/**
 * @param {object} [source]
 * @returns {Record<string, string>}
 */
export function getEventLabels(source = {}) {
  const configuredLabels = source?.hotkeyLabels && typeof source.hotkeyLabels === 'object'
    ? source.hotkeyLabels
    : source;
  const labels = { ...DEFAULT_EVENT_LABELS };

  Object.entries(configuredLabels || {}).forEach(([key, value]) => {
    const normalizedKey = normalizeEventLabelKey(key);
    const label = String(value || '').trim();
    if (normalizedKey && label) labels[normalizedKey] = label;
  });

  (Array.isArray(source?.customHotkeys) ? source.customHotkeys : []).forEach((customHotkey) => {
    const id = normalizeEventLabelKey(customHotkey?.id || customHotkey?.label);
    const label = String(customHotkey?.label || '').trim();
    if (id && label) labels[`custom:${id}`] = label;
  });

  return labels;
}

/**
 * @param {unknown} value
 * @param {Record<string, string>} [labels]
 * @returns {string}
 */
export function getEventLabel(value, labels = DEFAULT_EVENT_LABELS) {
  const raw = String(value || '').trim();
  const key = normalizeEventLabelKey(raw);
  return String(labels?.[key] || labels?.[raw] || '').trim() || humanizeEventLabel(raw);
}
