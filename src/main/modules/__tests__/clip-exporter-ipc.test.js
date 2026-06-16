import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ipcSource = readFileSync(new URL('../../ipc.js', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../../preload.js', import.meta.url), 'utf8');

describe('clip exporter IPC wiring', () => {
  it('registers clip export handlers and renderer progress events', () => {
    expect(ipcSource).toContain("lazyRequire('./modules/clip-exporter')");
    expect(ipcSource).toContain("ipcMain.handle('clips:export-single'");
    expect(ipcSource).toContain("ipcMain.handle('clips:export-batch'");
    expect(ipcSource).toContain("ipcMain.handle('clips:cancel-export'");
    expect(ipcSource).toContain("e.sender.send('clips:export-progress'");
    expect(ipcSource).toContain("e.sender.send('clips:export-complete'");
    expect(ipcSource).toContain("e.sender.send('clips:export-error'");

    expect(preloadSource).toContain('exportSingle: (payload)');
    expect(preloadSource).toContain('exportBatch: (payload)');
    expect(preloadSource).toContain('cancelExport: ()');
    expect(preloadSource).toContain("ipcRenderer.invoke('clips:cancel-export')");
  });
});
