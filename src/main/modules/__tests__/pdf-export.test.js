import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const pdfExportModule = require('../pdf-export.js');
const {
  exportDashboardPdf,
  renderDashboardPdfBuffer,
  savePdfBuffer,
} = pdfExportModule;

const pdfExportSource = readFileSync(new URL('../pdf-export.js', import.meta.url), 'utf8');

describe('pdf export drawing payload', () => {
  it('rejects malicious match ids before opening save dialogs or rendering PDF', async () => {
    await expect(exportDashboardPdf('../escape', {}, {})).rejects.toThrow(/match id/i);
  });

  it('loads annotated frame data urls and passes them to the print renderer', () => {
    expect(pdfExportSource).toContain("const { getAnnotatedFramesForPdf } = require('./drawings')");
    expect(pdfExportSource).toContain('await getAnnotatedFramesForPdf(matchId)');
    expect(pdfExportSource).toContain('drawingFrames,');
    expect(pdfExportSource).toContain('drawingFrameWarning: drawingFramePayload.warning ||');
  });

  it('uses a hidden Electron BrowserWindow and printToPDF instead of Puppeteer CDP targets', () => {
    expect(pdfExportSource).toContain('webContents.printToPDF');
    expect(pdfExportSource).toContain('show: false');
    expect(pdfExportSource).toContain('sandbox: true');
    expect(pdfExportSource).not.toContain("require('puppeteer-core')");
    expect(pdfExportSource).not.toContain("require('puppeteer')");
    expect(pdfExportSource).not.toContain('Target.createTarget');
    expect(pdfExportSource).not.toContain('.newPage(');
  });

  it('renders a PDF buffer with a hidden Electron BrowserWindow', async () => {
    const instances = [];
    class FakeBrowserWindow {
      constructor(options) {
        this.options = options;
        this.closed = false;
        this.loadedFile = '';
        this.webContents = {
          executeJavaScript: vi.fn(async () => ({ ready: true, pageCount: 1 })),
          printToPDF: vi.fn(async () => Buffer.from('%PDF-1.7\n%%EOF')),
        };
        instances.push(this);
      }

      async loadFile(filePath) {
        this.loadedFile = filePath;
      }

      close() {
        this.closed = true;
      }
    }

    const pdfBuffer = await renderDashboardPdfBuffer(
      { stats: { match: { homeTeam: 'Bigua', awayTeam: 'Rival' } } },
      {
        BrowserWindow: FakeBrowserWindow,
        printFile: 'C:\\app\\src\\renderer\\dashboard-print.html',
      },
    );

    expect(pdfBuffer.toString('utf8')).toContain('%PDF');
    expect(instances).toHaveLength(1);
    expect(instances[0].options).toMatchObject({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    expect(instances[0].loadedFile).toBe('C:\\app\\src\\renderer\\dashboard-print.html');
    expect(instances[0].webContents.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('window.renderDashboardPrint'), true);
    expect(instances[0].webContents.printToPDF).toHaveBeenCalledWith(expect.objectContaining({
      landscape: true,
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    }));
    expect(instances[0].closed).toBe(true);
  });

  it('wraps PDF write failures with a clear message', async () => {
    const writeError = new Error('EACCES: permission denied');
    const fsImpl = {
      mkdir: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {
        throw writeError;
      }),
    };

    await expect(savePdfBuffer(
      'C:\\blocked\\reporte.pdf',
      Buffer.from('%PDF-1.7\n%%EOF'),
      fsImpl,
    )).rejects.toThrow(/No se pudo guardar el PDF/);

    expect(fsImpl.mkdir).toHaveBeenCalledWith('C:\\blocked', { recursive: true });
    expect(fsImpl.writeFile).toHaveBeenCalledWith('C:\\blocked\\reporte.pdf', expect.any(Buffer));
  });

  it('exports a dashboard PDF file without launching an external Chromium process', async () => {
    const instances = [];
    class FakeBrowserWindow {
      constructor() {
        this.webContents = {
          executeJavaScript: vi.fn(async () => ({ ready: true, pageCount: 1 })),
          printToPDF: vi.fn(async () => Buffer.from('%PDF-1.7\nBigua 21 - 17 Rival\n%%EOF')),
        };
        instances.push(this);
      }

      async loadFile() {}
      close() {}
    }
    const fileWrites = [];
    const fsImpl = {
      mkdir: vi.fn(async () => {}),
      writeFile: vi.fn(async (filePath, buffer) => {
        fileWrites.push({ filePath, buffer });
      }),
    };
    const dialog = {
      showSaveDialog: vi.fn(async () => ({
        canceled: false,
        filePath: 'C:\\exports\\Bigua-vs-Rival-2026-06-16.pdf',
      })),
    };

    const result = await exportDashboardPdf('match-pdf-smoke', {}, {
      dialog,
      browserWindow: null,
      BrowserWindow: FakeBrowserWindow,
      fsImpl,
      data: {
        match: {
          id: 'match-pdf-smoke',
          homeTeam: 'Bigua',
          awayTeam: 'Rival',
          date: '2026-06-16',
          competition: 'Test',
          events: [],
          sequences: [],
          possession: [],
          coachNotes: 'Nota del entrenador',
        },
        settings: {},
        drawingFramePayload: [],
      },
    });

    expect(result).toEqual({
      canceled: false,
      filePath: 'C:\\exports\\Bigua-vs-Rival-2026-06-16.pdf',
    });
    expect(instances).toHaveLength(1);
    expect(fileWrites[0].buffer.toString('utf8')).toContain('%PDF');
  });

  it('passes four-sector heatmap stats to the PDF print renderer for legacy zones', async () => {
    const renderScripts = [];
    class FakeBrowserWindow {
      constructor() {
        this.webContents = {
          executeJavaScript: vi.fn(async (script) => {
            renderScripts.push(script);
            return { ready: true, pageCount: 1 };
          }),
          printToPDF: vi.fn(async () => Buffer.from('%PDF-1.7\n%%EOF')),
        };
      }

      async loadFile() {}
      close() {}
    }
    const fsImpl = {
      mkdir: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {}),
    };
    const dialog = {
      showSaveDialog: vi.fn(async () => ({
        canceled: false,
        filePath: 'C:\\exports\\heatmap.pdf',
      })),
    };

    await exportDashboardPdf('match-pdf-heatmap', {}, {
      dialog,
      browserWindow: null,
      BrowserWindow: FakeBrowserWindow,
      fsImpl,
      data: {
        match: {
          id: 'match-pdf-heatmap',
          homeTeam: 'Bigua',
          awayTeam: 'Rival',
          date: '2026-06-16',
          events: [{ type: 'ruck', team: 'home', result: 'ganado', timestamp: 12, zone: 'Z13' }],
          sequences: [],
          possession: [],
        },
        settings: {},
        drawingFramePayload: [],
      },
    });

    expect(renderScripts.join('\n')).toContain('"opp_22"');
    expect(renderScripts.join('\n')).toContain('"22 rival"');
  });
});
