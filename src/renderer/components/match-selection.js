// @ts-check

export const MATCH_EDIT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';

/**
 * @param {object} match
 * @returns {string}
 */
export function getMatchTitle(match) {
  return `${match?.homeTeam || 'Bigua'} vs ${match?.awayTeam || 'Rival'}`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function formatEventValue(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Sin dato';
}

/**
 * @param {string} value
 * @returns {Date}
 */
function parseMatchDate(value) {
  const dateValue = String(value || '');
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  return isoDateOnly
    ? new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]))
    : new Date(dateValue);
}

/**
 * @param {object} match
 * @returns {number}
 */
function getMatchSortTime(match) {
  const timestamp = parseMatchDate(match?.createdAt || match?.date || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * @param {object} match
 * @returns {string}
 */
function getMatchDateLabel(match) {
  const date = parseMatchDate(match?.date || match?.createdAt || '');
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

/**
 * @param {object} match
 * @returns {string}
 */
function getMatchVideoLabel(match) {
  const video = match?.video || {};
  if (video.name) return String(video.name);
  if (video.type === 'youtube') return 'YouTube';
  if (video.path) return String(video.path).split(/[\\/]/).filter(Boolean).pop() || 'MP4 local';
  if (video.type === 'local') return 'MP4 local';
  return 'Sin video';
}

/**
 * @param {string} status
 * @returns {string}
 */
function getMatchStatusLabel(status) {
  if (status === 'analyzed') return 'Analizado';
  if (status === 'tagging') return 'Tagging';
  if (status === 'created') return 'Pendiente';
  return formatEventValue(status);
}

/**
 * @param {Array<object>} matches
 * @returns {Array<{id: string, title: string, statusLabel: string, scoreLabel: string, videoLabel: string, dateLabel: string}>}
 */
export function getMatchSelectionItems(matches = []) {
  return [...matches]
    .filter(match => match?.id)
    .sort((a, b) => getMatchSortTime(b) - getMatchSortTime(a))
    .map(match => {
      const homeScore = Number.isFinite(Number(match.score?.local ?? match.score?.home ?? match.homeScore))
        ? Number(match.score?.local ?? match.score?.home ?? match.homeScore)
        : 0;
      const awayScore = Number.isFinite(Number(match.score?.rival ?? match.score?.away ?? match.awayScore))
        ? Number(match.score?.rival ?? match.score?.away ?? match.awayScore)
        : 0;

      return {
        id: String(match.id),
        title: getMatchTitle(match),
        statusLabel: getMatchStatusLabel(match.status),
        scoreLabel: `${homeScore} - ${awayScore}`,
        videoLabel: getMatchVideoLabel(match),
        dateLabel: getMatchDateLabel(match),
      };
    });
}
