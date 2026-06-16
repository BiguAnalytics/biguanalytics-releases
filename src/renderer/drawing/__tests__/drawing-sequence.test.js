import { describe, expect, it } from 'vitest';

import {
  createCuadroFromPrevious,
  createFrameFromPrevious,
  getDrawingSequenceDuration,
  getDrawingSequenceStepAtTime,
  getDrawingSequenceStrokesAtTime,
  normalizeDrawingSequenceSteps,
} from '../drawing-sequence.js';

describe('drawing sequence playback', () => {
  it('normalizes legacy strokes into a single playable stage', () => {
    const steps = normalizeDrawingSequenceSteps({
      durationSeconds: 4,
      strokes: [{ id: 'arrow', tool: 'arrow' }],
    });

    expect(steps).toEqual([
      expect.objectContaining({
        label: 'Etapa 1',
        durationSeconds: 4,
        strokes: [expect.objectContaining({ id: 'arrow' })],
      }),
    ]);
  });

  it('uses stage durations as transition lengths between consecutive stages', () => {
    expect(getDrawingSequenceDuration({
      steps: [
        { durationSeconds: 1.5, strokes: [] },
        { durationSeconds: 2, strokes: [] },
        { durationSeconds: 0.1, strokes: [] },
      ],
    })).toBe(3.5);
  });

  it('animates the same player marker from stage A to stage B across the transition duration', () => {
    const sequence = {
      steps: [
        {
          id: 'setup',
          durationSeconds: 3,
          strokes: [
            { id: 'p9', tool: 'player', text: '9', color: '#FFFFFF', width: 3, radius: 18, points: [{ x: 10, y: 20 }] },
          ],
        },
        {
          id: 'finish',
          durationSeconds: 3,
          strokes: [
            { id: 'p9', tool: 'player', text: '9', color: '#FFFFFF', width: 3, radius: 18, points: [{ x: 70, y: 80 }] },
          ],
        },
      ],
    };

    expect(getDrawingSequenceDuration(sequence)).toBe(3);
    expect(getDrawingSequenceStrokesAtTime(sequence, 0)[0].points[0]).toEqual({ x: 10, y: 20 });
    expect(getDrawingSequenceStrokesAtTime(sequence, 1.5)[0].points[0]).toEqual({ x: 40, y: 50 });
    expect(getDrawingSequenceStrokesAtTime(sequence, 3)[0].points[0]).toEqual({ x: 70, y: 80 });
  });

  it('returns the active stage for an elapsed playback time', () => {
    const sequence = {
      steps: [
        { id: 'setup', durationSeconds: 1.5, strokes: [{ id: 'p9' }] },
        { id: 'line-break', durationSeconds: 2, strokes: [{ id: 'arrow' }] },
      ],
    };

    expect(getDrawingSequenceStepAtTime(sequence, 0.5)).toEqual(expect.objectContaining({ id: 'setup' }));
    expect(getDrawingSequenceStepAtTime(sequence, 1.5)).toEqual(expect.objectContaining({ id: 'line-break' }));
    expect(getDrawingSequenceStrokesAtTime(sequence, 2.5)).toEqual([expect.objectContaining({ id: 'arrow' })]);
  });

  it('keeps legacy live drawing playback compatible', () => {
    expect(getDrawingSequenceStrokesAtTime({
      durationSeconds: 3,
      strokes: [{ id: 'legacy-line' }],
    }, 1)).toEqual([expect.objectContaining({ id: 'legacy-line' })]);
  });

  it('creates the first cuadro as an empty canvas stage', () => {
    expect(createCuadroFromPrevious({ id: 'jugada-1', frames: [] })).toEqual(expect.objectContaining({
      id: 'cuadro-1',
      name: 'Cuadro 1',
      order: 0,
      duration: 3,
      durationSeconds: 3,
      elements: [],
      thumbnail: '',
    }));
  });

  it('creates a new cuadro from the last ordered cuadro and preserves element ids', () => {
    const sequence = {
      id: 'jugada-1',
      frames: [
        {
          id: 'cuadro-1',
          name: 'Cuadro 1',
          order: 0,
          duration: 1.5,
          elements: [{ id: 'p9', tool: 'player', points: [{ x: 10, y: 20 }] }],
          thumbnail: 'data:image/png;base64,first',
        },
        {
          id: 'cuadro-2',
          name: 'Cuadro 2',
          order: 1,
          durationSeconds: 2,
          elements: [
            { id: 'p9', tool: 'player', points: [{ x: 70, y: 80 }] },
            { id: 'run', tool: 'arrow', points: [{ x: 20, y: 30 }, { x: 100, y: 120 }] },
          ],
          thumbnail: 'data:image/png;base64,last',
        },
      ],
    };

    const cuadro = createCuadroFromPrevious(sequence);

    expect(cuadro).toEqual(expect.objectContaining({
      id: 'cuadro-3',
      name: 'Cuadro 3',
      order: 2,
      duration: 2,
      durationSeconds: 2,
      thumbnail: 'data:image/png;base64,last',
    }));
    expect(cuadro.elements).toEqual(sequence.frames[1].elements);
    expect(cuadro.elements).not.toBe(sequence.frames[1].elements);
    expect(cuadro.elements[0]).not.toBe(sequence.frames[1].elements[0]);
    expect(cuadro.elements.map(element => element.id)).toEqual(['p9', 'run']);
  });

  it('keeps the previous frame factory compatible while using cuadro copy rules', () => {
    expect(createFrameFromPrevious({ frames: [] })).toEqual(expect.objectContaining({
      id: 'cuadro-1',
      name: 'Cuadro 1',
    }));
  });
});
