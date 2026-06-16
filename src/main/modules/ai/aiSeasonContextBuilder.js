// @ts-check
const { calculateMatchStats } = require('../analytics');
const { getSettings } = require('../settings');
const { getAllMatches, getMatchById } = require('../storage');
const { normalizeFieldZone } = require('../field-zones');
const { stableStringify, calculateAIContextHash } = require('./aiContextBuilder');

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function numberOrNull(value) {
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
 * @param {unknown} value
 * @returns {number|null}
 */
function timestampOrNull(value) {
  const numeric = numberOrNull(value);
  return numeric !== null && numeric >= 0 ? numeric : null;
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function formatClock(value) {
  const timestamp = timestampOrNull(value);
  if (timestamp === null) return null;
  const totalSeconds = Math.floor(timestamp);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * @param {object} match
 * @returns {'home'|'away'}
 */
function getBiguaSide(match = {}) {
  if (stringOrEmpty(match.awayTeam).toLowerCase().includes('bigua')) return 'away';
  return 'home';
}

/**
 * @param {'home'|'away'} side
 * @returns {'home'|'away'}
 */
function otherSide(side) {
  return side === 'home' ? 'away' : 'home';
}

/**
 * @param {Array<object>} matches
 * @returns {Array<object>}
 */
function sortMatches(matches) {
  return [...matches].sort((a, b) => {
    const dateCompare = stringOrEmpty(b.date).localeCompare(stringOrEmpty(a.date));
    if (dateCompare) return dateCompare;
    return stringOrEmpty(b.id).localeCompare(stringOrEmpty(a.id));
  });
}

/**
 * @param {Array<object>} events
 * @returns {Array<object>}
 */
function sortEvents(events) {
  return [...events].sort((a, b) => {
    const left = timestampOrNull(a.timestamp) ?? Number.MAX_SAFE_INTEGER;
    const right = timestampOrNull(b.timestamp) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return stringOrEmpty(a.id).localeCompare(stringOrEmpty(b.id));
  });
}

/**
 * @param {object} stats
 * @param {'home'|'away'} side
 * @returns {number}
 */
function getPenalties(stats, side) {
  return Number(stats?.discipline?.[side]?.penalties?.total ?? stats?.totals?.[side]?.penalties ?? 0) || 0;
}

/**
 * @param {object} stats
 * @param {'home'|'away'} side
 * @returns {number}
 */
function getBreakLines(stats, side) {
  return Number(stats?.breakLines?.[side]?.total ?? stats?.totals?.[side]?.breakLines ?? 0) || 0;
}

/**
 * @param {object} stats
 * @param {'home'|'away'} side
 * @returns {number|null}
 */
function getRuckWinPct(stats, side) {
  const direct = numberOrNull(stats?.rucks?.[side]?.wonPct ?? stats?.rucks?.[side]?.winPct);
  if (direct !== null) return direct;
  const won = Number(stats?.rucks?.[side]?.won ?? stats?.rucks?.[side]?.results?.ganado ?? stats?.rucks?.[side]?.ganado ?? 0) || 0;
  const total = Number(stats?.rucks?.[side]?.total ?? 0) || 0;
  return total > 0 ? Math.round((won / total) * 100) : null;
}

/**
 * @param {object} stats
 * @param {'home'|'away'} side
 * @returns {{total: number, won: number, lost: number, dirty: number, wonPct: number|null}}
 */
function getRuckSummary(stats, side) {
  const source = stats?.rucks?.[side] || {};
  return {
    total: Number(source.total ?? 0) || 0,
    won: Number(source.won ?? source.results?.ganado ?? 0) || 0,
    lost: Number(source.lost ?? source.results?.perdido ?? 0) || 0,
    dirty: Number(source.dirty ?? source.results?.['ganado-sucio'] ?? 0) || 0,
    wonPct: getRuckWinPct(stats, side),
  };
}

/**
 * @param {object} event
 * @returns {object}
 */
function sanitizeSeasonEvent(event) {
  const timestamp = timestampOrNull(event.timestamp);
  const zone = normalizeFieldZone(event);
  return {
    id: stringOrEmpty(event.id),
    timestamp,
    minute: timestamp === null ? null : Math.floor(timestamp / 60),
    clock: formatClock(timestamp),
    type: stringOrEmpty(event.type),
    team: event.team === 'home' || event.team === 'away' ? event.team : null,
    result: stringOrEmpty(event.result),
    subtype: stringOrEmpty(event.subtype),
    zone: zone?.id || null,
    zoneLabel: zone?.label || null,
    ...(zone?.legacy && zone.originalZone ? { legacyZone: zone.originalZone } : {}),
    note: stringOrEmpty(event.note),
  };
}

/**
 * @param {Array<object>} events
 * @returns {{total: number, byTeam: {home: number, away: number, unknown: number}, byType: Record<string, {total: number, home: number, away: number}>}}
 */
function buildEventBreakdown(events) {
  return events.reduce((breakdown, event) => {
    const team = event.team === 'home' || event.team === 'away' ? event.team : 'unknown';
    const type = stringOrEmpty(event.type) || 'unknown';
    breakdown.total += 1;
    breakdown.byTeam[team] += 1;
    if (!breakdown.byType[type]) breakdown.byType[type] = { total: 0, home: 0, away: 0 };
    breakdown.byType[type].total += 1;
    if (team === 'home' || team === 'away') breakdown.byType[type][team] += 1;
    return breakdown;
  }, {
    total: 0,
    byTeam: { home: 0, away: 0, unknown: 0 },
    byType: {},
  });
}

/**
 * @param {object|Array<object>|null|undefined} possession
 * @returns {object}
 */
function sanitizeSeasonPossession(possession) {
  const intervals = Array.isArray(possession)
    ? possession
    : Array.isArray(possession?.intervals)
      ? possession.intervals
      : [];
  const activeTeam = possession?.activeTeam === 'home' || possession?.activeTeam === 'away'
    ? possession.activeTeam
    : null;
  return {
    active: activeTeam ? {
      team: activeTeam,
      start: timestampOrNull(possession.activeStart),
      end: timestampOrNull(possession.activeEnd),
      startClock: formatClock(possession.activeStart),
      endClock: formatClock(possession.activeEnd),
    } : null,
    intervals: intervals.map(interval => ({
      team: interval.team === 'home' || interval.team === 'away' ? interval.team : null,
      start: timestampOrNull(interval.start),
      end: timestampOrNull(interval.end),
      startClock: formatClock(interval.start),
      endClock: formatClock(interval.end),
    })).filter(interval => interval.team && interval.start !== null && interval.end !== null),
  };
}

/**
 * @param {object} sequence
 * @returns {object}
 */
function sanitizeSeasonSequence(sequence) {
  const zoneStart = normalizeFieldZone(sequence.zoneStart || sequence.startZone);
  const zoneEnd = normalizeFieldZone(sequence.zoneEnd || sequence.endZone);
  return {
    id: stringOrEmpty(sequence.id),
    start: timestampOrNull(sequence.start),
    end: timestampOrNull(sequence.end),
    startClock: formatClock(sequence.start),
    endClock: formatClock(sequence.end),
    duration: numberOrNull(sequence.duration),
    phases: numberOrNull(sequence.phases),
    result: stringOrEmpty(sequence.result),
    team: sequence.team === 'home' || sequence.team === 'away' ? sequence.team : null,
    zoneStart: zoneStart?.id || null,
    zoneStartLabel: zoneStart?.label || null,
    ...(zoneStart?.legacy && zoneStart.originalZone ? { legacyZoneStart: zoneStart.originalZone } : {}),
    zoneEnd: zoneEnd?.id || null,
    zoneEndLabel: zoneEnd?.label || null,
    ...(zoneEnd?.legacy && zoneEnd.originalZone ? { legacyZoneEnd: zoneEnd.originalZone } : {}),
    note: stringOrEmpty(sequence.note),
  };
}

/**
 * @param {object} stats
 * @returns {object}
 */
function sanitizeSeasonStats(stats) {
  const cloned = JSON.parse(JSON.stringify(stats || {}));
  if (cloned.match) delete cloned.match.filters;
  return cloned;
}

/**
 * @param {object} match
 * @param {object} settings
 * @returns {object}
 */
function summarizeMatch(match, settings = {}) {
  const side = getBiguaSide(match);
  const rivalSide = otherSide(side);
  const stats = calculateMatchStats(match, settings, {});
  const score = {
    home: Number(stats?.score?.home?.total ?? match.homeScore ?? 0) || 0,
    away: Number(stats?.score?.away?.total ?? match.awayScore ?? 0) || 0,
  };
  const eventCount = Array.isArray(match.events) ? match.events.length : Number(match.eventCount ?? 0) || 0;
  const sequenceCount = Array.isArray(match.sequences) ? match.sequences.length : Number(match.sequenceCount ?? 0) || 0;
  const events = sortEvents(Array.isArray(match.events) ? match.events : []).map(sanitizeSeasonEvent);
  const sequences = (Array.isArray(match.sequences) ? match.sequences : [])
    .map(sanitizeSeasonSequence)
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || stringOrEmpty(a.id).localeCompare(stringOrEmpty(b.id)));

  return {
    id: stringOrEmpty(match.id),
    date: stringOrEmpty(match.date),
    competition: stringOrEmpty(match.competition),
    opponent: side === 'home' ? stringOrEmpty(match.awayTeam) || 'Rival' : stringOrEmpty(match.homeTeam) || 'Rival',
    venue: stringOrEmpty(match.venue),
    biguaSide: side,
    score,
    eventCount,
    sequenceCount,
    events,
    eventBreakdown: buildEventBreakdown(events),
    possession: sanitizeSeasonPossession(match.possession),
    sequences,
    coachNotes: stringOrEmpty(match.coachNotes),
    notesAvailable: Boolean(stringOrEmpty(match.coachNotes)),
    metrics: {
      penaltiesForBigua: getPenalties(stats, side),
      penaltiesForRival: getPenalties(stats, rivalSide),
      breakLinesForBigua: getBreakLines(stats, side),
      breakLinesForRival: getBreakLines(stats, rivalSide),
      ruckWinPctBigua: getRuckWinPct(stats, side),
      rucksForBigua: getRuckSummary(stats, side),
      rucksForRival: getRuckSummary(stats, rivalSide),
      possessionPctBigua: numberOrNull(stats?.possession?.[side]?.pct),
    },
    analytics: sanitizeSeasonStats(stats),
    alerts: Array.isArray(stats?.alerts) ? stats.alerts.slice(0, 6) : [],
  };
}

/**
 * @param {Array<object>} matches
 * @param {object} settings
 * @returns {object}
 */
function buildAISeasonContextFromData(matches, settings = {}) {
  const sourceMatches = Array.isArray(matches) ? matches : [];
  const latestMatches = sortMatches(sourceMatches)
    .map(match => summarizeMatch(match, settings));

  const aggregates = latestMatches.reduce((acc, match) => {
    acc.eventsTotal += match.eventCount;
    acc.sequencesTotal += match.sequenceCount;
    acc.penaltiesTotal += match.metrics.penaltiesForBigua;
    acc.penaltiesAgainstTotal += match.metrics.penaltiesForRival;
    acc.breakLinesFor += match.metrics.breakLinesForBigua;
    acc.breakLinesAgainst += match.metrics.breakLinesForRival;
    acc.rucksForBiguaTotal += match.metrics.rucksForBigua.total;
    acc.rucksForRivalTotal += match.metrics.rucksForRival.total;
    acc.rucksWonByBiguaTotal += match.metrics.rucksForBigua.won;
    if (match.metrics.ruckWinPctBigua !== null) {
      acc.ruckWinPctSamples += 1;
      acc.ruckWinPctTotal += match.metrics.ruckWinPctBigua;
    }
    return acc;
  }, {
    eventsTotal: 0,
    sequencesTotal: 0,
    penaltiesTotal: 0,
    penaltiesAgainstTotal: 0,
    breakLinesFor: 0,
    breakLinesAgainst: 0,
    rucksForBiguaTotal: 0,
    rucksForRivalTotal: 0,
    rucksWonByBiguaTotal: 0,
    ruckWinPctSamples: 0,
    ruckWinPctTotal: 0,
  });

  const alertCounts = new Map();
  latestMatches.forEach((match) => {
    match.alerts.forEach((alert) => {
      const metric = stringOrEmpty(alert.metric || alert.metrica || alert.label);
      if (metric) alertCounts.set(metric, (alertCounts.get(metric) || 0) + 1);
    });
  });

  return {
    schemaVersion: 1,
    matchCount: sourceMatches.length,
    contextMatchLimit: null,
    includesAllMatches: true,
    latestMatches,
    aggregates: {
      ...aggregates,
      ruckWinPctAverage: aggregates.ruckWinPctSamples > 0
        ? Math.round(aggregates.ruckWinPctTotal / aggregates.ruckWinPctSamples)
        : null,
    },
    repeatedAlerts: [...alertCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([metric, count]) => ({ metric, count })),
    missingDataHints: sourceMatches.length === 0 ? ['No hay partidos guardados.'] : [],
  };
}

/**
 * @returns {Promise<object>}
 */
async function buildAISeasonContext() {
  const [summaries, settings] = await Promise.all([getAllMatches(), getSettings()]);
  const fullMatches = [];

  for (const summary of summaries) {
    try {
      fullMatches.push(await getMatchById(summary.id));
    } catch {
      fullMatches.push(summary);
    }
  }

  return buildAISeasonContextFromData(fullMatches, settings);
}

/**
 * @param {object} context
 * @returns {string}
 */
function calculateAISeasonContextHash(context) {
  return calculateAIContextHash({ season: context });
}

module.exports = {
  buildAISeasonContext,
  buildAISeasonContextFromData,
  calculateAISeasonContextHash,
  stableStringify,
};
