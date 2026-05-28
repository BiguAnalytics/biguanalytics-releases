// @ts-check

const DELETE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
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
 * Gets the result badge class based on scores.
 * @param {object} match
 * @returns {{ className: string, label: string } | null}
 */
function getResultBadge(match) {
  if (match.status !== 'analyzed') return { className: 'sin-disputar', label: 'Sin disputar' };
  if (match.homeScore > match.awayScore) return { className: 'victoria', label: 'Victoria' };
  if (match.homeScore < match.awayScore) return { className: 'derrota', label: 'Derrota' };
  return { className: 'empate', label: 'Empate' };
}

/**
 * Gets the status badge based on match status.
 * @param {object} match
 * @returns {{ className: string, label: string }}
 */
function getStatusBadge(match) {
  if (match.status === 'analyzed') return { className: 'analizado', label: 'Analizado' };
  return { className: 'pendiente', label: 'Pendiente' };
}

/**
 * Gets a visual tone class for the card.
 * @param {object} match
 * @returns {string}
 */
function getToneClass(match) {
  if (match.status !== 'analyzed') return 'pending';
  if (match.homeScore > match.awayScore) return 'win';
  if (match.homeScore < match.awayScore) return 'loss';
  return 'draw';
}

/**
 * Gets display score values.
 * @param {object} match
 * @returns {{home: string|number, away: string|number}}
 */
function getScore(match) {
  if (match.status !== 'analyzed') return { home: '—', away: '—' };
  return {
    home: match.homeScore ?? 0,
    away: match.awayScore ?? 0,
  };
}

/**
 * Creates a match card DOM element.
 * @param {object} match - Match data
 * @param {object} handlers
 * @param {function} handlers.onClick - Called when card is clicked
 * @param {function} handlers.onDelete - Called when delete is clicked
 * @returns {HTMLElement}
 */
export function createMatchCard(match, { onClick, onDelete }) {
  const card = document.createElement('div');
  card.className = `match-card ${getToneClass(match)}`;
  card.id = `match-card-${match.id}`;

  const result = getResultBadge(match);
  const status = getStatusBadge(match);
  const venue = match.venue === 'home' ? 'Local' : 'Visitante';
  const location = match.venue === 'home' ? 'Cancha Bigua' : match.awayTeam;
  const score = getScore(match);
  const actionLabel = match.status === 'analyzed' ? 'Ver análisis' : 'Iniciar tagging';

  card.innerHTML = `
    <div class="match-card-thumbnail">
      <span class="match-card-status badge ${status.className}">${status.label}</span>
      <div class="match-card-field" aria-hidden="true"></div>
      <div class="match-card-score">
        <span class="home">${score.home}</span>
        <span class="separator">—</span>
        <span class="away">${score.away}</span>
      </div>
      <span class="match-card-competition">${match.competition || 'Sin competencia'}</span>
    </div>
    <div class="match-card-body">
      <div class="match-card-main">
        <div>
          <div class="match-card-title">
            <span class="match-card-home">${match.homeTeam}</span>
            <span class="match-card-vs">vs</span>
            <strong>${match.awayTeam}</strong>
          </div>
          <div class="match-card-meta">${formatDate(match.date)} · ${location}${match.venue === 'away' ? ` — ${venue}` : ''}</div>
        </div>
        <div class="match-card-result-score">
          <span>${score.home}</span>
          <span>—</span>
          <span>${score.away}</span>
        </div>
      </div>
      <div class="match-card-footer">
        <div class="match-card-badges">
          ${result ? `<span class="badge ${result.className}">${result.label}</span>` : ''}
        </div>
        <span class="match-card-action">${actionLabel} ${ARROW_ICON}</span>
        <button class="match-card-delete" title="Eliminar partido">
          ${DELETE_ICON}
        </button>
      </div>
    </div>
  `;

  // Click on card
  card.addEventListener('click', (e) => {
    if (!e.target.closest('.match-card-delete')) {
      onClick(match);
    }
  });

  // Click on delete
  card.querySelector('.match-card-delete').addEventListener('click', (e) => {
    e.stopPropagation();
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

  card.innerHTML = `
    <div class="match-card-new-icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    </div>
    <span class="match-card-new-text">Nuevo partido</span>
  `;

  card.addEventListener('click', onClick);

  return card;
}
