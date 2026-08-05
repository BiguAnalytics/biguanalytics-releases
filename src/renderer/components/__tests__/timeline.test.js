import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

import {
  getSequenceColor,
  getTimelineScale,
  getTimelineWheelDelta,
  getTimelineSegmentWidth,
  getTimelineRulerSeekTime,
  getTimelineSeekPercent,
  getTimelineDrawingWidth,
  renderTimeline,
} from '../timeline.js';

const timelineSource = fs.readFileSync(new URL('../timeline.js', import.meta.url), 'utf8');
const timelineCss = fs.readFileSync(new URL('../../../styles/components/timeline.css', import.meta.url), 'utf8');

class FakeTimelineNode {
  constructor(dataset = {}, className = '') {
    this.dataset = dataset;
    this.listeners = [];
    this.style = {};
    this.scrollLeft = 0;
    this.scrollWidth = 7200;
    this.clientWidth = 1200;
    this.textContent = '';
    this.childElementCount = 0;
    this.classNames = new Set(String(className).split(/\s+/).filter(Boolean));
    this.classList = {
      add: (...names) => names.forEach(name => this.classNames.add(name)),
      remove: (...names) => names.forEach(name => this.classNames.delete(name)),
      contains: name => this.classNames.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classNames.has(name) : Boolean(force);
        if (enabled) this.classNames.add(name);
        else this.classNames.delete(name);
        return enabled;
      },
    };
  }

  addEventListener(type) {
    this.listeners.push(type);
  }

  setPointerCapture() {}

  releasePointerCapture() {}

  closest(selector) {
    return selector === '.timeline-track' ? new FakeTimelineNode() : null;
  }

  getBoundingClientRect() {
    return { left: 0, width: 7200 };
  }
}

class FakeTimelineHost extends FakeTimelineNode {
  constructor() {
    super();
    this.innerHTMLWrites = 0;
    this.html = '';
    this.scroll = null;
    this.content = null;
    this.playhead = null;
    this.ruler = null;
    this.preview = null;
    this.eventBlocks = [];
    this.drawingBlocks = [];
    this.sequenceBlocks = [];
    this.untimedBlocks = [];
  }

  set innerHTML(value) {
    this.innerHTMLWrites += 1;
    this.html = String(value);
    this.scroll = new FakeTimelineNode();
    const duration = /data-timeline-duration="([^"]+)"/.exec(this.html)?.[1] || '0';
    this.content = new FakeTimelineNode({ timelineDuration: duration });
    this.playhead = new FakeTimelineNode();
    this.playhead.style.left = /timeline-playhead" style="left:([^"]+)"/.exec(this.html)?.[1] || '0%';
    this.ruler = new FakeTimelineNode();
    this.preview = new FakeTimelineNode();
    this.eventBlocks = parseTimelineBlocks(this.html, 'data-event-timestamp');
    this.drawingBlocks = parseTimelineBlocks(this.html, 'data-drawing-timestamp');
    this.sequenceBlocks = parseTimelineBlocks(this.html, 'data-sequence-start');
    this.untimedBlocks = parseTimelineBlocks(this.html, 'data-untimed-event-id');
  }

  get innerHTML() {
    return this.html;
  }

  querySelector(selector) {
    if (selector === '.timeline-scroll') return this.scroll;
    if (selector === '.timeline-content') return this.content;
    if (selector === '.timeline-playhead') return this.playhead;
    if (selector === '.timeline-ruler') return this.ruler;
    if (selector === '#timeline-preview') return this.preview;
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-event-timestamp]') return this.eventBlocks;
    if (selector === '[data-drawing-timestamp]') return this.drawingBlocks;
    if (selector === '[data-sequence-start]') return this.sequenceBlocks;
    if (selector === '[data-untimed-event-id]') return this.untimedBlocks;
    if (selector === '[data-event-id]') return this.eventBlocks;
    if (selector === '[data-drawing-id]') return this.drawingBlocks;
    if (selector === '[data-sequence-id]') return this.sequenceBlocks;
    return [];
  }

  get blockListenerCount() {
    return [
      ...this.eventBlocks,
      ...this.drawingBlocks,
      ...this.sequenceBlocks,
      ...this.untimedBlocks,
    ].reduce((count, block) => count + block.listeners.length, 0);
  }
}

