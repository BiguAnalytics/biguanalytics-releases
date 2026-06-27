import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { DEFAULT_PDF_TEMPLATE } from '../default-template.js';
import { GRID_COLUMNS, GRID_ROWS } from '../pdf-blocks.js';
import { PDF_BLOCK_TYPES } from '../pdf-block-registry.js';

const require = createRequire(import.meta.url);
const mainTemplates = require('../../../main/modules/pdf-templates.js');

function pageBounds(page) {
  const blocks = page.blocks || [];
  return blocks.reduce((bounds, block) => ({
    minX: Math.min(bounds.minX, block.x),
    minY: Math.min(bounds.minY, block.y),
    maxX: Math.max(bounds.maxX, block.x + block.w),
    maxY: Math.max(bounds.maxY, block.y + block.h),
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });
}

describe('default PDF template', () => {
  it('keeps renderer and main-process system templates in sync', () => {
    expect(mainTemplates.DEFAULT_PDF_TEMPLATE).toEqual(DEFAULT_PDF_TEMPLATE);
  });

  it('uses every available block in two full-width blocks per PDF page', () => {
    const rowCount = GRID_ROWS[DEFAULT_PDF_TEMPLATE.orientation];
    const usedTypes = new Set(DEFAULT_PDF_TEMPLATE.pages.flatMap(page => page.blocks.map(block => block.type)));

    expect([...usedTypes].sort()).toEqual([...PDF_BLOCK_TYPES].sort());
    DEFAULT_PDF_TEMPLATE.pages.forEach((page) => {
      const bounds = pageBounds(page);
      expect(page.blocks.length).toBeLessThanOrEqual(2);
      expect(bounds).toEqual({
        minX: 0,
        minY: 0,
        maxX: GRID_COLUMNS,
        maxY: rowCount,
      });
      page.blocks.forEach((block) => {
        expect(block.x).toBe(0);
        expect(block.w).toBe(GRID_COLUMNS);
      });
    });
  });

  it('keeps the default events table compact enough for a half-page PDF block', () => {
    const eventsTable = DEFAULT_PDF_TEMPLATE.pages
      .flatMap(page => page.blocks)
      .find(block => block.type === 'events-table');

    expect(eventsTable?.settings?.maxRows).toBeLessThanOrEqual(12);
  });
});
