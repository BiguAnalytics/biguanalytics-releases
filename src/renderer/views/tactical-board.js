// @ts-check
import { createDrawingEditor } from '../components/drawing-editor.js';
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { createCuadroFromPrevious } from '../drawing/drawing-sequence.js';
import { drawStrokes, serializeDrawingSvg } from '../drawing/drawing-engine.js';
import { interpolateFrame } from '../drawing/frame-interpolation.js';

const FIELD_BACKGROUNDS = [
  { value: '#26405F', label: 'Azul Bigua' },
  { value: '#E8ECE6', label: 'Blanco' },
  { value: '#101A2A', label: 'Oscuro' },
  { value: '#4F79AE', label: 'Azul suave' },
];

const FIELD_TEMPLATES = [
  { value: 'full', label: 'Cancha completa' },
  { value: 'left-half', label: 'Media cancha izquierda' },
  { value: 'right-half', label: 'Media cancha derecha' },
];

const DEFAULT_CANVAS = {
  width: 1200,
  height: 720,
  backgroundColor: '#26405F',
  fieldTemplate: 'full',
};

const HALF_FIELD_CANVAS = { width: 1008, height: 720 };
const CUADRO_THUMBNAIL_WIDTH = 640;
const CUADRO_THUMBNAIL_VERSION = 3;
const GOAL_POST_FIELD_WIDTH_RATIO = 0.112;

/**
 * @param {string} color
 * @returns {boolean}
 */
