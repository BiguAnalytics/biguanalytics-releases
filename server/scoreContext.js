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
 * @param {object} matchData
 * @returns {'home'|'away'}
 */
function inferBiguaTeam(matchData = {}) {
  const provided = matchData.scoreContext?.biguaSide;
  if (provided === 'rival') return 'away';
  if (provided === 'local') return 'home';
  if (matchData.stats?.teams?.biguaTeam === 'away') return 'away';
  if (matchData.stats?.teams?.biguaTeam === 'home') return 'home';
  if (String(matchData.match?.homeTeam || '').toLowerCase().includes('bigua')) return 'home';
  if (String(matchData.match?.awayTeam || '').toLowerCase().includes('bigua')) return 'away';
  return 'home';
}

/**
 * @param {object} matchData
 * @returns {{home: number, away: number}}
 */
function getScore(matchData = {}) {
  return {
    home: scoreNumber(
      matchData.stats?.score?.home?.total
      ?? matchData.match?.score?.home
      ?? matchData.scoreContext?.localScore
      ?? matchData.match?.homeScore
    ),
    away: scoreNumber(
      matchData.stats?.score?.away?.total
      ?? matchData.match?.score?.away
      ?? matchData.scoreContext?.rivalScore
      ?? matchData.match?.awayScore
    ),
  };
}

/**
 * @param {object} matchData
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
function buildScoreContext(matchData = {}) {
  const localTeam = String(matchData.match?.homeTeam || matchData.stats?.match?.homeTeam || matchData.stats?.teams?.home?.name || matchData.scoreContext?.localTeam || 'Bigua').trim() || 'Bigua';
  const rivalTeam = String(matchData.match?.awayTeam || matchData.stats?.match?.awayTeam || matchData.stats?.teams?.away?.name || matchData.scoreContext?.rivalTeam || 'Rival').trim() || 'Rival';
  const score = getScore(matchData);
  const biguaTeam = inferBiguaTeam(matchData);
  const biguaSide = biguaTeam === 'home' ? 'local' : 'rival';
  const biguaTeamName = biguaTeam === 'home' ? localTeam : rivalTeam;
  const opponentTeamName = biguaTeam === 'home' ? rivalTeam : localTeam;
  const biguaScore = biguaTeam === 'home' ? score.home : score.away;
  const opponentScore = biguaTeam === 'home' ? score.away : score.home;
  const winnerTeam = score.home === score.away
    ? 'Empate'
    : score.home > score.away
      ? localTeam
      : rivalTeam;
  const resultForBigua = biguaScore === opponentScore
    ? 'draw'
    : biguaScore > opponentScore
      ? 'win'
      : 'loss';

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
    scoreLabel: `${biguaTeamName} ${biguaScore} - ${opponentScore} ${opponentTeamName}`,
  };
}

module.exports = {
  buildScoreContext,
};
