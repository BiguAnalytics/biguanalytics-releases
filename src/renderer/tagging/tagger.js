// @ts-check

const RESULT_OPTIONS = [
  { label: 'Ganado', value: 'ganado' },
  { label: 'Perdido', value: 'perdido' },
  { label: 'Ganado sucio', value: 'ganado-sucio' },
];

const TEAM_OPTIONS = [
  { label: 'Bigua', value: 'home' },
  { label: 'Rival', value: 'away' },
];

const PENAL_TYPES = [
  { label: 'Ruck', value: 'ruck' },
  { label: 'Scrum', value: 'scrum' },
  { label: 'Offside', value: 'offside' },
  { label: 'Maul', value: 'maul' },
  { label: 'Inconducta', value: 'inconducta' },
  { label: 'Otro', value: 'otro' },
];

export const EVENT_DEFINITIONS = {
  R: {
    hotkey: 'R',
    type: 'ruck',
    label: 'Ruck',
    steps: [{ field: 'result', payload: 'result', options: RESULT_OPTIONS }],
  },
  S: {
    hotkey: 'S',
    type: 'scrum',
    label: 'Scrum',
    steps: [
      { field: 'result', payload: 'result', options: RESULT_OPTIONS },
      { field: 'team', payload: 'team', options: TEAM_OPTIONS },
    ],
  },
  L: {
    hotkey: 'L',
    type: 'lineout',
    label: 'Line Out',
    steps: [
      { field: 'result', payload: 'result', options: RESULT_OPTIONS },
      {
        field: 'throwQuality',
        payload: 'subtype',
        options: [
          { label: 'Lanzamiento bueno', value: 'bueno' },
          { label: 'Lanzamiento neutro', value: 'neutro' },
          { label: 'Lanzamiento malo', value: 'malo' },
        ],
      },
    ],
  },
  P: {
    hotkey: 'P',
    type: 'penal',
    label: 'Penal / Free Kick',
    steps: [
      {
        field: 'phase',
        payload: 'result',
        options: [
          { label: 'Ataque', value: 'ataque' },
          { label: 'Defensa', value: 'defensa' },
        ],
      },
      { field: 'subtype', payload: 'subtype', options: PENAL_TYPES },
    ],
  },
  T: {
    hotkey: 'T',
    type: 'points',
    label: 'Try y puntos',
    steps: [
      {
        field: 'result',
        payload: 'result',
        options: [
          { label: 'Try', value: 'try' },
          { label: 'Conversion', value: 'conversion' },
          { label: 'PK Goal', value: 'pk-goal' },
          { label: 'Drop', value: 'drop' },
          { label: 'Try Penal', value: 'try-penal' },
        ],
      },
    ],
  },
  B: {
    hotkey: 'B',
    type: 'break-line',
    label: 'Break Line',
    steps: [
      {
        field: 'result',
        payload: 'result',
        options: [
          { label: 'Try', value: 'try' },
          { label: 'Palos', value: 'palos' },
          { label: 'Turnover', value: 'turnover' },
          { label: 'P-FK a favor', value: 'pfk-favor' },
          { label: 'P-FK en contra', value: 'pfk-contra' },
          { label: 'Juego', value: 'juego' },
        ],
      },
    ],
  },
  K: {
    hotkey: 'K',
    type: 'kick',
    label: 'Kick',
    steps: [
      { field: 'player', payload: 'player', dynamic: 'roster', options: [] },
      {
        field: 'result',
        payload: 'result',
        options: [
          { label: 'En touch', value: 'touch' },
          { label: 'Recuperado', value: 'recuperado' },
          { label: 'Perdido', value: 'perdido' },
          { label: 'Contestado', value: 'contestado' },
        ],
      },
    ],
  },
  M: {
    hotkey: 'M',
    type: 'maul',
    label: 'Maul',
    steps: [{ field: 'result', payload: 'result', options: RESULT_OPTIONS }],
  },
  V: {
    hotkey: 'V',
    type: 'turnover',
    label: 'Turnover',
    defaultResult: 'turnover',
    steps: [
      {
        field: 'subtype',
        payload: 'subtype',
        options: [
          { label: 'Knock-on', value: 'knock-on' },
          { label: 'Pase forward', value: 'pase-forward' },
          { label: 'Mal pase', value: 'mal-pase' },
          { label: 'Robo en ruck', value: 'robo-ruck' },
          { label: 'Intercepcion', value: 'intercepcion' },
          { label: 'Touch', value: 'touch' },
          { label: 'Otro', value: 'otro' },
        ],
      },
    ],
  },
  A: {
    hotkey: 'A',
    type: 'card',
    label: 'Tarjeta',
    steps: [
      {
        field: 'result',
        payload: 'result',
        options: [
          { label: 'Amarilla', value: 'amarilla' },
          { label: 'Roja', value: 'roja' },
        ],
      },
      { field: 'team', payload: 'team', options: TEAM_OPTIONS },
    ],
  },
  N: {
    hotkey: 'N',
    type: 'note',
    label: 'Nota libre',
    noteOnly: true,
    steps: [],
  },
};

