import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { exportDashboardPdf, launchPdfBrowser } from '../pdf-export.js';

const pdfExportSource = readFileSync(new URL('../pdf-export.js', import.meta.url), 'utf8');

describe('pdf export drawing payload', () => {
  it('rejects malicious match ids before opening save dialogs or rendering PDF', async () => {
    await expect(exportDashboardPdf('../escape', {}, {})).rejects.toThrow(/match id/i);
  });

  it('loads annotated frame data urls and passes them to the print renderer', () => {
    expect(pdfExportSource).toContain("const { getAnnotatedFramesForPdf } = require('./drawings')");
    expect(pdfExportSource).toContain('const drawingFramePayload = await getAnnotatedFramesForPdf(matchId)');
    expect(pdfExportSource).toContain('drawingFrames,');
    expect(pdfExportSource).toContain('drawingFrameWarning: drawingFramePayload.warning ||');
  });

  it('uses puppeteer-core with Electron Chromium for packaged PDF export', () => {
    expect(pdfExportSource).toContain("require('puppeteer-core')");
    expect(pdfExportSource).toContain('getElectronChromiumExecutablePath');
    expect(pdfExportSource).toContain('executablePath:');
    expect(pdfExportSource).not.toContain("require('puppeteer')");
  });

  it('launches Chromium with sandbox first and uses no-sandbox only as a controlled fallback', async () => {
    const launches = [];
    const fallbackBrowser = { close: vi.fn() };
    const puppeteerImpl = {
      launch: vi.fn(async (options) => {
        launches.push(options);
        if (launches.length === 1) throw new Error('sandbox unavailable');
        return fallbackBrowser;
      }),
    };
    const warn = vi.fn();

    await expect(launchPdfBrowser({
      puppeteerImpl,
      executablePath: 'electron.exe',
      warn,
    })).resolves.toBe(fallbackBrowser);

    expect(launches[0]).toMatchObject({
      headless: 'new',
      executablePath: 'electron.exe',
      args: [],
    });
    expect(launches[1]).toMatchObject({
      headless: 'new',
      executablePath: 'electron.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('--no-sandbox'));
  });
});
