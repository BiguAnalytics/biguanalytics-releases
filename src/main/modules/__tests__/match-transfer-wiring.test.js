import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ipcSource = readFileSync(resolve(process.cwd(), 'src/main/ipc.js'), 'utf8');
const preloadSource = readFileSync(resolve(process.cwd(), 'src/main/preload.js'), 'utf8');
const homeSource = readFileSync(resolve(process.cwd(), 'src/renderer/views/home.js'), 'utf8');
const matchCardSource = readFileSync(resolve(process.cwd(), 'src/renderer/components/match-card.js'), 'utf8');
const dashboardSource = readFileSync(resolve(process.cwd(), 'src/renderer/views/dashboard.js'), 'utf8');
const taggingSource = readFileSync(resolve(process.cwd(), 'src/renderer/views/tagging.js'), 'utf8');
const settingsSource = readFileSync(resolve(process.cwd(), 'src/renderer/views/settings.js'), 'utf8');
const docsSource = readFileSync(resolve(process.cwd(), 'docs/UPDATE_SAFETY.md'), 'utf8');

describe('match transfer wiring', () => {
  it('exposes export, import and backup through secure IPC only', () => {
    expect(ipcSource).toContain("lazyRequire('./modules/match-transfer')");
    expect(ipcSource).toContain("ipcMain.handle('matches:exportArchive'");
    expect(ipcSource).toContain("ipcMain.handle('matches:selectImportArchive'");
    expect(ipcSource).toContain("ipcMain.handle('matches:importArchive'");
    expect(ipcSource).toContain("ipcMain.handle('backup:exportLocal'");
    expect(preloadSource).toContain("exportArchive: (id) => ipcRenderer.invoke('matches:exportArchive', id)");
    expect(preloadSource).toContain("selectImportArchive: () => ipcRenderer.invoke('matches:selectImportArchive')");
    expect(preloadSource).toContain("importArchive: (filePath, options) => ipcRenderer.invoke('matches:importArchive', filePath, options)");
    expect(preloadSource).toContain("exportLocal: () => ipcRenderer.invoke('backup:exportLocal')");
    expect(preloadSource).not.toContain('fs.');
    expect(preloadSource).not.toContain('process.env');
  });

  it('adds Home import and per-match export actions', () => {
    expect(homeSource).toContain("import { openModal } from '../components/modal.js';");
    expect(homeSource).toContain('handleImportMatch');
    expect(homeSource).toContain('handleExportMatch');
    expect(homeSource).toContain("Importar partido");
    expect(homeSource).toContain('window.api.matches.selectImportArchive()');
    expect(homeSource).toContain('window.api.matches.importArchive');
    expect(homeSource).toContain('duplicateStrategy');
    expect(homeSource).toContain('refreshHomeData(homeRoot.parentElement || homeRoot)');
    expect(homeSource).toContain('El video no se incluye en el export');
    expect(matchCardSource).toContain('EXPORT_ICON');
    expect(matchCardSource).toContain('match-card-export');
    expect(matchCardSource).toContain('onExport');
    expect(matchCardSource).toContain('Exportar partido');
  });

  it('adds active-match export actions to Tagging and Dashboard topbars', () => {
    expect(taggingSource).toContain("{ id: 'export-match', label: 'Exportar partido' }");
    expect(taggingSource).toContain('exportCurrentMatch');
    expect(taggingSource).toContain('window.api.matches.exportArchive(match.id)');
    expect(dashboardSource).toContain("{ id: 'export-match', label: 'Exportar partido' }");
    expect(dashboardSource).toContain('exportMatchArchive');
    expect(dashboardSource).toContain('window.api.matches.exportArchive(state.match.id)');
  });

  it('adds full local backup export to Settings and documents update safety', () => {
    expect(settingsSource).toContain('Exportar backup local');
    expect(settingsSource).toContain('data-local-backup-export');
    expect(settingsSource).toContain('window.api.backup.exportLocal()');
    expect(docsSource).toContain('Instalar una version nueva encima no debe borrar AppData');
    expect(docsSource).toContain('Nunca borrar datos locales en una actualizacion automatica o manual');
    expect(docsSource).toContain('No se exportan sesiones, tokens ni secretos');
  });
});