function parseTimelineBlocks(html, token) {
  return [...html.matchAll(/<button\b[\s\S]*?<\/button>/g)]
    .map(match => match[0])
    .filter(button => button.includes(token))
    .map((button) => {
      const attrs = {};
      for (const attr of button.matchAll(/\s([a-zA-Z0-9-]+)="([^"]*)"/g)) {
        attrs[attr[1]] = attr[2];
      }
      const dataset = Object.fromEntries(
        Object.entries(attrs)
          .filter(([key]) => key.startsWith('data-'))
          .map(([key, value]) => [
            key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
            value,
          ])
      );
      return new FakeTimelineNode(dataset, attrs.class || '');
    });
}

function createTimelineEvents(count, durationSeconds) {
  const eventTypes = ['ruck', 'lineout', 'penal', 'points', 'note'];
  return Array.from({ length: count }, (_, index) => ({
    id: `evt-${index}`,
    type: eventTypes[index % eventTypes.length],
    team: index % 2 === 0 ? 'home' : 'away',
    result: index % 3 === 0 ? 'ganado' : 'perdido',
    timestamp: Math.round((index / count) * durationSeconds * 100) / 100,
  }));
}

describe('timeline scale', () => {
  it('does not invent an 80 minute scale when video duration is unknown', () => {
    expect(getTimelineScale(null, [])).toEqual({
      duration: 60,
      durationKnown: false,
      tickCount: 0,
      timelineWidth: 1200,
    });
  });

  it('uses the real duration when video metadata is known', () => {
    expect(getTimelineScale(5400, [])).toEqual({
      duration: 5400,
      durationKnown: true,
      tickCount: 18,
      timelineWidth: 6480,
    });
  });

  it('uses an editor-style wide scale so long videos scroll horizontally', () => {
    const scale = getTimelineScale(6089, []);

    expect(scale.timelineWidth).toBe(7344);
    expect(scale.timelineWidth / (scale.duration / 600)).toBeGreaterThan(700);
  });
});

describe('timeline wheel navigation', () => {
  it('maps the regular mouse wheel to horizontal timeline movement', () => {
    expect(getTimelineWheelDelta({ deltaY: 120, deltaX: 0, deltaMode: 0 })).toBe(120);
    expect(getTimelineWheelDelta({ deltaY: -80, deltaX: 0, deltaMode: 0 })).toBe(-80);
  });

  it('normalizes line-based wheel events for consistent scrolling', () => {
    expect(getTimelineWheelDelta({ deltaY: 3, deltaX: 0, deltaMode: 1 })).toBe(48);
  });

  it('preserves manual scroll position while playback re-renders the playhead', () => {
    expect(timelineSource).toContain('const preservedScrollLeft');
    expect(timelineSource).toContain('scrollEl.scrollLeft = Math.min(preservedScrollLeft');
    expect(timelineSource).toContain("host.addEventListener('wheel', event => handleTimelineWheelScroll(host, event), { passive: false })");
  });
});

describe('timeline track labels', () => {
  it('renders track labels in a fixed rail outside the horizontal scroll area', () => {
    expect(timelineSource).toContain('class="timeline-track-labels"');
    expect(timelineSource).toContain('class="timeline-track-label timeline-possession-label"');
    expect(timelineSource).not.toContain('<span class="timeline-track-label">${track.label}</span>');
    expect(timelineCss).toContain('--timeline-track-rows: var(--timeline-ruler-height) var(--timeline-possession-height) repeat(5, minmax(0, 1fr));');
    expect(timelineCss).toMatch(/\.timeline-content\s*{[^}]*grid-template-rows:\s*var\(--timeline-track-rows\);/s);
    expect(timelineCss).toMatch(/\.timeline-track-labels\s*{[^}]*grid-template-rows:\s*var\(--timeline-track-rows\);/s);
    expect(timelineCss).toMatch(/\.tagging-timeline\s*{[^}]*grid-template-columns:\s*136px\s+minmax\(0,\s*1fr\);/s);
    expect(timelineCss).toMatch(/\.timeline-track-labels\s*{[^}]*grid-column:\s*1;[^}]*overflow:\s*hidden;/s);
    expect(timelineCss).toMatch(/\.timeline-scroll\s*{[^}]*grid-column:\s*2;/s);
  });
});

