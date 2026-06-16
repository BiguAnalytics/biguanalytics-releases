// @ts-check
import { getDrawingSequenceDuration } from '../drawing/drawing-sequence.js';

const TRACKS = [
  { id: 'set-piece', label: 'Formaciones', types: ['scrum', 'lineout', 'maul'] },
  { id: 'breakdown', label: 'Breakdown', types: ['ruck', 'turnover'] },
  { id: 'discipline', label: 'Disciplina', types: ['penal', 'card'] },
  { id: 'attack', label: 'Ataque', types: ['points', 'break-line', 'kick'] },
  { id: 'notes', label: 'Notas', types: ['note'] },
];

const MIN_TIMELINE_SECONDS = 60;
const TIMELINE_PIXELS_PER_MINUTE = 72;
export const SEQUENCE_COLOR_CHOICES = [
  { value: 'red', label: 'Rojo', color: 'rgba(200, 16, 46, 0.78)' },
  { value: 'blue', label: 'Azul', color: 'rgba(59, 130, 246, 0.78)' },
  { value: 'green', label: 'Verde', color: 'rgba(29, 185, 84, 0.78)' },
  { value: 'yellow', label: 'Amarillo', color: 'rgba(245, 158, 11, 0.78)' },
  { value: 'violet', label: 'Violeta', color: 'rgba(139, 92, 246, 0.78)' },
  { value: 'orange', label: 'Naranja', color: 'rgba(249, 115, 22, 0.78)' },
];

/**
 * @param {object} drawing
 * @returns {number}
 */
function getDrawingStepCount(drawing) {
  return Math.max(1, Array.isArray(drawing?.steps) ? drawing.steps.length : Number(drawing?.stepCount) || 1);
}

/**
 * @param {object} drawing
 * @returns {string}
 */
function getDrawingTitle(drawing) {
  const stepCount = getDrawingStepCount(drawing);
  return `Secuencia - ${stepCount} ${stepCount === 1 ? 'etapa' : 'etapas'} - ${formatClock(drawing.timestamp)} - ${getDrawingDurationSeconds(drawing)}s`;
}

/**
 * @param {object} drawing
 * @returns {number}
 */
function getDrawingDurationSeconds(drawing) {
  const sequenceDuration = getDrawingSequenceDuration(drawing || {});
  if (Number.isFinite(sequenceDuration) && sequenceDuration > 0) return Math.max(0.5, sequenceDuration);
  const durationSeconds = Number(drawing?.durationSeconds);
  return Number.isFinite(durationSeconds) ? Math.max(0.5, durationSeconds) : 3;
}

/**
 * @param {object} drawing
 * @returns {number}
 */
function getDrawingEndTimestamp(drawing) {
  return (Number(drawing?.timestamp) || 0) + getDrawingDurationSeconds(drawing);
}

/**
 * @param {string} value
 * @returns {string}
 */
export function getSequenceColor(value) {
  return SEQUENCE_COLOR_CHOICES.find(color => color.value === value)?.color || SEQUENCE_COLOR_CHOICES[0].color;
}

/**
 * @param {object} event
 * @returns {string}
 */
function getTrackId(event) {
  return TRACKS.find(track => track.types.includes(event.type))?.id || 'notes';
}

/**
 * @param {object} event
 * @returns {string}
 */
function getTone(event) {
  if (event.result === 'ganado') return 'won';
  if (event.result === 'perdido') return 'lost';
  if (event.result === 'ganado-sucio') return 'dirty';
  if (event.result === 'ataque') return 'attack';
  if (event.result === 'defensa') return 'defense';
  if (event.type === 'points') return 'won';
  if (event.type === 'penal' || event.type === 'card') return 'lost';
  return 'other';
}

/**
 * @param {string} value
 * @returns {string}
 */
function formatEventValue(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Sin resultado';
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatPercent(value) {
  return Number(value.toFixed(4)).toString();
}

/**
 * @param {number} currentTime
 * @param {number} duration
 * @returns {string}
 */
export function getTimelineSeekPercent(currentTime, duration = 0) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return '0%';
  return `${formatPercent(Math.max(0, Math.min(100, (currentTime / duration) * 100)))}%`;
}

/**
 * @param {object} segment
 * @param {number} duration
 * @returns {string}
 */
export function getTimelineSegmentWidth(segment, duration) {
  const start = Number(segment.start);
  const end = Number(segment.end);
  const safeDuration = Number(duration);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(safeDuration) || safeDuration <= 0) {
    return 'max(20px, 0%)';
  }

  return `max(20px, ${formatPercent((Math.max(0, end - start) / safeDuration) * 100)}%)`;
}

