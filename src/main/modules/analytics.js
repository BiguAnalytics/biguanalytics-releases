// @ts-check
const { getAllMatches, getMatchById } = require('./storage');
const { getSettings } = require('./settings');

const TEAMS = ['home', 'away'];
const DEFAULT_ALERT_THRESHOLDS = {
  ruckWinPctMin: 50,
  penaltiesMax: 15,
  lineoutWinPctMin: 40,
  scrumWinPctMin: 50,
  breakLinesConcededMax: 5,
};

const POINT_VALUES = {
  try: 5,
  conversion: 2,
  'pk-goal': 3,
  drop: 3,
  'try-penal': 7,
};

const SCORE_KEYS = {
  try: 'tries',
  conversion: 'conversions',
  'pk-goal': 'pkGoals',
  drop: 'drops',
  'try-penal': 'penaltyTries',
};

const RESULT_KEYS = ['ganado', 'perdido', 'ganado-sucio'];
const THROW_QUALITIES = ['bueno', 'neutro', 'malo'];
const PENAL_TYPES = ['ruck', 'scrum', 'offside', 'maul', 'inconducta', 'otro'];
const KICK_RESULTS = ['touch', 'recuperado', 'perdido', 'contestado'];
const FAVORABLE_KICKS = new Set(['touch', 'recuperado']);
const BREAK_LINE_RESULTS = ['try', 'palos', 'turnover', 'pfk-favor', 'pfk-contra', 'juego'];
const BIP_BANDS = [
  { label: '0-20', start: 0, end: 20 * 60 },
  { label: '20-40', start: 20 * 60, end: 40 * 60 },
  { label: '40-60', start: 40 * 60, end: 60 * 60 },
  { label: '60-80', start: 60 * 60, end: 80 * 60 },
  { label: '+80', start: 80 * 60, end: null },
];

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * @param {number} value
 * @param {number} total
 * @returns {number}
 */
