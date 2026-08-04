// @ts-check

const DELETE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
const EDIT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
const EXPORT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
const ARROW_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"></path><path d="M7 7h10v10"></path></svg>';

/**
 * Formats a date string to a readable format.
 * @param {string} dateStr - ISO date string
 * @returns {string}
 */
function formatDate(dateStr) {
  try {
    const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    const date = isoDateOnly
      ? new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]))
      : new Date(dateStr);
    const day = date.toLocaleDateString('es-AR', { day: '2-digit' });
    const month = date.toLocaleDateString('es-AR', { month: 'long' });
    const year = date.toLocaleDateString('es-AR', { year: 'numeric' });
    return `${day} ${month.charAt(0).toUpperCase()}${month.slice(1)}, ${year}`;
  } catch {
    return dateStr;
  }
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function toScoreNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

/**
 * @param {object} match
 * @returns {{home: number, away: number, hasEvidence: boolean}}
 */
function getScoreValues(match = {}) {
  const home = toScoreNumber(match.score?.local ?? match.score?.home ?? match.homeScore);
  const away = toScoreNumber(match.score?.rival ?? match.score?.away ?? match.awayScore);
  const result = match.score?.resultForBigua;
  return {
    home,
    away,
    hasEvidence: home > 0 || away > 0 || result === 'win' || result === 'loss' || result === 'draw',
  };
}

/**
 * Returns whether a match already has enough sporting data to show as disputed.
 * @param {object} match
 * @returns {boolean}
 */
export function isMatchDisputed(match) {
  const score = getScoreValues(match);
  const eventCount = Number(match.eventCount ?? match.totalEventCount);
  return match.status === 'analyzed'
    || score.hasEvidence
    || (Number.isFinite(eventCount) && eventCount > 0)
    || (Array.isArray(match.events) && match.events.length > 0);
}

/**
 * Gets the result badge class based on scores.
 * @param {object} match
 * @returns {{ className: string, label: string } | null}
 */
export function getResultBadge(match) {
  if (match.status === 'corrupt') return { className: 'derrota', label: 'Archivo corrupto' };
  if (!isMatchDisputed(match)) return { className: 'sin-disputar', label: 'Sin disputar' };
  const score = getScoreValues(match);
  if (score.home > score.away) return { className: 'victoria', label: 'Victoria' };
  if (score.home < score.away) return { className: 'derrota', label: 'Derrota' };
  return { className: 'empate', label: 'Empate' };
}

/**
 * Gets the status badge based on match status.
 * @param {object} match
 * @returns {{ className: string, label: string }}
 */
export function getStatusBadge(match) {
  if (match.status === 'corrupt') return { className: 'pendiente', label: 'Recuperable' };
  if (match.status === 'analyzed') return { className: 'analizado', label: 'Analizado' };
  if (isMatchDisputed(match)) return { className: 'taggeado', label: 'Taggeado' };
  return { className: 'pendiente', label: 'Pendiente' };
}

/**
 * Gets a visual tone class for the card.
 * @param {object} match
 * @returns {string}
 */
export function getToneClass(match) {
  if (match.status === 'corrupt') return 'loss';
  if (!isMatchDisputed(match)) return 'pending';
  const score = getScoreValues(match);
  if (score.home > score.away) return 'win';
  if (score.home < score.away) return 'loss';
  return 'draw';
}

/**
 * Gets display score values.
 * @param {object} match
 * @returns {{home: string|number, away: string|number}}
 */
export function getScore(match) {
  if (!isMatchDisputed(match)) return { home: '—', away: '—' };
  const score = getScoreValues(match);
  return {
    home: score.home,
    away: score.away,
  };
}

/**
 * @param {object} match
 * @returns {string}
 */
export function getActionLabel(match) {
  if (match.status === 'corrupt') return 'Ver diagnostico';
  return isMatchDisputed(match) ? 'Ver análisis' : 'Iniciar tagging';
}

/**
 * @param {string} tag
 * @param {string} className
 * @param {string|number} [text]
 * @returns {HTMLElement}
 */
function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

/**
 * @param {HTMLElement} target
 * @param {string} icon
 */
function appendStaticIcon(target, icon) {
  const wrapper = document.createElement('span');
  wrapper.innerHTML = icon;
  const svg = wrapper.firstElementChild;
  if (svg) target.appendChild(svg);
}

/**
 * Creates a match card DOM element.
 * @param {object} match - Match data
 * @param {object} handlers
 * @param {function} handlers.onClick - Called when card is clicked
 * @param {function} [handlers.onAction] - Called when the primary card action is clicked
 * @param {function} [handlers.onEdit] - Called when edit is clicked
 * @param {function} [handlers.onExport] - Called when export is clicked
 * @param {function} handlers.onDelete - Called when delete is clicked
 * @returns {HTMLElement}
 */
