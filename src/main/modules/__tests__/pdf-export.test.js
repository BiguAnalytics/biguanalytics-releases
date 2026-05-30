import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pdfExportSource = readFileSync(new URL('../pdf-export.js', import.meta.url), 'utf8');

describe('pdf export drawing payload', () => {
  it('loads annotated frame data urls and passes them to the print renderer', () => {
    expect(pdfExportSource).toContain("const { getAnnotatedFramesForPdf } = require('./drawings')");
    expect(pdfExportSource).toContain('const drawingFrames = await getAnnotatedFramesForPdf(matchId)');
    expect(pdfExportSource).toContain('drawingFrames,');
  });

  it('uses puppeteer-core with Electron Chromium for packaged PDF export', () => {
    expect(pdfExportSource).toContain("require('puppeteer-core')");
    expect(pdfExportSource).toContain('getElectronChromiumExecutablePath');
    expect(pdfExportSource).toContain('executablePath:');
    expect(pdfExportSource).not.toContain("require('puppeteer')");
  });
});
