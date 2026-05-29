import { describe, it, expect } from 'vitest';

import {
  createStroke,
  eraseStrokeAtPoint,
  hitTestStroke,
  pushHistory,
  redoHistory,
  smoothFreehandPoints,
  undoHistory,
} from '../drawing-engine.js';

describe('drawing engine', () => {
  it('creates typed strokes with drawing properties', () => {
    expect(createStroke('arrow', {
      color: '#fff',
      width: 3,
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    })).toEqual(expect.objectContaining({
      id: expect.any(String),
      tool: 'arrow',
      color: '#fff',
      width: 3,
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    }));
  });

  it('smooths freehand points without dropping endpoints', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 8 }, { x: 20, y: 10 }];
    const smoothed = smoothFreehandPoints(points);

    expect(smoothed[0]).toEqual(points[0]);
    expect(smoothed.at(-1)).toEqual(points.at(-1));
    expect(smoothed.length).toBeGreaterThan(points.length);
  });

  it('hit-tests and erases strokes by proximity', () => {
    const strokes = [
      createStroke('line', { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 3 }),
      createStroke('rect', { points: [{ x: 50, y: 50 }, { x: 100, y: 100 }], width: 3 }),
    ];

    expect(hitTestStroke(strokes[0], { x: 50, y: 5 }, 8)).toBe(true);
    expect(eraseStrokeAtPoint(strokes, { x: 50, y: 5 }, 8)).toHaveLength(1);
  });

  it('hit-tests shape outlines without treating the filled interior as a stroke', () => {
    const rect = createStroke('rect', { points: [{ x: 50, y: 50 }, { x: 100, y: 100 }], width: 3 });
    const ellipse = createStroke('ellipse', { points: [{ x: 50, y: 50 }, { x: 150, y: 110 }], width: 3 });

    expect(hitTestStroke(rect, { x: 52, y: 75 }, 8)).toBe(true);
    expect(hitTestStroke(rect, { x: 75, y: 75 }, 8)).toBe(false);
    expect(hitTestStroke(ellipse, { x: 150, y: 80 }, 8)).toBe(true);
    expect(hitTestStroke(ellipse, { x: 100, y: 80 }, 8)).toBe(false);
  });

  it('keeps undo and redo stacks capped at 20 operations', () => {
    let history = { undo: [], redo: [] };
    for (let index = 0; index < 25; index += 1) {
      history = pushHistory(history, [{ id: String(index) }]);
    }

    expect(history.undo).toHaveLength(20);
    const undone = undoHistory(history, [{ id: 'current' }]);
    expect(undone.strokes).toEqual([{ id: '24' }]);
    const redone = redoHistory(undone.history, undone.strokes);
    expect(redone.strokes).toEqual([{ id: 'current' }]);
  });
});
