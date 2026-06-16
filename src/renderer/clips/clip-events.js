// @ts-check

export const DEFAULT_CLIP_PRE_ROLL_SECONDS = 5;
export const DEFAULT_CLIP_POST_ROLL_SECONDS = 8;
export const CLIP_NO_VIDEO_MESSAGE = 'No hay video asociado.';
export const CLIP_LOCAL_VIDEO_MISSING_MESSAGE = 'Video local no asociado en esta PC.';
export const CLIP_NO_EVENTS_MESSAGE = 'No hay eventos para este filtro.';
export const CLIP_MISSING_TIMESTAMPS_MESSAGE = 'Hay eventos sin timestamp. No pueden convertirse en clips.';

const MAX_CLIP_EDGE_SECONDS = 60;
const TYPE_ALIASES = {
  break: 'break-line',
  breakline: 'break-line',
  'break-line': 'break-line',
  'break-lines': 'break-line',
  breaklines: 'break-line',
  card: 'card',
  cards: 'card',
  kick: 'kick',
  kicks: 'kick',
  line: 'lineout',
  'line-out': 'lineout',
  lineout: 'lineout',
  lineouts: 'lineout',
  maul: 'maul',
  mauls: 'maul',
  note: 'note',
  notes: 'note',
  penal: 'penal',
  penales: 'penal',
  penalties: 'penal',
  penalty: 'penal',
  point: 'points',
  points: 'points',
  ruck: 'ruck',
  rucks: 'ruck',
  scrum: 'scrum',
  scrums: 'scrum',
  try: 'points',
  tries: 'points',
  turnover: 'turnover',
  turnovers: 'turnover',
};

/**
 * @param {number|string|null|undefined} value
 * @param {number} fallback
 * @param {number} min
 * @returns {number}
 */
function normalizeClipSeconds(value, fallback, min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min) return fallback;
  return Math.min(MAX_CLIP_EDGE_SECONDS, Math.round(numeric));
}

/**
 * @param {number} value
 * @returns {number}
 */
