// @ts-check
const crypto = require('crypto');
const { calculateMatchStats } = require('../analytics');
const { getSettings } = require('../settings');
const { getMatchById } = require('../storage');
const { buildScoreContext } = require('./aiScoreContext');

const ALERT_KEYS = [
  'ruckWinPctMin',
  'penaltiesMax',
  'lineoutWinPctMin',
  'scrumWinPctMin',
  'breakLinesConcededMax',
];

/**
 * @param {unknown} value
 * @returns {string}
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value)
    .sort()
    .filter(key => value[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function numericOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stringOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {Array<object>} events
 * @returns {Map<string, string>}
 */
function buildPlayerMap(events) {
  const names = [];
  events.forEach((event) => {
    const name = stringOrEmpty(event.player);
    if (name && !names.includes(name)) names.push(name);
  });
  return new Map(names.map((name, index) => [name, `P${String(index + 1).padStart(2, '0')}`]));
}

/**
 * @param {object} event
 * @param {Map<string, string>} playerMap
 * @returns {object}
 */
function sanitizeEventForAI(event, playerMap = new Map()) {
  const player = stringOrEmpty(event.player);
  return {
    id: stringOrEmpty(event.id),
    timestamp: numericOrNull(event.timestamp),
    type: stringOrEmpty(event.type),
    team: event.team === 'away' ? 'away' : event.team === 'home' ? 'home' : null,
    result: stringOrEmpty(event.result),
    subtype: stringOrEmpty(event.subtype),
    note: stringOrEmpty(event.note),
    zone: stringOrEmpty(event.zone) || null,
    player: player ? playerMap.get(player) || null : null,
  };
}

/**
 * @param {Array<object>} values
 * @returns {Array<object>}
 */
function sortEvents(values) {
  return [...values].sort((a, b) => (
    (numericOrNull(a.timestamp) ?? Number.MAX_SAFE_INTEGER) - (numericOrNull(b.timestamp) ?? Number.MAX_SAFE_INTEGER)
    || stringOrEmpty(a.id).localeCompare(stringOrEmpty(b.id))
    || stringOrEmpty(a.type).localeCompare(stringOrEmpty(b.type))
    || stringOrEmpty(a.team).localeCompare(stringOrEmpty(b.team))
  ));
}

/**
 * @param {object} sequence
 * @returns {object}
 */
function sanitizeSequence(sequence) {
  return {
    id: stringOrEmpty(sequence.id),
    start: numericOrNull(sequence.start),
    end: numericOrNull(sequence.end),
    duration: numericOrNull(sequence.duration),
    phases: numericOrNull(sequence.phases),
    result: stringOrEmpty(sequence.result),
    team: sequence.team === 'away' ? 'away' : sequence.team === 'home' ? 'home' : null,
    zoneStart: stringOrEmpty(sequence.zoneStart) || null,
    zoneEnd: stringOrEmpty(sequence.zoneEnd) || null,
    note: stringOrEmpty(sequence.note),
  };
}

/**
 * @param {object|Array<object>} possession
 * @returns {object}
 */
function sanitizePossession(possession) {
  const intervals = Array.isArray(possession)
    ? possession
    : Array.isArray(possession?.intervals)
      ? possession.intervals
      : [];
  return {
    intervals: intervals
      .map(interval => ({
        team: interval.team === 'away' ? 'away' : interval.team === 'home' ? 'home' : null,
        start: numericOrNull(interval.start),
        end: numericOrNull(interval.end),
      }))
      .filter(interval => interval.team && interval.start !== null && interval.end !== null)
      .sort((a, b) => a.start - b.start || a.end - b.end || a.team.localeCompare(b.team)),
  };
}

/**
 * @param {object} stats
 * @param {Map<string, string>} playerMap
 * @returns {object}
 */
function sanitizeStats(stats, playerMap) {
  const cloned = JSON.parse(JSON.stringify(stats || {}));
  if (cloned.match) {
    delete cloned.match.filters;
    delete cloned.match.coachNotes;
  }
  ['home', 'away'].forEach((team) => {
    const players = cloned.kicks?.[team]?.byPlayer;
    if (Array.isArray(players)) {
      cloned.kicks[team].byPlayer = players.map(player => ({
        ...player,
        player: playerMap.get(player.player) || 'P00',
      }));
    }
  });
  return cloned;
}

/**
 * @param {object} settings
 * @returns {object}
 */
function getAlertThresholds(settings = {}) {
  return ALERT_KEYS.reduce((thresholds, key) => {
    thresholds[key] = settings.alerts?.[key];
    return thresholds;
  }, {});
}

/**
 * @param {object} match
 * @param {object} stats
 * @returns {Array<string>}
 */
function getMissingDataHints(match, stats) {
  const hints = [];
  if (!Array.isArray(match.events) || match.events.length === 0) hints.push('No hay eventos taggeados.');
  if (!stats.territory?.available) hints.push('No hay datos suficientes de zonas/territorio.');
  if (!Array.isArray(match.sequences) || match.sequences.length === 0) hints.push('No hay secuencias registradas.');
  const possessionIntervals = Array.isArray(match.possession?.intervals) ? match.possession.intervals : [];
  if (possessionIntervals.length === 0) hints.push('No hay intervalos reales de posesion.');
  return hints;
}

/**
 * @param {object} match
 * @param {object} settings
 * @returns {object}
 */
function buildAIContextFromData(match, settings = {}) {
  const safeMatch = match || {};
  const events = sortEvents(Array.isArray(safeMatch.events) ? safeMatch.events : []);
  const playerMap = buildPlayerMap(events);
  const stats = calculateMatchStats(safeMatch, settings, {});
  const sequences = Array.isArray(safeMatch.sequences) ? safeMatch.sequences : [];
  const scoreContext = buildScoreContext(safeMatch, stats);

  return {
    schemaVersion: 1,
    scoreContext,
    match: {
      id: stringOrEmpty(safeMatch.id),
      homeTeam: stringOrEmpty(safeMatch.homeTeam) || 'Bigua',
      awayTeam: stringOrEmpty(safeMatch.awayTeam) || 'Rival',
      date: stringOrEmpty(safeMatch.date),
      competition: stringOrEmpty(safeMatch.competition),
      venue: stringOrEmpty(safeMatch.venue),
      score: {
        home: numericOrNull(scoreContext.localScore) ?? numericOrNull(safeMatch.homeScore) ?? 0,
        away: numericOrNull(scoreContext.rivalScore) ?? numericOrNull(safeMatch.awayScore) ?? 0,
      },
    },
    thresholds: getAlertThresholds(settings),
    events: events.map(event => sanitizeEventForAI(event, playerMap)),
    sequences: sequences
      .map(sanitizeSequence)
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || stringOrEmpty(a.id).localeCompare(stringOrEmpty(b.id))),
    possession: sanitizePossession(safeMatch.possession),
    stats: sanitizeStats(stats, playerMap),
    alerts: stats.alerts || [],
    missingDataHints: getMissingDataHints(safeMatch, stats),
  };
}

/**
 * @param {object} context
 * @returns {string}
 */
function calculateAIContextHash(context) {
  const hash = crypto.createHash('sha256').update(stableStringify(context), 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * @param {string} matchId
 * @returns {Promise<object>}
 */
async function buildAIContext(matchId) {
  const [match, settings] = await Promise.all([
    getMatchById(matchId),
    getSettings(),
  ]);
  return buildAIContextFromData(match, settings);
}

module.exports = {
  buildAIContext,
  buildAIContextFromData,
  calculateAIContextHash,
  sanitizeEventForAI,
  stableStringify,
};
