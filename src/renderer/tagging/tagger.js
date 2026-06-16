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
const TEAM_STEP = { field: 'team', payload: 'team', options: TEAM_OPTIONS };

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
    requiresTeam: true,
    steps: [{ field: 'result', payload: 'result', options: RESULT_OPTIONS }, TEAM_STEP],
  },
  S: {
    hotkey: 'S',
    type: 'scrum',
    label: 'Scrum',
    requiresTeam: true,
    steps: [
      { field: 'result', payload: 'result', options: RESULT_OPTIONS },
      TEAM_STEP,
    ],
  },
  L: {
    hotkey: 'L',
    type: 'lineout',
    label: 'Line Out',
    requiresTeam: true,
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
      TEAM_STEP,
    ],
  },
  P: {
    hotkey: 'P',
    type: 'penal',
    label: 'Penal / Free Kick',
    requiresTeam: true,
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
      TEAM_STEP,
    ],
  },
  T: {
    hotkey: 'T',
    type: 'points',
    label: 'Try y puntos',
    requiresTeam: true,
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
      TEAM_STEP,
    ],
  },
  B: {
    hotkey: 'B',
    type: 'break-line',
    label: 'Break Line',
    requiresTeam: true,
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
      TEAM_STEP,
    ],
  },
  K: {
    hotkey: 'K',
    type: 'kick',
    label: 'Kick',
    requiresTeam: true,
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
      TEAM_STEP,
    ],
  },
  M: {
    hotkey: 'M',
    type: 'maul',
    label: 'Maul',
    requiresTeam: true,
    steps: [{ field: 'result', payload: 'result', options: RESULT_OPTIONS }, TEAM_STEP],
  },
  V: {
    hotkey: 'V',
    type: 'turnover',
    label: 'Turnover',
    defaultResult: 'turnover',
    requiresTeam: true,
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
      TEAM_STEP,
    ],
  },
  A: {
    hotkey: 'A',
    type: 'card',
    label: 'Tarjeta',
    requiresTeam: true,
    steps: [
      {
        field: 'result',
        payload: 'result',
        options: [
          { label: 'Amarilla', value: 'amarilla' },
          { label: 'Roja', value: 'roja' },
        ],
      },
      TEAM_STEP,
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

const EVENT_DEFINITION_ORDER = Object.values(EVENT_DEFINITIONS);
const DEFAULT_HOTKEYS_BY_TYPE = Object.fromEntries(
  EVENT_DEFINITION_ORDER.map(definition => [definition.type, definition.hotkey])
);

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
    defaultTeam: normalizeTeam(options.defaultTeam),
    eventDefinitions: options.eventDefinitions || EVENT_DEFINITIONS,
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
 * @param {string} value
 * @returns {string}
 */
function normalizeCustomId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function isUsableEventHotkey(key) {
  return /^[A-Z0-9]$/.test(key);
}

/**
 * @param {Array<string>|string|null|undefined} options
 * @returns {Array<{label: string, value: string}>}
 */
function normalizeCustomResultOptions(options) {
  const values = Array.isArray(options)
    ? options
    : String(options || '').split(',');
  return values
    .map(option => String(option || '').trim())
    .filter(Boolean)
    .map(option => ({ label: option, value: normalizeCustomId(option) || option.toLowerCase() }));
}

/**
 * @param {object} [taggingSettings]
 * @returns {Record<string, object>}
 */
export function buildEventDefinitions(taggingSettings = {}) {
  const definitions = {};
  const usedHotkeys = new Set();
  const hotkeys = {
    ...DEFAULT_HOTKEYS_BY_TYPE,
    ...(taggingSettings?.hotkeys || {}),
  };
  const requestedHotkeys = Object.fromEntries(EVENT_DEFINITION_ORDER.map((definition) => {
    const requestedHotkey = normalizeHotkey(hotkeys[definition.type]);
    return [
      definition.type,
      isUsableEventHotkey(requestedHotkey) ? requestedHotkey : normalizeHotkey(definition.hotkey),
    ];
  }));
  const requestCounts = Object.values(requestedHotkeys)
    .reduce((counts, hotkey) => ({ ...counts, [hotkey]: (counts[hotkey] || 0) + 1 }), {});

  EVENT_DEFINITION_ORDER.forEach((definition) => {
    const fallbackHotkey = normalizeHotkey(definition.hotkey);
    const requestedHotkey = requestedHotkeys[definition.type];
    const resolvedHotkey = requestCounts[requestedHotkey] === 1 ? requestedHotkey : fallbackHotkey;
    if (usedHotkeys.has(resolvedHotkey)) return;
    usedHotkeys.add(resolvedHotkey);
    definitions[resolvedHotkey] = {
      ...definition,
      hotkey: resolvedHotkey,
      defaultHotkey: fallbackHotkey,
      custom: false,
    };
  });

  (Array.isArray(taggingSettings?.customHotkeys) ? taggingSettings.customHotkeys : []).forEach((customHotkey) => {
    const hotkey = normalizeHotkey(customHotkey?.hotkey);
    const label = String(customHotkey?.label || '').trim();
    const id = normalizeCustomId(customHotkey?.id || label);
    if (!id || !label || !isUsableEventHotkey(hotkey) || usedHotkeys.has(hotkey)) return;
    const resultOptions = normalizeCustomResultOptions(customHotkey?.resultOptions);
    usedHotkeys.add(hotkey);
    definitions[hotkey] = {
      hotkey,
      defaultHotkey: hotkey,
      type: `custom:${id}`,
      label,
      custom: true,
      noteOnly: resultOptions.length === 0,
      defaultResult: resultOptions.length === 0 ? 'registrado' : '',
      steps: resultOptions.length > 0
        ? [{ field: 'result', payload: 'result', options: resultOptions }]
        : [],
    };
  });

  return definitions;
}

/**
 * @param {object} state
 * @returns {Record<string, object>}
 */
function getStateEventDefinitions(state) {
  return state?.eventDefinitions || EVENT_DEFINITIONS;
}

/**
 * @param {unknown} value
 * @returns {'home'|'away'|null}
 */
function normalizeTeam(value) {
  return value === 'home' || value === 'away' ? value : null;
}

/**
 * @param {object} state
 * @param {object} definition
 * @returns {'home'|'away'|null}
 */
function inferEventTeam(state, definition) {
  if (!definition?.requiresTeam) return null;
  return normalizeTeam(state?.possession?.activeTeam);
}

/**
 * @param {object} step
 * @param {object} values
 * @returns {boolean}
 */
function shouldSkipPopupStep(step, values) {
  return step?.field === 'team' && Boolean(normalizeTeam(values?.team));
}

/**
 * @param {object} definition
 * @param {object} popup
 * @param {number} nextStepIndex
 * @returns {number}
 */
function getNextPopupStepIndex(definition, popup, nextStepIndex) {
  let index = nextStepIndex;
  while (index < definition.steps.length && shouldSkipPopupStep(definition.steps[index], popup.values)) {
    index += 1;
  }
  return index;
}

/**
 * @param {object} state
 * @param {string} key
 * @param {number|null} timestamp
 * @returns {object}
 */
export function openTagPopup(state, key, timestamp) {
  const hotkey = normalizeHotkey(key);
  const definition = getStateEventDefinitions(state)[hotkey];
  if (!definition) return state;
  if (state.activePopup) {
    return { ...state, blockedHotkey: hotkey };
  }

  const now = Date.now();
  const inferredTeam = inferEventTeam(state, definition);
  return {
    ...state,
    blockedHotkey: null,
    activePopup: {
      hotkey,
      type: definition.type,
      label: definition.label,
      timestamp: Number.isFinite(timestamp) ? timestamp : null,
      stepIndex: 0,
      values: inferredTeam ? { team: inferredTeam } : {},
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

const SPEECH_ACCENT_TERMS = [
  ['presion', 'presi\u00f3n'],
  ['posesion', 'posesi\u00f3n'],
  ['recepcion', 'recepci\u00f3n'],
  ['conversion', 'conversi\u00f3n'],
  ['intercepcion', 'intercepci\u00f3n'],
  ['recuperacion', 'recuperaci\u00f3n'],
  ['linea', 'l\u00ednea'],
  ['veintidos', 'veintid\u00f3s'],
  ['despues', 'despu\u00e9s'],
  ['rapido', 'r\u00e1pido'],
  ['rapida', 'r\u00e1pida'],
  ['tactico', 't\u00e1ctico'],
  ['tactica', 't\u00e1ctica'],
  ['analisis', 'an\u00e1lisis'],
];

/**
 * @param {string} value
 * @param {string} replacement
 * @returns {string}
 */
function preserveSpeechTermCase(value, replacement) {
  return /^[A-Z]/.test(value) ? `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}` : replacement;
}

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function sanitizeNoteText(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
function normalizeSpeechText(value) {
  return SPEECH_ACCENT_TERMS.reduce((text, [source, replacement]) => {
    const pattern = new RegExp(`\\b${source}\\b`, 'gi');
    return text.replace(pattern, match => preserveSpeechTermCase(match, replacement));
  }, sanitizeNoteText(value));
}

/**
 * @param {string|null|undefined} baseNote
 * @param {string|null|undefined} finalTranscript
 * @param {string|null|undefined} interimTranscript
 * @returns {string}
 */
export function buildSpeechNoteValue(baseNote, finalTranscript, interimTranscript = '') {
  const base = normalizeSpeechText(baseNote);
  const finalText = normalizeSpeechText(finalTranscript);
  const interimText = normalizeSpeechText(interimTranscript);
  const segments = [];

  if (base) segments.push(base);
  if (finalText && !(base && base.toLowerCase().endsWith(finalText.toLowerCase()))) {
    segments.push(finalText);
  }
  if (interimText && !segments.join(' ').toLowerCase().endsWith(interimText.toLowerCase())) {
    segments.push(interimText);
  }

  return segments.join(' ').trim();
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
      team: normalizeTeam(popupOrEvent.team),
      result: popupOrEvent.result || '',
      subtype: popupOrEvent.subtype || '',
      note: sanitizeNoteText(popupOrEvent.note),
      zone: popupOrEvent.zone ?? null,
      ...(popupOrEvent.player ? { player: popupOrEvent.player } : {}),
    };
  }

  const definition = popupOrEvent.definition || EVENT_DEFINITIONS[popupOrEvent.hotkey];
  const event = {
    timestamp: popupOrEvent.timestamp ?? null,
    type: definition.type,
    team: normalizeTeam(popupOrEvent.values.team),
    result: definition.defaultResult || '',
    subtype: '',
    note: sanitizeNoteText(popupOrEvent.note),
    zone: popupOrEvent.zone ?? null,
  };

  definition.steps.forEach((step) => {
    const value = popupOrEvent.values[step.field];
    if (!value) return;
    event[step.payload] = step.payload === 'team' ? normalizeTeam(value) : value;
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

  const definition = getStateEventDefinitions(state)[state.activePopup.hotkey];
  if (!definition) return { state: closePopup(state), completed: false, event: null };
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

  const nextStepIndex = getNextPopupStepIndex(definition, activePopup, activePopup.stepIndex + 1);
  if (nextStepIndex < definition.steps.length) {
    return {
      state: {
        ...state,
        activePopup: {
          ...activePopup,
          stepIndex: nextStepIndex,
        },
      },
      completed: false,
      event: null,
    };
  }

  const event = buildEventPayload({ ...activePopup, definition });
  if (definition.requiresTeam && !normalizeTeam(event.team)) {
    return {
      state: { ...state, activePopup },
      completed: false,
      event: null,
    };
  }
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

  const definition = getStateEventDefinitions(state)[state.activePopup.hotkey];
  if (!definition) return { state: closePopup(state), completed: false, event: null };
  if (!definition.noteOnly && state.activePopup.stepIndex < definition.steps.length) {
    return { state, completed: false, event: null };
  }

  const event = buildEventPayload({ ...state.activePopup, definition });
  if (definition.requiresTeam && !normalizeTeam(event.team)) {
    return { state, completed: false, event: null };
  }
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
  void maxGapSeconds;

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
 * @param {number} timestamp
 * @returns {object}
 */
export function closeActivePossession(state, timestamp) {
  const possession = normalizePossession(state.possession);
  if (!possession.activeTeam || !Number.isFinite(possession.activeStart)) return {
    ...state,
    possession,
  };

  const fallbackEnd = Number.isFinite(possession.activeEnd) ? possession.activeEnd : possession.activeStart;
  const safeEnd = Number.isFinite(timestamp) ? Math.max(possession.activeStart, timestamp) : fallbackEnd;
  let intervals = resolvePossessionSegments(possession.intervals || []);
  const closedSegment = normalizePossessionSegment({
    team: possession.activeTeam,
    start: possession.activeStart,
    end: safeEnd,
  });
  if (closedSegment) intervals = overlayPossessionSegment(intervals, closedSegment);

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
 * @param {{zoneStart?: string|null}} [options]
 * @returns {object}
 */
export function startSequence(state, timestamp, options = {}) {
  const safeTimestamp = Number(timestamp);
  if (!Number.isFinite(safeTimestamp) || safeTimestamp < 0) return state;

  return {
    ...state,
    sequence: {
      ...state.sequence,
      active: {
        start: safeTimestamp,
        phases: 0,
        zone: options.zoneStart || null,
        zoneStart: options.zoneStart || null,
      },
    },
  };
}

/**
 * @param {object} state
 * @param {number} timestamp
 * @param {string} result
 * @param {{zoneStart?: string|null, zoneEnd?: string|null, requireZones?: boolean}} [options]
 * @returns {{state: object, sequence: object|null, error?: string}}
 */
export function finishSequence(state, timestamp, result, options = {}) {
  if (!state.sequence?.active) {
    return { state, sequence: null };
  }

  const start = Number(state.sequence.active.start);
  const end = Number(timestamp);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return {
      state,
      sequence: null,
      error: 'El fin de secuencia debe ser posterior al inicio.',
    };
  }

  const zoneStart = options.zoneStart || state.sequence.active.zoneStart || state.sequence.active.zone || null;
  const zoneEnd = options.zoneEnd || state.sequence.active.zoneEnd || null;
  if (options.requireZones && (!zoneStart || !zoneEnd)) {
    return {
      state,
      sequence: null,
      error: 'Selecciona zona de inicio y zona de fin para guardar la secuencia.',
    };
  }

  const sequence = {
    ...state.sequence.active,
    start,
    end,
    duration: Number((end - start).toFixed(2)),
    result,
    zoneStart,
    zoneEnd,
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
