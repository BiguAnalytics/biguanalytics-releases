import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardPrintSource = readFileSync(new URL('../dashboard-print.js', import.meta.url), 'utf8');
const dashboardPrintCss = readFileSync(new URL('../dashboard-print.css', import.meta.url), 'utf8');

describe('dashboard print annotated frames', () => {
  it('labels additive manual score adjustments consistently in PDF exports', () => {
    expect(dashboardPrintSource).toContain("if (source === 'events-manual') return 'Eventos + ajuste manual';");
  });

  it('places annotated frames in the print section that matches the event type', () => {
    expect(dashboardPrintSource).toContain('function frameSectionId(frame)');
    expect(dashboardPrintSource).toContain('function framesForSection(frames, sectionId)');
    expect(dashboardPrintSource).toContain("chartBlock('Rucks', chartImages.rucks, framesForSection(drawingFrames, 'rucks'))");
    expect(dashboardPrintSource).toContain("chartBlock('Disciplina', chartImages.discipline, framesForSection(drawingFrames, 'discipline'))");
    expect(dashboardPrintSource).toContain("chartBlock('Break Lines', chartImages.breakLines, framesForSection(drawingFrames, 'break-lines'))");
    expect(dashboardPrintSource).toContain("chartBlock('Custom', chartImages.customEvents, framesForSection(drawingFrames, 'custom-events'))");
    expect(dashboardPrintSource).not.toContain('pages.push(annotatedFramesPage(payload.drawingFrames || []));');
  });

  it('renders a clear PDF warning when annotated frames are omitted by export limits', () => {
    expect(dashboardPrintSource).toContain('function frameLimitWarning(payload)');
    expect(dashboardPrintSource).toContain('payload.drawingFrameWarning');
    expect(dashboardPrintSource).toContain('print-frame-limit-warning');
  });

  it('includes the Bigua logo and exposes a PDF readiness flag after assets load', () => {
    expect(dashboardPrintSource).toContain('assets/bigu-logo.svg');
    expect(dashboardPrintSource).toContain('window.__BIGU_PDF_READY__');
    expect(dashboardPrintSource).toContain('function waitForPdfAssets');
    expect(dashboardPrintSource).toContain('document.fonts.ready');
  });

  it('renders custom PDF template layouts when present and falls back to the legacy default', () => {
    expect(dashboardPrintSource).toContain("import { DEFAULT_PDF_TEMPLATE } from './pdf/default-template.js';");
    expect(dashboardPrintSource).toContain("import { renderPdfTemplatePages, validateTemplateLayout } from './pdf/pdf-blocks.js';");
    expect(dashboardPrintSource).toContain('payload.pdfTemplateLayout');
    expect(dashboardPrintSource).toContain('renderPdfTemplatePages(payload, templateLayout)');
    expect(dashboardPrintSource).toContain('renderLegacyDashboardPrint(payload)');
    expect(dashboardPrintSource).toContain('validateTemplateLayout(templateLayout)');
  });

  it('lets Electron control PDF orientation and fills each printed sheet', () => {
    expect(dashboardPrintCss).not.toMatch(/@page\s*{[^}]*size\s*:/s);
    expect(dashboardPrintCss).toMatch(/@page\s*{[^}]*margin:\s*0;/s);
    expect(dashboardPrintCss).toMatch(/\.print-template-page\s*{[^}]*min-height:\s*210mm;/s);
    expect(dashboardPrintCss).toMatch(/\.print-template-page\s*{[^}]*height:\s*210mm;[^}]*max-height:\s*210mm;[^}]*overflow:\s*hidden;/s);
    expect(dashboardPrintCss).toMatch(/\.print-template-portrait\s*{[^}]*min-height:\s*297mm;/s);
    expect(dashboardPrintCss).toMatch(/\.print-template-portrait\s*{[^}]*height:\s*297mm;[^}]*max-height:\s*297mm;/s);
    expect(dashboardPrintCss).toMatch(/\.print-template-chart-layout\s*{[^}]*overflow:\s*hidden;/s);
    expect(dashboardPrintCss).toMatch(/\.print-template-chart-visual\s*{[^}]*overflow:\s*hidden;/s);
    expect(dashboardPrintCss).toMatch(/\.print-template-chart-visual img\s*{[^}]*height:\s*100%;[^}]*object-fit:\s*contain;/s);
    expect(dashboardPrintCss).toMatch(/\.print-template-comparison-list span\s*{[^}]*min-height:\s*22px;[^}]*font:\s*900 9px/s);
    expect(dashboardPrintCss).toMatch(/\.print-template-block \.print-table th,\s*\.print-template-block \.print-table td\s*{[^}]*padding:\s*4px 6px;/s);
  });
});
