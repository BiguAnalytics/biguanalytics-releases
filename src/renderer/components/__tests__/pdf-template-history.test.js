import { describe, expect, it } from 'vitest';

import { createPdfTemplateHistory } from '../pdf-template-history.js';

const initialTemplate = {
  id: 'template-1',
  name: 'Plantilla',
  orientation: 'landscape',
  pages: [{
    id: 'page-1',
    blocks: [
      { id: 'score-1', type: 'score', x: 0, y: 0, w: 4, h: 4 },
    ],
  }],
};

describe('PDF template editor history', () => {
  it('undoes and redoes template changes without mutating snapshots', () => {
    const history = createPdfTemplateHistory(initialTemplate);
    const moved = {
      ...initialTemplate,
      pages: [{
        ...initialTemplate.pages[0],
        blocks: [{ ...initialTemplate.pages[0].blocks[0], x: 4 }],
      }],
    };

    history.push(moved);
    moved.pages[0].blocks[0].x = 8;

    expect(history.canUndo()).toBe(true);
    expect(history.undo().pages[0].blocks[0].x).toBe(0);
    expect(history.canRedo()).toBe(true);
    expect(history.redo().pages[0].blocks[0].x).toBe(4);
  });

  it('clears redo states when a new change is pushed after undo', () => {
    const history = createPdfTemplateHistory(initialTemplate);
    history.push({ ...initialTemplate, name: 'Cambio 1' });
    history.push({ ...initialTemplate, name: 'Cambio 2' });

    expect(history.undo().name).toBe('Cambio 1');
    history.push({ ...initialTemplate, name: 'Cambio nuevo' });

    expect(history.canRedo()).toBe(false);
    expect(history.current().name).toBe('Cambio nuevo');
  });
});
