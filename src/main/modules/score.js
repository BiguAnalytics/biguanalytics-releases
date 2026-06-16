// @ts-check

const POINT_VALUES = {
  try: 5,
  conversion: 2,
  'pk-goal': 3,
  drop: 3,
  'try-penal': 7,
};

/**
 * @param {unknown} value
 * @returns {number}
 */
function scoreDelta(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function scoreTotal(value) {
  return Math.max(0, scoreDelta(value));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * @param {unknown} value
 * @returns {'home'|'away'|null}
 */
function normalizeTeam(value) {
  if (value === 'home' || value === 'away') return value;
  return null;
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
 * @param {Array<object>} events
 * @returns {{homeScore: number, awayScore: number, hasPointEvents: boolean, updatedAt: string|null}}
 */
function calculateEventScore(events = []) {
  return (Array.isArray(events) ? events : []).reduce((score, event) => {
    if (event?.type !== 'points') return score;
    const team = normalizeTeam(event.team);
    if (!team) return score;
    const value = POINT_VALUES[normalizeKey(event.result)] || 0;
    if (!value) return score;
    score.hasPointEvents = true;
    if (team === 'home') score.homeScore += value;
    if (team === 'away') score.awayScore += value;
    const eventUpdatedAt = event.updatedAt || event.updated_at || event.createdAt || event.created_at || null;
    if (eventUpdatedAt && (!score.updatedAt || String(eventUpdatedAt) > score.updatedAt)) {
      score.updatedAt = String(eventUpdatedAt);
    }
    return score;
  }, { homeScore: 0, awayScore: 0, hasPointEvents: false, updatedAt: null });
}

/**
 * @param {{homeDelta?: unknown, awayDelta?: unknown, updatedAt?: string}|null|undefined} adjustment
 * @returns {{homeDelta: number, awayDelta: number, updatedAt: string}|null}
 */
function normalizeScoreAdjustment(adjustment) {
  if (!adjustment || typeof adjustment !== 'object') return null;
  const normalized = {
    homeDelta: scoreDelta(adjustment.homeDelta),
    awayDelta: scoreDelta(adjustment.awayDelta),
    updatedAt: String(adjustment.updatedAt || new Date().toISOString()),
  };
  if (normalized.homeDelta === 0 && normalized.awayDelta === 0) return null;
  return normalized;
}

/**
 * @param {object} match
 * @returns {{homeScore: number, awayScore: number, updatedAt: string|null, resultForBigua: string|null, winnerTeam: string|null, hasEvidence: boolean}}
 */
function readPersistedScore(match = {}) {
  const score = match.score || {};
  const homeScore = scoreTotal(score.local ?? score.home ?? match.homeScore);
  const awayScore = scoreTotal(score.rival ?? score.away ?? match.awayScore);
  const resultForBigua = ['win', 'loss', 'draw', 'unknown'].includes(score.resultForBigua)
    ? score.resultForBigua
    : null;
  const hasEvidence = homeScore > 0
    || awayScore > 0
    || resultForBigua === 'win'
    || resultForBigua === 'loss'
    || resultForBigua === 'draw';
  return {
    homeScore,
    awayScore,
    updatedAt: score.updatedAt || match.scoreContext?.updatedAt || null,
    resultForBigua,
    winnerTeam: score.winnerTeam ?? match.scoreContext?.winnerTeam ?? null,
    hasEvidence,
  };
}

/**
 * @param {object} match
 * @param {{homeScore: number, awayScore: number}} eventScore
 * @returns {{homeDelta: number, awayDelta: number, updatedAt: string}|null}
 */
function getManualScoreAdjustment(match, eventScore) {
  const adjustment = normalizeScoreAdjustment(match.scoreAdjustment);
  if (adjustment) return adjustment;

  if (match?.scoreOverride?.enabled === true) {
    const legacyAdjustment = {
      homeDelta: scoreTotal(match.scoreOverride.homeScore) - scoreTotal(eventScore.homeScore),
      awayDelta: scoreTotal(match.scoreOverride.awayScore) - scoreTotal(eventScore.awayScore),
      updatedAt: String(match.scoreOverride.updatedAt || new Date().toISOString()),
    };
    if (legacyAdjustment.homeDelta !== 0 || legacyAdjustment.awayDelta !== 0) return legacyAdjustment;
  }

  return null;
}

/**
 * @param {object} match
 * @param {{homeScore: number, awayScore: number}} eventScore
 * @param {{homeScore: number, awayScore: number, updatedAt: string|null, hasEvidence: boolean}} persisted
 * @returns {{homeDelta: number, awayDelta: number, updatedAt: string}|null}
 */
function deriveAdjustmentFromPersistedScore(match, eventScore, persisted) {
  if (!persisted.hasEvidence) return null;
  const adjustment = {
    homeDelta: persisted.homeScore - scoreTotal(eventScore.homeScore),
    awayDelta: persisted.awayScore - scoreTotal(eventScore.awayScore),
    updatedAt: persisted.updatedAt || match.updatedAt || new Date().toISOString(),
  };
  if (adjustment.homeDelta === 0 && adjustment.awayDelta === 0) return null;
  return adjustment;
}

/**
 * @param {object} match
 * @param {number} homeScore
 * @param {number} awayScore
 * @param {{hasEvidence: boolean, updatedAt?: string|null, source?: string}} options
 * @returns {{score: object, scoreContext: object}}
 */
function buildScoreObjects(match, homeScore, awayScore, options = {}) {
  const localTeam = String(match.homeTeam || 'Bigua').trim() || 'Bigua';
  const rivalTeam = String(match.awayTeam || 'Rival').trim() || 'Rival';
  const biguaTeam = identifyBiguaTeam(match);
  const rivalTeamSide = opponentOf(biguaTeam);
  const biguaSide = biguaTeam === 'home' ? 'local' : 'rival';
  const biguaTeamName = biguaTeam === 'home' ? localTeam : rivalTeam;
  const opponentTeamName = biguaTeam === 'home' ? rivalTeam : localTeam;
  const biguaScore = biguaTeam === 'home' ? homeScore : awayScore;
  const opponentScore = biguaTeam === 'home' ? awayScore : homeScore;
  const hasEvidence = options.hasEvidence === true;
  const resultForBigua = !hasEvidence
    ? 'unknown'
    : biguaScore === opponentScore
      ? 'draw'
      : biguaScore > opponentScore
        ? 'win'
        : 'loss';
  const winnerTeam = !hasEvidence
    ? null
    : homeScore === awayScore
      ? 'Empate'
      : homeScore > awayScore
        ? localTeam
        : rivalTeam;
  const updatedAt = String(options.updatedAt || match.score?.updatedAt || match.updatedAt || new Date().toISOString());

  return {
    score: {
      local: homeScore,
      rival: awayScore,
      bigua: biguaScore,
      opponent: opponentScore,
      winnerTeam,
      resultForBigua,
      updatedAt,
      source: options.source || (hasEvidence ? 'events' : 'none'),
    },
    scoreContext: {
      localTeam,
      rivalTeam,
      biguaTeamName,
      opponentTeamName,
      biguaSide,
      biguaTeam,
      rivalTeamSide,
      localScore: homeScore,
      rivalScore: awayScore,
      biguaScore,
      opponentScore,
      winnerTeam,
      resultForBigua,
      updatedAt,
      scoreLabel: `${biguaTeamName} ${biguaScore} - ${opponentScore} ${opponentTeamName}`,
    },
  };
}

/**
 * @param {object} match
 * @param {{preferPersistedScore?: boolean, clearScoreOverride?: boolean, ignoreLegacyScore?: boolean, now?: string}} [options]
 * @returns {{homeScore: number, awayScore: number, scoreAdjustment: object|null, scoreOverride: object|null, score: object, scoreContext: object}}
 */
function buildScoreUpdate(match = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const events = Array.isArray(match.events) ? match.events : [];
  const eventScore = calculateEventScore(events);
  const persisted = readPersistedScore(match);
  let scoreAdjustment = getManualScoreAdjustment(match, eventScore);
  let homeScore = 0;
  let awayScore = 0;
  let hasEvidence = false;
  let source = 'none';
  let updatedAt = match.updatedAt || now;

  if (options.preferPersistedScore && persisted.hasEvidence) {
    scoreAdjustment = deriveAdjustmentFromPersistedScore(match, eventScore, persisted);
    homeScore = persisted.homeScore;
    awayScore = persisted.awayScore;
    hasEvidence = true;
    source = scoreAdjustment ? 'events-manual' : (eventScore.hasPointEvents ? 'events' : 'persisted');
    updatedAt = persisted.updatedAt || scoreAdjustment?.updatedAt || updatedAt;
  } else if (eventScore.hasPointEvents || scoreAdjustment) {
    homeScore = Math.max(0, eventScore.homeScore + (scoreAdjustment?.homeDelta || 0));
    awayScore = Math.max(0, eventScore.awayScore + (scoreAdjustment?.awayDelta || 0));
    hasEvidence = true;
    source = scoreAdjustment ? 'events-manual' : 'events';
    updatedAt = scoreAdjustment?.updatedAt || eventScore.updatedAt || updatedAt;
  } else if (!options.ignoreLegacyScore && persisted.hasEvidence) {
    homeScore = persisted.homeScore;
    awayScore = persisted.awayScore;
    hasEvidence = true;
    source = persisted.resultForBigua && persisted.resultForBigua !== 'unknown' ? 'persisted' : 'legacy-manual';
    updatedAt = persisted.updatedAt || updatedAt;
  }

  const scoreObjects = buildScoreObjects(match, homeScore, awayScore, { hasEvidence, updatedAt, source });
  return {
    homeScore,
    awayScore,
    scoreAdjustment,
    scoreOverride: options.clearScoreOverride ? null : (match.scoreOverride || null),
    ...scoreObjects,
  };
}

/**
 * @param {object} match
 * @param {{preferPersistedScore?: boolean, now?: string}} [options]
 * @returns {object}
 */
function normalizeMatchScore(match = {}, options = {}) {
  return {
    ...match,
    ...buildScoreUpdate(match, options),
  };
}

module.exports = {
  POINT_VALUES,
  buildScoreObjects,
  buildScoreUpdate,
  calculateEventScore,
  identifyBiguaTeam,
  normalizeMatchScore,
  scoreTotal,
};
