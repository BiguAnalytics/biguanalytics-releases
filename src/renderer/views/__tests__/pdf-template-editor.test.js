import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../../../main/preload.js', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../pdf-template-editor.js', import.meta.url), 'utf8');
const gridSource = readFileSync(new URL('../../components/pdf-template-grid.js', import.meta.url), 'utf8');
const editorCss = readFileSync(new URL('../../../styles/components/pdf-template-editor.css', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../dashboard.js', import.meta.url), 'utf8');

describe('PDF template editor renderer', () => {
  it('registers the PDF templates route and stylesheet', () => {
    expect(routerSource).toContain("import { renderPdfTemplateEditor } from './views/pdf-template-editor.js';");
    expect(routerSource).toContain("pdfTemplates: renderPdfTemplateEditor");
    expect(indexHtml).toContain('../styles/components/pdf-template-editor.css');
  });

  it('renders the template manager and visual editor controls', () => {
    expect(editorSource).toContain('Plantillas PDF');
    expect(editorSource).toContain('data-template-create');
    expect(editorSource).toContain('data-template-duplicate');
    expect(editorSource).toContain('data-template-rename');
    expect(editorSource).toContain('data-template-delete');
    expect(editorSource).toContain('data-template-default');
    expect(editorSource).toContain('data-template-import');
    expect(editorSource).toContain('data-template-export');
    expect(editorSource).toContain('data-template-open-editor');
    expect(editorSource).toContain('Guardar plantilla');
    expect(editorSource).toContain('Vista previa');
    expect(editorSource).toContain('Bloques');
    expect(editorSource).toContain('Propiedades');
  });

  it('wires drag, move and size preset behavior without external libraries', () => {
    expect(gridSource).toContain('pointerdown');
    expect(gridSource).toContain('pointermove');
    expect(gridSource).toContain('elementFromPoint');
    expect(gridSource).toContain('preventBlockOverlap');
    expect(gridSource).toContain('getResizeCandidateFromPointer');
    expect(gridSource).toContain('preventBlockResizeOverlap');
    expect(gridSource).toContain("small: { label: 'Pequeño'");
    expect(gridSource).toContain("medium: { label: 'Mediano'");
    expect(gridSource).toContain("large: { label: 'Grande'");
    expect(gridSource).toContain("full: { label: 'Ancho completo'");
    expect(gridSource).not.toContain('react-grid-layout');
  });

  it('supports keyboard undo and redo in the editor', () => {
    expect(editorSource).toContain('createPdfTemplateHistory');
    expect(editorSource).toContain("event.key.toLowerCase() === 'z'");
    expect(editorSource).toContain('event.shiftKey');
    expect(editorSource).toContain('history.undo()');
    expect(editorSource).toContain('history.redo()');
  });

  it('uses in-app template name dialogs instead of unsupported browser prompts', () => {
    expect(editorSource).not.toContain('window.prompt');
    expect(editorSource).toContain('data-template-name-dialog');
    expect(editorSource).toContain('data-template-name-input');
    expect(editorSource).toContain('openTemplateNameDialog');
    expect(editorCss).toContain('.pdf-template-name-dialog');
  });

  it('uses accented Spanish UI copy and aligns the orientation select with its label', () => {
    expect(editorSource).toContain('Orientación');
    expect(editorSource).toContain('Tamaño');
    expect(editorSource).toContain('Página');
    expect(editorSource).toContain('Métricas');
    expect(editorSource).not.toContain('Orientacion');
    expect(editorSource).not.toContain('Tamano');
    expect(editorCss).toContain('.pdf-template-orientation-field');
    expect(editorCss).toContain('grid-template-columns: auto minmax(150px, 190px)');
  });

  it('exposes template selection from Dashboard export without owning template management there', () => {
    expect(dashboardSource).toContain('data-export-template-id');
    expect(dashboardSource).toContain('templateId: state.exportTemplateId');
    expect(dashboardSource).toContain("navigate('pdfTemplates'");
    expect(dashboardSource).not.toContain('data-template-delete');
  });

  it('uses the BiguAnalytics visual system and pointer cursor for clickable editor controls', () => {
    expect(editorCss).toContain('.pdf-template-editor-view');
    expect(editorCss).toContain('var(--color-bg-surface)');
    expect(editorCss).toContain('var(--color-accent)');
    expect(editorCss).toContain('cursor: pointer');
    expect(editorCss).toContain('.pdf-template-grid-block.invalid');
    expect(editorCss).toContain('@media (max-width: 980px)');
    expect(preloadSource).toContain('pdfTemplates: {');
  });

  it('returns synchronous route cleanup for keydown, timers and walkthrough surfaces', () => {
    expect(editorSource).toContain('export function renderPdfTemplateEditor(');
    expect(editorSource).not.toContain('export async function renderPdfTemplateEditor(');
    expect(editorSource).toContain('window.clearTimeout(lifecycleState.walkthroughTimer)');
    expect(editorSource).toContain('data-pdf-template-walkthrough-root');
    expect(editorSource).toContain("window.removeEventListener('keydown'");
  });
});
