import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('../../components/sidebar.js', import.meta.url), 'utf8');
const tacticalSource = readFileSync(new URL('../tactical-board.js', import.meta.url), 'utf8');
const drawingEditorSource = readFileSync(new URL('../../components/drawing-editor.js', import.meta.url), 'utf8');
const tacticalCss = readFileSync(new URL('../../../styles/components/tactical-board.css', import.meta.url), 'utf8');

describe('tactical board view', () => {
  it('adds a standalone tactical board route and sidebar entry', () => {
    expect(routerSource).toContain("import { renderTacticalBoard } from './views/tactical-board.js'");
    expect(routerSource).toContain('tactical: renderTacticalBoard');
    expect(sidebarSource).toContain("{ id: 'tactical'");
    expect(sidebarSource).toContain('pencil');
  });

  it('renders the drawing canvas, toolbar and saved board library', () => {
    expect(tacticalSource).toContain('window.api.tacticalBoards.list');
    expect(drawingEditorSource).toContain("['arrow', 'Flecha', '->']");
    expect(drawingEditorSource).toContain("['rect', 'Rectangulo', '[]']");
    expect(drawingEditorSource).toContain("['freehand', 'Trazo libre', '~']");
    expect(drawingEditorSource).toContain("['eraser', 'Borrador', 'X']");
    expect(drawingEditorSource).toContain("['eraser', 'Borrador'");
    expect(tacticalSource).toContain('data-board-new');
    expect(tacticalSource).toContain('data-board-rename');
    expect(tacticalSource).toContain('data-board-delete');
    expect(tacticalSource).toContain('data-board-export');
    expect(tacticalCss).toContain('grid-template-columns: minmax(0, 1fr) 200px');
  });

  it('renames boards inline and supports right-click deletion from the library', () => {
    expect(tacticalSource).toContain("label.addEventListener('dblclick'");
    expect(tacticalSource).toContain("input.className = 'tactical-board-name-input'");
    expect(tacticalSource).toContain("item.addEventListener('contextmenu'");
    expect(tacticalSource).not.toContain('window.prompt');
    expect(tacticalCss).toContain('.tactical-board-name-input');
  });
});
