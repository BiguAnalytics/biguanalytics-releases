import { describe, expect, it } from 'vitest';

import {
  GRID_COLUMNS,
  GRID_ROWS,
  getResizeCandidateFromPointer,
  preventBlockResizeOverlap,
} from '../pdf-template-grid.js';

const gridRect = {
  left: 0,
  top: 0,
  width: 1200,
  height: 720,
};

describe('PDF template grid resizing', () => {
  it('clamps resize outside the page without moving the block to fill the whole page', () => {
    const block = { id: 'score-1', type: 'score', x: 4, y: 6, w: 3, h: 4 };

    const resized = getResizeCandidateFromPointer(block, {
      clientX: 2000,
      clientY: 1400,
    }, gridRect, GRID_ROWS.landscape);

    expect(resized).toEqual({
      ...block,
      x: 4,
      y: 6,
      w: GRID_COLUMNS - 4,
      h: GRID_ROWS.landscape - 6,
    });
  });

  it('shrinks a resize candidate before it overlaps a neighboring block', () => {
    const block = { id: 'score-1', type: 'score', x: 4, y: 6, w: 3, h: 4 };
    const neighbor = { id: 'chart-1', type: 'rucks-chart', x: 8, y: 6, w: 4, h: 6 };
    const candidate = getResizeCandidateFromPointer(block, {
      clientX: 2000,
      clientY: 1400,
    }, gridRect, GRID_ROWS.landscape);

    const resized = preventBlockResizeOverlap(candidate, [block, neighbor], {}, 'landscape');

    expect(resized).toEqual({
      ...block,
      w: 4,
      h: GRID_ROWS.landscape - 6,
    });
  });
});