export function createMatchCard(match, { onClick, onAction, onEdit, onExport, onDelete }) {
  const card = document.createElement('div');
  card.textContent = '';
  card.className = `match-card ${getToneClass(match)}`;
  card.id = `match-card-${match.id}`;
  card.setAttribute('data-match-card', 'true');

  const result = getResultBadge(match);
  const status = getStatusBadge(match);
  const venue = match.venue === 'home' ? 'Local' : 'Visitante';
  const location = match.venue === 'home' ? 'Cancha Bigua' : match.awayTeam;
  const score = getScore(match);
  const actionLabel = getActionLabel(match);

  const thumbnail = createElement('div', 'match-card-thumbnail');
  const statusBadge = createElement('span', `match-card-status badge ${status.className}`, status.label);
  const field = createElement('div', 'match-card-field');
  field.setAttribute('aria-hidden', 'true');
  const thumbnailScore = createElement('div', 'match-card-score');
  thumbnailScore.appendChild(createElement('span', 'home', score.home));
  thumbnailScore.appendChild(createElement('span', 'separator', '—'));
  thumbnailScore.appendChild(createElement('span', 'away', score.away));
  thumbnail.appendChild(statusBadge);
  thumbnail.appendChild(field);
  thumbnail.appendChild(thumbnailScore);
  thumbnail.appendChild(createElement('span', 'match-card-competition', match.competition || 'Sin competencia'));

  const body = createElement('div', 'match-card-body');
  const main = createElement('div', 'match-card-main');
  const titleWrap = document.createElement('div');
  const title = createElement('div', 'match-card-title');
  title.appendChild(createElement('span', 'match-card-home', match.homeTeam));
  title.appendChild(createElement('span', 'match-card-vs', 'vs'));
  title.appendChild(createElement('strong', '', match.awayTeam));
  titleWrap.appendChild(title);
  titleWrap.appendChild(createElement(
    'div',
    'match-card-meta',
    `${formatDate(match.date)} · ${location}${match.venue === 'away' ? ` — ${venue}` : ''}`
  ));

  const resultScore = createElement('div', 'match-card-result-score');
  resultScore.appendChild(createElement('span', '', score.home));
  resultScore.appendChild(createElement('span', '', '—'));
  resultScore.appendChild(createElement('span', '', score.away));
  main.appendChild(titleWrap);
  main.appendChild(resultScore);

  const footer = createElement('div', 'match-card-footer');
  const badges = createElement('div', 'match-card-badges');
  if (result) badges.appendChild(createElement('span', `badge ${result.className}`, result.label));
  const action = createElement('button', 'match-card-action', `${actionLabel} `);
  action.type = 'button';
  action.setAttribute('aria-label', actionLabel);
  appendStaticIcon(action, ARROW_ICON);
  const editButton = createElement('button', 'match-card-edit');
  editButton.type = 'button';
  editButton.title = 'Editar partido';
  editButton.setAttribute('aria-label', 'Editar partido');
  appendStaticIcon(editButton, EDIT_ICON);
  const exportButton = createElement('button', 'match-card-export');
  exportButton.type = 'button';
  exportButton.title = 'Exportar partido';
  exportButton.setAttribute('aria-label', 'Exportar partido');
  appendStaticIcon(exportButton, EXPORT_ICON);
  const deleteButton = createElement('button', 'match-card-delete');
  deleteButton.type = 'button';
  deleteButton.title = 'Eliminar partido';
  deleteButton.setAttribute('aria-label', 'Eliminar partido');
  appendStaticIcon(deleteButton, DELETE_ICON);
  footer.appendChild(badges);
  footer.appendChild(action);
  footer.appendChild(exportButton);
  footer.appendChild(editButton);
  footer.appendChild(deleteButton);

  body.appendChild(main);
  body.appendChild(footer);
  card.appendChild(thumbnail);
  card.appendChild(body);

  action.addEventListener('click', (event) => {
    event.stopPropagation();
    if (onAction) {
      onAction(match);
      return;
    }
    onClick(match);
  });

  card.addEventListener('click', (event) => {
    if (!event.target.closest('.match-card-action, .match-card-delete, .match-card-edit, .match-card-export')) {
      onClick(match);
    }
  });

  editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onEdit?.(match);
  });

  exportButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onExport?.(match);
  });

  deleteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onDelete(match);
  });

  return card;
}

/**
 * Creates the "New Match" card.
 * @param {function} onClick - Called when clicked
 * @returns {HTMLElement}
 */
export function createNewMatchCard(onClick) {
  const card = document.createElement('div');
  card.className = 'match-card-new';
  card.id = 'new-match-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('data-no-route-swipe', 'true');

  card.innerHTML = `
    <div class="match-card-new-icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    </div>
    <span class="match-card-new-text">Nuevo partido</span>
  `;

  card.addEventListener('click', onClick);
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onClick(event);
  });

  return card;
}
