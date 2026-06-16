// @ts-check

/**
 * @param {unknown} value
 * @returns {number}
 */
function scoreNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

/**
 * @param {object} match
 * @param {object} stats
 * @returns {'home'|'away'}
 */
function getBiguaTeam(match = {}, stats = {}) {
  if (stats?.teams?.biguaTeam === 'away') return 'away';
  if (stats?.teams?.biguaTeam === 'home') return 'home';
  if (String(match.homeTeam || stats?.match?.homeTeam || '').toLowerCase().includes('bigua')) return 'home';
  if (String(match.awayTeam || stats?.match?.awayTeam || '').toLowerCase().includes('bigua')) return 'away';
  return 'home';
}

/**
 * @param {object} match
 * @param {object} stats
 * @returns {{home: number, away: number}}
 */
function getScore(match = {}, stats = {}) {
  const statsSource = stats?.score?.source || '';
  const statsHome = stats?.score?.home?.total;
  const statsAway = stats?.score?.away?.total;
  if (statsSource && statsSource !== 'none') {
    return {
      home: scoreNumber(statsHome),
      away: scoreNumber(statsAway),
    };
  }
  return {
    home: scoreNumber(match?.score?.local ?? match?.score?.home ?? statsHome ?? match.homeScore),
    away: scoreNumber(match?.score?.rival ?? match?.score?.away ?? statsAway ?? match.awayScore),
  };
}

/**
 * @param {object} match
 * @param {{home: number, away: number}} score
 * @returns {boolean}
 */
function hasScoreEvidence(match = {}, score) {
  const result = match.score?.resultForBigua;
  return score.home > 0 || score.away > 0 || result === 'win' || result === 'loss' || result === 'draw';
}

/**
 * @param {object} match
 * @param {object} stats
 * @returns {{
 *   localTeam: string,
 *   rivalTeam: string,
 *   biguaTeamName: string,
 *   biguaSide: 'local'|'rival',
 *   localScore: number,
 *   rivalScore: number,
 *   biguaScore: number,
 *   opponentScore: number,
 *   winnerTeam: string,
 *   resultForBigua: 'win'|'loss'|'draw',
 *   scoreLabel: string,
 * }}
 */
function buildScoreContext(match = {}, stats = {}) {
  const localTeam = String(match.homeTeam || stats?.match?.homeTeam || stats?.teams?.home?.name || 'Bigua').trim() || 'Bigua';
  const rivalTeam = String(match.awayTeam || stats?.match?.awayTeam || stats?.teams?.away?.name || 'Rival').trim() || 'Rival';
  const score = getScore(match, stats);
  const biguaTeam = getBiguaTeam(match, stats);
  const biguaSide = biguaTeam === 'home' ? 'local' : 'rival';
  const biguaTeamName = biguaTeam === 'home' ? localTeam : rivalTeam;
  const opponentTeamName = biguaTeam === 'home' ? rivalTeam : localTeam;
  const biguaScore = biguaTeam === 'home' ? score.home : score.away;
  const opponentScore = biguaTeam === 'home' ? score.away : score.home;
  const hasEvidence = hasScoreEvidence(match, score);
  const winnerTeam = !hasEvidence
    ? null
    : score.home === score.away
    ? 'Empate'
    : score.home > score.away
      ? localTeam
      : rivalTeam;
  const resultForBigua = !hasEvidence
    ? 'unknown'
    : biguaScore === opponentScore
    ? 'draw'
    : biguaScore > opponentScore
      ? 'win'
      : 'loss';
  const updatedAt = match.score?.updatedAt || match.scoreContext?.updatedAt || match.updatedAt || '';

  return {
    localTeam,
    rivalTeam,
    biguaTeamName,
    biguaSide,
    localScore: score.home,
    rivalScore: score.away,
    biguaScore,
    opponentScore,
    winnerTeam,
    resultForBigua,
    updatedAt,
    scoreLabel: `${biguaTeamName} ${biguaScore} - ${opponentScore} ${opponentTeamName}`,
  };
}

module.exports = {
  buildScoreContext,
};