function pct(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

/**
 * @param {number} value
 * @param {number} [digits]
 * @returns {number}
 */
function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * @param {object} match
 * @returns {'home'|'away'}
 */
function identifyBiguaTeam(match = {}) {
  if (String(match.homeTeam || '').toLowerCase().includes('bigua')) return 'home';
  if (String(match.awayTeam || '').toLowerCase().includes('bigua')) return 'away';
  return 'home';
}

/**
 * @param {'home'|'away'} team
 * @returns {'home'|'away'}
 */
function opponentOf(team) {
  return team === 'home' ? 'away' : 'home';
}

/**
 * @param {object} match
 * @returns {object}
 */
function buildTeams(match) {
  const biguaTeam = identifyBiguaTeam(match);
  const rivalTeam = opponentOf(biguaTeam);
  return {
    home: {
      id: 'home',
      name: match.homeTeam || 'Bigua',
      isBigua: biguaTeam === 'home',
    },
    away: {
      id: 'away',
      name: match.awayTeam || 'Rival',
      isBigua: biguaTeam === 'away',
    },
    biguaTeam,
    rivalTeam,
    biguaName: biguaTeam === 'home' ? match.homeTeam || 'Bigua' : match.awayTeam || 'Bigua',
    rivalName: rivalTeam === 'home' ? match.homeTeam || 'Local' : match.awayTeam || 'Rival',
  };
}

/**
 * @returns {{tries: number, conversions: number, pkGoals: number, drops: number, penaltyTries: number}}
 */
function emptyScoreBreakdown() {
  return {
    tries: 0,
    conversions: 0,
    pkGoals: 0,
    drops: 0,
    penaltyTries: 0,
  };
}

/**
 * @param {object} match
 * @param {Array<object>} events
 * @returns {object}
 */
function calculateScore(match, events) {
  const score = {
    home: { total: 0, breakdown: emptyScoreBreakdown() },
    away: { total: 0, breakdown: emptyScoreBreakdown() },
    source: 'events',
  };
  let hasPointEvents = false;

  events.forEach((event) => {
    if (event.type !== 'points') return;
    const team = event.team === 'away' ? 'away' : 'home';
    const result = normalizeKey(event.result);
    const value = POINT_VALUES[result] || 0;
    const scoreKey = SCORE_KEYS[result];
    if (!value || !scoreKey) return;
    hasPointEvents = true;
    score[team].total += value;
    score[team].breakdown[scoreKey] += 1;
  });

  if (!hasPointEvents) {
    score.source = 'manual';
    score.home.total = Math.max(0, Number(match.homeScore) || 0);
    score.away.total = Math.max(0, Number(match.awayScore) || 0);
  }

  return score;
}

/**
 * @param {object} segment
 * @returns {{team: 'home'|'away', start: number, end: number}|null}
 */
function normalizePossessionSegment(segment) {
  const team = segment?.team === 'away' ? 'away' : segment?.team === 'home' ? 'home' : null;
  const start = Number(segment?.start);
  const end = Number(segment?.end);
  if (!team || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { team, start, end };
}

/**
 * @param {object} possession
 * @returns {Array<{team: 'home'|'away', start: number, end: number}>}
 */
function getPossessionIntervals(possession) {
  const intervals = Array.isArray(possession)
    ? possession
    : Array.isArray(possession?.intervals)
      ? possession.intervals
      : [];
  const normalized = [];

  intervals.forEach((segment) => {
    const next = normalizePossessionSegment(segment);
    if (next) normalized.push(next);
  });

  const active = normalizePossessionSegment({
    team: possession?.activeTeam,
    start: possession?.activeStart,
    end: possession?.activeEnd,
  });
  if (active) normalized.push(active);

  return normalized.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * @param {object} match
 * @param {Array<object>} events
 * @returns {object}
 */
function calculatePossession(match, events) {
  const intervals = getPossessionIntervals(match.possessionIntervals || match.possession);
  const seconds = { home: 0, away: 0, total: 0 };
  const counts = { home: 0, away: 0, total: 0 };

  if (intervals.length > 0) {
    intervals.forEach((interval) => {
      const duration = Math.max(0, interval.end - interval.start);
      seconds[interval.team] += duration;
      seconds.total += duration;
      counts[interval.team] += 1;
      counts.total += 1;
    });

    return {
      source: 'intervals',
      percentages: {
        home: pct(seconds.home, seconds.total),
        away: pct(seconds.away, seconds.total),
      },
      seconds,
      counts,
      segments: intervals,
    };
  }

  events.forEach((event) => {
    if (event.team !== 'home' && event.team !== 'away') return;
    counts[event.team] += 1;
    counts.total += 1;
  });

  return {
    source: counts.total > 0 ? 'events' : 'none',
    percentages: {
      home: pct(counts.home, counts.total),
      away: pct(counts.away, counts.total),
    },
    seconds,
    counts,
    segments: [],
  };
}

/**
 * @param {Array<object>} events
 * @returns {object}
 */
function calculateTerritory(events) {
  const counts = { home: 0, away: 0, total: 0 };
  events.forEach((event) => {
    if (!event.zone || (event.team !== 'home' && event.team !== 'away')) return;
    counts[event.team] += 1;
    counts.total += 1;
  });

  return {
    available: counts.total > 0,
    counts,
    percentages: counts.total > 0
      ? { home: pct(counts.home, counts.total), away: pct(counts.away, counts.total) }
      : null,
  };
}

/**
 * @returns {{turnovers: number, penalties: number, breakLines: number, kicks: number}}
 */
function emptyTotals() {
  return { turnovers: 0, penalties: 0, breakLines: 0, kicks: 0 };
}

/**
 * @param {Array<object>} events
 * @returns {object}
 */
function calculateTotals(events) {
  const totals = { home: emptyTotals(), away: emptyTotals() };
  events.forEach((event) => {
    if (event.team !== 'home' && event.team !== 'away') return;
    if (event.type === 'turnover') totals[event.team].turnovers += 1;
    if (event.type === 'penal') totals[event.team].penalties += 1;
    if (event.type === 'break-line') totals[event.team].breakLines += 1;
    if (event.type === 'kick') totals[event.team].kicks += 1;
  });
  return totals;
}

/**
 * @param {boolean} withThrowQuality
 * @returns {object}
 */
function emptySetPieceMetric(withThrowQuality = false) {
  const metric = {
    total: 0,
    won: 0,
    lost: 0,
    dirty: 0,
    wonPct: 0,
    lostPct: 0,
    dirtyPct: 0,
  };
  if (withThrowQuality) metric.throwQuality = { bueno: 0, neutro: 0, malo: 0 };
  return metric;
}

/**
 * @param {object} metric
 */
function finalizeResultMetric(metric) {
  metric.wonPct = pct(metric.won, metric.total);
  metric.lostPct = pct(metric.lost, metric.total);
  metric.dirtyPct = pct(metric.dirty, metric.total);
}

/**
 * @param {object} metric
 * @param {string} result
 */
function addResult(metric, result) {
  const normalized = normalizeKey(result);
  if (!RESULT_KEYS.includes(normalized)) return;
  if (normalized === 'ganado') metric.won += 1;
  if (normalized === 'perdido') metric.lost += 1;
  if (normalized === 'ganado-sucio') metric.dirty += 1;
  metric.total += 1;
}

/**
 * @param {Array<object>} events
 * @returns {object}
 */
function calculateSetPieces(events) {
  const setPieces = {
    scrums: { home: emptySetPieceMetric(), away: emptySetPieceMetric() },
    lineouts: { home: emptySetPieceMetric(true), away: emptySetPieceMetric(true) },
  };

  events.forEach((event) => {
    if (event.team !== 'home' && event.team !== 'away') return;
    if (event.type === 'scrum') addResult(setPieces.scrums[event.team], event.result);
    if (event.type === 'lineout') {
      addResult(setPieces.lineouts[event.team], event.result);
      const quality = normalizeKey(event.subtype);
      if (THROW_QUALITIES.includes(quality)) {
        setPieces.lineouts[event.team].throwQuality[quality] += 1;
      }
    }
  });

  TEAMS.forEach((team) => {
    finalizeResultMetric(setPieces.scrums[team]);
    finalizeResultMetric(setPieces.lineouts[team]);
  });

  return setPieces;
}

/**
 * @returns {object}
 */
function emptyRuckMetric() {
  return {
    total: 0,
    won: 0,
    lost: 0,
    dirty: 0,
    wonPct: 0,
    lostPct: 0,
    dirtyPct: 0,
    rucksPerPossession: 0,
  };
}

/**
 * @param {Array<object>} events
 * @param {object} possession
 * @returns {object}
 */
function calculateRucks(events, possession) {
  const rucks = { home: emptyRuckMetric(), away: emptyRuckMetric() };
  events.forEach((event) => {
    if (event.type !== 'ruck' || (event.team !== 'home' && event.team !== 'away')) return;
    addResult(rucks[event.team], event.result);
  });

  TEAMS.forEach((team) => {
    finalizeResultMetric(rucks[team]);
    const possessions = Math.max(0, Number(possession.counts?.[team]) || 0);
    rucks[team].rucksPerPossession = possessions > 0 ? round(rucks[team].total / possessions) : 0;
  });

  return rucks;
}

/**
 * @returns {object}
 */
function emptyKickResults() {
  return KICK_RESULTS.reduce((acc, result) => ({ ...acc, [result]: 0 }), {});
}

/**
 * @param {object} metric
 */
function finalizeKickMetric(metric) {
  metric.favorablePct = pct(metric.favorable, metric.total);
}

/**
 * @param {Array<object>} events
 * @returns {object}
 */
function calculateKicks(events) {
  const kicks = {
    home: { total: 0, favorable: 0, favorablePct: 0, results: emptyKickResults(), byPlayer: [] },
    away: { total: 0, favorable: 0, favorablePct: 0, results: emptyKickResults(), byPlayer: [] },
  };
  const players = { home: new Map(), away: new Map() };

  events.forEach((event) => {
    if (event.type !== 'kick' || (event.team !== 'home' && event.team !== 'away')) return;
    const team = event.team;
    const result = KICK_RESULTS.includes(normalizeKey(event.result)) ? normalizeKey(event.result) : 'contestado';
    const player = String(event.player || 'Sin pateador');

    kicks[team].total += 1;
    kicks[team].results[result] += 1;
    if (FAVORABLE_KICKS.has(result)) kicks[team].favorable += 1;

    if (!players[team].has(player)) {
      players[team].set(player, {
        player,
        total: 0,
        favorable: 0,
        favorablePct: 0,
        results: emptyKickResults(),
      });
    }
    const playerMetric = players[team].get(player);
    playerMetric.total += 1;
    playerMetric.results[result] += 1;
    if (FAVORABLE_KICKS.has(result)) playerMetric.favorable += 1;
  });

  TEAMS.forEach((team) => {
    finalizeKickMetric(kicks[team]);
    kicks[team].byPlayer = Array.from(players[team].values())
      .map((playerMetric) => {
        finalizeKickMetric(playerMetric);
        return playerMetric;
      })
      .sort((a, b) => b.favorablePct - a.favorablePct || b.total - a.total || a.player.localeCompare(b.player));
  });

  return kicks;
}

/**
 * @returns {object}
 */
function emptyPenaltyTypeCounts() {
  return PENAL_TYPES.reduce((acc, type) => ({ ...acc, [type]: 0 }), {});
}

/**
 * @returns {object}
 */
function emptyPenaltyPhaseByType() {
  return PENAL_TYPES.reduce((acc, type) => ({
    ...acc,
    [type]: { ataque: 0, defensa: 0 },
  }), {});
}

/**
 * @returns {object}
 */
function emptyDisciplineTeam() {
  return {
    penalties: {
      total: 0,
      attack: 0,
      defense: 0,
      byType: emptyPenaltyTypeCounts(),
      byTypePhase: emptyPenaltyPhaseByType(),
    },
    cards: {
      amarilla: 0,
      roja: 0,
    },
  };
}

/**
 * @param {Array<object>} events
 * @returns {object}
 */
function calculateDiscipline(events) {
  const discipline = { home: emptyDisciplineTeam(), away: emptyDisciplineTeam() };

  events.forEach((event) => {
    if (event.team !== 'home' && event.team !== 'away') return;
    const team = event.team;
    if (event.type === 'penal') {
      const phase = normalizeKey(event.result);
      const type = PENAL_TYPES.includes(normalizeKey(event.subtype)) ? normalizeKey(event.subtype) : 'otro';
      discipline[team].penalties.total += 1;
      if (phase === 'ataque') discipline[team].penalties.attack += 1;
      if (phase === 'defensa') discipline[team].penalties.defense += 1;
      discipline[team].penalties.byType[type] += 1;
      if (phase === 'ataque' || phase === 'defensa') {
        discipline[team].penalties.byTypePhase[type][phase] += 1;
      }
    }
    if (event.type === 'card') {
      const card = normalizeKey(event.result);
      if (card === 'amarilla' || card === 'roja') discipline[team].cards[card] += 1;
    }
  });

  return discipline;
}

/**
 * @returns {object}
 */
function emptyBreakLineResults() {
  return BREAK_LINE_RESULTS.reduce((acc, result) => ({ ...acc, [result]: 0 }), {});
}

/**
 * @param {Array<object>} events
 * @returns {object}
 */
function calculateBreakLines(events) {
  const breakLines = {
    home: { total: 0, killerInstinctPct: 0, byOrigin: {}, byResult: emptyBreakLineResults() },
    away: { total: 0, killerInstinctPct: 0, byOrigin: {}, byResult: emptyBreakLineResults() },
  };

  events.forEach((event) => {
    if (event.type !== 'break-line' || (event.team !== 'home' && event.team !== 'away')) return;
    const team = event.team;
    const result = BREAK_LINE_RESULTS.includes(normalizeKey(event.result)) ? normalizeKey(event.result) : 'juego';
    const origin = normalizeKey(event.subtype) || event.zone || 'sin-origen';
    breakLines[team].total += 1;
    breakLines[team].byResult[result] += 1;
    breakLines[team].byOrigin[origin] = (breakLines[team].byOrigin[origin] || 0) + 1;
  });

  TEAMS.forEach((team) => {
    breakLines[team].killerInstinctPct = pct(breakLines[team].byResult.try, breakLines[team].total);
  });

  return breakLines;
}

/**
 * @param {Array<object>} events
 * @returns {object}
 */
function calculateBip(events) {
  return {
    bands: BIP_BANDS.map((band) => ({
      ...band,
      count: events.filter((event) => {
        const timestamp = Number(event.timestamp);
        if (!Number.isFinite(timestamp)) return false;
        return timestamp >= band.start && (band.end === null || timestamp < band.end);
      }).length,
    })),
  };
}

/**
 * @param {Array<object>} sequences
 * @returns {object}
 */
function calculateSequences(sequences) {
  const valid = Array.isArray(sequences) ? sequences : [];
  const byResult = {};
  const totalPhases = valid.reduce((sum, sequence) => sum + (Number(sequence.phases) || 0), 0);

  valid.forEach((sequence) => {
    const result = normalizeKey(sequence.result) || 'sin-resultado';
    if (!byResult[result]) byResult[result] = { count: 0, pct: 0 };
    byResult[result].count += 1;
  });

  Object.values(byResult).forEach((metric) => {
    metric.pct = pct(metric.count, valid.length);
  });

  return {
    total: valid.length,
    averagePhases: valid.length > 0 ? round(totalPhases / valid.length) : 0,
    byResult,
    longest: [...valid]
      .sort((a, b) => (Number(b.phases) || 0) - (Number(a.phases) || 0) || (Number(b.duration) || 0) - (Number(a.duration) || 0))
      .slice(0, 5),
  };
}

/**
 * @param {Array<object>} events
 * @returns {object}
 */
function calculateHeatmap(events) {
  const zones = {};

  events.forEach((event) => {
    if (!event.zone || (event.team !== 'home' && event.team !== 'away')) return;
    const zone = String(event.zone);
    if (!zones[zone]) zones[zone] = { home: 0, away: 0, total: 0, intensity: 0 };
    zones[zone][event.team] += 1;
    zones[zone].total += 1;
  });

  const maxCount = Object.values(zones).reduce((max, zone) => Math.max(max, zone.total), 0);
  Object.values(zones).forEach((zone) => {
    zone.intensity = maxCount > 0 ? round(zone.total / maxCount) : 0;
  });

  return {
    available: maxCount > 0,
    maxCount,
    zones,
  };
}

/**
 * @param {object} stats
 * @param {object} teams
 * @param {object} settings
 * @returns {Array<{metrica: string, valor: number, umbral: number, equipo: string}>}
 */
function calculateAlerts(stats, teams, settings = {}) {
  const thresholds = {
    ...DEFAULT_ALERT_THRESHOLDS,
    ...(settings.alerts || settings || {}),
  };
  const alerts = [];

  TEAMS.forEach((team) => {
    const teamName = teams[team].name;
    if (stats.rucks[team].total > 0 && stats.rucks[team].wonPct < thresholds.ruckWinPctMin) {
      alerts.push({ metrica: '% Rucks ganados', valor: stats.rucks[team].wonPct, umbral: thresholds.ruckWinPctMin, equipo: teamName });
    }
    if (stats.discipline[team].penalties.total > thresholds.penaltiesMax) {
      alerts.push({ metrica: 'Penales totales', valor: stats.discipline[team].penalties.total, umbral: thresholds.penaltiesMax, equipo: teamName });
    }
    if (stats.setPieces.lineouts[team].total > 0 && stats.setPieces.lineouts[team].wonPct < thresholds.lineoutWinPctMin) {
      alerts.push({ metrica: '% Line Outs ganados', valor: stats.setPieces.lineouts[team].wonPct, umbral: thresholds.lineoutWinPctMin, equipo: teamName });
    }
    if (stats.setPieces.scrums[team].total > 0 && stats.setPieces.scrums[team].wonPct < thresholds.scrumWinPctMin) {
      alerts.push({ metrica: '% Scrums ganados', valor: stats.setPieces.scrums[team].wonPct, umbral: thresholds.scrumWinPctMin, equipo: teamName });
    }
    const conceded = stats.breakLines[opponentOf(team)].total;
    if (conceded > thresholds.breakLinesConcededMax) {
      alerts.push({ metrica: 'Break Lines concedidas', valor: conceded, umbral: thresholds.breakLinesConcededMax, equipo: teamName });
    }
  });

  return alerts;
}

/**
 * @param {object} stats
 * @param {object} teams
 * @returns {object}
 */
function buildKpis(stats, teams) {
  const bigua = teams.biguaTeam;
  return {
    ruckWinPct: stats.rucks[bigua].wonPct,
    penalties: stats.discipline[bigua].penalties.total,
    lineoutWinPct: stats.setPieces.lineouts[bigua].wonPct,
    breakLines: stats.breakLines[bigua].total,
  };
}

/**
 * @param {object} match
 * @param {object} [settings]
 * @returns {object}
 */
function calculateMatchStats(match, settings = {}) {
  const safeMatch = match || {};
  const events = Array.isArray(safeMatch.events) ? safeMatch.events : [];
  const sequences = Array.isArray(safeMatch.sequences) ? safeMatch.sequences : [];
  const teams = buildTeams(safeMatch);
  const possession = calculatePossession(safeMatch, events);
  const stats = {
    match: {
      id: safeMatch.id || '',
      homeTeam: safeMatch.homeTeam || 'Bigua',
      awayTeam: safeMatch.awayTeam || 'Rival',
      date: safeMatch.date || '',
      competition: safeMatch.competition || '',
      eventCount: events.length,
      coachNotes: safeMatch.coachNotes || '',
    },
    teams,
    score: calculateScore(safeMatch, events),
    possession,
    territory: calculateTerritory(events),
    totals: calculateTotals(events),
    setPieces: calculateSetPieces(events),
    rucks: calculateRucks(events, possession),
    kicks: calculateKicks(events),
    discipline: calculateDiscipline(events),
    breakLines: calculateBreakLines(events),
    bip: calculateBip(events),
    sequences: calculateSequences(sequences),
    heatmap: calculateHeatmap(events),
    kpis: {},
    alerts: [],
  };

  stats.kpis = buildKpis(stats, teams);
  stats.alerts = calculateAlerts(stats, teams, settings);
  return stats;
}

/**
 * @param {string} matchId
 * @returns {Promise<object>}
 */
async function getMatchStats(matchId) {
  const [match, settings] = await Promise.all([
    getMatchById(matchId),
    getSettings(),
  ]);
  return calculateMatchStats(match, settings);
}


/**
 * @param {string|null|undefined} value
 * @returns {Date|null}
 */
function parseSeasonDate(value) {
  const raw = String(value || '');
  if (!raw) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * @param {Array<number>} values
 * @returns {number}
 */
function average(values) {
  const valid = values.filter(value => Number.isFinite(value));
  if (valid.length === 0) return 0;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10;
}

/**
 * @param {object} match
 * @param {object} stats
 * @returns {object}
 */
function buildSeasonMatchRow(match, stats) {
  const bigua = stats.teams.biguaTeam;
  const rival = stats.teams.rivalTeam;
  const homeScore = Number.isFinite(Number(match.homeScore)) ? Number(match.homeScore) : stats.score.home.total;
  const awayScore = Number.isFinite(Number(match.awayScore)) ? Number(match.awayScore) : stats.score.away.total;
  const rivalName = rival === 'home' ? match.homeTeam || 'Local' : match.awayTeam || 'Rival';
  const date = match.date || match.createdAt || '';

  return {
    id: match.id,
    date,
    label: rivalName + ' ' + date,
    rival: rivalName,
    score: homeScore + ' - ' + awayScore,
    competition: match.competition || 'Sin competencia',
    ruckWinPct: stats.rucks[bigua].wonPct,
    penalties: stats.discipline[bigua].penalties.total,
    lineoutWinPct: stats.setPieces.lineouts[bigua].wonPct,
    breakLines: stats.breakLines[bigua].total,
    breakLinesConceded: stats.breakLines[rival].total,
  };
}

/**
 * @param {number|string} year
 * @returns {Promise<object>}
 */
async function getSeasonStats(year = new Date().getFullYear()) {
  const safeYear = Number(year) || new Date().getFullYear();
  const [summaries, settings] = await Promise.all([
    getAllMatches(),
    getSettings(),
  ]);
  const rows = [];

  for (const summary of summaries) {
    const date = parseSeasonDate(summary.date || summary.createdAt);
    if (!date || date.getFullYear() !== safeYear) continue;
    const match = await getMatchById(summary.id);
    rows.push(buildSeasonMatchRow(match, calculateMatchStats(match, settings)));
  }

  rows.sort((a, b) => {
    const dateA = parseSeasonDate(a.date)?.getTime() || 0;
    const dateB = parseSeasonDate(b.date)?.getTime() || 0;
    return dateA - dateB;
  });

  const thresholds = {
    ...DEFAULT_ALERT_THRESHOLDS,
    ...(settings.alerts || {}),
  };

  return {
    year: safeYear,
    matches: rows,
    competitions: Array.from(new Set(rows.map(row => row.competition))).sort((a, b) => a.localeCompare(b)),
    averages: {
      ruckWinPct: average(rows.map(row => row.ruckWinPct)),
      penalties: average(rows.map(row => row.penalties)),
      lineoutWinPct: average(rows.map(row => row.lineoutWinPct)),
      breakLines: average(rows.map(row => row.breakLines)),
      breakLinesConceded: average(rows.map(row => row.breakLinesConceded)),
    },
    thresholds,
  };
}

module.exports = {
  DEFAULT_ALERT_THRESHOLDS,
  calculateMatchStats,
  getMatchStats,
  getSeasonStats,
  identifyBiguaTeam,
};