describe('timeline event selection', () => {
  it('renders a contextual empty state when there are no events, sequences or drawings', () => {
    expect(timelineSource).toContain('timeline-empty-state');
    expect(timelineSource).toContain('Todavia no hay eventos taggeados');
    expect(timelineSource).toContain('Usa las hotkeys de Tagging para cargar el primer evento.');
  });

  it('keeps untimed events visible in a secondary list instead of dropping them from the timeline', () => {
    expect(timelineSource).toContain('const untimedEvents = (options.events || [])');
    expect(timelineSource).toContain('timeline-untimed-events');
    expect(timelineSource).toContain('Eventos sin tiempo');
    expect(timelineSource).toContain('data-untimed-event-id');
    expect(timelineSource).not.toContain('untimedEvents.slice');
    expect(timelineSource).toContain('options.onUntimedEventSelect');
    expect(timelineSource).toContain('state.options.onEventSelect?.(untimedEvent)');
    expect(timelineSource).toContain('state.options.onUntimedEventContextMenu?.(state.untimedEvents');
    expect(timelineCss).toContain('.timeline-untimed-events');
    expect(timelineCss).toContain('.timeline-untimed-event');
  });

  it('does not mix untimed events into the temporal event blocks', () => {
    const temporalEventsSource = timelineSource.slice(
      timelineSource.indexOf('const events = (options.events || [])'),
      timelineSource.indexOf('const untimedEvents = (options.events || [])')
    );

    expect(temporalEventsSource).toContain('Number.isFinite(event.timestamp)');
    expect(temporalEventsSource).not.toContain('event.timestamp === null');
  });

  it('uses pointer down to seek and open the event inspector on the first interaction', () => {
    expect(timelineSource).toContain('state.options.onEventSelect?.(getTimelineEventById(host, block.dataset.eventId))');
    expect(timelineSource).toContain("host.addEventListener('pointerdown'");
    expect(timelineSource).toContain('event.preventDefault();');
  });

  it('supports dragging event markers horizontally within their existing timeline channel', () => {
    expect(getTimelineSeekPercent(0)).toBe('0%');
    expect(getTimelineSeekPercent(300, 600)).toBe('50%');
    expect(getTimelineSeekPercent(750, 600)).toBe('100%');
    expect(timelineSource).toContain('state.options.onEventMove?.(getTimelineEventById(host, dragState.block.dataset.eventId), dragState.nextTimestamp)');
    expect(timelineSource).toContain("host.addEventListener('pointermove'");
    expect(timelineSource).toContain("host.addEventListener('pointerup'");
    expect(timelineSource).toContain("block.classList.add('dragging')");
    expect(timelineSource).toContain("eventBlock.closest('.timeline-track')");
    expect(timelineCss).toMatch(/\.timeline-block\.dragging\s*{[^}]*cursor:\s*grabbing;/s);
  });

  it('updates only the playhead during playback so native scrollbar dragging is not interrupted', () => {
    expect(timelineSource).toContain('export function updateTimelinePlayback(host, currentTime)');
    expect(timelineSource).toContain('content.dataset.timelineDuration');
    expect(timelineSource).toContain("playhead.style.left = getTimelineSeekPercent(currentTime, duration)");
    expect(timelineSource).toContain('data-timeline-duration="${duration}"');
  });

  it('delegates timeline interactions from the host instead of binding listeners to every block', () => {
    const host = new FakeTimelineHost();

    renderTimeline(host, {
      events: createTimelineEvents(500, 7200),
      duration: 7200,
      currentTime: 0,
    });

    expect(host.eventBlocks).toHaveLength(500);
    expect(host.listeners).toEqual(expect.arrayContaining([
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'keydown',
      'contextmenu',
      'pointerover',
      'focusin',
      'wheel',
    ]));
    expect(host.blockListenerCount).toBe(0);
  });

  it('keeps the static timeline DOM when only playback or selection changes', () => {
    const host = new FakeTimelineHost();
    const events = createTimelineEvents(50, 7200);

    renderTimeline(host, {
      events,
      duration: 7200,
      currentTime: 30,
    });
    renderTimeline(host, {
      events,
      duration: 7200,
      currentTime: 120,
      selectedEventId: 'evt-3',
      selectedSequenceKey: 'sequence-1',
    });

    expect(host.innerHTMLWrites).toBe(1);
    expect(host.playhead.style.left).toBe(getTimelineSeekPercent(120, 7200));
  });

  it('covers a simulated two hour plus timeline with many distributed events without adding per-block listeners', () => {
    const host = new FakeTimelineHost();
    const duration = 2 * 60 * 60 + 18 * 60;
    const events = createTimelineEvents(2500, duration);

    renderTimeline(host, {
      events,
      duration,
      currentTime: 0,
    });
    renderTimeline(host, {
      events,
      duration,
      currentTime: duration - 10,
      selectedEventId: 'evt-2400',
    });

    expect(getTimelineScale(duration, events).duration).toBeGreaterThan(7200);
    expect(host.eventBlocks).toHaveLength(2500);
    expect(host.innerHTMLWrites).toBe(1);
    expect(host.blockListenerCount).toBe(0);
    expect(host.playhead.style.left).toBe(getTimelineSeekPercent(duration - 10, duration));
  });

  it('computes note and drawing indicators inside the event marker template', () => {
    const sequenceTemplate = timelineSource.slice(
      timelineSource.indexOf("track.id === 'notes' ? sequences.map"),
      timelineSource.indexOf("track.id === 'notes' ? drawings.map")
    );
    const eventTemplate = timelineSource.slice(
      timelineSource.indexOf("events.filter(event => getTrackId(event) === track.id).map(event =>"),
      timelineSource.indexOf("host.querySelectorAll('[data-event-timestamp]')")
    );

    expect(sequenceTemplate).not.toContain('event.note');
    expect(sequenceTemplate).not.toContain('event.drawingId');
    expect(eventTemplate).toContain("const hasNote = Boolean(String(event.note || '').trim())");
    expect(eventTemplate).toContain('const hasDrawing = Boolean(event.drawingId)');
  });

  it('escapes every event-derived timeline data attribute', () => {
    const eventTemplate = timelineSource.slice(
      timelineSource.indexOf("events.filter(event => getTrackId(event) === track.id).map(event =>"),
      timelineSource.indexOf("host.querySelectorAll('[data-event-timestamp]')")
    );

    expect(eventTemplate).toContain('data-event-id="${escapeHtml(eventId)}"');
    expect(eventTemplate).toContain('data-event-type="${escapeHtml(event.type)}"');
    expect(eventTemplate).toContain('data-event-result="${escapeHtml(eventResult)}"');
    expect(eventTemplate).toContain('data-event-note="${escapeHtml(event.note || \'\')}"');
    expect(eventTemplate).toContain('data-event-drawing-id="${escapeHtml(event.drawingId || \'\')}"');
  });

  it('renders live drawings as duration blocks in the notes track', () => {
    expect(getTimelineDrawingWidth({ timestamp: 10, durationSeconds: 3 }, 60)).toBe('max(20px, 5%)');
    expect(getTimelineDrawingWidth({ timestamp: 58, durationSeconds: 5 }, 60)).toBe('max(20px, 3.3333%)');
    expect(timelineSource).toContain('getTimelineDrawingWidth(drawing, duration)');
    expect(timelineSource).toContain('data-drawing-duration="${drawingDuration}"');
    expect(timelineSource).toContain('timestamp: getDrawingEndTimestamp(drawing)');
    expect(timelineCss).toMatch(/\.timeline-drawing-block\s*{[^}]*min-width:\s*20px;/s);
    expect(timelineCss).toMatch(/\.timeline-drawing-block\s*{[^}]*top:\s*50%;/s);
    expect(timelineCss).toMatch(/\.timeline-drawing-block\s*{[^}]*transform:\s*translateY\(-50%\);/s);
  });

  it('supports selecting and dragging live drawing blocks independently from events', () => {
    const drawingListeners = timelineSource.slice(
      timelineSource.indexOf('function handleTimelinePointerMove'),
      timelineSource.indexOf('function handleTimelinePointerUp')
    );

    expect(timelineSource).toContain('selectedDrawingId');
    expect(timelineSource).toContain('class="timeline-drawing-block${String(drawing.id) === selectedDrawingId ? \' selected\' : \'\'}"');
    expect(timelineSource).toContain("host.addEventListener('pointermove'");
    expect(timelineSource).toContain("host.addEventListener('pointerup'");
    expect(drawingListeners).toContain("dragState.block.classList.add('dragging')");
    expect(timelineSource).toContain('state.options.onDrawingMove?.(state.drawingsById.get(String(dragState.block.dataset.drawingId)), dragState.nextTimestamp)');
    expect(timelineCss).toMatch(/\.timeline-drawing-block\.dragging\s*{[^}]*cursor:\s*grabbing;/s);
    expect(timelineCss).toMatch(/\.timeline-drawing-block\.selected\s*{[^}]*border-color:\s*rgba\(255,\s*255,\s*255,\s*0\.5\);/s);
  });

  it('keeps the zero minute tick inside the timeline frame', () => {
    expect(timelineSource).toContain('timeline-tick zero-tick');
    expect(timelineCss).toMatch(/\.timeline-tick\.zero-tick\s*{[^}]*transform:\s*translateX\(0\);[^}]*padding-left:\s*var\(--space-1\);/s);
  });

  it('seeks from any click position in the ruler channel, not only tick labels', () => {
    expect(getTimelineRulerSeekTime({ left: 100, width: 500 }, 350, 600)).toBe(300);
    expect(getTimelineRulerSeekTime({ left: 100, width: 500 }, 25, 600)).toBe(0);
    expect(getTimelineRulerSeekTime({ left: 100, width: 500 }, 700, 600)).toBe(600);
    expect(timelineSource).toContain("const ruler = closestTimelineElement(event.target, '.timeline-ruler')");
    expect(timelineSource).toContain('state.options.onSeek?.(getTimelineRulerSeekTime');
    expect(timelineSource).not.toContain('data-tick-time');
    expect(timelineCss).not.toContain('.timeline-tick:hover');
  });

  it('extends minute guide lines through every timeline channel', () => {
    expect(timelineCss).not.toMatch(/\.timeline-tick::after\s*{[^}]*height:\s*116px;/s);
    expect(timelineCss).toMatch(/\.timeline-tick::after\s*{[^}]*height:\s*280px;/s);
  });
});