export const SEQUENCE_RESULT_OPTIONS = [
  { label: 'Try', value: 'try' },
  { label: 'Penal', value: 'penal' },
  { label: 'Turnover', value: 'turnover' },
  { label: 'Despeje', value: 'despeje' },
  { label: 'Fuera', value: 'fuera' },
];

/**
 * @param {object} [options]
 * @returns {object}
 */
export function createTaggerState(options = {}) {
  return {
    activePopup: null,
    blockedHotkey: null,
    autoCloseMs: options.autoCloseMs ?? 8000,
    defaultTeam: options.defaultTeam || 'home',
    possession: normalizePossession(options.possession),
    sequence: {
      active: null,
      items: [],
    },
  };
}

/**
 * @param {object|Array<object>|null|undefined} possession
 * @returns {{activeTeam: string|null, activeStart: number|null, activeEnd: number|null, intervals: Array<object>}}
 */
function normalizePossession(possession) {
  if (Array.isArray(possession)) {
    return {
      activeTeam: null,
      activeStart: null,
      activeEnd: null,
      intervals: possession,
    };
  }

  if (!possession || typeof possession !== 'object') {
    return {
      activeTeam: null,
      activeStart: null,
      activeEnd: null,
      intervals: [],
    };
  }

  const activeTeam = possession.activeTeam === 'home' || possession.activeTeam === 'away'
    ? possession.activeTeam
    : null;
  const activeStart = Number.isFinite(possession.activeStart) ? possession.activeStart : null;
  const activeEnd = Number.isFinite(possession.activeEnd) ? Math.max(possession.activeEnd, activeStart ?? 0) : activeStart;
  const hasActivePossession = activeTeam && Number.isFinite(activeStart);

  return {
    activeTeam: hasActivePossession ? activeTeam : null,
    activeStart: hasActivePossession ? activeStart : null,
    activeEnd: hasActivePossession ? activeEnd : null,
    intervals: Array.isArray(possession.intervals) ? possession.intervals : [],
  };
}

/**
 * @param {object} segment
 * @param {number} [maxEnd]
 * @returns {{team: string, start: number, end: number}|null}
 */
