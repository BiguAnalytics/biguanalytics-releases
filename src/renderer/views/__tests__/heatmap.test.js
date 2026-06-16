import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const heatmapUrl = new URL('../heatmap.js', import.meta.url);

describe('heatmap route wrapper', () => {
  it('reuses Dashboard heatmap rendering without creating a dead placeholder', () => {
    expect(existsSync(heatmapUrl)).toBe(true);

    const source = readFileSync(heatmapUrl, 'utf8');
    expect(source).toContain("import { renderDashboard } from './dashboard.js';");
    expect(source).toContain('export function renderHeatmap');
    expect(source).toContain("focusSection: 'heatmap'");
    expect(source).not.toContain('under-construction');
  });
});
