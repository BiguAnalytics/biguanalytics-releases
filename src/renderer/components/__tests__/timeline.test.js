import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

import {
  getSequenceColor,
  getTimelineScale,
  getTimelineWheelDelta,
  getTimelineSegmentWidth,
  getTimelineRulerSeekTime,
  getTimelineSeekPercent,
} from '../timeline.js';

const timelineSource = fs.readFileSync(new URL('../timeline.js', import.meta.url), 'utf8');
const timelineCss = fs.readFileSync(new URL('../../../styles/components/timeline.css', import.meta.url), 'utf8');

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
    expect(timelineSource).toContain("scrollEl.addEventListener('wheel', handleTimelineWheelScroll, { passive: false })");
  });
});

describe('timeline track labels', () => {
  it('renders track labels in a fixed rail outside the horizontal scroll area', () => {
    expect(timelineSource).toContain('class="timeline-track-labels"');
    expect(timelineSource).toContain('class="timeline-track-label timeline-possession-label"');
    expect(timelineSource).not.toContain('<span class="timeline-track-label">${track.label}</span>');
    expect(timelineCss).toMatch(/\.tagging-timeline\s*{[^}]*grid-template-columns:\s*136px\s+minmax\(0,\s*1fr\);/s);
    expect(timelineCss).toMatch(/\.timeline-track-labels\s*{[^}]*grid-column:\s*1;[^}]*overflow:\s*hidden;/s);
    expect(timelineCss).toMatch(/\.timeline-scroll\s*{[^}]*grid-column:\s*2;/s);
  });
});

describe('timeline event selection', () => {
  it('uses pointer down to seek and open the event inspector on the first interaction', () => {
    expect(timelineSource).toContain('options.onEventSelect?.(event)');
    expect(timelineSource).toContain("block.addEventListener('pointerdown'");
    expect(timelineSource).toContain('event.preventDefault();');
  });

  it('supports dragging event markers horizontally within their existing timeline channel', () => {
    expect(getTimelineSeekPercent(0)).toBe('0%');
    expect(getTimelineSeekPercent(300, 600)).toBe('50%');
    expect(getTimelineSeekPercent(750, 600)).toBe('100%');
    expect(timelineSource).toContain('options.onEventMove?.(event, nextTimestamp)');
    expect(timelineSource).toContain("block.addEventListener('pointermove'");
    expect(timelineSource).toContain("block.addEventListener('pointerup'");
    expect(timelineSource).toContain("block.classList.add('dragging')");
    expect(timelineSource).toContain("block.closest('.timeline-track')");
    expect(timelineCss).toMatch(/\.timeline-block\.dragging\s*{[^}]*cursor:\s*grabbing;/s);
  });

  it('updates only the playhead during playback so native scrollbar dragging is not interrupted', () => {
    expect(timelineSource).toContain('export function updateTimelinePlayback(host, currentTime)');
    expect(timelineSource).toContain('content.dataset.timelineDuration');
    expect(timelineSource).toContain("playhead.style.left = getTimelineSeekPercent(currentTime, duration)");
    expect(timelineSource).toContain('data-timeline-duration="${duration}"');
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

  it('keeps the zero minute tick inside the timeline frame', () => {
    expect(timelineSource).toContain('timeline-tick zero-tick');
    expect(timelineCss).toMatch(/\.timeline-tick\.zero-tick\s*{[^}]*transform:\s*translateX\(0\);[^}]*padding-left:\s*var\(--space-1\);/s);
  });

  it('seeks from any click position in the ruler channel, not only tick labels', () => {
    expect(getTimelineRulerSeekTime({ left: 100, width: 500 }, 350, 600)).toBe(300);
    expect(getTimelineRulerSeekTime({ left: 100, width: 500 }, 25, 600)).toBe(0);
    expect(getTimelineRulerSeekTime({ left: 100, width: 500 }, 700, 600)).toBe(600);
    expect(timelineSource).toContain("ruler?.addEventListener('pointerdown'");
    expect(timelineSource).toContain('options.onSeek?.(getTimelineRulerSeekTime');
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
    expect(timelineSource).toContain('options.onSequenceSelect?.(sequence)');
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
      timelineSource.indexOf("host.querySelectorAll('[data-sequence-start]')"),
      timelineSource.indexOf('function handleTimelineWheelScroll')
    );

    expect(sequenceListeners).toContain("block.addEventListener('pointerdown'");
    expect(sequenceListeners).toContain('options.onSequenceSelect?.(sequence)');
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
    expect(timelineCss).toMatch(/\.timeline-content\s*{[^}]*height:\s*calc\(100%\s*-\s*var\(--timeline-scrollbar-lane\)\);[^}]*display:\s*grid;[^}]*grid-template-rows:\s*var\(--timeline-ruler-height\)\s+var\(--timeline-possession-height\)\s+repeat\(5,\s*minmax\(var\(--timeline-track-min-height\),\s*1fr\)\);/s);
    expect(timelineCss).toMatch(/\.timeline-track\s*{[^}]*min-height:\s*var\(--timeline-track-min-height\);/s);
    expect(timelineCss).not.toMatch(/\.timeline-track\s*{[^}]*height:\s*calc\(\(100%\s*-\s*22px\)\s*\/\s*5\);/s);
  });

  it('uses the same row sizing variables for labels and timeline channels', () => {
    expect(timelineCss).toMatch(/\.tagging-timeline\s*{[^}]*--timeline-ruler-height:\s*22px;/s);
    expect(timelineCss).toMatch(/\.tagging-timeline\s*{[^}]*--timeline-track-min-height:\s*34px;/s);
    expect(timelineCss).toMatch(/\.timeline-track-labels\s*{[^}]*grid-template-rows:\s*var\(--timeline-ruler-height\)\s+var\(--timeline-possession-height\)\s+repeat\(5,\s*minmax\(var\(--timeline-track-min-height\),\s*1fr\)\);/s);
    expect(timelineCss).toMatch(/\.timeline-content\s*{[^}]*grid-template-rows:\s*var\(--timeline-ruler-height\)\s+var\(--timeline-possession-height\)\s+repeat\(5,\s*minmax\(var\(--timeline-track-min-height\),\s*1fr\)\);/s);
    expect(timelineCss).toMatch(/\.timeline-ruler\s*{[^}]*height:\s*var\(--timeline-ruler-height\);/s);
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
    expect(getSequenceColor('blue')).toContain('59, 130, 246');
    expect(getSequenceColor('green')).toContain('29, 185, 84');
    expect(getSequenceColor('unknown')).toContain('200, 16, 46');
  });
});
