import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const dashboardPrintSource = readFileSync(new URL('../dashboard-print.js', import.meta.url), 'utf8');
const dashboardPrintCss = readFileSync(new URL('../dashboard-print.css', import.meta.url), 'utf8');

describe('dashboard print license watermark', () => {
  it('renders a licensed footer with club, user email and slug', () => {
    expect(dashboardPrintSource).toContain('printLicenseWatermark');
    expect(dashboardPrintSource).toContain('BiguAnalytics · Licenciado a');
    expect(dashboardPrintSource).toContain('payload.license');
    expect(dashboardPrintSource).toContain('clubSlug');
    expect(dashboardPrintSource).toContain('userEmail');
    expect(dashboardPrintCss).toContain('.print-license-watermark');
  });
});