function roundSeconds(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function optionalSeconds(value) {
  if (value === null || value === undefined || value === '') return Number.NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

/**
 * @param {number|string|null|undefined} timestamp
 * @param {number|string|null|undefined} videoDuration
 * @param {object} [settings]
 * @returns {{start: number, end: number, duration: number}}
 */
export function calculateClipRange(timestamp, videoDuration, settings = {}) {
  const eventTimestamp = Number(timestamp);
  if (!Number.isFinite(eventTimestamp) || eventTimestamp < 0) {
    throw new Error('El evento no tiene timestamp valido para reproducir.');
  }
  const preRoll = normalizeClipSeconds(settings.clipPreRollSeconds, DEFAULT_CLIP_PRE_ROLL_SECONDS, 0);
  const postRoll = normalizeClipSeconds(settings.clipPostRollSeconds, DEFAULT_CLIP_POST_ROLL_SECONDS, 1);
  const start = Math.max(0, eventTimestamp - preRoll);
  const maxDuration = Number(videoDuration);
  const unclampedEnd = eventTimestamp + postRoll;
  const end = Number.isFinite(maxDuration) && maxDuration > 0 ? Math.min(maxDuration, unclampedEnd) : unclampedEnd;
  return {
    start: roundSeconds(start),
    end: roundSeconds(end),
    duration: roundSeconds(Math.max(0, end - start)),
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeClipFilterKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function hasValidClipTimestamp(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0;
}

/**
 * @param {object} match
 * @returns {'home'|'away'}
 */
export function identifyBiguaTeam(match = {}) {
  const home = normalizeClipFilterKey(match.homeTeam || match.localTeam);
  const away = normalizeClipFilterKey(match.awayTeam || match.rivalTeam);
  if (home.includes('bigua')) return 'home';
  if (away.includes('bigua')) return 'away';
  return 'home';
}

/**
 * @param {unknown} value
 * @param {Array<unknown>} targetValues
 * @returns {boolean}
 */
function valueMatchesAny(value, targetValues) {
  const normalized = normalizeClipFilterKey(value);
  return Boolean(normalized) && targetValues.some(target => normalizeClipFilterKey(target) === normalized);
}

/**
 * @param {object} match
 * @returns {{home: Array<unknown>, away: Array<unknown>}}
 */
function getTeamIdentityValues(match = {}) {
  return {
    home: [
      'home',
      'local',
      match.homeTeam,
      match.localTeam,
      match.homeTeamId,
      match.localTeamId,
      match.homeTeamSlug,
    ],
    away: [
      'away',
      'rival',
      'visitante',
      'opponent',
      match.awayTeam,
      match.rivalTeam,
      match.awayTeamId,
      match.rivalTeamId,
      match.awayTeamSlug,
    ],
  };
}

/**
 * @param {unknown} value
 * @returns {Array<unknown>}
 */
function getObjectTeamValues(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [value];
  return [
    value.id,
    value.teamId,
    value.team_id,
    value.name,
    value.teamName,
    value.team_name,
    value.label,
    value.slug,
  ];
}

/**
 * @param {Array<unknown>} values
 * @param {object} match
 * @returns {'home'|'away'|null}
 */
function resolveTeamSideFromValues(values, match = {}) {
  const identities = getTeamIdentityValues(match);
  const biguaTeam = identifyBiguaTeam(match);
  for (const value of values.flatMap(getObjectTeamValues)) {
    const normalized = normalizeClipFilterKey(value);
    if (!normalized) continue;
    if (normalized === 'bigua') return biguaTeam;
    if (normalized === 'rival' || normalized === 'opponent') return biguaTeam === 'home' ? 'away' : 'home';
    if (valueMatchesAny(normalized, identities.home)) return 'home';
    if (valueMatchesAny(normalized, identities.away)) return 'away';
  }
  return null;
}

/**
 * @param {object} event
 * @param {object} match
 * @returns {'home'|'away'|null}
 */
export function resolveEventTeam(event = {}, match = {}) {
  return resolveTeamSideFromValues([
    event.team,
    event.teamId,
    event.team_id,
    event.teamName,
    event.team_name,
    event.equipo,
  ], match);
}

/**
 * @param {string|null|undefined} team
 * @param {object} match
 * @returns {'home'|'away'|null}
 */
export function resolveClipTeamFilter(team, match = {}) {
  const normalized = normalizeClipFilterKey(team || 'all');
  if (!normalized || normalized === 'all' || normalized === 'todos') return null;
  return resolveTeamSideFromValues([team], match);
}

/**
 * @param {object} event
 * @returns {string}
 */
export function resolveEventType(event = {}) {
  const rawType = event.type ?? event.eventType ?? event.event_type ?? event.kind ?? event.category;
  const normalized = normalizeClipFilterKey(rawType);
  if ((normalized === 'set-piece' || normalized === 'setpiece') && normalizeClipFilterKey(event.subtype).includes('scrum')) {
    return 'scrum';
  }
  if ((normalized === 'set-piece' || normalized === 'setpiece') && normalizeClipFilterKey(event.subtype).includes('line')) {
    return 'lineout';
  }
  if ((normalized === 'set-piece' || normalized === 'setpiece') && normalizeClipFilterKey(event.subtype).includes('maul')) {
    return 'maul';
  }
  return TYPE_ALIASES[normalized] || normalized;
}

/**
 * @param {object} event
 * @returns {Array<unknown>}
 */
export function getEventResultValues(event = {}) {
  const values = [
    event.result,
    event.outcome,
    event.subtype,
    event.subType,
    event.resultType,
    event.result_type,
  ];
  if (Array.isArray(event.subtypes)) values.push(...event.subtypes);
  if (Array.isArray(event.tags)) values.push(...event.tags);
  if (normalizeClipFilterKey(event.type ?? event.eventType ?? event.event_type) === 'try') values.push('try');
  return values;
}

/**
 * @param {object} event
 * @param {string} resultFilter
 * @returns {boolean}
 */
export function eventMatchesResult(event, resultFilter) {
  const normalized = normalizeClipFilterKey(resultFilter || 'all');
  if (!normalized || normalized === 'all' || normalized === 'todos') return true;
  return getEventResultValues(event).some(value => normalizeClipFilterKey(value) === normalized);
}

/**
 * @param {object} event
 * @param {object} filters
 * @param {object} match
 * @param {{requireTimestamp?: boolean}} [options]
 * @returns {boolean}
 */
export function eventMatchesClipFilters(event = {}, filters = {}, match = {}, options = {}) {
  const type = normalizeClipFilterKey(filters.type || 'all');
  const team = resolveClipTeamFilter(filters.team, match);
  const timestamp = Number(event.timestamp);
  const hasTimestamp = hasValidClipTimestamp(event.timestamp);
  const fromSeconds = optionalSeconds(filters.fromSeconds);
  const toSeconds = optionalSeconds(filters.toSeconds);
  const hasFrom = Number.isFinite(fromSeconds);
  const hasTo = Number.isFinite(toSeconds);

  if (options.requireTimestamp !== false && !hasTimestamp) return false;
  if (type && type !== 'all' && resolveEventType(event) !== (TYPE_ALIASES[type] || type)) return false;
  if (!eventMatchesResult(event, filters.result || 'all')) return false;
  if (team && resolveEventTeam(event, match) !== team) return false;
  if (hasTimestamp) {
    if (hasFrom && timestamp < fromSeconds) return false;
    if (hasTo && timestamp > toSeconds) return false;
  }
  return true;
}

/**
 * @param {Array<object>} events
 * @param {object} filters
 * @param {object} match
 * @param {{requireTimestamp?: boolean}} [options]
 * @returns {Array<object>}
 */
export function filterClipEvents(events = [], filters = {}, match = {}, options = {}) {
  return (Array.isArray(events) ? events : [])
    .filter(event => eventMatchesClipFilters(event, filters, match, options))
    .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
}

/**
 * @param {object} event
 * @param {object} match
 * @returns {string}
 */
export function getEventTeamLabel(event = {}, match = {}) {
  const side = resolveEventTeam(event, match);
  if (side === 'home') return String(match.homeTeam || match.localTeam || 'Bigua');
  if (side === 'away') return String(match.awayTeam || match.rivalTeam || 'Rival');
  return String(event.teamName || event.team_name || event.team?.name || event.team || 'Sin equipo');
}

/**
 * @param {object} event
 * @returns {string}
 */
export function getEventResultLabel(event = {}) {
  const first = getEventResultValues(event).find(value => normalizeClipFilterKey(value));
  return String(first || 'Sin resultado');
}

/**
 * @param {object} event
 * @returns {string}
 */
export function getEventTypeLabel(event = {}) {
  return (resolveEventType(event) || 'evento').replaceAll('-', ' ');
}

/**
 * @param {object} params
 * @returns {{eventId: string|null, eventTimestamp: number|null, type: string, result: string, team: string, fromSeconds: number|null, toSeconds: number|null}}
 */
export function getClipRequestFromParams(params = {}) {
  return {
    eventId: params.eventId || null,
    eventTimestamp: params.eventTimestamp === '' || params.eventTimestamp === null || params.eventTimestamp === undefined ? null : Number(params.eventTimestamp),
    type: params.clipType || params.type || 'all',
    result: params.clipResult || params.result || 'all',
    team: params.clipTeam || params.team || 'all',
    fromSeconds: params.clipFrom === '' || params.clipFrom === null || params.clipFrom === undefined ? null : Number(params.clipFrom),
    toSeconds: params.clipTo === '' || params.clipTo === null || params.clipTo === undefined ? null : Number(params.clipTo),
  };
}

/**
 * @param {string} filePath
 * @returns {string}
 */
export function toFileUrl(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  return `file:///${encodeURI(normalized)}`;
}

/**
 * @param {object|null|undefined} video
 * @returns {{type: 'youtube'|'local', src: string}|null}
 */
export function getPlayableVideo(video) {
  if (!video || typeof video !== 'object') return null;
  if (video.type === 'youtube' || video.sourceType === 'youtube') {
    if (video.videoId || video.youtubeVideoId || video.url || video.embedUrl) {
      return { type: 'youtube', src: '' };
    }
    return null;
  }
  if (video.type === 'local' || video.sourceType === 'local_mp4') {
    const path = String(video.path || '').trim();
    if (!path) return null;
    return {
      type: 'local',
      src: video.fileUrl || toFileUrl(path),
    };
  }
  return null;
}

/**
 * @param {object} match
 * @param {object} request
 * @returns {Array<object>}
 */
export function getClipCandidateEvents(match = {}, request = {}) {
  const events = Array.isArray(match.events) ? match.events : [];
  if (request.eventId) return events.filter(event => String(event.id) === String(request.eventId));
  if (Number.isFinite(request.eventTimestamp)) {
    return events.filter(event => Number(event.timestamp) === Number(request.eventTimestamp));
  }
  return filterClipEvents(events, request, match, { requireTimestamp: false });
}