function isLightColor(color) {
  const hex = String(color || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return ((red * 299 + green * 587 + blue * 114) / 1000) > 170;
}

/**
 * @param {object} canvas
 * @returns {object}
 */
function normalizeCanvas(canvas = {}) {
  const backgroundColor = String(canvas?.backgroundColor || '');
  const template = FIELD_TEMPLATES.some(item => item.value === canvas?.fieldTemplate)
    ? canvas.fieldTemplate
    : DEFAULT_CANVAS.fieldTemplate;
  return {
    ...DEFAULT_CANVAS,
    ...(canvas || {}),
    width: template === 'full' ? DEFAULT_CANVAS.width : HALF_FIELD_CANVAS.width,
    height: template === 'full' ? DEFAULT_CANVAS.height : HALF_FIELD_CANVAS.height,
    backgroundColor: /^#[0-9a-f]{6}$/i.test(backgroundColor)
      ? backgroundColor
      : DEFAULT_CANVAS.backgroundColor,
    fieldTemplate: template,
  };
}

/**
 * @param {{axis?: 'x'|'y', tryLine: number, center: number, fieldEdge: number, direction: -1|1, color: string, span?: number}} options
 * @returns {string}
 */
function drawGoalPosts({ axis = 'x', tryLine, center, fieldEdge, direction, color, span = 56 }) {
  const goalPostDepth = 78;
  const goalPostInset = 42;
  const goalPostClearance = 14;
  const goalPostSpan = Math.max(40, Number(span) || 56);
  const availableDepth = Math.max(32, Math.abs(fieldEdge - tryLine) - goalPostClearance);
  const depth = Math.min(goalPostDepth, availableDepth);
  const outerEdge = tryLine + direction * depth;
  const insetPost = tryLine + direction * Math.min(goalPostInset, depth * 0.58);
  const firstBar = center - goalPostSpan / 2;
  const secondBar = center + goalPostSpan / 2;
  const path = axis === 'x'
    ? `M${tryLine} ${firstBar} L${outerEdge} ${firstBar}
       M${tryLine} ${secondBar} L${outerEdge} ${secondBar}
       M${tryLine} ${firstBar} L${tryLine} ${secondBar}
       M${insetPost} ${firstBar} L${insetPost} ${secondBar}`
    : `M${firstBar} ${tryLine} L${firstBar} ${outerEdge}
       M${secondBar} ${tryLine} L${secondBar} ${outerEdge}
       M${firstBar} ${tryLine} L${secondBar} ${tryLine}
       M${firstBar} ${insetPost} L${secondBar} ${insetPost}`;
  return `
    <path d="${path}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="square"/>
  `;
}

/**
 * @param {number} x
 * @param {number} top
 * @param {number} bottom
 * @param {string} color
 * @param {string} [dash]
 * @returns {string}
 */
function verticalLine(x, top, bottom, color, dash = '') {
  return `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${color}" stroke-width="2.5"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

/**
 * @param {number} y
 * @param {number} left
 * @param {number} right
 * @param {string} color
 * @param {string} [dash]
 * @returns {string}
 */
function horizontalLine(y, left, right, color, dash = '') {
  return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${color}" stroke-width="2.5"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

/**
 * @param {object} settings
 * @param {string} strong
 * @param {string} medium
 * @param {string} soft
 * @returns {string}
 */
function halfFieldMarkings(settings, strong, medium, soft) {
  const width = Number(settings.width) || HALF_FIELD_CANVAS.width;
  const height = Number(settings.height) || HALF_FIELD_CANVAS.height;
  const top = 70;
  const bottom = height - 70;
  const fieldHeight = bottom - top;
  const fieldWidth = fieldHeight * (70 / 50);
  const fieldLeft = (width - fieldWidth) / 2;
  const fieldRight = fieldLeft + fieldWidth;
  const centerX = width / 2;
  const touchWidth = fieldRight - fieldLeft;
  const fiveLeft = fieldLeft + touchWidth * (5 / 70);
  const fifteenLeft = fieldLeft + touchWidth * (15 / 70);
  const fifteenRight = fieldRight - touchWidth * (15 / 70);
  const fiveRight = fieldRight - touchWidth * (5 / 70);
  const playsTowardBottom = settings.fieldTemplate !== 'right-half';
  const inGoalDepth = 58;
  const tryLine = playsTowardBottom ? top + inGoalDepth : bottom - inGoalDepth;
  const halfwayLine = playsTowardBottom ? bottom : top;
  const meter = Math.abs(halfwayLine - tryLine) / 50;
  const twentyTwoLine = playsTowardBottom ? tryLine + meter * 22 : tryLine - meter * 22;
  const tenLine = playsTowardBottom ? halfwayLine - meter * 10 : halfwayLine + meter * 10;

  return `
    <rect x="${fieldLeft}" y="${top}" width="${fieldRight - fieldLeft}" height="${bottom - top}" fill="none" stroke="${strong}" stroke-width="4"/>
    ${verticalLine(fiveLeft, top, bottom, soft, '9 10')}
    ${verticalLine(fifteenLeft, top, bottom, soft, '9 10')}
    ${verticalLine(fifteenRight, top, bottom, soft, '9 10')}
    ${verticalLine(fiveRight, top, bottom, soft, '9 10')}
    ${horizontalLine(tryLine, fieldLeft, fieldRight, strong)}
    ${horizontalLine(twentyTwoLine, fieldLeft, fieldRight, medium)}
    ${horizontalLine(tenLine, fieldLeft, fieldRight, soft, '10 10')}
    ${horizontalLine(halfwayLine, fieldLeft, fieldRight, strong, '14 10')}
    ${drawGoalPosts({
      axis: 'y',
      tryLine,
      center: centerX,
      fieldEdge: playsTowardBottom ? top : bottom,
      direction: playsTowardBottom ? -1 : 1,
      color: strong,
      span: touchWidth * GOAL_POST_FIELD_WIDTH_RATIO,
    })}
  `;
}

/**
 * @param {object} settings
 * @param {string} strong
 * @param {string} medium
 * @param {string} soft
 * @returns {string}
 */
function fieldMarkings(settings, strong, medium, soft) {
  if (settings.fieldTemplate !== 'full') return halfFieldMarkings(settings, strong, medium, soft);
  const template = settings.fieldTemplate;
  const width = Number(settings.width) || 1200;
  const top = 70;
  const bottom = 650;
  const centerY = 360;
  const fieldLeft = 70;
  const fieldRight = width - 70;
  const touchHeight = bottom - top;
  const fiveTop = top + touchHeight * (5 / 70);
  const fifteenTop = top + touchHeight * (15 / 70);
  const fifteenBottom = bottom - touchHeight * (15 / 70);
  const fiveBottom = bottom - touchHeight * (5 / 70);
  const playableLeft = template === 'right-half' ? fieldLeft : 158;
  const playableRight = template === 'left-half' ? fieldRight : width - 158;
  const playableWidth = Math.abs(playableRight - playableLeft);
  const meter = playableWidth / (template === 'full' ? 100 : 50);
  const tryLine = template === 'right-half' ? playableRight : playableLeft;
  const secondTryLine = template === 'full' ? playableRight : null;
  const twentyTwoLines = template === 'full'
    ? [playableLeft + meter * 22, playableRight - meter * 22]
    : [template === 'left-half' ? playableLeft + meter * 22 : playableRight - meter * 22];
  const tenLines = template === 'full'
    ? [width / 2 - meter * 10, width / 2 + meter * 10]
    : [template === 'left-half' ? fieldRight - meter * 10 : fieldLeft + meter * 10];
  const halfwayLine = template === 'full'
    ? verticalLine(width / 2, top, bottom, strong, '14 10')
    : verticalLine(template === 'left-half' ? fieldRight : fieldLeft, top, bottom, strong, '14 10');

  return `
    <rect x="${fieldLeft}" y="${top}" width="${fieldRight - fieldLeft}" height="${bottom - top}" fill="none" stroke="${strong}" stroke-width="4"/>
    <line x1="${fieldLeft}" y1="${fiveTop}" x2="${fieldRight}" y2="${fiveTop}" stroke="${soft}" stroke-width="1.5" stroke-dasharray="9 10"/>
    <line x1="${fieldLeft}" y1="${fifteenTop}" x2="${fieldRight}" y2="${fifteenTop}" stroke="${soft}" stroke-width="1.5" stroke-dasharray="9 10"/>
    <line x1="${fieldLeft}" y1="${fifteenBottom}" x2="${fieldRight}" y2="${fifteenBottom}" stroke="${soft}" stroke-width="1.5" stroke-dasharray="9 10"/>
    <line x1="${fieldLeft}" y1="${fiveBottom}" x2="${fieldRight}" y2="${fiveBottom}" stroke="${soft}" stroke-width="1.5" stroke-dasharray="9 10"/>
    ${verticalLine(tryLine, top, bottom, strong)}
    ${secondTryLine ? verticalLine(secondTryLine, top, bottom, strong) : ''}
    ${twentyTwoLines.map(x => verticalLine(x, top, bottom, medium)).join('')}
    ${tenLines.map(x => verticalLine(x, top, bottom, soft, '10 10')).join('')}
    ${halfwayLine}
    ${drawGoalPosts({
      axis: 'x',
      tryLine,
      center: centerY,
      fieldEdge: fieldLeft,
      direction: -1,
      color: strong,
      span: touchHeight * GOAL_POST_FIELD_WIDTH_RATIO,
    })}
    ${secondTryLine ? drawGoalPosts({
      axis: 'x',
      tryLine: secondTryLine,
      center: centerY,
      fieldEdge: fieldRight,
      direction: 1,
      color: strong,
      span: touchHeight * GOAL_POST_FIELD_WIDTH_RATIO,
    }) : ''}
  `;
}

/**
 * @param {object} canvas
 * @returns {string}
 */
function getFieldSvgContent(canvas = {}) {
  const settings = normalizeCanvas(canvas);
  const light = isLightColor(settings.backgroundColor);
  const strong = light ? 'rgba(8,14,26,0.52)' : 'rgba(240,244,248,0.34)';
  const medium = light ? 'rgba(8,14,26,0.34)' : 'rgba(240,244,248,0.22)';
  const soft = light ? 'rgba(8,14,26,0.20)' : 'rgba(240,244,248,0.12)';
  return `
    <rect width="${settings.width}" height="${settings.height}" fill="${settings.backgroundColor}"/>
    ${fieldMarkings(settings, strong, medium, soft)}
  `;
}

/**
 * @param {object} canvas
 * @returns {string}
 */
function getFieldSvg(canvas = {}) {
  const settings = normalizeCanvas(canvas);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${settings.width} ${settings.height}">
      ${getFieldSvgContent(settings)}
    </svg>
  `;
  return svg;
}

/**
 * @param {object} canvas
 * @returns {string}
 */
function getFieldDataUrl(canvas = {}) {
  const svg = getFieldSvg(canvas);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * @param {object} cuadro
 * @param {object} [canvasSettings]
 * @returns {Promise<string>}
 */
async function generateCuadroThumbnail(cuadro = {}, canvasSettings = DEFAULT_CANVAS) {
  const settings = normalizeCanvas(canvasSettings);
  const svg = serializeDrawingSvg(Array.isArray(cuadro.elements) ? cuadro.elements : [], {
    width: settings.width,
    height: settings.height,
    background: getFieldSvgContent(settings),
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

/**
 * @returns {string}
 */
function createFrameId() {
  return globalThis.crypto?.randomUUID?.() || `frame-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * @param {object} frame
 * @param {number} index
 * @returns {object}
 */
function normalizeFrameForView(frame = {}, index = 0) {
  const elements = Array.isArray(frame.elements)
    ? frame.elements
    : Array.isArray(frame.strokes)
      ? frame.strokes
      : [];
  const durationSeconds = Math.max(0.5, Math.min(10, Number(frame.durationSeconds ?? frame.duration) || 3));
  const fallbackName = `Cuadro ${index + 1}`;
  const rawName = String(frame.name || frame.label || fallbackName).trim() || fallbackName;
  const migratedName = rawName.replace(/^Frame(\s+\d+)?$/i, `Cuadro${rawName.match(/\s+\d+$/)?.[0] || ` ${index + 1}`}`);
  return {
    id: String(frame.id || `cuadro-${index + 1}`),
    name: migratedName,
    order: Number.isFinite(Number(frame.order)) ? Number(frame.order) : index,
    duration: durationSeconds,
    durationSeconds,
    elements: cloneValue(elements) || [],
    thumbnail: String(frame.thumbnail || ''),
    thumbnailWidth: Number(frame.thumbnailWidth) || 0,
    thumbnailHeight: Number(frame.thumbnailHeight) || 0,
    thumbnailVersion: Number(frame.thumbnailVersion) || 0,
  };
}

/**
 * @param {object|null|undefined} board
 * @returns {Array<object>}
 */
function getBoardFrames(board) {
  if (Array.isArray(board?.frames)) return board.frames.map((frame, index) => normalizeFrameForView(frame, index));
  if (Array.isArray(board?.steps)) {
    return board.steps.map((step, index) => normalizeFrameForView({
      id: step.id,
      name: step.label,
      order: index,
      durationSeconds: step.durationSeconds,
      elements: step.strokes,
      thumbnail: step.thumbnail,
    }, index));
  }
  if (Array.isArray(board?.strokes)) {
    return [normalizeFrameForView({
      id: 'cuadro-1',
      name: 'Cuadro 1',
      order: 0,
      durationSeconds: board.durationSeconds,
      elements: board.strokes,
      thumbnail: board.thumbnail,
    }, 0)];
  }
  return [];
}

/**
 * @param {HTMLElement} container
 */
export function renderTacticalBoard(container) {
  setSidebarExpanded(false);
  updateTopbarContext('Tablero tactico');
  const scrollContainer = container.closest('.main-content-body');
  scrollContainer?.classList.add('main-content-body--drawing-fixed');
  setTopbarActions([
    { id: 'export', label: 'Exportar PNG' },
  ], (id) => {
    if (id === 'export') void exportActiveBoard();
  });

  let disposed = false;
  let boards = [];
  let activeBoard = null;
  let activeFrameId = '';
  let viewMode = 'list';
  let editor = null;
  let isPlaybackPlaying = false;
  let playbackAnimationFrame = 0;
  let playbackStartedAt = 0;
  let thumbnailSyncTimer = 0;
  let thumbnailHydrationInFlight = false;
  let openActionMenuId = '';
  let saveStatus = 'saved';

  void load();

  return () => {
    disposed = true;
    stopPlayback();
    window.clearTimeout(thumbnailSyncTimer);
    scrollContainer?.classList.remove('main-content-body--drawing-fixed');
    editor?.close?.(false);
    document.querySelector('.tactical-board-context-menu')?.remove();
    document.querySelector('[data-sequence-name-dialog]')?.remove();
  };

  async function load(selectedId = null) {
    boards = await window.api.tacticalBoards.list();
    if (selectedId) activeBoard = await window.api.tacticalBoards.get(selectedId);
    else if (activeBoard?.id) activeBoard = await window.api.tacticalBoards.get(activeBoard.id).catch(() => null);
    else activeBoard = boards.length ? await window.api.tacticalBoards.get(boards[0].id) : null;
    const frames = getFrames();
    if (!frames.some(frame => frame.id === activeFrameId)) activeFrameId = '';
    if (!disposed) render();
  }

  function getFrames() {
    return getBoardFrames(activeBoard).sort((a, b) => a.order - b.order);
  }

  function getActiveFrame() {
    const frames = getFrames();
    if (!activeFrameId) return null;
    return frames.find(frame => frame.id === activeFrameId) || null;
  }

  function getCuadroCountLabel(count) {
    return `${count} ${count === 1 ? 'cuadro' : 'cuadros'}`;
  }

  function getCuadroName(index) {
    return `Cuadro ${index + 1}`;
  }

  function renderFrameThumbnail(frame) {
    return `
      <span class="tactical-cuadro-thumb" data-cuadro-thumbnail="${escapeHtml(frame.id)}">
        ${frame.thumbnail
          ? `<img src="${frame.thumbnail}" alt="">`
          : `<span class="tactical-cuadro-placeholder" aria-hidden="true">
              <span></span><span></span><span></span>
            </span>`}
      </span>
    `;
  }

  function updateCuadroThumbnailDom(frameId, thumbnail) {
    if (!frameId || !thumbnail) return;
    const target = [...container.querySelectorAll('[data-cuadro-thumbnail]')]
      .find(node => node.getAttribute('data-cuadro-thumbnail') === frameId);
    if (!target) return;
    target.innerHTML = `<img src="${thumbnail}" alt="">`;
  }

  function setSaveStatus(status) {
    saveStatus = status;
    const statusNode = container.querySelector('[data-save-status]');
    if (!statusNode) return;
    statusNode.setAttribute('data-state', saveStatus);
    statusNode.textContent = saveStatus === 'saving'
      ? 'Guardando'
      : saveStatus === 'error'
        ? 'Error al guardar'
        : isPlaybackPlaying ? 'Reproduciendo' : 'Guardado';
  }

  function renderSequenceMenu(boardId, label = 'Acciones de secuencia') {
    return `
      <button class="tactical-sequence-menu-btn" type="button" data-sequence-menu="${escapeHtml(boardId)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
        <span class="tactical-menu-dots" aria-hidden="true"><span></span><span></span><span></span></span>
      </button>
      ${openActionMenuId === boardId ? `
        <div class="tactical-sequence-menu-popover" role="menu">
          <button type="button" data-sequence-rename="${escapeHtml(boardId)}">Renombrar</button>
          <button type="button" data-sequence-duplicate="${escapeHtml(boardId)}">Duplicar</button>
          <button type="button" class="danger" data-sequence-delete="${escapeHtml(boardId)}">Eliminar</button>
        </div>
      ` : ''}
    `;
  }

  function renderSequenceList() {
    return `
      <header class="tactical-library-header">
        <div>
          <h2>Secuencias</h2>
          <span data-save-status data-state="${escapeHtml(saveStatus)}">${isPlaybackPlaying ? 'Reproduciendo' : saveStatus === 'error' ? 'Error al guardar' : saveStatus === 'saving' ? 'Guardando' : 'Guardado'}</span>
        </div>
        <button class="tactical-new-sequence-btn" type="button" data-sequence-new>+ Nueva secuencia</button>
      </header>
      <div class="tactical-board-list" aria-label="Secuencias guardadas">
        ${boards.map((board) => {
          const frameCount = Number(board.frameCount ?? board.stepCount ?? 0);
          return `
            <article class="tactical-board-item tactical-sequence-card${activeBoard?.id === board.id ? ' active' : ''}" data-board-id="${escapeHtml(board.id)}" data-sequence-id="${escapeHtml(board.id)}">
              <button class="tactical-sequence-open" type="button" data-sequence-open="${escapeHtml(board.id)}" aria-label="Abrir secuencia ${escapeHtml(board.name)}">
                <span class="tactical-sequence-copy">
                  <span class="tactical-board-name" data-board-rename>${escapeHtml(board.name)}</span>
                  <small>${getCuadroCountLabel(frameCount)}</small>
                </span>
                <span class="tactical-sequence-chevron" aria-hidden="true"></span>
              </button>
              ${renderSequenceMenu(board.id)}
            </article>
          `;
        }).join('') || `
          <div class="tactical-empty">
            <strong>Sin secuencias</strong>
            <span>Crea una secuencia para ordenar cuadros y animar una jugada.</span>
          </div>
        `}
      </div>
    `;
  }

  function renderSequenceDetail(activeFrame, activeFrames, activeFrameIndex) {
    if (!activeBoard) return renderSequenceList();
    return `
      <header class="tactical-sequence-detail-header">
        <button class="tactical-sequence-back" type="button" data-sequence-back aria-label="Volver a secuencias">
          <span class="tactical-sequence-chevron back" aria-hidden="true"></span>
        </button>
        <h2>${escapeHtml(activeBoard.name || 'Secuencia')}</h2>
        <div class="tactical-sequence-detail-menu">
          ${renderSequenceMenu(activeBoard.id)}
        </div>
      </header>
      <div class="tactical-playback-controls" aria-label="Reproducción de secuencia">
        <button class="tactical-play-btn" type="button" data-sequence-play${activeFrames.length > 1 ? '' : ' disabled'}>${isPlaybackPlaying ? 'Pausar' : 'Reproducir'}</button>
        <span data-sequence-current-frame aria-label="${activeFrame ? `Cuadro ${activeFrameIndex + 1} de ${activeFrames.length}` : 'Sin cuadro'}">${activeFrame ? `${activeFrameIndex + 1}/${activeFrames.length}` : 'Sin cuadro'}</span>
        <label>
          <span>Duración</span>
          <input type="number" min="0.5" max="10" step="0.5" value="${activeFrame?.durationSeconds || 3}" data-cuadro-duration${activeFrame ? '' : ' disabled'}>
        </label>
      </div>
      <p class="tactical-sequence-hint">Duplicá un cuadro y mové los elementos en el siguiente para animarlos.</p>
      ${activeFrames.length ? `
        <div class="tactical-cuadro-list" aria-label="Cuadros de ${escapeHtml(activeBoard.name)}">
          ${activeFrames.map((frame, index) => `
            <div class="tactical-cuadro-row">
              <button
                class="tactical-cuadro-card${activeFrameId === frame.id ? ' active' : ''}"
                type="button"
                data-cuadro-load="${escapeHtml(activeBoard.id)}:${escapeHtml(frame.id)}"
                aria-label="Abrir ${getCuadroName(index)}"
              >
                ${renderFrameThumbnail(frame)}
                <span class="tactical-cuadro-meta">
                  <strong>${getCuadroName(index)}</strong>
                  <small>${index + 1}/${activeFrames.length} · ${frame.durationSeconds}s</small>
                </span>
              </button>
              <div class="tactical-cuadro-hover-actions" aria-label="Acciones de cuadro">
                <button class="tactical-cuadro-icon" type="button" data-cuadro-duplicate="${escapeHtml(activeBoard.id)}:${escapeHtml(frame.id)}" aria-label="Duplicar cuadro">Copiar</button>
                <button class="tactical-cuadro-icon danger" type="button" data-cuadro-delete="${escapeHtml(activeBoard.id)}:${escapeHtml(frame.id)}" aria-label="Eliminar cuadro">Borrar</button>
              </div>
            </div>
          `).join('')}
          <button class="tactical-cuadro-add" type="button" data-cuadro-add="${escapeHtml(activeBoard.id)}">+ Nuevo cuadro</button>
        </div>
      ` : `
        <div class="tactical-sequence-empty">
          <strong>Sin cuadros todavía</strong>
          <span>Creá el primer cuadro para empezar la jugada.</span>
          <button type="button" data-cuadro-add="${escapeHtml(activeBoard.id)}">Crear primer cuadro</button>
        </div>
      `}
    `;
  }

  function render() {
    const canvasSettings = normalizeCanvas(activeBoard?.canvas);
    const activeFrame = getActiveFrame();
    const activeFrames = getFrames();
    const activeFrameIndex = activeFrame ? activeFrames.findIndex(frame => frame.id === activeFrame.id) : -1;
    container.innerHTML = `
      <section class="tactical-board-view view-enter">
        <main class="tactical-board-main">
          <div class="tactical-canvas-frame">
            <div class="tactical-board-options" aria-label="Opciones de cancha">
              <label>
                <span>Fondo</span>
                <select data-board-background>
                  ${FIELD_BACKGROUNDS.map(option => `
                    <option value="${escapeHtml(option.value)}"${option.value === canvasSettings.backgroundColor ? ' selected' : ''}>${escapeHtml(option.label)}</option>
                  `).join('')}
                </select>
                <input type="color" value="${escapeHtml(canvasSettings.backgroundColor)}" data-board-background-picker aria-label="Color de fondo de cancha">
              </label>
              <label>
                <span>Plantilla</span>
                <select data-board-template>
                  ${FIELD_TEMPLATES.map(option => `
                    <option value="${escapeHtml(option.value)}"${option.value === canvasSettings.fieldTemplate ? ' selected' : ''}>${escapeHtml(option.label)}</option>
                  `).join('')}
                </select>
              </label>
            </div>
            <div class="tactical-canvas-host" data-tactical-canvas-host></div>
          </div>
        </main>
        <aside class="tactical-board-library" aria-label="Biblioteca de secuencias">
          <div class="tactical-library-view" data-view-mode="${escapeHtml(viewMode)}">
            ${viewMode === 'detail' && activeBoard ? renderSequenceDetail(activeFrame, activeFrames, activeFrameIndex) : renderSequenceList()}
          </div>
          <button class="btn btn-secondary btn-sm tactical-export-btn" type="button" data-board-export${activeFrame ? '' : ' disabled'}>Exportar PNG</button>
        </aside>
      </section>
    `;

    container.querySelector('[data-sequence-new]')?.addEventListener('click', () => void createNewSequence());
    container.querySelector('[data-sequence-play]')?.addEventListener('click', togglePlayback);
    container.querySelector('[data-board-export]')?.addEventListener('click', () => void exportActiveBoard());
    container.querySelector('[data-sequence-back]')?.addEventListener('click', () => void returnToSequenceList());
    container.querySelector('[data-cuadro-duration]')?.addEventListener('change', (event) => {
      updateActiveFrameDuration(Number(/** @type {HTMLInputElement} */ (event.currentTarget).value));
    });
    container.querySelector('[data-board-background]')?.addEventListener('change', (event) => {
      updateCanvasOptions({ backgroundColor: /** @type {HTMLSelectElement} */ (event.currentTarget).value });
    });
    container.querySelector('[data-board-background-picker]')?.addEventListener('input', (event) => {
      updateCanvasOptions({ backgroundColor: /** @type {HTMLInputElement} */ (event.currentTarget).value });
    });
    container.querySelector('[data-board-template]')?.addEventListener('change', (event) => {
      updateCanvasOptions({ fieldTemplate: /** @type {HTMLSelectElement} */ (event.currentTarget).value });
    });
    container.querySelectorAll('[data-sequence-open]').forEach(button => {
      button.addEventListener('click', () => void openSequenceDetail(button.getAttribute('data-sequence-open')));
    });
    container.querySelectorAll('[data-sequence-menu]').forEach(button => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = button.getAttribute('data-sequence-menu') || '';
        openActionMenuId = openActionMenuId === id ? '' : id;
        render();
      });
    });
    container.querySelectorAll('[data-sequence-rename]').forEach(button => {
      button.addEventListener('click', () => void promptRenameSequence(button.getAttribute('data-sequence-rename')));
    });
    container.querySelectorAll('[data-sequence-duplicate]').forEach(button => {
      button.addEventListener('click', () => void duplicateBoard(button.getAttribute('data-sequence-duplicate')));
    });
    container.querySelectorAll('[data-sequence-delete]').forEach(button => {
      button.addEventListener('click', () => void deleteBoard(button.getAttribute('data-sequence-delete')));
    });
    container.querySelectorAll('[data-cuadro-load]').forEach(button => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        void selectFrameFromToken(button.getAttribute('data-cuadro-load'));
      });
    });
    container.querySelectorAll('[data-cuadro-add]').forEach(button => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        void addFrame(button.getAttribute('data-cuadro-add'));
      });
    });
    container.querySelectorAll('[data-cuadro-duplicate]').forEach(button => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void duplicateFrameFromToken(button.getAttribute('data-cuadro-duplicate'));
      });
    });
    container.querySelectorAll('[data-cuadro-delete]').forEach(button => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void deleteFrameFromToken(button.getAttribute('data-cuadro-delete'));
      });
    });
    container.querySelectorAll('[data-board-rename]').forEach(label => {
      label.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        startInlineRename(label);
      });
    });
    container.querySelectorAll('[data-board-id]').forEach(item => {
      item.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        showBoardContextMenu(item.getAttribute('data-board-id'), event.clientX, event.clientY);
      });
    });
    mountEditor();
    void ensureVisibleThumbnails();
  }

  function mountEditor() {
    editor?.close?.(false);
    const host = /** @type {HTMLElement|null} */ (container.querySelector('[data-tactical-canvas-host]'));
    if (!host) return;
    const activeFrame = getActiveFrame();
    if (!activeFrame) {
      host.innerHTML = '<div class="tactical-canvas-empty">No hay cuadro seleccionado</div>';
      editor = null;
      return;
    }
    const canvasSettings = normalizeCanvas(activeBoard?.canvas);
    editor = createDrawingEditor(host, {
      initialTool: 'select',
      width: canvasSettings.width,
      height: canvasSettings.height,
      backgroundImage: getFieldDataUrl(canvasSettings),
      strokes: activeFrame.elements || [],
      durationSeconds: activeFrame.durationSeconds,
      includeImageData: true,
      allowExport: false,
      showDuration: false,
      showActions: false,
      onSave: saveActiveSequence,
      onChange: scheduleThumbnailSync,
      onCancel: () => {
        editor = null;
      },
    });
    if (!activeFrame.thumbnail) scheduleThumbnailSync();
  }

  function snapshotActiveFrame(payload = null) {
    const frames = getFrames();
    const activeFrame = getActiveFrame();
    if (!activeFrame) return frames;
    const snapshot = payload || editor?.getState?.() || {};
    return frames.map((frame, index) => frame.id === activeFrame.id
      ? {
          ...frame,
          order: index,
          duration: Math.max(0.5, Math.min(10, Number(frame.durationSeconds ?? frame.duration) || 3)),
          durationSeconds: Math.max(0.5, Math.min(10, Number(frame.durationSeconds ?? frame.duration) || 3)),
          elements: payload?.strokes ? cloneValue(payload.strokes) : cloneValue(snapshot.strokes || frame.elements) || [],
          thumbnail: payload?.imageDataUrl || frame.thumbnail || '',
          thumbnailWidth: payload?.imageDataUrl ? normalizeCanvas(activeBoard?.canvas).width : frame.thumbnailWidth || 0,
          thumbnailHeight: payload?.imageDataUrl ? normalizeCanvas(activeBoard?.canvas).height : frame.thumbnailHeight || 0,
          thumbnailVersion: payload?.imageDataUrl ? CUADRO_THUMBNAIL_VERSION : frame.thumbnailVersion || 0,
        }
      : { ...frame, order: index, duration: frame.durationSeconds ?? frame.duration ?? 3 });
  }

  function normalizeFramesForSave(frames = []) {
    return frames.map((frame, index) => {
      const durationSeconds = Math.max(0.5, Math.min(10, Number(frame.durationSeconds ?? frame.duration) || 3));
      return {
        ...frame,
        order: index,
        duration: durationSeconds,
        durationSeconds,
        elements: cloneValue(frame.elements) || [],
        thumbnail: frame.thumbnail || '',
        thumbnailWidth: Number(frame.thumbnailWidth) || 0,
        thumbnailHeight: Number(frame.thumbnailHeight) || 0,
        thumbnailVersion: Number(frame.thumbnailVersion) || 0,
      };
    });
  }

  function syncBoardSummary(board) {
    if (!board?.id) return;
    const frames = getBoardFrames(board);
    const summary = {
      id: board.id,
      kind: board.kind || 'drawing-sequence',
      name: board.name,
      date: board.date,
      updatedAt: board.updatedAt,
      thumbnail: board.thumbnail || frames.find(frame => frame.thumbnail)?.thumbnail || '',
      stepCount: Number(board.stepCount) || frames.length,
      frameCount: Number(board.frameCount) || frames.length,
      isOpen: viewMode === 'detail' && activeBoard?.id === board.id,
    };
    boards = [summary, ...boards.filter(item => item.id !== board.id)];
  }

  async function persistActiveBoard(board = activeBoard, options = {}) {
    if (!board?.id) return null;
    const shouldReplaceActive = options.replaceActive !== false && activeBoard?.id === board.id;
    const frames = normalizeFramesForSave(board.frames || getFrames());
    const thumbnail = board.thumbnail || frames.find(frame => frame.thumbnail)?.thumbnail || '';
    const canvasSettings = normalizeCanvas(board.canvas || activeBoard?.canvas || {});
    setSaveStatus('saving');
    try {
      const saved = await window.api.tacticalBoards.update(board.id, {
        name: board.name || 'Nueva secuencia',
        thumbnail,
        canvas: canvasSettings,
        frames,
        drawingSequences: [
          {
            id: board.id,
            name: board.name || 'Nueva secuencia',
            isOpen: viewMode === 'detail' && activeBoard?.id === board.id,
            frames,
          },
        ],
      });
      if (shouldReplaceActive) activeBoard = saved;
      syncBoardSummary(saved);
      setSaveStatus('saved');
      return saved;
    } catch {
      setSaveStatus('error');
      return null;
    }
  }

  function scheduleThumbnailSync() {
    if (!activeBoard || !activeFrameId || isPlaybackPlaying) return;
    const frameId = activeFrameId;
    const editorRef = editor;
    window.clearTimeout(thumbnailSyncTimer);
    thumbnailSyncTimer = window.setTimeout(async () => {
      if (!editorRef || editorRef !== editor || frameId !== activeFrameId || isPlaybackPlaying) return;
      try {
        const editorState = editorRef.getState();
        const thumbnail = await generateCuadroThumbnail({ elements: editorState.strokes }, activeBoard?.canvas);
        if (editorRef !== editor || frameId !== activeFrameId || isPlaybackPlaying) return;
        const payload = { ...editorState, imageDataUrl: thumbnail };
        const nextFrames = snapshotActiveFrame(payload);
        activeBoard = {
          ...activeBoard,
          thumbnail,
          frames: nextFrames.map(frame => frame.id === frameId ? {
            ...frame,
            thumbnail,
            thumbnailWidth: normalizeCanvas(activeBoard?.canvas).width,
            thumbnailHeight: normalizeCanvas(activeBoard?.canvas).height,
            thumbnailVersion: CUADRO_THUMBNAIL_VERSION,
          } : frame),
        };
        await persistActiveBoard(activeBoard);
      } catch {
        setSaveStatus('error');
      }
    }, 450);
  }

  async function flushActiveFrameSnapshot() {
    if (!activeBoard?.id) return null;
    window.clearTimeout(thumbnailSyncTimer);
    if (!activeFrameId || !editor) {
      return persistActiveBoard({ ...activeBoard, frames: snapshotActiveFrame() });
    }
    try {
      const editorState = editor.getState();
      const thumbnail = await generateCuadroThumbnail({ elements: editorState.strokes }, activeBoard?.canvas);
      const payload = { ...editorState, imageDataUrl: thumbnail };
      const nextFrames = snapshotActiveFrame(payload).map(frame => frame.id === activeFrameId
        ? {
            ...frame,
            thumbnail,
            thumbnailWidth: normalizeCanvas(activeBoard?.canvas).width,
            thumbnailHeight: normalizeCanvas(activeBoard?.canvas).height,
            thumbnailVersion: CUADRO_THUMBNAIL_VERSION,
          }
        : frame);
      activeBoard = {
        ...activeBoard,
        thumbnail,
        frames: nextFrames,
      };
      return persistActiveBoard(activeBoard);
    } catch {
      setSaveStatus('error');
      return persistActiveBoard({ ...activeBoard, frames: snapshotActiveFrame() });
    }
  }

  function captureActiveFrameSnapshot() {
    if (!activeBoard?.id) return null;
    window.clearTimeout(thumbnailSyncTimer);
    activeBoard = { ...activeBoard, frames: snapshotActiveFrame() };
    return activeBoard;
  }

  async function ensureVisibleThumbnails() {
    if (!activeBoard || viewMode !== 'detail' || isPlaybackPlaying || thumbnailHydrationInFlight) return;
    const boardId = activeBoard.id;
    const frames = getFrames();
    const missing = frames.filter(frame => !frame.thumbnail
      || !String(frame.thumbnail).startsWith('data:image/svg+xml')
      || Number(frame.thumbnailWidth) < CUADRO_THUMBNAIL_WIDTH
      || Number(frame.thumbnailVersion) !== CUADRO_THUMBNAIL_VERSION);
    if (!missing.length) return;
    const canvasSettings = normalizeCanvas(activeBoard.canvas);
    thumbnailHydrationInFlight = true;
    try {
      const generated = await Promise.all(missing.map(async frame => ({
        id: frame.id,
        thumbnail: await generateCuadroThumbnail(frame, canvasSettings),
        thumbnailWidth: CUADRO_THUMBNAIL_WIDTH,
        thumbnailHeight: Math.round(CUADRO_THUMBNAIL_WIDTH * (canvasSettings.height / canvasSettings.width)),
        thumbnailVersion: CUADRO_THUMBNAIL_VERSION,
      })));
      if (disposed || !activeBoard || activeBoard?.id !== boardId || viewMode !== 'detail' || isPlaybackPlaying) return;
      const thumbnails = new Map(generated.filter(item => item.thumbnail).map(item => [item.id, item]));
      if (!thumbnails.size) return;
      const nextFrames = getFrames().map(frame => thumbnails.has(frame.id)
        ? { ...frame, ...thumbnails.get(frame.id) }
        : frame);
      activeBoard = {
        ...activeBoard,
        thumbnail: activeBoard.thumbnail || nextFrames.find(frame => frame.thumbnail)?.thumbnail || '',
        frames: nextFrames,
      };
      thumbnails.forEach((item, frameId) => updateCuadroThumbnailDom(frameId, item.thumbnail));
      await persistActiveBoard(activeBoard);
    } catch {
      setSaveStatus('error');
    } finally {
      thumbnailHydrationInFlight = false;
    }
  }

  async function saveActiveSequence(payload = null) {
    if (!activeBoard) return;
    const editorState = payload || editor?.getState?.() || {};
    const canvasSettings = normalizeCanvas({
      ...(activeBoard.canvas || {}),
      ...(editorState?.canvas || {}),
    });
    const thumbnail = editorState?.imageDataUrl || await generateCuadroThumbnail({ elements: editorState?.strokes || [] }, canvasSettings);
    const payloadWithThumbnail = { ...editorState, imageDataUrl: thumbnail };
    let nextFrames = snapshotActiveFrame(payloadWithThumbnail);
    const activeFrame = getActiveFrame();
    nextFrames = nextFrames.map(frame => frame.id === activeFrame?.id ? {
      ...frame,
      thumbnail,
      thumbnailWidth: normalizeCanvas(activeBoard?.canvas).width,
      thumbnailHeight: normalizeCanvas(activeBoard?.canvas).height,
      thumbnailVersion: CUADRO_THUMBNAIL_VERSION,
    } : frame);
    await persistActiveBoard({ ...activeBoard, thumbnail, canvas: canvasSettings, frames: nextFrames });
  }

  function updateCanvasOptions(updates) {
    if (isPlaybackPlaying) return;
    activeBoard = {
      ...(activeBoard || { name: 'Nueva secuencia' }),
      canvas: normalizeCanvas({
        ...(activeBoard?.canvas || {}),
        ...updates,
      }),
      frames: snapshotActiveFrame(),
    };
    render();
    void persistActiveBoard(activeBoard);
    scheduleThumbnailSync();
  }

  function updateActiveFrameDuration(value) {
    const durationSeconds = Math.max(0.5, Math.min(10, Number(value) || 3));
    activeBoard = {
      ...activeBoard,
      frames: getFrames().map(frame => frame.id === activeFrameId ? { ...frame, duration: durationSeconds, durationSeconds } : frame),
    };
    void persistActiveBoard(activeBoard);
  }

  function createNewSequence() {
    const fallbackName = `Jugada ${boards.length + 1}`;
    openSequenceNameDialog({
      title: 'Nueva secuencia',
      submitLabel: 'Crear secuencia',
      fallbackName,
      onSubmit: async (name) => {
        activeBoard = await window.api.tacticalBoards.create({
          name,
          thumbnail: '',
          canvas: { ...DEFAULT_CANVAS },
          frames: [],
          drawingSequences: [{ name, isOpen: true, frames: [] }],
        });
        activeFrameId = '';
        viewMode = 'detail';
        await load(activeBoard.id);
      },
    });
  }

  async function addFrame(boardId = activeBoard?.id) {
    if (!boardId) return;
    const capturedBoard = captureActiveFrameSnapshot();
    const sameBoard = activeBoard?.id === boardId;
    if (capturedBoard && !sameBoard) void persistActiveBoard(capturedBoard, { replaceActive: false });
    if (!sameBoard) activeBoard = await window.api.tacticalBoards.get(boardId);
    const frames = getFrames();
    const frame = normalizeFrameForView(createCuadroFromPrevious({ ...activeBoard, frames }), frames.length);
    activeBoard = { ...activeBoard, frames: [...frames, frame] };
    activeFrameId = frame.id;
    viewMode = 'detail';
    render();
    await persistActiveBoard(activeBoard);
    scheduleThumbnailSync();
  }

  async function selectFrameFromToken(token) {
    const [boardId, frameId] = String(token || '').split(':');
    if (!boardId || !frameId) return;
    stopPlayback();
    const capturedBoard = captureActiveFrameSnapshot();
    const sameBoard = activeBoard?.id === boardId;
    if (capturedBoard && !sameBoard) void persistActiveBoard(capturedBoard, { replaceActive: false });
    if (!sameBoard) activeBoard = await window.api.tacticalBoards.get(boardId);
    activeFrameId = frameId;
    viewMode = 'detail';
    render();
    if (capturedBoard && sameBoard) void persistActiveBoard(capturedBoard, { replaceActive: false });
  }

  async function duplicateFrameFromToken(token) {
    const [boardId, frameId] = String(token || '').split(':');
    if (!boardId || !frameId) return;
    const capturedBoard = captureActiveFrameSnapshot();
    const sameBoard = activeBoard?.id === boardId;
    if (capturedBoard && !sameBoard) void persistActiveBoard(capturedBoard, { replaceActive: false });
    if (!sameBoard) activeBoard = await window.api.tacticalBoards.get(boardId);
    const frames = getFrames();
    const source = frames.find(frame => frame.id === frameId);
    if (!source) return;
    const insertIndex = frames.findIndex(frame => frame.id === frameId) + 1;
    const frame = normalizeFrameForView({
      ...source,
      id: createFrameId(),
      name: `${source.name} copia`,
      order: insertIndex,
      elements: source.elements,
      thumbnail: source.thumbnail,
    }, insertIndex);
    const nextFrames = [
      ...frames.slice(0, insertIndex),
      frame,
      ...frames.slice(insertIndex),
    ].map((item, index) => ({ ...item, order: index }));
    activeBoard = { ...activeBoard, frames: nextFrames };
    activeFrameId = frame.id;
    viewMode = 'detail';
    render();
    await persistActiveBoard(activeBoard);
    scheduleThumbnailSync();
  }

  async function deleteFrameFromToken(token) {
    const [boardId, frameId] = String(token || '').split(':');
    if (!boardId || !frameId) return;
    const capturedBoard = captureActiveFrameSnapshot();
    const sameBoard = activeBoard?.id === boardId;
    if (capturedBoard && !sameBoard) void persistActiveBoard(capturedBoard, { replaceActive: false });
    if (!sameBoard) activeBoard = await window.api.tacticalBoards.get(boardId);
    const frames = getFrames();
    const removeIndex = frames.findIndex(frame => frame.id === frameId);
    if (removeIndex < 0) return;
    const nextFrames = frames.filter(frame => frame.id !== frameId).map((frame, index) => ({ ...frame, order: index }));
    activeBoard = { ...activeBoard, frames: nextFrames };
    activeFrameId = nextFrames[Math.max(0, Math.min(removeIndex, nextFrames.length - 1))]?.id || '';
    viewMode = 'detail';
    render();
    await persistActiveBoard(activeBoard);
  }

  async function openSequenceDetail(id) {
    if (!id) return;
    stopPlayback();
    if (activeBoard?.id && activeBoard.id !== id) await flushActiveFrameSnapshot();
    openActionMenuId = '';
    activeFrameId = '';
    viewMode = 'detail';
    await load(id);
  }

  async function returnToSequenceList() {
    stopPlayback();
    openActionMenuId = '';
    if (activeBoard?.id) await flushActiveFrameSnapshot();
    activeFrameId = '';
    viewMode = 'list';
    render();
  }

  function togglePlayback() {
    if (isPlaybackPlaying) {
      stopPlayback();
      render();
      return;
    }
    playSequence();
  }

  function playSequence() {
    const frames = snapshotActiveFrame();
    if (frames.length < 2 || !editor) return;
    window.clearTimeout(thumbnailSyncTimer);
    activeBoard = { ...activeBoard, frames };
    isPlaybackPlaying = true;
    playbackStartedAt = performance.now();
    activeFrameId = frames[0].id;
    editor.setLocked(true);
    setSaveStatus('saved');
    renderPlaybackStatus(frames, 0);
    playbackAnimationFrame = window.requestAnimationFrame(playbackTick);
  }

  function playbackTick(now) {
    if (!isPlaybackPlaying || !editor) return;
    const frames = getFrames();
    const elapsedSeconds = Math.max(0, (now - playbackStartedAt) / 1000);
    let cursor = 0;
    for (let index = 0; index < frames.length - 1; index += 1) {
      const fromFrame = frames[index];
      const toFrame = frames[index + 1];
      const durationSeconds = Math.max(0.5, Number(fromFrame.durationSeconds) || 3);
      const end = cursor + durationSeconds;
      if (elapsedSeconds <= end) {
        const progress = Math.max(0, Math.min(1, (elapsedSeconds - cursor) / durationSeconds));
        const interpolated = interpolateFrame(fromFrame, toFrame, progress);
        activeFrameId = fromFrame.id;
        editor.setPreviewStrokes(interpolated.elements || []);
        renderPlaybackStatus(frames, index);
        playbackAnimationFrame = window.requestAnimationFrame(playbackTick);
        return;
      }
      cursor = end;
    }
    const lastFrame = frames.at(-1);
    activeFrameId = lastFrame?.id || '';
    stopPlayback();
    if (lastFrame) editor.loadDrawing({ strokes: lastFrame.elements, durationSeconds: lastFrame.durationSeconds });
    render();
  }

  function stopPlayback() {
    if (playbackAnimationFrame) window.cancelAnimationFrame(playbackAnimationFrame);
    playbackAnimationFrame = 0;
    isPlaybackPlaying = false;
    editor?.setLocked?.(false);
    editor?.clearPreview?.();
    setSaveStatus('saved');
  }

  function renderPlaybackStatus(frames = getFrames(), index = Math.max(0, frames.findIndex(frame => frame.id === activeFrameId))) {
    const current = container.querySelector('[data-sequence-current-frame]');
    const playButton = container.querySelector('[data-sequence-play]');
    if (current) {
      current.textContent = frames.length ? `${Math.max(0, index) + 1}/${frames.length}` : 'Sin cuadro';
      current.setAttribute('aria-label', frames.length ? `Cuadro ${Math.max(0, index) + 1} de ${frames.length}` : 'Sin cuadro');
    }
    if (playButton) playButton.textContent = isPlaybackPlaying ? 'Pausar' : 'Reproducir';
  }

  function promptRenameSequence(id) {
    if (!id) return;
    openActionMenuId = '';
    const board = boards.find(item => item.id === id) || activeBoard;
    openSequenceNameDialog({
      title: 'Renombrar secuencia',
      submitLabel: 'Guardar nombre',
      initialValue: board?.name || '',
      fallbackName: board?.name || 'Secuencia',
      onSubmit: async (nextName) => {
        await renameBoard(id, nextName);
      },
    });
  }

  function openSequenceNameDialog({
    title,
    submitLabel,
    initialValue = '',
    fallbackName = 'Nueva secuencia',
    onSubmit,
  }) {
    document.querySelector('[data-sequence-name-dialog]')?.remove();
    const dialog = document.createElement('div');
    dialog.className = 'tactical-sequence-dialog-backdrop';
    dialog.setAttribute('data-sequence-name-dialog', '');
    dialog.setAttribute('role', 'presentation');
    dialog.innerHTML = `
      <form class="tactical-sequence-dialog" role="dialog" aria-modal="true" aria-labelledby="sequence-name-title">
        <header>
          <strong id="sequence-name-title">${escapeHtml(title)}</strong>
          <button type="button" data-sequence-name-cancel aria-label="Cerrar">x</button>
        </header>
        <label>
          <span>Nombre</span>
          <input type="text" data-sequence-name-input maxlength="64" autocomplete="off">
        </label>
        <p data-sequence-name-error aria-live="polite"></p>
        <footer>
          <button type="button" class="btn btn-secondary btn-sm" data-sequence-name-cancel>Cancelar</button>
          <button type="submit" class="btn btn-primary btn-sm" data-sequence-name-submit>${escapeHtml(submitLabel)}</button>
        </footer>
      </form>
    `;
    document.body.appendChild(dialog);

    const form = dialog.querySelector('form');
    const input = /** @type {HTMLInputElement|null} */ (dialog.querySelector('[data-sequence-name-input]'));
    const error = dialog.querySelector('[data-sequence-name-error]');
    const submitButton = /** @type {HTMLButtonElement|null} */ (dialog.querySelector('[data-sequence-name-submit]'));
    if (input) input.value = initialValue;

    const close = () => dialog.remove();
    const submit = async (event) => {
      event.preventDefault();
      const name = input?.value.trim() || fallbackName;
      if (submitButton) submitButton.disabled = true;
      if (error) error.textContent = '';
      try {
        await onSubmit(name);
        close();
      } catch {
        if (error) error.textContent = 'No se pudo guardar. Intenta de nuevo.';
        if (submitButton) submitButton.disabled = false;
      }
    };

    form?.addEventListener('submit', (event) => void submit(event));
    dialog.querySelectorAll('[data-sequence-name-cancel]').forEach(button => {
      button.addEventListener('click', close);
    });
    dialog.addEventListener('pointerdown', (event) => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.select();
    });
  }

  async function deleteBoard(id) {
    if (!id) return;
    openActionMenuId = '';
    await window.api.tacticalBoards.delete(id);
    activeBoard = null;
    activeFrameId = '';
    viewMode = 'list';
    await load();
  }

  async function duplicateBoard(id) {
    if (!id) return;
    openActionMenuId = '';
    if (activeBoard?.id) await flushActiveFrameSnapshot();
    const source = await window.api.tacticalBoards.get(id);
    const sourceFrames = getBoardFrames(source);
    const frames = sourceFrames.map((frame, index) => ({
      ...frame,
      id: createFrameId(),
      name: frame.name || `Cuadro ${index + 1}`,
      order: index,
      elements: cloneValue(frame.elements) || [],
      thumbnail: frame.thumbnail || '',
    }));
    activeBoard = await window.api.tacticalBoards.create({
      name: `${source.name || 'Jugada'} copia`,
      thumbnail: source.thumbnail || frames.find(frame => frame.thumbnail)?.thumbnail || '',
      canvas: source.canvas || { ...DEFAULT_CANVAS },
      frames,
      drawingSequences: [{ name: `${source.name || 'Jugada'} copia`, isOpen: true, frames }],
    });
    activeFrameId = getBoardFrames(activeBoard)[0]?.id || '';
    viewMode = 'detail';
    await load(activeBoard.id);
  }

  async function renameBoard(id, nextName) {
    if (!id || !nextName?.trim()) return;
    activeBoard = await window.api.tacticalBoards.rename(id, nextName.trim());
    await load(activeBoard.id);
  }

  function startInlineRename(label) {
    const id = label.closest('[data-board-id]')?.getAttribute('data-board-id');
    if (!id) return;
    const currentName = label.textContent || '';
    const input = document.createElement('input');
    input.className = 'tactical-board-name-input';
    input.type = 'text';
    input.value = currentName;
    input.setAttribute('aria-label', 'Nombre de la secuencia');
    label.replaceWith(input);
    input.focus();
    input.select();

    const commit = async () => {
      const nextName = input.value.trim();
      if (!nextName || nextName === currentName.trim()) {
        await load(id);
        return;
      }
      await renameBoard(id, nextName);
    };

    input.addEventListener('click', event => event.stopPropagation());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
      if (event.key === 'Escape') load(id);
    });
    input.addEventListener('blur', commit, { once: true });
  }

  function showBoardContextMenu(id, x, y) {
    if (!id) return;
    document.querySelector('.tactical-board-context-menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'tactical-board-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.innerHTML = '<button class="tactical-board-context-delete" type="button">Eliminar</button>';
    document.body.appendChild(menu);

    const close = () => menu.remove();
    menu.querySelector('button')?.addEventListener('click', async () => {
      close();
      await deleteBoard(id);
    });
    setTimeout(() => {
      document.addEventListener('pointerdown', close, { once: true });
      document.addEventListener('keydown', close, { once: true });
    }, 0);
  }

  async function exportActiveBoard() {
    if (!editor) return;
    await window.api.tacticalBoards.exportPng(await editor.getCompositeDataUrl(), `${activeBoard?.name || 'secuencia'}.png`);
  }
}
