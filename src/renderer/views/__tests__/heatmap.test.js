import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../dashboard.js', import.meta.url), 'utf8');

describe('heatmap dashboard-only integration', () => {
  it('does not expose Heatmap as a standalone route while preserving dashboard heatmap analytics', () => {
    expect(routerSource).not.toContain("import { renderHeatmap } from './views/heatmap.js';");
    expect(routerSource).not.toContain('heatmap: renderHeatmap');
    expect(dashboardSource).toContain("['heatmap', 'Heatmap']");
    expect(dashboardSource).toContain('function renderHeatmap');
    expect(dashboardSource).toContain('<svg id="dashboard-heatmap"');
  });

  it('keeps exported heatmap text styling in attributes instead of an inline SVG style element', () => {
    expect(dashboardSource).not.toContain('    <style>');
    expect(dashboardSource).toContain('class="heatmap-zone-number"');
    expect(dashboardSource).toContain('style="fill: color-mix');
  });
});
