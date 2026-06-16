import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editorSource = readFileSync(new URL('../drawing-editor.js', import.meta.url), 'utf8');
const editorCss = readFileSync(new URL('../../../styles/components/drawing-editor.css', import.meta.url), 'utf8');
const taggingSource = readFileSync(new URL('../../views/tagging.js', import.meta.url), 'utf8');
const timelineSource = readFileSync(new URL('../timeline.js', import.meta.url), 'utf8');

describe('drawing editor sequences', () => {
  it('adds sequence stages, playback preview and sequence save copy to the drawing editor', () => {
    expect(editorSource).toContain('sequenceMode');
    expect(editorSource).toContain('drawing-sequence-strip');
    expect(editorSource).toContain('data-sequence-add');
    expect(editorSource).toContain('data-sequence-duplicate');
    expect(editorSource).toContain('data-sequence-delete');
    expect(editorSource).toContain('data-sequence-preview');
    expect(editorSource).toContain('Guardar secuencia');
    expect(editorSource).toContain('payload.steps = getSerializableSteps();');
  });

  it('styles sequence controls as compact glassy timeline controls with pointer affordances', () => {
    expect(editorCss).toContain('.drawing-sequence-strip');
    expect(editorCss).toContain('.drawing-sequence-step');
    expect(editorCss).toContain('.drawing-sequence-step.active');
    expect(editorCss).toMatch(/\.drawing-sequence-(?:step|control)[^{]*{[^}]*cursor:\s*pointer;/s);
    expect(editorCss).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('saves live drawings from tagging with sequence steps and replays active stage strokes', () => {
    expect(taggingSource).toContain('sequenceMode: true');
    expect(taggingSource).toContain('steps: payload.steps');
    expect(taggingSource).toContain('getLiveDrawingStrokesAtTime(drawing, getVisualCurrentTime())');
    expect(taggingSource).toContain('drawStrokes(ctx, getLiveDrawingStrokesAtTime');
  });

  it('previews and overlays sequences as animated motion frames instead of stage jumps', () => {
    expect(editorSource).toContain('requestAnimationFrame');
    expect(editorSource).toContain('getDrawingSequenceStrokesAtTime({ steps: state.steps }');
    expect(taggingSource).toContain('redrawLiveDrawingCanvases(overlay, activeDrawings);');
    expect(taggingSource).toContain('liveDrawingAnimationFrame');
    expect(taggingSource).toContain('requestAnimationFrame(renderLiveDrawingAnimationFrame)');
  });

  it('exposes non-mutating preview and locked editing APIs for playback surfaces', () => {
    expect(editorSource).toContain('previewStrokes');
    expect(editorSource).toContain('setPreviewStrokes(strokes)');
    expect(editorSource).toContain('clearPreview()');
    expect(editorSource).toContain('setLocked(locked)');
    expect(editorSource).toContain("drawing-editor-shell--locked");
    expect(editorSource).toContain('loadDrawing(drawing = {})');
  });

  it('labels timeline drawing blocks as sequences with stage counts', () => {
    expect(timelineSource).toContain('getDrawingStepCount');
    expect(timelineSource).toContain('Secuencia');
    expect(timelineSource).toContain('timeline-drawing-step-count');
  });
});
