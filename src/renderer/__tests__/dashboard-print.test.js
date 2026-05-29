import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardPrintSource = readFileSync(new URL('../dashboard-print.js', import.meta.url), 'utf8');

describe('dashboard print annotated frames', () => {
  it('places annotated frames in the print section that matches the event type', () => {
    expect(dashboardPrintSource).toContain('function frameSectionId(frame)');
    expect(dashboardPrintSource).toContain('function framesForSection(frames, sectionId)');
    expect(dashboardPrintSource).toContain("chartBlock('Rucks', chartImages.rucks, framesForSection(drawingFrames, 'rucks'))");
    expect(dashboardPrintSource).toContain("chartBlock('Disciplina', chartImages.discipline, framesForSection(drawingFrames, 'discipline'))");
    expect(dashboardPrintSource).toContain("chartBlock('Break Lines', chartImages.breakLines, framesForSection(drawingFrames, 'break-lines'))");
    expect(dashboardPrintSource).not.toContain('pages.push(annotatedFramesPage(payload.drawingFrames || []));');
  });
});
