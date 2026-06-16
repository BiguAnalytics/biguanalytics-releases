// @ts-check
const { v4: uuidv4 } = require('uuid');
const { getMatchById, updateMatch } = require('./storage');
const { buildScoreUpdate } = require('./score');
const { normalizeFieldZone } = require('./field-zones');

const TEAM_REQUIRED_EVENT_TYPES = new Set([
  'ruck',
  'scrum',
  'lineout',
  'penal',
  'points',
  'break-line',
  'kick',
  'maul',
  'turnover',
  'card',
]);

const POINT_VALUES = {
  try: 5,
  conversion: 2,
  'pk-goal': 3,
  drop: 3,
  'try-penal': 7,
};

const MAX_EVENT_TEXT_LENGTH = 80;
const MAX_EVENT_NOTE_LENGTH = 2000;
const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;

const EVENT_SCHEMAS = {
  ruck: {
    requiresTeam: true,
    results: ['ganado', 'perdido', 'ganado-sucio', ''],
  },
  scrum: {
    requiresTeam: true,
    results: ['ganado', 'perdido', 'ganado-sucio', ''],
  },
  lineout: {
    requiresTeam: true,
    results: ['ganado', 'perdido', 'ganado-sucio', ''],
    subtypes: ['bueno', 'neutro', 'malo', ''],
  },
  penal: {
    requiresTeam: true,
    results: ['ataque', 'defensa', ''],
    subtypes: ['ruck', 'scrum', 'offside', 'maul', 'inconducta', 'otro', ''],
  },
  points: {
    requiresTeam: true,
    results: ['try', 'conversion', 'pk-goal', 'drop', 'try-penal', ''],
  },
  'break-line': {
    requiresTeam: true,
    results: ['try', 'palos', 'turnover', 'pfk-favor', 'pfk-contra', 'juego', ''],
  },
  kick: {
    requiresTeam: true,
    results: ['touch', 'recuperado', 'perdido', 'contestado', ''],
  },
  maul: {
    requiresTeam: true,
    results: ['ganado', 'perdido', 'ganado-sucio', ''],
  },
  turnover: {
    requiresTeam: true,
    results: ['turnover', ''],
    subtypes: ['knock-on', 'pase-forward', 'mal-pase', 'robo-ruck', 'intercepcion', 'touch', 'otro', ''],
  },
  card: {
    requiresTeam: true,
    results: ['amarilla', 'roja', ''],
  },
  note: {
    requiresTeam: false,
    results: [''],
  },
  try: {
    legacy: true,
    requiresTeam: false,
  },
};

/**
 * @param {unknown} value
 * @returns {'home'|'away'|null}
 */
