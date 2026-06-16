import { describe, expect, it } from 'vitest';

import { interpolateFrame } from '../frame-interpolation.js';

describe('frame interpolation', () => {
  it('interpolates matching elements by persistent id without mutating source frames', () => {
    const fromFrame = {
      id: 'frame-1',
      elements: [
        { id: 'p9', type: 'player', points: [{ x: 10, y: 20 }], radius: 18, style: { color: '#fff' } },
        { id: 'line', type: 'line', points: [{ x: 0, y: 0 }, { x: 20, y: 20 }], style: { color: '#C8102E' } },
        { id: 'rect', type: 'rect', geometry: { x: 10, y: 10, width: 40, height: 20 } },
      ],
    };
    const toFrame = {
      id: 'frame-2',
      elements: [
        { id: 'p9', type: 'player', points: [{ x: 70, y: 80 }], radius: 18, style: { color: '#fff' } },
        { id: 'line', type: 'line', points: [{ x: 20, y: 10 }, { x: 60, y: 30 }], style: { color: '#C8102E' } },
        { id: 'rect', type: 'rect', geometry: { x: 30, y: 20, width: 80, height: 30 } },
      ],
    };

    const result = interpolateFrame(fromFrame, toFrame, 0.5);

    expect(result.elements).toEqual([
      expect.objectContaining({ id: 'p9', points: [{ x: 40, y: 50 }], radius: 18 }),
      expect.objectContaining({ id: 'line', points: [{ x: 10, y: 5 }, { x: 40, y: 25 }] }),
      expect.objectContaining({ id: 'rect', geometry: { x: 20, y: 15, width: 60, height: 25 } }),
    ]);
    expect(fromFrame.elements[0].points[0]).toEqual({ x: 10, y: 20 });
    expect(toFrame.elements[0].points[0]).toEqual({ x: 70, y: 80 });
  });

  it('does not tween new or removed elements from arbitrary positions', () => {
    const fromFrame = {
      elements: [
        { id: 'kept', type: 'player', points: [{ x: 0, y: 0 }] },
        { id: 'removed', type: 'cone', points: [{ x: 20, y: 20 }] },
      ],
    };
    const toFrame = {
      elements: [
        { id: 'kept', type: 'player', points: [{ x: 100, y: 0 }] },
        { id: 'new', type: 'ball', points: [{ x: 80, y: 80 }] },
      ],
    };

    expect(interpolateFrame(fromFrame, toFrame, 0.5).elements.map(element => element.id)).toEqual(['kept', 'removed']);
    expect(interpolateFrame(fromFrame, toFrame, 1).elements.map(element => element.id)).toEqual(['kept', 'new']);
    expect(interpolateFrame(fromFrame, toFrame, 1).elements.find(element => element.id === 'new')?.points[0]).toEqual({ x: 80, y: 80 });
  });

  it('supports strokes as legacy frame elements', () => {
    const result = interpolateFrame(
      { strokes: [{ id: 'arrow', tool: 'arrow', points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] }] },
      { strokes: [{ id: 'arrow', tool: 'arrow', points: [{ x: 20, y: 10 }, { x: 70, y: 90 }] }] },
      0.25
    );

    expect(result.strokes).toEqual([
      expect.objectContaining({
        id: 'arrow',
        points: [{ x: 5, y: 2.5 }, { x: 55, y: 60 }],
      }),
    ]);
  });
});
