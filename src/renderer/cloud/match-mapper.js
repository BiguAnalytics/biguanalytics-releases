// @ts-check
import { mapVideoReferenceToLocalVideo } from './video-reference-service.js';

/**
 * @param {unknown} value
 * @returns {number}
 */
function scoreNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

/**
 * @param {unknown} value
 * @returns {'win'|'loss'|'draw'|'unknown'}
 */
function normalizeResult(value) {
  return value === 'win' || value === 'loss' || value === 'draw' || value === 'unknown'
    ? value
    : 'unknown';
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
 * @param {object} match
 * @param {{local?: unknown, rival?: unknown, bigua?: unknown, opponent?: unknown, winnerTeam?: unknown, resultForBigua?: unknown, updatedAt?: unknown, source?: string}} source
 * @returns {{score: object, scoreContext: object, homeScore: number, awayScore: number}}
 */
function buildScore(match, source = {}) {
  const homeScore = scoreNumber(source.local ?? match.homeScore ?? match.score?.local ?? match.score?.home);
  const awayScore = scoreNumber(source.rival ?? match.awayScore ?? match.score?.rival ?? match.score?.away);
  const biguaTeam = identifyBiguaTeam(match);
  const localTeam = String(match.homeTeam || 'Bigua').trim() || 'Bigua';
  const rivalTeam = String(match.awayTeam || 'Rival').trim() || 'Rival';
  const biguaScore = scoreNumber(source.bigua ?? (biguaTeam === 'home' ? homeScore : awayScore));
  const opponentScore = scoreNumber(source.opponent ?? (biguaTeam === 'home' ? awayScore : homeScore));
  const hasEvidence = homeScore > 0
    || awayScore > 0
    || source.resultForBigua === 'win'
    || source.resultForBigua === 'loss'
    || source.resultForBigua === 'draw';
  const computedResult = !hasEvidence
    ? 'unknown'
    : biguaScore === opponentScore
      ? 'draw'
      : biguaScore > opponentScore
        ? 'win'
        : 'loss';
  const sourceResult = normalizeResult(source.resultForBigua);
  const resultForBigua = sourceResult === 'unknown' && hasEvidence ? computedResult : sourceResult;
  const winnerTeam = !hasEvidence
    ? null
    : source.winnerTeam
      ? String(source.winnerTeam)
      : homeScore === awayScore
        ? 'Empate'
        : homeScore > awayScore
          ? localTeam
          : rivalTeam;
  const biguaTeamName = biguaTeam === 'home' ? localTeam : rivalTeam;
  const opponentTeamName = biguaTeam === 'home' ? rivalTeam : localTeam;
  const updatedAt = String(source.updatedAt || match.score?.updatedAt || match.updatedAt || match.createdAt || new Date().toISOString());

  return {
    homeScore,
    awayScore,
    score: {
      local: homeScore,
      rival: awayScore,
      bigua: biguaScore,
      opponent: opponentScore,
      winnerTeam,
      resultForBigua: hasEvidence ? resultForBigua : 'unknown',
      updatedAt,
      source: source.source || (hasEvidence ? 'persisted' : 'none'),
    },
    scoreContext: {
      localTeam,
      rivalTeam,
      biguaTeamName,
      opponentTeamName,
      biguaSide: biguaTeam === 'home' ? 'local' : 'rival',
      localScore: homeScore,
      rivalScore: awayScore,
      biguaScore,
      opponentScore,
      winnerTeam,
      resultForBigua: hasEvidence ? resultForBigua : 'unknown',
      updatedAt,
      scoreLabel: `${biguaTeamName} ${biguaScore} - ${opponentScore} ${opponentTeamName}`,
    },
  };
}

/**
 * @param {object} match
 * @returns {object}
 */
export function normalizeMatchForHome(match = {}) {
  const nowDate = new Date().toISOString().slice(0, 10);
  const normalized = {
    ...match,
    id: String(match.id || ''),
    homeTeam: String(match.homeTeam || match.localTeam || 'Bigua').trim() || 'Bigua',
    awayTeam: String(match.awayTeam || match.rivalTeam || 'Rival').trim() || 'Rival',
    date: String(match.date || match.matchDate || nowDate).trim() || nowDate,
    competition: String(match.competition || '').trim(),
    venue: match.venue === 'away' ? 'away' : 'home',
    status: match.status || 'created',
    video: match.video !== undefined ? match.video : null,
    roster: Array.isArray(match.roster) ? match.roster : [],
    drawings: Array.isArray(match.drawings) ? match.drawings : [],
    sequences: Array.isArray(match.sequences) ? match.sequences : [],
    possession: match.possession ?? { activeTeam: null, activeStart: null, activeEnd: null, intervals: [] },
    coachNotes: match.coachNotes || '',
    cloud: match.cloud || null,
    createdAt: match.createdAt || match.updatedAt || new Date().toISOString(),
    updatedAt: match.updatedAt || match.createdAt || new Date().toISOString(),
    eventCount: Number.isFinite(Number(match.eventCount)) ? Number(match.eventCount) : undefined,
    sequenceCount: Number.isFinite(Number(match.sequenceCount)) ? Number(match.sequenceCount) : undefined,
  };
  return {
    ...normalized,
    ...buildScore(normalized, {
      local: match.score?.local ?? match.score?.home ?? match.homeScore,
      rival: match.score?.rival ?? match.score?.away ?? match.awayScore,
      bigua: match.score?.bigua,
      opponent: match.score?.opponent,
      winnerTeam: match.score?.winnerTeam,
      resultForBigua: match.score?.resultForBigua,
      updatedAt: match.score?.updatedAt,
      source: match.score?.source,
    }),
  };
}

/**
 * @param {object} row
 * @returns {object}
 */
export function hydrateCloudMatch(row = {}) {
  const videoReference = Array.isArray(row.video_references)
    ? row.video_references[0]
    : row.video_references;
  const base = normalizeMatchForHome({
    id: row.id,
    homeTeam: row.local_team || 'Bigua',
    awayTeam: row.rival_team || 'Rival',
    date: row.match_date || new Date().toISOString().slice(0, 10),
    competition: row.competition || '',
    venue: row.venue || 'home',
    status: row.status || 'created',
    video: mapVideoReferenceToLocalVideo(videoReference),
    events: [],
    sequences: [],
    possession: { activeTeam: null, activeStart: null, activeEnd: null, intervals: [] },
    coachNotes: '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
    cloud: {
      clubId: row.club_id,
      createdBy: row.created_by,
    },
  });
  return {
    ...base,
    ...buildScore(base, {
      local: row.local_score,
      rival: row.rival_score,
      bigua: row.bigua_score,
      opponent: row.opponent_score,
      winnerTeam: row.winner_team,
      resultForBigua: row.result_for_bigua,
      updatedAt: row.score_updated_at,
      source: 'cloud',
    }),
  };
}

/**
 * @param {object} row
 * @returns {object}
 */
export function mapCloudMatchToLocal(row) {
  return hydrateCloudMatch(row);
}

/**
 * @param {object} row
 * @returns {object}
 */
export function mapCloudMatchSummaryToLocal(row) {
  const local = hydrateCloudMatch(row);
  delete local.events;
  delete local.sequences;
  delete local.possession;
  delete local.coachNotes;
  return local;
}

/**
 * @param {object} match
 * @param {{clubId: string, userId: string}} context
 * @returns {object}
 */
export function mapLocalMatchToCloud(match, context) {
  const normalized = normalizeMatchForHome(match);
  return {
    id: normalized.id,
    club_id: context.clubId,
    created_by: match.createdBy || match.cloud?.createdBy || context.userId,
    local_team: normalized.homeTeam,
    rival_team: normalized.awayTeam,
    match_date: normalized.date || new Date().toISOString().slice(0, 10),
    competition: normalized.competition || null,
    venue: normalized.venue || 'home',
    status: normalized.status || 'created',
    local_score: scoreNumber(normalized.score.local),
    rival_score: scoreNumber(normalized.score.rival),
    bigua_score: scoreNumber(normalized.score.bigua),
    opponent_score: scoreNumber(normalized.score.opponent),
    winner_team: normalized.score.winnerTeam || null,
    result_for_bigua: normalizeResult(normalized.score.resultForBigua),
    score_updated_at: normalized.score.updatedAt || null,
  };
}