function normalizeTeam(value) {
  return value === 'home' || value === 'away' ? value : null;
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
 * @param {string} field
 * @param {number} maxLength
 * @returns {string}
 */
function normalizeEventText(value, field, maxLength = MAX_EVENT_TEXT_LENGTH) {
  const text = String(value ?? '').trim();
  if (text.length > maxLength) throw new Error(`${field} excede el largo maximo.`);
  return text;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error('Timestamp invalido.');
  return Math.round(numeric * 1000) / 1000;
}

/**
 * @param {unknown} value
 * @returns {number|undefined}
 */
function normalizeOptionalDuration(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('Duracion invalida.');
  return Math.round(numeric * 1000) / 1000;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string|undefined}
 */
function normalizeDateField(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  const text = normalizeEventText(value, field, 40);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${field} invalido.`);
  return text;
}

/**
 * @param {string} type
 * @returns {object|null}
 */
function getEventSchema(type) {
  if (type.startsWith('custom:')) return { custom: true, requiresTeam: false };
  return EVENT_SCHEMAS[type] || null;
}

/**
 * @param {object} event
 * @returns {object}
 */
function validateEventPayload(event) {
  const id = normalizeEventText(event.id, 'ID de evento', 120);
  if (!EVENT_ID_RE.test(id)) throw new Error('ID de evento invalido.');

  const type = normalizeEventText(event.type, 'Tipo de evento', 80);
  const schema = getEventSchema(type);
  if (!schema) throw new Error('Tipo de evento invalido.');

  const timestamp = normalizeTimestamp(event.timestamp);
  const team = normalizeTeam(event.team);
  if (event.team !== null && event.team !== undefined && event.team !== '' && !team) {
    throw new Error('Equipo invalido.');
  }
  if (schema.requiresTeam && !team) throw new Error('Equipo requerido para este evento.');

  const result = normalizeEventText(event.result, 'Resultado');
  const subtype = normalizeEventText(event.subtype, 'Subtipo');
  if (Array.isArray(schema.results) && !schema.results.includes(result)) {
    throw new Error('Resultado invalido para este tipo de evento.');
  }
  if (Array.isArray(schema.subtypes) && !schema.subtypes.includes(subtype)) {
    throw new Error('Subtipo invalido para este tipo de evento.');
  }

  const zone = normalizeFieldZone(event);
  const normalized = {
    ...event,
    id,
    type,
    timestamp,
    team,
    result,
    subtype,
    note: normalizeEventText(event.note, 'Nota', MAX_EVENT_NOTE_LENGTH),
    zone: zone ? normalizeEventText(zone.id, 'Zona', 40) : null,
    zoneId: zone ? normalizeEventText(zone.id, 'Zona', 40) : null,
    zoneLabel: zone ? normalizeEventText(zone.label, 'Zona label', 80) : null,
    ...(zone?.legacy && zone.originalZone ? { legacyZone: normalizeEventText(zone.originalZone, 'Zona legacy', 40) } : {}),
  };

  if (event.player !== undefined) normalized.player = normalizeEventText(event.player, 'Jugador', 80);
  const duration = normalizeOptionalDuration(event.duration ?? event.durationSeconds);
  if (duration !== undefined) {
    if (event.duration !== undefined) normalized.duration = duration;
    if (event.durationSeconds !== undefined) normalized.durationSeconds = duration;
  }
  const createdAt = normalizeDateField(event.createdAt, 'createdAt');
  const updatedAt = normalizeDateField(event.updatedAt, 'updatedAt');
  if (createdAt !== undefined) normalized.createdAt = createdAt;
  if (updatedAt !== undefined) normalized.updatedAt = updatedAt;

  return normalized;
}

/**
 * @param {object} event
 */
function assertEventTeam(event) {
  if (!TEAM_REQUIRED_EVENT_TYPES.has(String(event.type || ''))) return;
  if (!normalizeTeam(event.team)) throw new Error('Equipo requerido para este evento.');
}

/**
 * @param {Array<object>} events
 * @returns {{homeScore: number, awayScore: number}}
 */
function calculateScoreCache(events = []) {
  return events.reduce((score, event) => {
    if (event.type !== 'points') return score;
    const team = normalizeTeam(event.team);
    if (!team) return score;
    const value = POINT_VALUES[normalizeKey(event.result)] || 0;
    if (team === 'home') score.homeScore += value;
    if (team === 'away') score.awayScore += value;
    return score;
  }, { homeScore: 0, awayScore: 0 });
}

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
 * @param {{homeDelta: number, awayDelta: number}|null} adjustment
 * @returns {boolean}
 */
function hasManualAdjustment(adjustment) {
  return Boolean(adjustment && (adjustment.homeDelta !== 0 || adjustment.awayDelta !== 0));
}

/**
 * @param {object} match
 * @param {{homeScore: number, awayScore: number}} eventScore
 * @returns {{homeDelta: number, awayDelta: number, updatedAt: string}|null}
 */
function getManualScoreAdjustment(match, eventScore) {
  if (match?.scoreAdjustment && typeof match.scoreAdjustment === 'object') {
    const adjustment = {
      homeDelta: scoreDelta(match.scoreAdjustment.homeDelta),
      awayDelta: scoreDelta(match.scoreAdjustment.awayDelta),
      updatedAt: match.scoreAdjustment.updatedAt || new Date().toISOString(),
    };
    return hasManualAdjustment(adjustment) ? adjustment : null;
  }

  if (match?.scoreOverride?.enabled) {
    const adjustment = {
      homeDelta: scoreTotal(match.scoreOverride.homeScore) - scoreTotal(eventScore.homeScore),
      awayDelta: scoreTotal(match.scoreOverride.awayScore) - scoreTotal(eventScore.awayScore),
      updatedAt: match.scoreOverride.updatedAt || new Date().toISOString(),
    };
    return hasManualAdjustment(adjustment) ? adjustment : null;
  }

  return null;
}

/**
 * @param {object} match
 * @param {Array<object>} events
 * @returns {{homeScore: number, awayScore: number}}
 */
function getScoreCacheUpdate(match, events) {
  return buildScoreUpdate({ ...match, events }, {
    clearScoreOverride: true,
    ignoreLegacyScore: true,
  });
}

/**
 * Adds an event to a match
 * @param {string} matchId
 * @param {object} eventData
 * @returns {Promise<object>}
 */
async function addEvent(matchId, eventData) {
  const match = await getMatchById(matchId);
  
  const newEvent = {
    timestamp: null,
    type: '',
    team: null,
    result: '',
    subtype: '',
    note: '',
    zone: null,
    ...eventData,
    team: normalizeTeam(eventData?.team),
    id: uuidv4(),
    createdAt: new Date().toISOString()
  };
  const validatedEvent = validateEventPayload(newEvent);
  assertEventTeam(validatedEvent);

  const updatedEvents = [...(match.events || []), validatedEvent];
  await updateMatch(matchId, {
    events: updatedEvents,
    ...getScoreCacheUpdate(match, updatedEvents),
    status: match.status === 'created' ? 'tagging' : match.status
  });

  return validatedEvent;
}

/**
 * Updates an existing event
 * @param {string} matchId
 * @param {string} eventId
 * @param {object} updates
 * @returns {Promise<object>}
 */
async function updateEvent(matchId, eventId, updates) {
  const match = await getMatchById(matchId);
  
  const eventIndex = (match.events || []).findIndex(e => e.id === eventId);
  if (eventIndex === -1) {
    throw new Error('Event not found');
  }

  const updatedEvents = [...match.events];
  updatedEvents[eventIndex] = {
    ...updatedEvents[eventIndex],
    ...updates,
    team: updates.team !== undefined ? normalizeTeam(updates.team) : normalizeTeam(updatedEvents[eventIndex].team),
    updatedAt: new Date().toISOString(),
  };
  updatedEvents[eventIndex] = validateEventPayload(updatedEvents[eventIndex]);
  assertEventTeam(updatedEvents[eventIndex]);

  await updateMatch(matchId, {
    events: updatedEvents,
    ...getScoreCacheUpdate(match, updatedEvents),
  });

  return updatedEvents[eventIndex];
}

/**
 * Deletes an event
 * @param {string} matchId
 * @param {string} eventId
 * @returns {Promise<void>}
 */
async function deleteEvent(matchId, eventId) {
  const match = await getMatchById(matchId);
  
  const updatedEvents = (match.events || []).filter(e => e.id !== eventId);
  await updateMatch(matchId, {
    events: updatedEvents,
    ...getScoreCacheUpdate(match, updatedEvents),
  });
}

module.exports = {
  addEvent,
  updateEvent,
  deleteEvent,
  calculateScoreCache,
  validateEventPayload,
};
