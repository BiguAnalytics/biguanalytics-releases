import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  PDF_TEMPLATE_EDITOR_WALKTHROUGH_COMPLETED_FLAG,
  PDF_TEMPLATE_EDITOR_WALKTHROUGH_STEPS,
  buildPdfTemplateEditorWalkthroughCompletedSettings,
  buildPdfTemplateEditorWalkthroughResetSettings,
  getPdfTemplateEditorWalkthroughSettings,
  isPdfTemplateEditorWalkthroughCompleted,
  shouldShowPdfTemplateEditorWalkthrough,
} from '../pdf-template-walkthrough.js';

describe('PDF template editor walkthrough state', () => {
  it('uses a local pdfTemplateEditor walkthrough completion key', () => {
    expect(PDF_TEMPLATE_EDITOR_WALKTHROUGH_COMPLETED_FLAG).toBe('pdfTemplateEditor.walkthrough.completed');
    expect(getPdfTemplateEditorWalkthroughSettings({})).toEqual({ completed: false });
  });

  it('appears only before completion unless explicitly forced', () => {
    expect(shouldShowPdfTemplateEditorWalkthrough({})).toBe(true);
    expect(shouldShowPdfTemplateEditorWalkthrough({
      pdfTemplateEditor: { walkthrough: { completed: true } },
    })).toBe(false);
    expect(shouldShowPdfTemplateEditorWalkthrough({
      pdfTemplateEditor: { walkthrough: { completed: true } },
    }, { force: true })).toBe(true);
  });

  it('marks finish and skip as completed, and reset makes it eligible again', () => {
    const completed = buildPdfTemplateEditorWalkthroughCompletedSettings({});

    expect(isPdfTemplateEditorWalkthroughCompleted(completed)).toBe(true);
    expect(buildPdfTemplateEditorWalkthroughResetSettings(completed).pdfTemplateEditor.walkthrough.completed).toBe(false);
  });

  it('defines the requested eight-step editor tutorial with real targets', () => {
    expect(PDF_TEMPLATE_EDITOR_WALKTHROUGH_STEPS.map(step => step.id)).toEqual([
      'intro',
      'library',
      'page',
      'move-resize',
      'properties',
      'add-page',
      'save',
      'preview-export',
    ]);
    expect(PDF_TEMPLATE_EDITOR_WALKTHROUGH_STEPS).toHaveLength(8);
    PDF_TEMPLATE_EDITOR_WALKTHROUGH_STEPS.forEach((step) => {
      expect(step.title).toBeTruthy();
      expect(step.description).toBeTruthy();
      expect(Array.isArray(step.targetIds)).toBe(true);
    });
  });
});

describe('PDF template editor walkthrough integration', () => {
  const editorSource = readFileSync(new URL('../../views/pdf-template-editor.js', import.meta.url), 'utf8');
  const gridSource = readFileSync(new URL('../pdf-template-grid.js', import.meta.url), 'utf8');
  const targetSource = `${editorSource}\n${gridSource}`;
  const settingsSource = readFileSync(new URL('../../views/settings.js', import.meta.url), 'utf8');
  const editorCss = readFileSync(new URL('../../../styles/components/pdf-template-editor.css', import.meta.url), 'utf8');

  it('marks editor UI targets and exposes a restart action in the editor', () => {
    [
      'pdf-template-editor-root',
      'pdf-template-block-library',
      'pdf-template-page-grid',
      'pdf-template-block',
      'pdf-template-properties',
      'pdf-template-add-page',
      'pdf-template-save',
      'pdf-template-preview',
    ].forEach((targetId) => {
      expect(targetSource).toContain(`data-tour-id="${targetId}"`);
    });
    expect(editorSource).toContain('data-editor-walkthrough');
    expect(editorSource).toContain('Ver tutorial de nuevo');
  });

  it('exposes a reset action from Settings without Supabase storage', () => {
    expect(settingsSource).toContain('data-pdf-template-walkthrough-restart');
    expect(settingsSource).toContain('buildPdfTemplateEditorWalkthroughResetSettings');
    expect(settingsSource).not.toContain('supabase');
  });

  it('uses the existing overlay system and recalculates position from target bounds', () => {
    expect(editorCss).toContain('.pdf-template-library-category');
    expect(editorCss).toContain('.pdf-template-library-description');
    expect(editorCss).toContain('.pdf-template-technical-name');
    expect(editorCss).toContain('cursor: pointer');
  });
});
