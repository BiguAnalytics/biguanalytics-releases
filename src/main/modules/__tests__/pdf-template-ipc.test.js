import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const ipcSource = readFileSync(new URL('../../ipc.js', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../../preload.js', import.meta.url), 'utf8');
const pdfExportSource = readFileSync(new URL('../pdf-export.js', import.meta.url), 'utf8');

describe('pdf template IPC wiring', () => {
  it('exposes all PDF template operations through secure IPC and preload APIs', () => {
    [
      'pdfTemplates:list',
      'pdfTemplates:get',
      'pdfTemplates:create',
      'pdfTemplates:update',
      'pdfTemplates:delete',
      'pdfTemplates:duplicate',
      'pdfTemplates:setDefault',
      'pdfTemplates:export',
      'pdfTemplates:import',
    ].forEach(channel => {
      expect(ipcSource).toContain(`ipcMain.handle('${channel}'`);
      expect(preloadSource).toContain(`ipcRenderer.invoke('${channel}'`);
    });

    expect(preloadSource).toContain('pdfTemplates: {');
    expect(ipcSource).toContain("lazyRequire('./modules/pdf-templates')");
  });

  it('passes templateId through analytics PDF export and exposes a preview PDF IPC', () => {
    expect(ipcSource).toContain("ipcMain.handle('analytics:previewPdf'");
    expect(preloadSource).toContain("previewPdf: (matchId, printPayload)");
    expect(preloadSource).toContain("ipcRenderer.invoke('analytics:previewPdf'");
    expect(pdfExportSource).toContain('printPayload.templateId');
    expect(pdfExportSource).toContain('resolveForExport(printPayload.templateId');
    expect(pdfExportSource).toContain('pdfTemplateLayout');
  });
});