function normalizePossessionSegment(segment, maxEnd = Number.POSITIVE_INFINITY) {
  const team = segment?.team === 'home' || segment?.team === 'away' ? segment.team : null;
  const start = Number(segment?.start);
  const end = Math.min(Number(segment?.end), maxEnd);
  if (!team || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { team, start, end };
}

/**
 * @param {Array<{team: string, start: number, end: number}>} segments
 * @returns {Array<{team: string, start: number, end: number}>}
 */
function mergeAdjacentPossessionSegments(segments) {
  return [...segments]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .reduce((merged, segment) => {
      const previous = merged.at(-1);
      if (previous && previous.team === segment.team && previous.end >= segment.start) {
        previous.end = Math.max(previous.end, segment.end);
        return merged;
      }
      merged.push({ ...segment });
      return merged;
    }, []);
}

/**
 * @param {Array<{team: string, start: number, end: number}>} segments
 * @param {{team: string, start: number, end: number}} nextSegment
 * @returns {Array<{team: string, start: number, end: number}>}
 */
function overlayPossessionSegment(segments, nextSegment) {
  const trimmed = [];
  segments.forEach((segment) => {
    if (segment.end <= nextSegment.start || segment.start >= nextSegment.end) {
      trimmed.push(segment);
      return;
    }
    if (segment.start < nextSegment.start) {
      trimmed.push({ ...segment, end: nextSegment.start });
    }
    if (segment.end > nextSegment.end) {
      trimmed.push({ ...segment, start: nextSegment.end });
    }
  });
  return mergeAdjacentPossessionSegments([...trimmed, nextSegment]);
}

/**
 * @param {Array<object>} segments
 * @param {number} [maxEnd]
 * @returns {Array<{team: string, start: number, end: number}>}
 */
function resolvePossessionSegments(segments, maxEnd = Number.POSITIVE_INFINITY) {
  return segments.reduce((resolved, segment) => {
    const normalized = normalizePossessionSegment(segment, maxEnd);
    return normalized ? overlayPossessionSegment(resolved, normalized) : resolved;
  }, []);
}

/**
 * @param {string} key
 * @returns {string}
 */
export function normalizeHotkey(key) {
  return String(key || '').trim().toUpperCase();
}

/**
 * @param {object} state
 * @param {string} key
 * @param {number|null} timestamp
 * @returns {object}
 */
export function openTagPopup(state, key, timestamp) {
  const hotkey = normalizeHotkey(key);
  const definition = EVENT_DEFINITIONS[hotkey];
  if (!definition) return state;
  if (state.activePopup) {
    return { ...state, blockedHotkey: hotkey };
  }

  const now = Date.now();
  return {
    ...state,
    blockedHotkey: null,
    activePopup: {
      hotkey,
      type: definition.type,
      label: definition.label,
      timestamp: Number.isFinite(timestamp) ? timestamp : null,
      stepIndex: 0,
      values: {},
      note: '',
      zone: null,
      openedAt: now,
      lastInteractionAt: now,
    },
  };
}

/**
 * @param {object} state
 * @returns {object}
 */
export function closePopup(state) {
  return {
    ...state,
    activePopup: null,
    discardedPopup: state.activePopup,
  };
}

/**
 * @param {object} state
 * @param {string} note
 * @returns {object}
 */
export function updatePopupNote(state, note) {
  if (!state.activePopup) return state;
  return {
    ...state,
    activePopup: {
      ...state.activePopup,
      note,
      lastInteractionAt: Date.now(),
    },
  };
}

/**
 * @param {object} state
 * @param {string|null} zone
 * @returns {object}
 */
export function selectPopupZone(state, zone) {
  if (!state.activePopup) return state;
  return {
    ...state,
    activePopup: {
      ...state.activePopup,
      zone,
      lastInteractionAt: Date.now(),
    },
  };
}

/**
 * @param {object} popupOrEvent
 * @returns {object}
 */
export function buildEventPayload(popupOrEvent) {
  if (!popupOrEvent) return null;
  if (!popupOrEvent.hotkey) {
    return {
      timestamp: popupOrEvent.timestamp ?? null,
      type: popupOrEvent.type || '',
      team: popupOrEvent.team ?? 'home',
      result: popupOrEvent.result || '',
      subtype: popupOrEvent.subtype || '',
      note: popupOrEvent.note || '',
      zone: popupOrEvent.zone ?? null,
      ...(popupOrEvent.player ? { player: popupOrEvent.player } : {}),
    };
  }

  const definition = EVENT_DEFINITIONS[popupOrEvent.hotkey];
  const event = {
    timestamp: popupOrEvent.timestamp ?? null,
    type: definition.type,
    team: popupOrEvent.values.team || 'home',
    result: definition.defaultResult || '',
    subtype: '',
    note: popupOrEvent.note || '',
    zone: popupOrEvent.zone ?? null,
  };

  definition.steps.forEach((step) => {
    const value = popupOrEvent.values[step.field];
    if (!value) return;
    event[step.payload] = value;
  });

  return event;
}

/**
 * @param {object} state
 * @param {string} value
 * @returns {{state: object, completed: boolean, event: object|null}}
 */
export function selectPopupOption(state, value) {
  if (!state.activePopup) {
    return { state, completed: false, event: null };
  }

  const definition = EVENT_DEFINITIONS[state.activePopup.hotkey];
  const step = definition.steps[state.activePopup.stepIndex];
  if (!step) {
    return completePopup(state);
  }

  const activePopup = {
    ...state.activePopup,
    values: {
      ...state.activePopup.values,
      [step.field]: value,
    },
    lastInteractionAt: Date.now(),
  };

  if (activePopup.stepIndex < definition.steps.length - 1) {
    return {
      state: {
        ...state,
        activePopup: {
          ...activePopup,
          stepIndex: activePopup.stepIndex + 1,
        },
      },
      completed: false,
      event: null,
    };
  }

  const event = buildEventPayload(activePopup);
  return {
    state: {
      ...state,
      activePopup: null,
      completedPopup: activePopup,
    },
    completed: true,
    event,
  };
}

/**
 * @param {object} state
 * @returns {{state: object, completed: boolean, event: object|null}}
 */
export function completePopup(state) {
  if (!state.activePopup) {
    return { state, completed: false, event: null };
  }

  const definition = EVENT_DEFINITIONS[state.activePopup.hotkey];
  if (!definition.noteOnly && state.activePopup.stepIndex < definition.steps.length) {
    return { state, completed: false, event: null };
  }

  const event = buildEventPayload(state.activePopup);
  return {
    state: {
      ...state,
      activePopup: null,
      completedPopup: state.activePopup,
    },
    completed: true,
    event,
  };
}

/**
 * @param {object} state
 * @param {number} now
 * @returns {boolean}
 */
export function shouldAutoClosePopup(state, now = Date.now()) {
  return Boolean(
    state.activePopup &&
    Number.isFinite(state.autoCloseMs) &&
    now - state.activePopup.lastInteractionAt >= state.autoCloseMs
  );
}

/**
 * @param {object} state
 * @param {'home'|'away'} team
 * @param {number} timestamp
 * @returns {object}
 */
export function togglePossession(state, team, timestamp) {
  const possession = normalizePossession(state.possession);
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : possession.activeEnd ?? possession.activeStart ?? 0;
  let intervals = resolvePossessionSegments(possession.intervals || []);

  if (possession.activeTeam && Number.isFinite(possession.activeStart)) {
    const closedSegment = normalizePossessionSegment({
      team: possession.activeTeam,
      start: possession.activeStart,
      end: Math.max(possession.activeStart, safeTimestamp),
    });
    if (closedSegment) {
      intervals = overlayPossessionSegment(intervals, closedSegment);
    }
  }

  const isClosingCurrent = possession.activeTeam === team;
  return {
    ...state,
    possession: {
      activeTeam: isClosingCurrent ? null : team,
      activeStart: isClosingCurrent ? null : safeTimestamp,
      activeEnd: isClosingCurrent ? null : safeTimestamp,
      intervals,
    },
  };
}

/**
 * @param {object} state
 * @param {number} timestamp
 * @param {number} [maxGapSeconds]
 * @returns {object}
 */
export function advancePossession(state, timestamp, maxGapSeconds = 2) {
  const possession = normalizePossession(state.possession);
  if (!possession.activeTeam || !Number.isFinite(possession.activeStart) || !Number.isFinite(timestamp)) return state;

  const activeEnd = Number.isFinite(possession.activeEnd) ? possession.activeEnd : possession.activeStart;
  if (timestamp <= activeEnd) return state;

  if (timestamp - activeEnd > maxGapSeconds) {
    const intervals = activeEnd > possession.activeStart
      ? overlayPossessionSegment(resolvePossessionSegments(possession.intervals), {
        team: possession.activeTeam,
        start: possession.activeStart,
        end: activeEnd,
      })
      : resolvePossessionSegments(possession.intervals);
    return {
      ...state,
      possession: {
        activeTeam: null,
        activeStart: null,
        activeEnd: null,
        intervals,
      },
    };
  }

  return {
    ...state,
    possession: {
      ...possession,
      activeEnd: timestamp,
    },
  };
}

/**
 * @param {object} state
 * @returns {object}
 */
export function resetPossession(state) {
  return {
    ...state,
    possession: {
      activeTeam: null,
      activeStart: null,
      activeEnd: null,
      intervals: [],
    },
  };
}

/**
 * @param {object} possession
 * @param {number} currentTime
 * @returns {Array<{team: string, start: number, end: number}>}
 */
export function getPossessionTimelineSegments(possession, currentTime = Number.POSITIVE_INFINITY) {
  const normalized = normalizePossession(possession);
  const maxEnd = Number.isFinite(currentTime) ? currentTime : Number.POSITIVE_INFINITY;
  const segments = [...normalized.intervals];

  if (normalized.activeTeam && Number.isFinite(normalized.activeStart) && Number.isFinite(normalized.activeEnd)) {
    segments.push({
      team: normalized.activeTeam,
      start: normalized.activeStart,
      end: normalized.activeEnd,
    });
  }

  return resolvePossessionSegments(segments, maxEnd);
}

/**
 * @param {object} possession
 * @param {number} currentTime
 * @returns {{home: number, away: number}}
 */
export function calculatePossessionPercentages(possession, currentTime = 0) {
  const totals = { home: 0, away: 0 };
  getPossessionTimelineSegments(possession, currentTime).forEach((interval) => {
    totals[interval.team] += Math.max(0, interval.end - interval.start);
  });

  const total = totals.home + totals.away;
  if (total <= 0) return { home: 0, away: 0 };
  return {
    home: Math.round((totals.home / total) * 100),
    away: Math.round((totals.away / total) * 100),
  };
}

/**
 * @param {object} state
 * @param {number} timestamp
 * @returns {object}
 */
export function startSequence(state, timestamp) {
  return {
    ...state,
    sequence: {
      ...state.sequence,
      active: {
        start: timestamp,
        phases: 0,
        zone: null,
      },
    },
  };
}

/**
 * @param {object} state
 * @param {number} timestamp
 * @param {string} result
 * @returns {{state: object, sequence: object|null}}
 */
export function finishSequence(state, timestamp, result) {
  if (!state.sequence?.active) {
    return { state, sequence: null };
  }

  const sequence = {
    ...state.sequence.active,
    end: timestamp,
    duration: Number((timestamp - state.sequence.active.start).toFixed(2)),
    result,
    createdAt: new Date().toISOString(),
  };

  return {
    state: {
      ...state,
      sequence: {
        active: null,
        items: [...(state.sequence.items || []), sequence],
      },
    },
    sequence,
  };
}

/**
 * Adds derived phase and zone data to a sequence from tagged events.
 * @param {object} sequence
 * @param {Array<object>} events
 * @returns {object}
 */
export function enrichSequenceFromEvents(sequence, events = []) {
  const eventsInWindow = events
    .filter(event => Number.isFinite(event.timestamp))
    .filter(event => event.timestamp >= sequence.start && event.timestamp <= sequence.end)
    .sort((a, b) => a.timestamp - b.timestamp);
  const zonedEvents = eventsInWindow.filter(event => event.zone);

  return {
    ...sequence,
    phases: eventsInWindow.filter(event => event.type === 'ruck').length,
    zoneStart: zonedEvents[0]?.zone || sequence.zoneStart || null,
    zoneEnd: zonedEvents[zonedEvents.length - 1]?.zone || sequence.zoneEnd || null,
  };
}