/**
 * @param {object} drawing
 * @param {number} duration
 * @returns {string}
 */
export function getTimelineDrawingWidth(drawing, duration) {
  const start = Number(drawing?.timestamp);
  const safeDuration = Number(duration);
  if (!Number.isFinite(start) || !Number.isFinite(safeDuration) || safeDuration <= 0) {
    return 'max(20px, 0%)';
  }

  const visibleDuration = Math.max(0, Math.min(getDrawingDurationSeconds(drawing), safeDuration - start));
  return `max(20px, ${formatPercent((visibleDuration / safeDuration) * 100)}%)`;
}

/**
 * @param {{left: number, width: number}} rect
 * @param {number} clientX
 * @param {number} duration
 * @returns {number}
 */
export function getTimelineRulerSeekTime(rect, clientX, duration) {
  if (!Number.isFinite(rect.width) || rect.width <= 0 || !Number.isFinite(duration) || duration <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return Math.round(ratio * duration * 100) / 100;
}

/**
 * @param {number|null} seconds
 * @returns {string}
 */
export function formatClock(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

/**
 * @param {number|null} duration
 * @param {Array<object>} events
 * @returns {{duration: number, durationKnown: boolean, tickCount: number, timelineWidth: number}}
 */
export function getTimelineScale(duration, events = []) {
  const durationKnown = Number.isFinite(duration) && duration > 0;
  const maxEventTimestamp = Math.max(
    MIN_TIMELINE_SECONDS,
    ...events
      .filter(event => Number.isFinite(event.timestamp))
      .map(event => event.timestamp)
  );
  const scaleDuration = durationKnown ? duration : maxEventTimestamp;

  return {
    duration: scaleDuration,
    durationKnown,
    tickCount: durationKnown ? Math.ceil(scaleDuration / 300) : 0,
    timelineWidth: Math.max(1200, Math.ceil(scaleDuration / 60) * TIMELINE_PIXELS_PER_MINUTE),
  };
}

/**
 * @param {{deltaX?: number, deltaY?: number, deltaMode?: number}} event
 * @returns {number}
 */
export function getTimelineWheelDelta(event) {
  const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1;
  const deltaX = (Number(event.deltaX) || 0) * multiplier;
  const deltaY = (Number(event.deltaY) || 0) * multiplier;
  return Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
}

const timelineHostState = new WeakMap();

/**
 * @param {Array<object>} events
 * @returns {Map<string, object>}
 */
function buildTimelineMap(events) {
  return new Map(events.map(event => [String(event.id || event.timestamp), event]));
}

/**
 * @param {Array<object>} sequences
 * @returns {Map<string, object>}
 */
function buildSequenceMap(sequences) {
  return new Map(sequences.map(sequence => [
    String(sequence.id || `${sequence.start}-${sequence.end}-${sequence.result || 'sequence'}`),
    sequence,
  ]));
}

/**
 * @param {Array<object>} drawings
 * @returns {Map<string, object>}
 */
function buildDrawingMap(drawings) {
  return new Map(drawings.map(drawing => [String(drawing.id), drawing]));
}

/**
 * @param {HTMLElement} host
 * @returns {object}
 */
function getTimelineHostState(host) {
  let state = timelineHostState.get(host);
  if (!state) {
    state = {
      renderSignature: '',
      options: {},
      duration: 0,
      durationKnown: false,
      eventsById: new Map(),
      drawingsById: new Map(),
      sequencesById: new Map(),
      untimedEvents: [],
      dragState: null,
      playbackFrame: 0,
      pendingPlaybackTime: 0,
      wired: false,
    };
    timelineHostState.set(host, state);
  }
  return state;
}

/**
 * @param {object} data
 * @returns {string}
 */
function getTimelineRenderSignature(data) {
  return JSON.stringify({
    duration: data.duration,
    durationKnown: data.durationKnown,
    tickCount: data.tickCount,
    timelineWidth: data.timelineWidth,
    hasTimelineEntries: data.hasTimelineEntries,
    events: data.events.map(event => [
      event.id || event.timestamp,
      event.timestamp,
      event.type,
      event.team,
      event.result,
      event.subtype,
      event.note,
      event.drawingId,
      getTrackId(event),
    ]),
    untimedEvents: data.untimedEvents.map((event, index) => [
      event.id || `untimed-${index}`,
      event.type,
      event.team,
      event.result,
      event.subtype,
      event.note,
    ]),
    sequences: data.sequences.map(sequence => [
      sequence.id || `${sequence.start}-${sequence.end}-${sequence.result || 'sequence'}`,
      sequence.start,
      sequence.end,
      sequence.result,
      sequence.name,
      sequence.duration,
      sequence.color,
    ]),
    drawings: data.drawings.map(drawing => [
      drawing.id,
      drawing.timestamp,
      getDrawingDurationSeconds(drawing),
      getDrawingStepCount(drawing),
    ]),
    newEventIds: data.newEventIds,
    newSequenceIds: data.newSequenceIds,
  });
}

/**
 * @param {object} options
 */
function getPreparedTimelineData(options) {
  const currentTime = Math.max(0, Number(options.currentTime) || 0);
  const events = (options.events || [])
    .filter(event => Number.isFinite(event.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  const untimedEvents = (options.events || [])
    .filter(event => !Number.isFinite(event.timestamp))
    .sort((a, b) => String(a.type || '').localeCompare(String(b.type || '')));
  const sequences = (options.sequences || [])
    .filter(sequence => Number.isFinite(sequence.start) && Number.isFinite(sequence.end))
    .sort((a, b) => a.start - b.start);
  const possessionSegments = (options.possessionSegments || [])
    .filter(segment => (
      (segment.team === 'home' || segment.team === 'away')
      && Number.isFinite(segment.start)
      && Number.isFinite(segment.end)
      && segment.end > segment.start
    ))
    .sort((a, b) => a.start - b.start);
  const drawings = (options.drawings || [])
    .filter(drawing => Number.isFinite(drawing.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  const scaleEvents = [
    ...events,
    ...sequences.map(sequence => ({ timestamp: sequence.end })),
    ...possessionSegments.map(segment => ({ timestamp: segment.end })),
    ...drawings.flatMap(drawing => [
      { timestamp: drawing.timestamp },
      { timestamp: getDrawingEndTimestamp(drawing) },
    ]),
  ];
  const hasTimelineEntries = events.length > 0 || sequences.length > 0 || drawings.length > 0 || untimedEvents.length > 0;
  const scale = getTimelineScale(options.duration, scaleEvents);
  const selectedEventId = String(options.selectedEventId || '');
  const selectedSequenceKey = String(options.selectedSequenceKey || '');
  const selectedDrawingId = String(options.selectedDrawingId || '');
  const newEventIds = (options.newEventIds || []).map(id => String(id));
  const newSequenceIds = (options.newSequenceIds || []).map(id => String(id));

  return {
    ...scale,
    currentTime,
    events,
    untimedEvents,
    sequences,
    possessionSegments,
    drawings,
    hasTimelineEntries,
    selectedEventId,
    selectedSequenceKey,
    selectedDrawingId,
    newEventIds,
    newSequenceIds,
    renderSignature: '',
  };
}

/**
 * @param {HTMLElement} host
 * @param {object} data
 * @param {object} options
 */
function updateTimelineState(host, data, options) {
  const state = getTimelineHostState(host);
  state.options = options || {};
  state.duration = data.duration;
  state.durationKnown = data.durationKnown;
  state.eventsById = buildTimelineMap(data.events);
  state.drawingsById = buildDrawingMap(data.drawings);
  state.sequencesById = buildSequenceMap(data.sequences);
  state.untimedEvents = data.untimedEvents;
  wireTimelineHost(host);
}

/**
 * @param {HTMLElement} host
 * @param {number} currentTime
 */
function applyTimelinePlayback(host, currentTime) {
  const content = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-content'));
  const playhead = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-playhead'));
  if (!content || !playhead) return;
  const duration = Number(content.dataset.timelineDuration);
  playhead.style.left = getTimelineSeekPercent(currentTime, duration);
}

/**
 * @param {HTMLElement} host
 * @param {number} currentTime
 */
export function updateTimelinePlayback(host, currentTime) {
  const state = getTimelineHostState(host);
  state.pendingPlaybackTime = currentTime;
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    applyTimelinePlayback(host, currentTime);
    return;
  }
  if (state.playbackFrame) return;
  state.playbackFrame = window.requestAnimationFrame(() => {
    state.playbackFrame = 0;
    applyTimelinePlayback(host, state.pendingPlaybackTime);
  });
}

/**
 * @param {Array<object>} possessionSegments
 * @param {number} duration
 * @returns {string}
 */
function renderTimelinePossessionSegments(possessionSegments, duration) {
  return possessionSegments.map(segment => {
    const left = Math.max(0, Math.min(100, (segment.start / duration) * 100));
    const width = Math.max(0, Math.min(100 - left, ((segment.end - segment.start) / duration) * 100));
    const teamLabel = segment.team === 'away' ? 'Rival' : 'Bigua';
    const title = `${teamLabel} - ${formatClock(segment.start)}-${formatClock(segment.end)}`;
    return `<span class="timeline-possession-segment ${segment.team}" style="left:${formatPercent(left)}%; width:max(2px, ${formatPercent(width)}%)" data-possession-team="${segment.team}" title="${escapeHtml(title)}"></span>`;
  }).join('');
}

/**
 * @param {HTMLElement} host
 * @param {Array<object>} possessionSegments
 * @param {number|null|undefined} duration
 */
export function updateTimelinePossession(host, possessionSegments = [], duration = null) {
  const content = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-content'));
  const track = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-possession-track'));
  if (!content || !track) return;
  const safeDuration = Number.isFinite(Number(duration)) && Number(duration) > 0
    ? Number(duration)
    : Number(content.dataset.timelineDuration);
  if (!Number.isFinite(safeDuration) || safeDuration <= 0) return;
  const segments = (possessionSegments || [])
    .filter(segment => (
      (segment.team === 'home' || segment.team === 'away')
      && Number.isFinite(segment.start)
      && Number.isFinite(segment.end)
      && segment.end > segment.start
    ))
    .sort((a, b) => a.start - b.start);
  track.innerHTML = renderTimelinePossessionSegments(segments, safeDuration);
}

/**
 * @param {HTMLElement} host
 * @param {object} data
 */
function updateTimelineSelection(host, data) {
  host.querySelectorAll('[data-event-id]').forEach((block) => {
    block.classList.toggle('selected', Boolean(data.selectedEventId) && block.dataset.eventId === data.selectedEventId);
  });
  host.querySelectorAll('[data-drawing-id]').forEach((block) => {
    block.classList.toggle('selected', Boolean(data.selectedDrawingId) && block.dataset.drawingId === data.selectedDrawingId);
  });
  host.querySelectorAll('[data-sequence-id]').forEach((block) => {
    block.classList.toggle('selected', Boolean(data.selectedSequenceKey) && block.dataset.sequenceId === data.selectedSequenceKey);
  });
}

/**
 * @param {HTMLElement} host
 * @param {object} options
 */
export function renderTimeline(host, options) {
  const preservedScrollLeft = host.querySelector('.timeline-scroll')?.scrollLeft || 0;
  const data = getPreparedTimelineData(options);
  data.renderSignature = getTimelineRenderSignature(data);
  updateTimelineState(host, data, options);
  const state = getTimelineHostState(host);
  const content = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-content'));
  if (content && state.renderSignature === data.renderSignature) {
    updateTimelinePlayback(host, data.currentTime);
    updateTimelinePossession(host, data.possessionSegments, data.duration);
    updateTimelineSelection(host, data);
    return;
  }

  const {
    currentTime,
    events,
    untimedEvents,
    sequences,
    possessionSegments,
    drawings,
    hasTimelineEntries,
    duration,
    durationKnown,
    tickCount,
    timelineWidth,
    selectedEventId,
    selectedSequenceKey,
    selectedDrawingId,
  } = data;
  const newEventIds = new Set(data.newEventIds);
  const newSequenceIds = new Set(data.newSequenceIds);

  host.innerHTML = `
    <section class="tagging-timeline" aria-label="Timeline de eventos">
      <div class="timeline-track-labels" aria-hidden="true">
        <div class="timeline-label-ruler"></div>
        <span class="timeline-track-label timeline-possession-label">Posesion</span>
        ${TRACKS.map(track => `<span class="timeline-track-label" data-track-label="${track.id}">${track.label}</span>`).join('')}
      </div>
      <div class="timeline-scroll">
        <div class="timeline-content" style="width:${timelineWidth}px" data-timeline-duration="${duration}">
          <div class="timeline-ruler">
            ${durationKnown ? Array.from({ length: tickCount + 1 }, (_, index) => {
              const seconds = index * 300;
              const left = Math.min(100, (seconds / duration) * 100);
              const tickClass = index === 0 ? 'timeline-tick zero-tick' : 'timeline-tick';
              return `<span class="${tickClass}" style="left:${left}%">${Math.floor(seconds / 60)}'</span>`;
            }).join('') : '<span class="timeline-duration-pending">Cargá un video para ver la escala real</span>'}
          </div>
          ${hasTimelineEntries ? '' : `
            <div class="timeline-empty-state">
              <strong>Todavia no hay eventos taggeados</strong>
              <span>Usa las hotkeys de Tagging para cargar el primer evento.</span>
            </div>
          `}
          <div class="timeline-preview" id="timeline-preview">Selecciona un evento</div>
          <div class="timeline-playhead" style="left:${getTimelineSeekPercent(currentTime, duration)}"></div>
          <div class="timeline-possession-track" aria-label="Posesion en timeline">
            ${possessionSegments.map(segment => {
              const left = Math.max(0, Math.min(100, (segment.start / duration) * 100));
              const width = Math.max(0, Math.min(100 - left, ((segment.end - segment.start) / duration) * 100));
              const teamLabel = segment.team === 'away' ? 'Rival' : 'Bigua';
              const title = `${teamLabel} · ${formatClock(segment.start)}-${formatClock(segment.end)}`;
              return `<span class="timeline-possession-segment ${segment.team}" style="left:${formatPercent(left)}%; width:max(2px, ${formatPercent(width)}%)" data-possession-team="${segment.team}" title="${escapeHtml(title)}"></span>`;
            }).join('')}
          </div>
          ${TRACKS.map(track => `
            <div class="timeline-track" data-track="${track.id}">
              ${track.id === 'notes' ? sequences.map(sequence => {
                const left = Math.min(100, (sequence.start / duration) * 100);
                const sequenceId = sequence.id || `${sequence.start}-${sequence.end}-${sequence.result || 'sequence'}`;
                const sequenceName = sequence.name?.trim() || formatEventValue(sequence.result);
                const sequenceColor = getSequenceColor(sequence.color);
                const safeSequenceId = escapeHtml(sequenceId);
                const safeSequenceColor = escapeHtml(sequence.color || 'red');
                const sequenceClass = [
                  'timeline-sequence-block',
                  sequenceId === selectedSequenceKey ? 'selected' : '',
                  newSequenceIds.has(String(sequenceId)) ? 'is-new' : '',
                ].filter(Boolean).join(' ');
                const title = `${sequenceName} · ${formatEventValue(sequence.result)} · ${formatClock(sequence.start)}-${formatClock(sequence.end)} · ${formatClock(sequence.duration)}`;
                return `
                  <button
                    class="${sequenceClass}"
                    type="button"
                    style="left:${left}%; width:${getTimelineSegmentWidth(sequence, duration)}; --sequence-color:${sequenceColor}"
                    data-sequence-id="${safeSequenceId}"
                    data-sequence-start="${sequence.start}"
                    data-sequence-end="${sequence.end}"
                    data-sequence-name="${escapeHtml(sequenceName)}"
                    data-sequence-result="${escapeHtml(formatEventValue(sequence.result))}"
                    data-sequence-color="${safeSequenceColor}"
                    title="${escapeHtml(title)}"
                    aria-label="${escapeHtml(title)}"
                  ></button>
                `;
              }).join('') : ''}
              ${track.id === 'notes' ? drawings.map(drawing => {
                const left = Math.min(100, (drawing.timestamp / duration) * 100);
                const drawingDuration = getDrawingDurationSeconds(drawing);
                const stepCount = getDrawingStepCount(drawing);
                const title = getDrawingTitle(drawing);
                return `
                  <button
                    class="timeline-drawing-block${String(drawing.id) === selectedDrawingId ? ' selected' : ''}"
                    type="button"
                    style="left:${left}%; width:${getTimelineDrawingWidth(drawing, duration)}"
                    data-drawing-id="${escapeHtml(drawing.id)}"
                    data-drawing-timestamp="${drawing.timestamp}"
                    data-drawing-duration="${drawingDuration}"
                    title="${escapeHtml(title)}"
                    aria-label="${escapeHtml(title)}"
                  >
                    <span class="timeline-drawing-icon" aria-hidden="true">S</span>
                    <span class="timeline-drawing-step-count" aria-hidden="true">${stepCount}</span>
                  </button>
                `;
              }).join('') : ''}
              ${events.filter(event => getTrackId(event) === track.id).map(event => {
                const left = Math.min(100, (event.timestamp / duration) * 100);
                const eventResult = formatEventValue(event.result || event.subtype);
                const hasNote = Boolean(String(event.note || '').trim());
                const hasDrawing = Boolean(event.drawingId);
                const eventId = event.id || event.timestamp;
                const blockClass = [
                  'timeline-block',
                  getTone(event),
                  String(eventId) === selectedEventId ? 'selected' : '',
                  hasNote ? 'has-note' : '',
                  hasDrawing ? 'has-drawing' : '',
                  newEventIds.has(String(eventId)) ? 'is-new' : '',
                ].filter(Boolean).join(' ');
                const title = `${event.type} · ${event.result || event.subtype || 'sin resultado'} · ${event.note || formatClock(event.timestamp)}`;
                return `
                  <button
                    class="${blockClass}"
                    type="button"
                    style="left:${left}%"
                    data-event-id="${escapeHtml(eventId)}"
                    data-event-timestamp="${event.timestamp}"
                    data-event-type="${escapeHtml(event.type)}"
                    data-event-result="${escapeHtml(eventResult)}"
                    data-event-note="${escapeHtml(event.note || '')}"
                    data-event-drawing-id="${escapeHtml(event.drawingId || '')}"
                    title="${escapeHtml(title)}"
                    aria-label="${escapeHtml(title)}"
                  >
                    ${hasNote ? '<span class="timeline-note-dot" aria-hidden="true"></span>' : ''}
                    ${hasDrawing ? '<span class="timeline-pencil-indicator" aria-hidden="true">D</span>' : ''}
                  </button>
                `;
              }).join('')}
            </div>
          `).join('')}
        </div>
      </div>
      ${untimedEvents.length > 0 ? `
        <aside class="timeline-untimed-events" aria-label="Eventos sin tiempo">
          <header>
            <strong>Eventos sin tiempo</strong>
            <span>${untimedEvents.length}</span>
          </header>
          <div>
            ${untimedEvents.map((event, index) => {
              const eventResult = formatEventValue(event.result || event.subtype);
              const eventId = event.id || `untimed-${index}`;
              const title = `${event.type} - ${event.result || event.subtype || 'sin resultado'}${event.note ? ` - ${event.note}` : ''}`;
              return `
                <button
                  class="timeline-untimed-event"
                  type="button"
                  data-untimed-event-id="${escapeHtml(eventId)}"
                  data-untimed-event-index="${index}"
                  data-event-type="${escapeHtml(event.type)}"
                  data-event-result="${escapeHtml(eventResult)}"
                  title="${escapeHtml(title)}"
                  aria-label="${escapeHtml(title)}"
                >
                  <span>${escapeHtml(event.type || 'evento')}</span>
                  <em>${escapeHtml(eventResult)}</em>
                </button>
              `;
            }).join('')}
          </div>
        </aside>
      ` : ''}
    </section>
  `;

  const scrollEl = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-scroll'));
  if (scrollEl) {
    scrollEl.scrollLeft = Math.min(preservedScrollLeft, Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth));
  }

  state.renderSignature = data.renderSignature;
  updateTimelineSelection(host, data);

}

/**
 * @param {EventTarget|null} target
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
function closestTimelineElement(target, selector) {
  return /** @type {HTMLElement|null} */ (target && typeof target.closest === 'function'
    ? target.closest(selector)
    : null);
}

/**
 * @param {HTMLElement} host
 * @param {string} id
 * @returns {object|undefined}
 */
function getTimelineEventById(host, id) {
  return getTimelineHostState(host).eventsById.get(String(id));
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} block
 */
function selectTimelineEventBlock(host, block) {
  const state = getTimelineHostState(host);
  state.options.onSeek?.(Number(block.dataset.eventTimestamp));
  state.options.onEventSelect?.(getTimelineEventById(host, block.dataset.eventId));
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} block
 */
function selectTimelineDrawingBlock(host, block) {
  const state = getTimelineHostState(host);
  state.options.onDrawingSelect?.(state.drawingsById.get(String(block.dataset.drawingId)));
  state.options.onSeek?.(Number(block.dataset.drawingTimestamp));
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} block
 */
function selectTimelineSequenceBlock(host, block) {
  const state = getTimelineHostState(host);
  state.options.onSequenceSelect?.(state.sequencesById.get(String(block.dataset.sequenceId)));
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} block
 */
function selectUntimedEventBlock(host, block) {
  const state = getTimelineHostState(host);
  const untimedEvent = state.untimedEvents[Number(block.dataset.untimedEventIndex)];
  if (state.options.onUntimedEventSelect) state.options.onUntimedEventSelect(untimedEvent);
  else state.options.onEventSelect?.(untimedEvent);
}

/**
 * @param {HTMLElement} host
 * @param {PointerEvent} event
 */
function handleTimelinePointerDown(host, event) {
  const state = getTimelineHostState(host);
  const ruler = closestTimelineElement(event.target, '.timeline-ruler');
  if (ruler) {
    if (!state.durationKnown) return;
    event.preventDefault();
    state.options.onSeek?.(getTimelineRulerSeekTime(ruler.getBoundingClientRect(), event.clientX, state.duration));
    return;
  }

  const eventBlock = closestTimelineElement(event.target, '[data-event-timestamp]');
  if (eventBlock) {
    event.preventDefault();
    const content = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-content'));
    state.dragState = {
      type: 'event',
      block: eventBlock,
      content,
      pointerId: event.pointerId,
      startX: event.clientX,
      nextTimestamp: Number(eventBlock.dataset.eventTimestamp),
      dragging: false,
      track: eventBlock.closest('.timeline-track'),
    };
    eventBlock.setPointerCapture?.(event.pointerId);
    return;
  }

  const drawingBlock = closestTimelineElement(event.target, '[data-drawing-timestamp]');
  if (drawingBlock) {
    event.preventDefault();
    const content = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-content'));
    state.dragState = {
      type: 'drawing',
      block: drawingBlock,
      content,
      pointerId: event.pointerId,
      startX: event.clientX,
      nextTimestamp: Number(drawingBlock.dataset.drawingTimestamp),
      dragging: false,
    };
    drawingBlock.setPointerCapture?.(event.pointerId);
    return;
  }

  const sequenceBlock = closestTimelineElement(event.target, '[data-sequence-start]');
  if (sequenceBlock) {
    event.preventDefault();
    selectTimelineSequenceBlock(host, sequenceBlock);
    return;
  }

  const untimedBlock = closestTimelineElement(event.target, '[data-untimed-event-id]');
  if (untimedBlock) {
    event.preventDefault();
    selectUntimedEventBlock(host, untimedBlock);
  }
}

/**
 * @param {HTMLElement} host
 * @param {PointerEvent} event
 */
function handleTimelinePointerMove(host, event) {
  const state = getTimelineHostState(host);
  const dragState = state.dragState;
  if (!dragState?.content || !state.durationKnown || dragState.pointerId !== event.pointerId) return;
  if (!dragState.dragging && Math.abs(event.clientX - dragState.startX) < 4) return;
  event.preventDefault();
  dragState.dragging = true;
  const nextTimestamp = getTimelineRulerSeekTime(dragState.content.getBoundingClientRect(), event.clientX, state.duration);
  dragState.nextTimestamp = nextTimestamp;
  dragState.block.classList.add('dragging');
  dragState.block.style.left = getTimelineSeekPercent(nextTimestamp, state.duration);
  if (dragState.type === 'drawing') {
    dragState.block.dataset.drawingTimestamp = String(nextTimestamp);
    updateDrawingPreview(host, dragState.block);
    return;
  }
  dragState.block.dataset.eventTimestamp = String(nextTimestamp);
  updateTimelinePreview(host, dragState.block);
}

/**
 * @param {HTMLElement} host
 * @param {PointerEvent} event
 */
function handleTimelinePointerUp(host, event) {
  const state = getTimelineHostState(host);
  const dragState = state.dragState;
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  event.preventDefault();
  state.dragState = null;
  dragState.block.releasePointerCapture?.(event.pointerId);
  dragState.block.classList.remove('dragging');
  if (dragState.dragging) {
    if (dragState.type === 'drawing') {
      state.options.onDrawingMove?.(state.drawingsById.get(String(dragState.block.dataset.drawingId)), dragState.nextTimestamp);
      return;
    }
    state.options.onEventMove?.(getTimelineEventById(host, dragState.block.dataset.eventId), dragState.nextTimestamp);
    return;
  }
  if (dragState.type === 'drawing') selectTimelineDrawingBlock(host, dragState.block);
  else selectTimelineEventBlock(host, dragState.block);
}

/**
 * @param {HTMLElement} host
 * @param {PointerEvent} event
 */
function handleTimelinePointerCancel(host, event) {
  const state = getTimelineHostState(host);
  const dragState = state.dragState;
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  state.dragState = null;
  dragState.block.releasePointerCapture?.(event.pointerId);
  dragState.block.classList.remove('dragging');
}

/**
 * @param {HTMLElement} host
 * @param {KeyboardEvent} event
 */
function handleTimelineKeydown(host, event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const eventBlock = closestTimelineElement(event.target, '[data-event-timestamp]');
  const drawingBlock = closestTimelineElement(event.target, '[data-drawing-timestamp]');
  const sequenceBlock = closestTimelineElement(event.target, '[data-sequence-start]');
  const untimedBlock = closestTimelineElement(event.target, '[data-untimed-event-id]');
  const block = eventBlock || drawingBlock || sequenceBlock || untimedBlock;
  if (!block) return;
  event.preventDefault();
  if (eventBlock) selectTimelineEventBlock(host, eventBlock);
  else if (drawingBlock) selectTimelineDrawingBlock(host, drawingBlock);
  else if (sequenceBlock) selectTimelineSequenceBlock(host, sequenceBlock);
  else if (untimedBlock) selectUntimedEventBlock(host, untimedBlock);
}

/**
 * @param {HTMLElement} host
 * @param {MouseEvent} event
 */
function handleTimelineContextMenu(host, event) {
  const state = getTimelineHostState(host);
  const eventBlock = closestTimelineElement(event.target, '[data-event-timestamp]');
  if (eventBlock) {
    event.preventDefault();
    state.options.onEventContextMenu?.(getTimelineEventById(host, eventBlock.dataset.eventId), {
      x: event.clientX,
      y: event.clientY,
      block: eventBlock,
    });
    return;
  }
  const untimedBlock = closestTimelineElement(event.target, '[data-untimed-event-id]');
  if (!untimedBlock) return;
  event.preventDefault();
  state.options.onUntimedEventContextMenu?.(state.untimedEvents[Number(untimedBlock.dataset.untimedEventIndex)], {
    x: event.clientX,
    y: event.clientY,
    block: untimedBlock,
  });
}

/**
 * @param {HTMLElement} host
 * @param {Event} event
 */
function handleTimelinePreviewEvent(host, event) {
  const eventBlock = closestTimelineElement(event.target, '[data-event-timestamp]');
  if (eventBlock) {
    updateTimelinePreview(host, eventBlock);
    return;
  }
  const drawingBlock = closestTimelineElement(event.target, '[data-drawing-timestamp]');
  if (drawingBlock) {
    updateDrawingPreview(host, drawingBlock);
    return;
  }
  const sequenceBlock = closestTimelineElement(event.target, '[data-sequence-start]');
  if (sequenceBlock) updateSequencePreview(host, sequenceBlock);
}

/**
 * @param {HTMLElement} host
 * @param {WheelEvent} event
 */
function handleTimelineWheelScroll(host, event) {
  const scrollEl = closestTimelineElement(event.target, '.timeline-scroll');
  if (!scrollEl) return;
  const delta = getTimelineWheelDelta(event);
  if (!delta) return;
  event.preventDefault();
  scrollEl.scrollLeft += delta;
}

/**
 * @param {HTMLElement} host
 */
function wireTimelineHost(host) {
  const state = getTimelineHostState(host);
  if (state.wired) return;
  state.wired = true;
  host.addEventListener('pointerdown', event => handleTimelinePointerDown(host, event));
  host.addEventListener('pointermove', event => handleTimelinePointerMove(host, event));
  host.addEventListener('pointerup', event => handleTimelinePointerUp(host, event));
  host.addEventListener('pointercancel', event => handleTimelinePointerCancel(host, event));
  host.addEventListener('keydown', event => handleTimelineKeydown(host, event));
  host.addEventListener('contextmenu', event => handleTimelineContextMenu(host, event));
  host.addEventListener('pointerover', event => handleTimelinePreviewEvent(host, event));
  host.addEventListener('focusin', event => handleTimelinePreviewEvent(host, event));
  host.addEventListener('wheel', event => handleTimelineWheelScroll(host, event), { passive: false });
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} block
 */
function updateTimelinePreview(host, block) {
  const preview = host.querySelector('#timeline-preview');
  if (!preview) return;
  preview.textContent = `${formatClock(Number(block.dataset.eventTimestamp))} · ${block.dataset.eventType} · ${block.dataset.eventResult}${block.dataset.eventNote ? ` · ${block.dataset.eventNote}` : ''}`;
  preview.classList.add('active');
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} block
 */
function updateSequencePreview(host, block) {
  const preview = host.querySelector('#timeline-preview');
  if (!preview) return;
  const start = Number(block.dataset.sequenceStart);
  const end = Number(block.dataset.sequenceEnd);
  preview.textContent = `${formatClock(start)}-${formatClock(end)} · ${block.dataset.sequenceName || 'Secuencia'} · ${block.dataset.sequenceResult}`;
  preview.classList.add('active');
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} block
 */
function updateDrawingPreview(host, block) {
  const preview = host.querySelector('#timeline-preview');
  if (!preview) return;
  preview.textContent = `Secuencia - ${formatClock(Number(block.dataset.drawingTimestamp))}`;
  preview.classList.add('active');
}