describe('timeline possession', () => {
  it('renders possession as a dedicated timeline channel above event tracks', () => {
    expect(timelineSource).toContain('const possessionSegments = (options.possessionSegments || [])');
    expect(timelineSource).toContain('...possessionSegments.map(segment => ({ timestamp: segment.end }))');
    expect(timelineSource).toContain('class="timeline-possession-track"');
    expect(timelineSource).toContain('class="timeline-possession-segment ${segment.team}"');
    expect(timelineSource).toContain('data-possession-team="${segment.team}"');
    expect(timelineCss).toMatch(/\.tagging-timeline\s*{[^}]*--timeline-possession-height:\s*16px;/s);
    expect(timelineCss).toMatch(/\.timeline-possession-track\s*{[^}]*position:\s*relative;[^}]*height:\s*100%;/s);
    expect(timelineCss).toMatch(/\.timeline-possession-segment\s*{[^}]*border-radius:\s*0;/s);
    expect(timelineCss).not.toMatch(/\.timeline-possession-segment\s*{[^}]*border-radius:\s*var\(--radius-full\);/s);
    expect(timelineCss).toMatch(/\.timeline-possession-segment\.home\s*{[^}]*background:\s*rgba\(200,\s*16,\s*46,\s*0\.72\);/s);
    expect(timelineCss).toMatch(/\.timeline-possession-segment\.away\s*{[^}]*background:\s*rgba\(138,\s*155,\s*176,\s*0\.62\);/s);
  });
});

