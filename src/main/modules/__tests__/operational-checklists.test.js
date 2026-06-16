import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const pdfValidationDoc = readFileSync(resolve(process.cwd(), 'docs/PDF_VALIDATION.md'), 'utf8');
const windowsInstallDoc = readFileSync(resolve(process.cwd(), 'docs/WINDOWS_INSTALL_TEST.md'), 'utf8');
const longMatchPerfDoc = readFileSync(resolve(process.cwd(), 'docs/PERFORMANCE_2H_TIMELINE.md'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

describe('operational validation checklists', () => {
  it('documents the Windows PDF visual smoke test scope', () => {
    expect(pdfValidationDoc).toContain('Portada/header');
    expect(pdfValidationDoc).toContain('KPIs');
    expect(pdfValidationDoc).toContain('graficos');
    expect(pdfValidationDoc).toContain('heatmap');
    expect(pdfValidationDoc).toContain('alertas');
    expect(pdfValidationDoc).toContain('notas');
    expect(pdfValidationDoc).toContain('paginado');
    expect(pdfValidationDoc).toContain('Puppeteer');
    expect(pdfValidationDoc).toContain('Windows');
  });

  it('documents the two hour plus timeline performance check and exposes a runnable command', () => {
    expect(packageJson.scripts['test:perf:timeline']).toBe('vitest run src/renderer/components/__tests__/timeline.test.js');
    expect(longMatchPerfDoc).toContain('2h18m');
    expect(longMatchPerfDoc).toContain('2500 eventos');
    expect(longMatchPerfDoc).toContain('render inicial');
    expect(longMatchPerfDoc).toContain('seek');
    expect(longMatchPerfDoc).toContain('scroll');
    expect(longMatchPerfDoc).toContain('playhead');
    expect(longMatchPerfDoc).toContain('hotkeys');
    expect(longMatchPerfDoc).toContain('npm run test:perf:timeline');
  });

  it('documents Windows clean install validation and build artifact checks', () => {
    expect(windowsInstallDoc).toContain('AppData');
    expect(windowsInstallDoc).toContain('Program Files');
    expect(windowsInstallDoc).toContain('Puppeteer');
    expect(windowsInstallDoc).toContain('ffmpeg');
    expect(windowsInstallDoc).toContain('preload');
    expect(windowsInstallDoc).toContain('assets');
    expect(windowsInstallDoc).toContain('sin firma de codigo');
    expect(windowsInstallDoc).toContain('npm run check:windows-build');
  });
});
