// @ts-check

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
 * @returns {string}
 */
function getDrawingTitle(drawing) {
  return `Dibujo Â· ${formatClock(drawing.timestamp)} Â· ${Number(drawing.durationSeconds) || 3}s`;
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

/**
 * @param {HTMLElement} host
 * @param {number} currentTime
 */
export function updateTimelinePlayback(host, currentTime) {
  const content = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-content'));
  const playhead = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-playhead'));
  if (!content || !playhead) return;
  const duration = Number(content.dataset.timelineDuration);
  playhead.style.left = getTimelineSeekPercent(currentTime, duration);
}

/**
 * @param {HTMLElement} host
 * @param {object} options
 */
export function renderTimeline(host, options) {
  const preservedScrollLeft = host.querySelector('.timeline-scroll')?.scrollLeft || 0;
  const currentTime = Math.max(0, Number(options.currentTime) || 0);
  const events = (options.events || [])
    .filter(event => Number.isFinite(event.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
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
    ...drawings.map(drawing => ({ timestamp: drawing.timestamp })),
  ];
  const { duration, durationKnown, tickCount, timelineWidth } = getTimelineScale(options.duration, scaleEvents);
  const selectedSequenceKey = String(options.selectedSequenceKey || '');

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
                const sequenceClass = sequenceId === selectedSequenceKey ? 'timeline-sequence-block selected' : 'timeline-sequence-block';
                const title = `${sequenceName} · ${formatEventValue(sequence.result)} · ${formatClock(sequence.start)}-${formatClock(sequence.end)} · ${formatClock(sequence.duration)}`;
                return `
                  <button
                    class="${sequenceClass}"
                    type="button"
                    style="left:${left}%; width:${getTimelineSegmentWidth(sequence, duration)}; --sequence-color:${sequenceColor}"
                    data-sequence-id="${sequenceId}"
                    data-sequence-start="${sequence.start}"
                    data-sequence-end="${sequence.end}"
                    data-sequence-name="${escapeHtml(sequenceName)}"
                    data-sequence-result="${formatEventValue(sequence.result)}"
                    data-sequence-color="${sequence.color || 'red'}"
                    title="${escapeHtml(title)}"
                    aria-label="${escapeHtml(title)}"
                  ></button>
                `;
              }).join('') : ''}
              ${track.id === 'notes' ? drawings.map(drawing => {
                const left = Math.min(100, (drawing.timestamp / duration) * 100);
                const title = getDrawingTitle(drawing);
                return `
                  <button
                    class="timeline-drawing-block"
                    type="button"
                    style="left:${left}%"
                    data-drawing-id="${escapeHtml(drawing.id)}"
                    data-drawing-timestamp="${drawing.timestamp}"
                    title="${escapeHtml(title)}"
                    aria-label="${escapeHtml(title)}"
                  >
                    <span class="timeline-drawing-icon" aria-hidden="true">D</span>
                  </button>
                `;
              }).join('') : ''}
              ${events.filter(event => getTrackId(event) === track.id).map(event => {
                const left = Math.min(100, (event.timestamp / duration) * 100);
                const eventResult = formatEventValue(event.result || event.subtype);
                const hasNote = Boolean(String(event.note || '').trim());
                const hasDrawing = Boolean(event.drawingId);
                const title = `${event.type} · ${event.result || event.subtype || 'sin resultado'} · ${event.note || formatClock(event.timestamp)}`;
                return `
                  <button
                    class="timeline-block ${getTone(event)}${hasNote ? ' has-note' : ''}${hasDrawing ? ' has-drawing' : ''}"
                    type="button"
                    style="left:${left}%"
                    data-event-id="${event.id || event.timestamp}"
                    data-event-timestamp="${event.timestamp}"
                    data-event-type="${event.type}"
                    data-event-result="${eventResult}"
                    data-event-note="${event.note || ''}"
                    data-event-drawing-id="${event.drawingId || ''}"
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
    </section>
  `;

  const scrollEl = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-scroll'));
  if (scrollEl) {
    scrollEl.scrollLeft = Math.min(preservedScrollLeft, Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth));
    scrollEl.addEventListener('wheel', handleTimelineWheelScroll, { passive: false });
  }

  const ruler = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-ruler'));
  ruler?.addEventListener('pointerdown', (event) => {
    if (!durationKnown) return;
    event.preventDefault();
    options.onSeek?.(getTimelineRulerSeekTime(ruler.getBoundingClientRect(), event.clientX, duration));
  });

  host.querySelectorAll('[data-event-timestamp]').forEach((block) => {
    let dragState = null;
    const selectEventBlock = () => {
      options.onSeek?.(Number(block.dataset.eventTimestamp));
      const event = events.find(item => String(item.id || item.timestamp) === block.dataset.eventId);
      options.onEventSelect?.(event);
    };
    block.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const content = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-content'));
      const track = block.closest('.timeline-track');
      dragState = {
        content,
        pointerId: event.pointerId,
        startX: event.clientX,
        nextTimestamp: Number(block.dataset.eventTimestamp),
        dragging: false,
        track,
      };
      block.setPointerCapture?.(event.pointerId);
    });
    block.addEventListener('pointermove', (event) => {
      if (!dragState?.content || !durationKnown) return;
      if (!dragState.dragging && Math.abs(event.clientX - dragState.startX) < 4) return;
      event.preventDefault();
      dragState.dragging = true;
      const nextTimestamp = getTimelineRulerSeekTime(dragState.content.getBoundingClientRect(), event.clientX, duration);
      dragState.nextTimestamp = nextTimestamp;
      block.classList.add('dragging');
      block.style.left = getTimelineSeekPercent(nextTimestamp, duration);
      block.dataset.eventTimestamp = String(nextTimestamp);
      updateTimelinePreview(host, block);
    });
    block.addEventListener('pointerup', (pointerEvent) => {
      if (!dragState) return;
      pointerEvent.preventDefault();
      const moved = dragState.dragging;
      const nextTimestamp = dragState.nextTimestamp;
      dragState = null;
      block.releasePointerCapture?.(pointerEvent.pointerId);
      block.classList.remove('dragging');
      if (moved) {
        const event = events.find(item => String(item.id || item.timestamp) === block.dataset.eventId);
        options.onEventMove?.(event, nextTimestamp);
        return;
      }
      selectEventBlock();
    });
    block.addEventListener('pointercancel', (event) => {
      dragState = null;
      block.releasePointerCapture?.(event.pointerId);
      block.classList.remove('dragging');
    });
    block.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectEventBlock();
    });
    block.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const timelineEvent = events.find(item => String(item.id || item.timestamp) === block.dataset.eventId);
      options.onEventContextMenu?.(timelineEvent, {
        x: event.clientX,
        y: event.clientY,
        block,
      });
    });
    block.addEventListener('mouseenter', () => updateTimelinePreview(host, block));
    block.addEventListener('focus', () => updateTimelinePreview(host, block));
  });

  host.querySelectorAll('[data-drawing-timestamp]').forEach((block) => {
    const selectDrawingBlock = () => {
      const drawing = drawings.find(item => String(item.id) === block.dataset.drawingId);
      options.onDrawingSelect?.(drawing);
      options.onSeek?.(Number(block.dataset.drawingTimestamp));
    };
    block.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      selectDrawingBlock();
    });
    block.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectDrawingBlock();
    });
    block.addEventListener('mouseenter', () => updateDrawingPreview(host, block));
    block.addEventListener('focus', () => updateDrawingPreview(host, block));
  });

  host.querySelectorAll('[data-sequence-start]').forEach((block) => {
    const selectSequenceBlock = () => {
      const sequence = sequences.find(item => String(item.id || `${item.start}-${item.end}-${item.result || 'sequence'}`) === block.dataset.sequenceId);
      options.onSequenceSelect?.(sequence);
    };
    block.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      selectSequenceBlock();
    });
    block.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectSequenceBlock();
    });
    block.addEventListener('mouseenter', () => updateSequencePreview(host, block));
    block.addEventListener('focus', () => updateSequencePreview(host, block));
  });

}

/**
 * @param {WheelEvent} event
 */
function handleTimelineWheelScroll(event) {
  const scrollEl = /** @type {HTMLElement} */ (event.currentTarget);
  const delta = getTimelineWheelDelta(event);
  if (!delta) return;
  event.preventDefault();
  scrollEl.scrollLeft += delta;
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
  preview.textContent = `Dibujo Â· ${formatClock(Number(block.dataset.drawingTimestamp))}`;
  preview.classList.add('active');
}