describe('timeline sequences', () => {
  it('renders finished sequences as duration blocks with the same minimum hit target', () => {
    expect(getTimelineSegmentWidth({ start: 60, end: 62 }, 600)).toBe('max(20px, 0.3333%)');
    expect(getTimelineSegmentWidth({ start: 60, end: 360 }, 600)).toBe('max(20px, 50%)');
    expect(timelineSource).toContain('const sequences = (options.sequences || [])');
    expect(timelineSource).toContain('timeline-sequence-block');
    expect(timelineSource).toContain('state.options.onSequenceSelect?.(state.sequencesById.get(String(block.dataset.sequenceId)))');
  });

  it('does not paint a red elapsed band behind the white playhead', () => {
    expect(timelineSource).not.toContain('class="timeline-progress"');
    expect(timelineCss).not.toContain('.timeline-progress');
  });

  it('renders sequences centered in the notes track', () => {
    expect(timelineSource).toContain("track.id === 'notes' ? sequences.map");
    expect(timelineSource).not.toContain("track.id === 'attack' ? sequences.map");
    expect(timelineCss).toMatch(/\.timeline-track\[data-track="notes"\]\s+\.timeline-block\s*{[^}]*top:\s*32%;/s);
    expect(timelineCss).toMatch(/\.timeline-track\[data-track="notes"\]\s+\.timeline-sequence-block\s*{[^}]*top:\s*50%;/s);
  });

  it('uses pointer down to select a sequence immediately without also forcing a seek', () => {
    const sequenceListeners = timelineSource.slice(
      timelineSource.indexOf("const sequenceBlock = closestTimelineElement(event.target, '[data-sequence-start]')"),
      timelineSource.indexOf("const untimedBlock = closestTimelineElement(event.target, '[data-untimed-event-id]')")
    );

    expect(timelineSource).toContain("host.addEventListener('pointerdown'");
    expect(sequenceListeners).toContain('selectTimelineSequenceBlock(host, sequenceBlock)');
    expect(sequenceListeners).not.toContain('options.onSeek?.');
  });

  it('keeps sequence blocks text-free while matching the thinner event marker shape', () => {
    expect(timelineSource).not.toContain('><span>${escapeHtml(sequenceName)}</span></button>');
    expect(timelineCss).toMatch(/\.timeline-sequence-block\s*{[^}]*min-width:\s*20px;/s);
    expect(timelineCss).toMatch(/\.timeline-sequence-block\s*{[^}]*height:\s*13px;/s);
    expect(timelineCss).toMatch(/\.timeline-sequence-block\s*{[^}]*background:\s*var\(--sequence-color,/s);
    expect(timelineCss).toMatch(/\.timeline-sequence-block::before\s*{[^}]*inset:\s*-8px\s+-10px;/s);
    expect(timelineCss).not.toMatch(/\.timeline-sequence-block\s*{[^}]*linear-gradient/s);
  });

  it('reserves a scrollbar lane below the notes track instead of covering it', () => {
    expect(timelineCss).toMatch(/\.tagging-timeline\s*{[^}]*--timeline-scrollbar-lane:\s*12px;/s);
    expect(timelineCss).toMatch(/\.timeline-scroll\s*{[^}]*box-sizing:\s*border-box;/s);
    expect(timelineCss).toMatch(/\.timeline-track-labels\s*{[^}]*height:\s*calc\(100%\s*-\s*var\(--timeline-scrollbar-lane\)\);/s);
    expect(timelineCss).toMatch(/\.timeline-content\s*{[^}]*height:\s*calc\(100%\s*-\s*var\(--timeline-scrollbar-lane\)\);[^}]*display:\s*grid;[^}]*grid-template-rows:\s*var\(--timeline-track-rows\);/s);
    expect(timelineCss).not.toMatch(/\.timeline-track\s*{[^}]*height:\s*calc\(\(100%\s*-\s*22px\)\s*\/\s*5\);/s);
  });

  it('uses the same row sizing variables for labels and timeline channels', () => {
    expect(timelineCss).toMatch(/\.tagging-timeline\s*{[^}]*--timeline-ruler-height:\s*22px;/s);
    expect(timelineCss).toMatch(/\.tagging-timeline\s*{[^}]*--timeline-track-min-height:\s*34px;/s);
    expect(timelineCss).toMatch(/\.tagging-timeline\s*{[^}]*min-height:\s*calc\([^}]*var\(--timeline-track-min-height\)[^}]*var\(--timeline-track-min-height\)[^}]*var\(--timeline-track-min-height\)[^}]*var\(--timeline-track-min-height\)[^}]*var\(--timeline-track-min-height\)[^}]*\);/s);
    expect(timelineCss).toMatch(/\.timeline-track-labels\s*{[^}]*grid-template-rows:\s*var\(--timeline-track-rows\);/s);
    expect(timelineCss).toMatch(/\.timeline-content\s*{[^}]*grid-template-rows:\s*var\(--timeline-track-rows\);/s);
    expect(timelineCss).toMatch(/\.timeline-ruler\s*{[^}]*height:\s*var\(--timeline-ruler-height\);/s);
    expect(timelineCss).toContain('--timeline-track-rows: var(--timeline-ruler-height) var(--timeline-possession-height) repeat(5, minmax(0, 1fr));');
  });

  it('pins each label to the same grid row as its timeline channel', () => {
    expect(timelineSource).toContain('style="--timeline-label-row:2"');
    expect(timelineSource).toContain('style="--timeline-label-row:${index + 3}"');
    expect(timelineCss).toMatch(/\.timeline-label-ruler\s*{[^}]*grid-row:\s*1;/s);
    expect(timelineCss).toMatch(/\.timeline-track-label\s*{[^}]*grid-row:\s*var\(--timeline-label-row\);[^}]*align-self:\s*stretch;/s);
  });

  it('keeps separator borders inside shared grid rows so label and channel lines align', () => {
    expect(timelineCss).toMatch(/\.timeline-label-ruler,\s*\.timeline-ruler,\s*\.timeline-possession-track,\s*\.timeline-track-label,\s*\.timeline-track\s*{[^}]*box-sizing:\s*border-box;/s);
    expect(timelineCss).toMatch(/\.timeline-track-label\s*{[^}]*height:\s*auto;/s);
    expect(timelineCss).toMatch(/\.timeline-track-label\s*{[^}]*min-height:\s*0;/s);
    expect(timelineCss).toMatch(/\.timeline-track\s*{[^}]*min-height:\s*0;/s);
    expect(timelineCss).not.toMatch(/\.timeline-track-label\s*{[^}]*height:\s*100%;/s);
  });

  it('keeps the timeline scrollbar visible and draggable', () => {
    expect(timelineCss).toMatch(/\.timeline-scroll\s*{[^}]*overflow-x:\s*scroll;/s);
    expect(timelineCss).toMatch(/\.timeline-scroll::-webkit-scrollbar\s*{[^}]*height:\s*10px;/s);
    expect(timelineCss).toMatch(/\.timeline-scroll::-webkit-scrollbar-thumb\s*{[^}]*cursor:\s*grab;/s);
  });

  it('keeps sequence hover geometry stable to prevent flicker', () => {
    const hoverRule = timelineCss.slice(
      timelineCss.indexOf('.timeline-sequence-block:hover'),
      timelineCss.indexOf('}', timelineCss.indexOf('.timeline-sequence-block:hover'))
    );

    expect(hoverRule).not.toContain('transform');
    expect(hoverRule).not.toContain('scale');
  });

  it('maps sequence color choices to timeline-safe colors', () => {
    expect(getSequenceColor('blue')).toContain('79, 121, 174');
    expect(getSequenceColor('green')).toContain('79, 121, 174');
    expect(getSequenceColor('yellow')).toContain('118, 135, 157');
    expect(getSequenceColor('unknown')).toContain('200, 16, 46');
  });

  it('uses configurable event labels in timeline content and titles', () => {
    expect(timelineSource).toContain("import { getEventLabel } from '../tagging/event-labels.js';");
    expect(timelineSource).toContain('getEventLabel(event.type, options.eventLabels)');
  });
});
