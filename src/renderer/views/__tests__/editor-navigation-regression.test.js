import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pdfEditorSource = readFileSync(new URL('../pdf-template-editor.js', import.meta.url), 'utf8');
const tacticalBoardSource = readFileSync(new URL('../tactical-board.js', import.meta.url), 'utf8');

function getTopbarSetup(source, nextMarker) {
  const start = source.indexOf('setTopbarActions(');
  const end = source.indexOf(nextMarker, start);
  return source.slice(start, end < 0 ? source.length : end);
}

describe('editor view navigation regressions', () => {
  it('offers a direct Inicio action from the PDF template editor', () => {
    const topbarSetup = getTopbarSetup(pdfEditorSource, '  container.innerHTML =');

    expect(topbarSetup).toMatch(/\{\s*id:\s*'home',\s*label:\s*'Inicio'\s*\}/s);
    expect(topbarSetup).toContain("navigate('home')");
  });

  it('offers a direct Inicio action from the tactical board', () => {
    const topbarSetup = getTopbarSetup(tacticalBoardSource, '  let disposed = false;');

    expect(topbarSetup).toMatch(/\{\s*id:\s*'home',\s*label:\s*'Inicio'\s*\}/s);
    expect(topbarSetup).toContain("navigate('home')");
  });

  it('keeps PDF template export and preview tied to the current template draft', () => {
    expect(pdfEditorSource).toContain('const result = await window.api.pdfTemplates.export(id);');
    expect(pdfEditorSource).toContain('templateId: draft.id');
    expect(pdfEditorSource).toContain('pdfTemplateLayout: draft');
  });

  it('keeps tactical PNG export and sequence playback wired to persisted frames', () => {
    expect(tacticalBoardSource).toContain('await window.api.tacticalBoards.exportPng(await editor.getCompositeDataUrl(), `${activeBoard?.name || \'secuencia\'}.png`);');
    expect(tacticalBoardSource).toContain('const frames = snapshotActiveFrame();');
    expect(tacticalBoardSource).toContain('playbackAnimationFrame = window.requestAnimationFrame(playbackTick);');
    expect(tacticalBoardSource).toContain('await flushActiveFrameSnapshot();');
  });
});
