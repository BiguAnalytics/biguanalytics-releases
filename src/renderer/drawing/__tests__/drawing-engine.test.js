import { describe, it, expect } from 'vitest';

import {
  createStroke,
  eraseStrokesAlongPath,
  eraseStrokeAtPoint,
  findStrokeAtPoint,
  findStrokesInRect,
  getSelectionBounds,
  getStrokeBounds,
  hitTestSelectionResizeHandle,
  hitTestStroke,
  moveStrokes,
  moveStroke,
  pushHistory,
  redoHistory,
  removeStrokesByIds,
  scaleStrokesFromSelectionHandle,
  scaleStrokes,
  serializeDrawingSvg,
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

  it('erases every stroke touched while dragging the eraser', () => {
    const strokes = [
      createStroke('line', { id: 'a', points: [{ x: 0, y: 10 }, { x: 100, y: 10 }], width: 3 }),
      createStroke('line', { id: 'b', points: [{ x: 0, y: 40 }, { x: 100, y: 40 }], width: 3 }),
      createStroke('line', { id: 'c', points: [{ x: 0, y: 80 }, { x: 100, y: 80 }], width: 3 }),
    ];

    const next = eraseStrokesAlongPath(strokes, [{ x: 50, y: 0 }, { x: 50, y: 55 }], 8);

    expect(next.map(stroke => stroke.id)).toEqual(['c']);
  });

  it('selects the topmost stroke and moves player markers with their number', () => {
    const line = createStroke('line', { id: 'line', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 3 });
    const player = createStroke('player', { id: 'p9', points: [{ x: 40, y: 50 }], text: '9', radius: 18 });

    const selected = findStrokeAtPoint([line, player], { x: 40, y: 50 }, 8);
    const moved = moveStroke(player, 12, -6);

    expect(selected?.id).toBe('p9');
    expect(hitTestStroke(player, { x: 53, y: 50 }, 8)).toBe(true);
    expect(moved).toEqual(expect.objectContaining({
      id: 'p9',
      tool: 'player',
      text: '9',
      points: [{ x: 52, y: 44 }],
    }));
  });

  it('selects every stroke fully inside a marquee rectangle and moves them together', () => {
    const strokes = [
      createStroke('line', { id: 'line', points: [{ x: 10, y: 10 }, { x: 60, y: 10 }], width: 3 }),
      createStroke('player', { id: 'p9', points: [{ x: 40, y: 50 }], text: '9', radius: 18 }),
      createStroke('rect', { id: 'outside', points: [{ x: 110, y: 110 }, { x: 160, y: 160 }], width: 3 }),
    ];

    const selected = findStrokesInRect(strokes, { x: 0, y: 0, width: 80, height: 80 });
    const moved = moveStrokes(strokes, selected.map(stroke => stroke.id), 10, 5);

    expect(selected.map(stroke => stroke.id)).toEqual(['line', 'p9']);
    expect(moved.find(stroke => stroke.id === 'line')?.points[0]).toEqual({ x: 20, y: 15 });
    expect(moved.find(stroke => stroke.id === 'p9')?.points[0]).toEqual({ x: 50, y: 55 });
    expect(moved.find(stroke => stroke.id === 'outside')?.points[0]).toEqual({ x: 110, y: 110 });
  });

  it('removes selected strokes by id without touching the rest', () => {
    const strokes = [
      createStroke('line', { id: 'line', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }),
      createStroke('cone', { id: 'cone', points: [{ x: 20, y: 20 }] }),
      createStroke('ball', { id: 'ball', points: [{ x: 40, y: 20 }] }),
    ];

    expect(removeStrokesByIds(strokes, ['line', 'ball']).map(stroke => stroke.id)).toEqual(['cone']);
  });

  it('scales selected strokes around their own center', () => {
    const strokes = [
      createStroke('line', { id: 'line', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 3 }),
      createStroke('player', { id: 'p9', points: [{ x: 40, y: 50 }], text: '9', radius: 18, width: 3 }),
      createStroke('cone', { id: 'cone', points: [{ x: 80, y: 80 }], radius: 18, width: 3 }),
    ];

    const scaled = scaleStrokes(strokes, ['line', 'p9'], 2);

    expect(scaled.find(stroke => stroke.id === 'line')).toEqual(expect.objectContaining({
      width: 6,
      points: [{ x: -50, y: 0 }, { x: 150, y: 0 }],
    }));
    expect(scaled.find(stroke => stroke.id === 'p9')).toEqual(expect.objectContaining({
      radius: 36,
      width: 6,
      points: [{ x: 40, y: 50 }],
    }));
    expect(scaled.find(stroke => stroke.id === 'cone')?.radius).toBe(18);
  });

  it('scales selected tactical elements from a corner resize handle around the group center', () => {
    const strokes = [
      createStroke('line', { id: 'line', points: [{ x: 10, y: 10 }, { x: 60, y: 10 }], width: 3 }),
      createStroke('player', { id: 'p9', points: [{ x: 100, y: 80 }], text: '9', radius: 20, width: 3 }),
      createStroke('cone', { id: 'cone', points: [{ x: 220, y: 180 }], radius: 18, width: 3 }),
    ];
    const bounds = getSelectionBounds(strokes, ['line', 'p9']);

    expect(bounds).toEqual({ x: 10, y: 10, width: 110, height: 90 });
    expect(hitTestSelectionResizeHandle(bounds, { x: 128, y: 108 }, 4)).toBe(true);
    expect(hitTestSelectionResizeHandle(bounds, { x: 120, y: 100 }, 4)).toBe(false);

    const scaled = scaleStrokesFromSelectionHandle(
      strokes,
      ['line', 'p9'],
      { x: 120, y: 100 },
      { x: 175, y: 145 },
    );

    expect(scaled.find(stroke => stroke.id === 'line')).toEqual(expect.objectContaining({
      width: 6,
      points: [{ x: -45, y: -35 }, { x: 55, y: -35 }],
    }));
    expect(scaled.find(stroke => stroke.id === 'p9')).toEqual(expect.objectContaining({
      radius: 40,
      width: 6,
      points: [{ x: 135, y: 105 }],
    }));
    expect(scaled.find(stroke => stroke.id === 'cone')?.points[0]).toEqual({ x: 220, y: 180 });
  });

  it('creates bounded tactical equipment markers', () => {
    const ball = createStroke('ball', { points: [{ x: 80, y: 40 }] });
    const cone = createStroke('cone', { points: [{ x: 120, y: 40 }] });

    expect(hitTestStroke(ball, { x: 90, y: 40 }, 2)).toBe(true);
    expect(hitTestStroke(cone, { x: 120, y: 52 }, 2)).toBe(true);
    expect(getStrokeBounds(ball)).toEqual({ x: 62, y: 22, width: 36, height: 36 });
  });

  it('serializes tactical markers and symbols as vector SVG primitives', () => {
    const strokes = [
      createStroke('player', { id: 'p1', points: [{ x: 50, y: 50 }], text: '1', radius: 24, color: '#FFFFFF' }),
      createStroke('ball', { id: 'ball', points: [{ x: 110, y: 50 }], radius: 18 }),
      createStroke('cone', { id: 'cone', points: [{ x: 160, y: 50 }], radius: 18 }),
      createStroke('arrow', { id: 'arrow', points: [{ x: 30, y: 120 }, { x: 180, y: 120 }], width: 4, color: '#C8102E' }),
      createStroke('text', { id: 'text', points: [{ x: 40, y: 170 }], text: 'Salida', fontSize: 20, color: '#FFFFFF' }),
    ];

    const svg = serializeDrawingSvg(strokes, { width: 240, height: 180, background: '<rect width="240" height="180" fill="#0E3B2A"/>' });

    expect(svg).toContain('<svg');
    expect(svg).toContain('<circle');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<marker');
    expect(svg).toContain('Salida');
    expect(svg).not.toContain('<canvas');
    expect(svg).not.toContain('<img');
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
