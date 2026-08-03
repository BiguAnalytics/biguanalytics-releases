import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('../../components/sidebar.js', import.meta.url), 'utf8');
const tacticalSource = readFileSync(new URL('../tactical-board.js', import.meta.url), 'utf8');
const drawingEditorSource = readFileSync(new URL('../../components/drawing-editor.js', import.meta.url), 'utf8');
const drawingEditorCss = readFileSync(new URL('../../../styles/components/drawing-editor.css', import.meta.url), 'utf8');
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
    expect(drawingEditorSource).toContain("tool: options.initialTool || 'select'");
    expect(drawingEditorSource).toContain('const TOOL_ICONS');
    expect(drawingEditorSource).toContain("['select', 'Seleccionar', 'mouse-pointer']");
    expect(drawingEditorSource).toContain("['arrow', 'Flecha', 'arrow-up-right']");
    expect(drawingEditorSource).toContain("['line', 'Linea', 'minus']");
    expect(drawingEditorSource).toContain("['ellipse', 'Circulo', 'circle']");
    expect(drawingEditorSource).toContain("['rect', 'Rectangulo', 'square']");
    expect(drawingEditorSource).toContain("['freehand', 'Trazo libre', 'pencil']");
    expect(drawingEditorSource).toContain("['player', 'Jugador', 'badge-number']");
    expect(drawingEditorSource).toContain("['ball', 'Pelota', 'rugby-ball']");
    expect(drawingEditorSource).toContain("['cone', 'Cono', 'traffic-cone']");
    expect(drawingEditorSource).not.toContain("['pad', 'Escudo', 'shield']");
    expect(drawingEditorSource).toContain("['eraser', 'Borrador', 'eraser']");
    expect(drawingEditorSource).toContain('const HOTKEYS');
    expect(drawingEditorSource).toContain("t: 'text'");
    expect(drawingEditorSource).toContain("e: 'eraser'");
    expect(drawingEditorSource).toContain('drawing-tool-letter');
    expect(drawingEditorSource).not.toContain("['arrow', 'Flecha', '->']");
    expect(drawingEditorSource).toContain('data-player-number');
    expect(drawingEditorSource).toContain('selectedStrokeIds');
    expect(drawingEditorSource).toContain('selectionRect');
    expect(drawingEditorSource).toContain("event.key === 'Backspace'");
    expect(drawingEditorSource).toContain('scaleStrokes');
    expect(drawingEditorSource).toContain('data-size-down');
    expect(drawingEditorSource).toContain('data-size-up');
    expect(drawingEditorSource).toContain('drawing-editor-stage');
    expect(drawingEditorCss).toContain('.drawing-player-field input::-webkit-inner-spin-button');
    expect(drawingEditorCss).toContain('.drawing-size-btn');
    expect(tacticalSource).toContain('data-sequence-new');
    expect(tacticalSource).toContain('data-sequence-rename');
    expect(tacticalSource).toContain('data-sequence-delete');
    expect(tacticalSource).toContain('data-board-export');
    expect(tacticalCss).toContain('grid-template-columns: minmax(0, 1fr) 280px');
  });

  it('supports explicit grow and shrink controls for selected tactical players and elements', () => {
    expect(drawingEditorSource).toContain('data-size-down');
    expect(drawingEditorSource).toContain('data-size-up');
    expect(drawingEditorSource).toContain('scaleSelection(0.85)');
    expect(drawingEditorSource).toContain('scaleSelection(1.15)');
    expect(drawingEditorSource).toContain("event.key === '['");
    expect(drawingEditorSource).toContain("event.key === ']'");
    expect(drawingEditorCss).toContain('.drawing-size-shortcut');
  });

  it('supports Canva-style corner resize handles on selected tactical elements', () => {
    expect(drawingEditorSource).toContain('drawSelectionResizeHandle');
    expect(drawingEditorSource).toContain('hitTestSelectionResizeHandle');
    expect(drawingEditorSource).toContain('scaleStrokesFromSelectionHandle');
    expect(drawingEditorSource).toContain("state.dragMode = 'resize'");
    expect(drawingEditorSource).toContain('state.selectionResizeStart');
    expect(drawingEditorSource).toContain('state.selectionResizeBounds');
    expect(drawingEditorCss).toContain('.drawing-editor-shell[data-resize-handle="true"] .drawing-editor-canvas');
    expect(drawingEditorCss).toContain('cursor: nwse-resize');
  });

  it('draws the selected resize handle as a red circle centered on the selection corner', () => {
    const handleStart = drawingEditorSource.indexOf('function drawSelectionResizeHandle');
    const handleEnd = drawingEditorSource.indexOf('function drawSelectionRect', handleStart);
    const handleSource = drawingEditorSource.slice(handleStart, handleEnd);
    const outlineStart = drawingEditorSource.indexOf('function drawSelectionOutlines');
    const outlineEnd = drawingEditorSource.indexOf('function drawSelectionResizeHandle', outlineStart);
    const outlineSource = drawingEditorSource.slice(outlineStart, outlineEnd);

    expect(drawingEditorSource).toContain('const SELECTION_OUTLINE_PADDING = 8;');
    expect(outlineSource).toContain('bounds.x - SELECTION_OUTLINE_PADDING');
    expect(outlineSource).toContain('bounds.width + SELECTION_OUTLINE_PADDING * 2');
    expect(handleSource).toContain('const x = bounds.x + bounds.width + SELECTION_OUTLINE_PADDING;');
    expect(handleSource).toContain('const y = bounds.y + bounds.height + SELECTION_OUTLINE_PADDING;');
    expect(handleSource).toContain("ctx.fillStyle = '#C8102E';");
    expect(handleSource).toContain('ctx.arc(x, y, 8, 0, Math.PI * 2);');
  });

  it('uses a high-density canvas backing store while keeping tactical coordinates logical', () => {
    expect(drawingEditorSource).toContain('const canvasPixelRatio = Math.max(1, Math.min(3, Number(window.devicePixelRatio) || 1));');
    expect(drawingEditorSource).toContain('canvas.width = Math.round(width * canvasPixelRatio);');
    expect(drawingEditorSource).toContain('canvas.height = Math.round(height * canvasPixelRatio);');
    expect(drawingEditorSource).toContain('ctx.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);');
    expect(drawingEditorSource).toContain('getCanvasPoint(canvas, event, width, height)');
    expect(drawingEditorSource).toContain('serializeDrawing(state.strokes, { width, height })');
    expect(drawingEditorSource).toContain('output.width = width;');
    expect(drawingEditorSource).toContain('output.height = height;');
  });

  it('uses SVG thumbnails for tactical cuadros so markers stay sharp in the library', () => {
    expect(tacticalSource).toContain("import { drawStrokes, serializeDrawingSvg }");
    expect(tacticalSource).toContain('return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;');
    expect(tacticalSource).toContain('generateCuadroThumbnail');
    expect(tacticalSource).toContain('serializeDrawingSvg(');
    expect(tacticalSource).not.toContain('return output.toDataURL(\'image/png\');');
  });

  it('supports static-board field options without showing live duration controls', () => {
    expect(tacticalSource).toContain('data-board-background');
    expect(tacticalSource).toContain('data-board-template');
    expect(tacticalSource).toContain('FIELD_BACKGROUNDS');
    expect(tacticalSource).toContain('FIELD_TEMPLATES');
    expect(tacticalSource).toContain("{ value: '#E8ECE6', label: 'Blanco'");
    expect(tacticalSource).toContain('const HALF_FIELD_CANVAS = { width: 1008, height: 720 };');
    expect(tacticalSource).toContain("width: template === 'full' ? DEFAULT_CANVAS.width : HALF_FIELD_CANVAS.width");
    expect(tacticalSource).toContain("height: template === 'full' ? DEFAULT_CANVAS.height : HALF_FIELD_CANVAS.height");
    expect(tacticalSource).toContain('drawGoalPosts');
    expect(tacticalSource).toContain('goalPostDepth');
    expect(tacticalSource).toContain('halfFieldMarkings');
    expect(tacticalSource).toContain('tryLine');
    expect(tacticalSource).toContain('showDuration: false');
    expect(tacticalSource).toContain('backgroundColor');
    expect(tacticalSource).toContain('fieldTemplate');
    expect(tacticalCss).toContain('.tactical-board-options');
    expect(tacticalCss).toContain('.tactical-export-btn');
    expect(tacticalCss).toContain('margin-bottom: 72px');
    expect(tacticalCss).toMatch(/\.tactical-board-view\s*{[^}]*overflow:\s*hidden;/s);
    expect(tacticalCss).toMatch(/\.tactical-canvas-frame\s*{[^}]*min-height:\s*0;/s);
  });

  it('stores tactical board drawings as playable sequences', () => {
    expect(tacticalSource).toContain('frames: nextFrames');
    expect(tacticalSource).toContain('payload?.strokes');
    expect(tacticalSource).toContain('getActiveFrame()');
  });

  it('renders a sequence library with internal cuadro navigation and playback controls', () => {
    expect(tacticalSource).toContain('Secuencias');
    expect(tacticalSource).toContain('+ Nueva secuencia');
    expect(tacticalSource).not.toContain('data-sequence-save');
    expect(tacticalSource).not.toContain('+ Nueva carpeta');
    expect(tacticalSource).not.toContain('Sin carpetas');
    expect(tacticalSource).not.toContain('Sin frames todavia');
    expect(tacticalSource).not.toContain('Crear primer frame');
    expect(tacticalSource).not.toContain('Duplica un frame');
    expect(tacticalSource).toContain('Sin secuencias');
    expect(tacticalSource).toContain('Sin cuadros todavía');
    expect(tacticalSource).toContain('Crear primer cuadro');
    expect(tacticalSource).toContain('Duplicá un cuadro y mové los elementos en el siguiente para animarlos.');
    expect(tacticalSource).toContain('let viewMode = \'list\'');
    expect(tacticalSource).toContain('viewMode = \'detail\'');
    expect(tacticalSource).toContain('data-sequence-open');
    expect(tacticalSource).toContain('data-sequence-back');
    expect(tacticalSource).toContain('data-cuadro-add');
    expect(tacticalSource).toContain('data-cuadro-duplicate');
    expect(tacticalSource).toContain('data-cuadro-delete');
    expect(tacticalSource).not.toContain('data-sequence-toggle');
    expect(tacticalSource).toContain('data-sequence-menu');
    expect(tacticalSource).toContain('data-sequence-duplicate');
    expect(tacticalSource).toContain('data-sequence-play');
    expect(tacticalSource).toContain('data-cuadro-duration');
    expect(tacticalSource).toContain('requestAnimationFrame(playbackTick)');
    expect(tacticalSource).toContain('interpolateFrame(');
    expect(tacticalSource).toContain('createCuadroFromPrevious');
    expect(tacticalSource).toContain('scheduleThumbnailSync');
    expect(tacticalSource).toContain('generateCuadroThumbnail');
    expect(tacticalSource).toContain('isPlaybackPlaying ? \'Reproduciendo\'');
    expect(tacticalCss).toContain('.tactical-sequence-card');
    expect(tacticalCss).toContain('.tactical-sequence-detail-header');
    expect(tacticalCss).toContain('.tactical-cuadro-card.active');
    expect(tacticalCss).not.toContain('.tactical-folder-glyph');
    expect(tacticalCss).toContain('.tactical-sequence-menu-popover');
    expect(tacticalCss).toContain('.tactical-cuadro-placeholder');
    expect(tacticalCss).toContain('.tactical-cuadro-thumb');
  });

  it('renders cuadros as large vertical preview cards with compact playback controls', () => {
    expect(tacticalSource).toContain('const CUADRO_THUMBNAIL_WIDTH = 640;');
    expect(tacticalSource).toContain('thumbnailWidth: CUADRO_THUMBNAIL_WIDTH');
    expect(tacticalSource).toContain('thumbnailVersion');
    expect(tacticalSource).toContain("isPlaybackPlaying ? 'Pausar' : 'Reproducir'");
    expect(tacticalCss).toMatch(/\.tactical-playback-controls\s*{[^}]*grid-template-columns:\s*auto max-content minmax\(0,\s*auto\);/s);
    expect(tacticalCss).toMatch(/\.tactical-playback-controls label\s*{[^}]*grid-template-columns:\s*auto 52px;[^}]*gap:\s*var\(--space-2\);/s);
    expect(tacticalCss).toContain('.tactical-playback-controls input::-webkit-inner-spin-button');
    expect(tacticalCss).toContain('.tactical-playback-controls input::-webkit-outer-spin-button');
    expect(tacticalCss).toMatch(/\.tactical-playback-controls input\[type="number"\]\s*{[^}]*-moz-appearance:\s*textfield;/s);
    expect(tacticalCss).not.toMatch(/\.tactical-playback-controls \[data-sequence-current-frame\]\s*{[^}]*text-overflow:\s*ellipsis;/s);
    expect(tacticalCss).toMatch(/\.tactical-cuadro-list\s*{[^}]*gap:\s*14px;/s);
    expect(tacticalCss).toMatch(/\.tactical-cuadro-row\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
    expect(tacticalCss).toMatch(/\.tactical-cuadro-card\s*{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\) auto;[^}]*min-height:\s*168px;/s);
    expect(tacticalCss).not.toMatch(/\.tactical-cuadro-card\s*{[^}]*grid-template-columns:\s*78px minmax\(0,\s*1fr\);/s);
    expect(tacticalCss).toMatch(/\.tactical-cuadro-thumb\s*{[^}]*width:\s*100%;[^}]*aspect-ratio:\s*16 \/ 9;/s);
    expect(tacticalCss).toMatch(/\.tactical-cuadro-thumb img\s*{[^}]*object-fit:\s*contain;/s);
    expect(tacticalCss).toMatch(/\.tactical-sequence-detail-header\s*{[^}]*min-height:\s*52px;/s);
  });

  it('keeps cuadro actions stable and nonblocking', () => {
    expect(tacticalSource).toContain('class="tactical-menu-dots"');
    expect(tacticalSource).toMatch(/data-cuadro-load[^\n]+[\s\S]*?button\.addEventListener\('click', \(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?void selectFrameFromToken/s);
    expect(tacticalSource).toMatch(/data-cuadro-add[^\n]+[\s\S]*?button\.addEventListener\('click', \(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?void addFrame/s);
    expect(tacticalSource).toMatch(/data-cuadro-duplicate[^\n]+[\s\S]*?button\.addEventListener\('click', \(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);[\s\S]*?void duplicateFrameFromToken/s);
    expect(tacticalSource).toMatch(/data-cuadro-delete[^\n]+[\s\S]*?button\.addEventListener\('click', \(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);[\s\S]*?void deleteFrameFromToken/s);
    expect(tacticalCss).toMatch(/\.tactical-cuadro-hover-actions\s*{[^}]*pointer-events:\s*none;[^}]*transition:\s*opacity var\(--duration-fast\) var\(--ease-smooth\)/s);
    expect(tacticalCss).toMatch(/\.tactical-cuadro-row:hover \.tactical-cuadro-hover-actions,[\s\S]*?\.tactical-cuadro-row:focus-within \.tactical-cuadro-hover-actions\s*{[^}]*pointer-events:\s*auto;/s);
    expect(tacticalCss).toMatch(/\.tactical-cuadro-icon\s*{[^}]*padding:\s*0 var\(--space-2\);[^}]*border-radius:\s*var\(--radius-md\);/s);
  });

  it('renders sequence cards as dark rounded blocks without outlines', () => {
    expect(tacticalCss).not.toContain('--tactical-hover-bg');
    expect(tacticalCss).not.toMatch(/\.tactical-new-sequence-btn,[\s\S]*?\.tactical-export-btn\s*{[^}]*transition:\s*background 140ms/s);
    expect(tacticalCss).toMatch(/\.tactical-board-item,\s*\.tactical-sequence-card\s*{[^}]*border:\s*0;[^}]*border-radius:\s*18px;[^}]*background:\s*rgba\(5, 9, 17, 0\.76\);/s);
    expect(tacticalCss).toMatch(/\.tactical-sequence-open\s*{[^}]*min-height:\s*52px;[^}]*padding:\s*var\(--space-2\);[^}]*border-radius:\s*14px;[^}]*background:\s*transparent;/s);
    expect(tacticalCss).toMatch(/\.tactical-sequence-card\.active\s*{[^}]*border:\s*0;[^}]*background:\s*rgba\(5, 9, 17, 0\.92\);/s);
    expect(tacticalCss).not.toMatch(/\.tactical-sequence-card\.active\s*{[^}]*border-color:/s);
    expect(tacticalCss).not.toMatch(/\.tactical-sequence-card\.active\s*{[^}]*box-shadow:/s);
  });

  it('uses the animated club gradient on play and cuadro creation actions', () => {
    const focusStart = tacticalCss.indexOf('.tactical-sequence-open:focus-visible');
    const focusEnd = tacticalCss.indexOf('.tactical-sequence-menu-btn,', focusStart);
    const focusSource = tacticalCss.slice(focusStart, focusEnd);

    expect(tacticalCss).toMatch(/\.tactical-library-view\s*{[^}]*gap:\s*var\(--space-8\);/s);
    expect(tacticalCss).toMatch(/\.tactical-new-sequence-btn\s*{[^}]*linear-gradient\(\s*110deg,\s*var\(--color-brand-red\)\s*0%,\s*var\(--color-brand-navy\)\s*48%,\s*var\(--color-brand-red\)\s*100%\s*\)[^}]*background-size:\s*220% 100%;[^}]*animation:\s*club-gradient-shift 7s ease-in-out infinite;/s);
    expect(tacticalCss).toMatch(/\.tactical-play-btn\s*{[^}]*linear-gradient\(\s*110deg,\s*var\(--color-brand-red\)\s*0%,\s*var\(--color-brand-navy\)\s*48%,\s*var\(--color-brand-red\)\s*100%\s*\)[^}]*background-size:\s*220% 100%;[^}]*animation:\s*club-gradient-shift 7s ease-in-out infinite;/s);
    expect(tacticalCss).toMatch(/\.tactical-cuadro-add,\s*\.tactical-sequence-empty button\s*{[^}]*border:\s*0;[^}]*linear-gradient\(\s*110deg,\s*var\(--color-brand-red\)\s*0%,\s*var\(--color-brand-navy\)\s*48%,\s*var\(--color-brand-red\)\s*100%\s*\)[^}]*background-size:\s*220% 100%;[^}]*animation:\s*club-gradient-shift 7s ease-in-out infinite;/s);
    expect(focusSource).not.toContain('.tactical-cuadro-add:focus-visible');
    expect(focusSource).not.toContain('.tactical-sequence-empty button:focus-visible');
  });

  it('hydrates missing thumbnails without remounting the editor', () => {
    const ensureStart = tacticalSource.indexOf('async function ensureVisibleThumbnails()');
    const ensureEnd = tacticalSource.indexOf('async function saveActiveSequence', ensureStart);
    const ensureSource = tacticalSource.slice(ensureStart, ensureEnd);

    expect(tacticalSource).toContain('let thumbnailHydrationInFlight = false');
    expect(tacticalSource).toContain('data-cuadro-thumbnail');
    expect(tacticalSource).toContain('function updateCuadroThumbnailDom');
    expect(ensureSource).toContain('if (!activeBoard || viewMode !== \'detail\' || isPlaybackPlaying || thumbnailHydrationInFlight) return;');
    expect(ensureSource).toContain('const boardId = activeBoard.id;');
    expect(ensureSource).toContain('thumbnailHydrationInFlight = true;');
    expect(ensureSource).toContain('activeBoard?.id !== boardId');
    expect(ensureSource).toContain('updateCuadroThumbnailDom(');
    expect(ensureSource).toContain('thumbnailHydrationInFlight = false;');
    expect(ensureSource).not.toContain('render();');
  });

  it('does not load a cuadro into the editor until one is explicitly selected', () => {
    const getActiveFrameStart = tacticalSource.indexOf('function getActiveFrame()');
    const getActiveFrameEnd = tacticalSource.indexOf('function getCuadroCountLabel', getActiveFrameStart);
    const getActiveFrameSource = tacticalSource.slice(getActiveFrameStart, getActiveFrameEnd);
    const openSequenceStart = tacticalSource.indexOf('async function openSequenceDetail');
    const openSequenceEnd = tacticalSource.indexOf('async function returnToSequenceList', openSequenceStart);
    const openSequenceSource = tacticalSource.slice(openSequenceStart, openSequenceEnd);

    expect(getActiveFrameSource).toContain('if (!activeFrameId) return null;');
    expect(getActiveFrameSource).not.toContain('|| frames[0]');
    expect(openSequenceSource).toContain("activeFrameId = '';");
    expect(tacticalSource).toContain('No hay cuadro seleccionado');
  });

  it('uses an in-app sequence name dialog instead of unsupported browser prompts', () => {
    expect(tacticalSource).not.toContain('window.prompt');
    expect(tacticalSource).toContain('data-sequence-name-dialog');
    expect(tacticalSource).toContain('data-sequence-name-input');
    expect(tacticalSource).toContain('openSequenceNameDialog');
    expect(tacticalCss).toContain('.tactical-sequence-dialog');
  });

  it('draws goal posts as reference-style Hs inside the in-goal area', () => {
    expect(tacticalSource).toContain('goalPostInset');
    expect(tacticalSource).toContain('goalPostClearance');
    expect(tacticalSource).toContain('const GOAL_POST_FIELD_WIDTH_RATIO = 0.112;');
    expect(tacticalSource).toContain('span = 56');
    expect(tacticalSource).toMatch(/span:\s*touchWidth \* GOAL_POST_FIELD_WIDTH_RATIO/);
    expect(tacticalSource).toMatch(/span:\s*touchHeight \* GOAL_POST_FIELD_WIDTH_RATIO/);
    expect(tacticalSource).toContain("axis = 'x'");
    expect(tacticalSource).toContain('fieldEdge');
    expect(tacticalSource).toContain('direction: -1');
    expect(tacticalSource).toContain('direction: 1');
    expect(tacticalSource).not.toContain('const leftPost = centerX - goalPostGap / 2;');
  });

  it('keeps the tactical editor controls clear of the field and window edges', () => {
    expect(drawingEditorCss).toMatch(/\.drawing-toolbar\s*{[^}]*bottom:\s*var\(--space-6\);/s);
    expect(tacticalCss).toMatch(/\.tactical-board-main\s*{[^}]*padding:\s*var\(--space-3\) var\(--space-4\) var\(--space-4\);/s);
    expect(tacticalCss).toMatch(/\.tactical-board-options\s*{[^}]*top:\s*var\(--space-3\);/s);
  });

  it('keeps only the freehand pencil active after releasing a stroke', () => {
    const finalizeDraftStart = drawingEditorSource.indexOf('const finalizeDraft = () => {');
    const finalizeDraftEnd = drawingEditorSource.indexOf('const openTextInput', finalizeDraftStart);
    const finalizeDraftSource = drawingEditorSource.slice(finalizeDraftStart, finalizeDraftEnd);

    expect(finalizeDraftSource).toContain("if (stroke.tool === 'freehand')");
    expect(finalizeDraftSource).toContain('state.selectedStrokeIds = [];');
    expect(finalizeDraftSource).toContain('return;');
    expect(finalizeDraftSource.indexOf("if (stroke.tool === 'freehand')")).toBeLessThan(finalizeDraftSource.indexOf('selectOnly(stroke.id)'));
    expect(finalizeDraftSource).toContain('selectOnly(stroke.id)');
    expect(finalizeDraftSource).toContain('switchToSelect();');
  });

  it('keeps the live drawing toolbar compact so it does not cover the video', () => {
    expect(drawingEditorCss).toMatch(/\.tagging-live-drawing-editor \.drawing-toolbar\s*{[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);[^}]*max-height:\s*64px;[^}]*overflow-x:\s*auto;/s);
    expect(drawingEditorCss).toMatch(/\.tagging-live-drawing-editor \.drawing-toolbar-row\s*{[^}]*flex:\s*0 0 auto;[^}]*flex-wrap:\s*nowrap;/s);
    expect(drawingEditorCss).toMatch(/\.tagging-live-drawing-editor \.drawing-toolbar-actions\s*{[^}]*margin-left:\s*var\(--space-2\);[^}]*flex-wrap:\s*nowrap;/s);
    expect(drawingEditorCss).not.toMatch(/\.tagging-live-drawing-editor \.drawing-toolbar\s*{[^}]*right:\s*var\(--space-3\);/s);
  });

  it('renames boards inline and supports right-click deletion from the library', () => {
    expect(tacticalSource).toContain("label.addEventListener('dblclick'");
    expect(tacticalSource).toContain("input.className = 'tactical-board-name-input'");
    expect(tacticalSource).toContain("item.addEventListener('contextmenu'");
    expect(tacticalCss).toContain('.tactical-board-name-input');
  });
});
