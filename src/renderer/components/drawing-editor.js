// @ts-check
import {
  createStroke,
  drawStrokes,
  eraseStrokesAlongPath,
  findStrokeAtPoint,
  findStrokesInRect,
  getStrokeBounds,
  moveStrokes,
  pushHistory,
  redoHistory,
  removeStrokesByIds,
  scaleStrokes,
  serializeDrawing,
  undoHistory,
} from '../drawing/drawing-engine.js';
import {
  getDrawingSequenceDuration,
  getDrawingSequenceStepAtTime,
  getDrawingSequenceStrokesAtTime,
  normalizeDrawingSequenceSteps,
  normalizeStepDuration,
} from '../drawing/drawing-sequence.js';

const TOOL_OPTIONS = [
  ['select', 'Seleccionar', 'mouse-pointer'],
  ['arrow', 'Flecha', 'arrow-up-right'],
  ['line', 'Linea', 'minus'],
  ['ellipse', 'Circulo', 'circle'],
  ['rect', 'Rectangulo', 'square'],
  ['freehand', 'Trazo libre', 'pencil'],
  ['text', 'Texto', 'type'],
  ['player', 'Jugador', 'badge-number'],
  ['ball', 'Pelota', 'rugby-ball'],
  ['cone', 'Cono', 'traffic-cone'],
  ['eraser', 'Borrador', 'eraser'],
];

const TOOL_ICONS = {
  'mouse-pointer': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l11 10-5 1 3 6-3 1-3-6-4 4z"/></svg>',
  'arrow-up-right': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7"/><path d="M9 7h8v8"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  circle: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/></svg>',
  square: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.5-1 10-10a2.2 2.2 0 0 0-3.1-3.1l-10 10z"/><path d="M14 7l3 3"/></svg>',
  type: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14"/><path d="M9 6v12"/><path d="M15 6v12"/><path d="M8 18h8"/></svg>',
  'badge-number': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M9.5 15.5h5"/><path d="M10.5 8.5h2v7"/></svg>',
  'rugby-ball': '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="8" ry="5" transform="rotate(-20 12 12)"/><path d="M8.7 12.6l6.6-2.4"/><path d="M10.5 10.9l.8 2.2"/><path d="M12.4 10.2l.8 2.2"/></svg>',
  'traffic-cone': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 16H5z"/><path d="M9 14h6"/><path d="M7 20h10"/></svg>',
  eraser: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15l7-7a2.8 2.8 0 0 1 4 0l4 4a2.8 2.8 0 0 1 0 4l-4 4H9z"/><path d="M12 20h8"/><path d="M8 11l6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14"/><path d="M16 5v14"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="10" height="10" rx="2"/><path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>',
};

const FIXED_TOOL_STYLES = {
  ball: { color: '#B9794B', radius: 18 },
  cone: { color: '#F5B63D', radius: 18 },
};

const QUICK_COLORS = [
  '#FFFFFF',
  'var(--color-accent)',
  'var(--tag-sucio)',
  'var(--tag-ganado)',
  'var(--tag-ataque)',
  '#050917',
];

const STROKE_WIDTHS = [1, 3, 6];

const HOTKEYS = {
  v: 'select',
  a: 'arrow',
  l: 'line',
  o: 'ellipse',
  r: 'rect',
  p: 'freehand',
  t: 'text',
  j: 'player',
  b: 'ball',
  c: 'cone',
  e: 'eraser',
};

/**
 * @param {string} icon
 * @returns {string}
 */
function renderIcon(icon) {
  if (icon === 'type') return '<span class="drawing-tool-letter" aria-hidden="true">T</span>';
  return `<span class="drawing-tool-icon">${TOOL_ICONS[icon] || ''}</span>`;
}

/**
 * @param {string} tool
 * @returns {string}
 */
function getHotkeyForTool(tool) {
  return Object.entries(HOTKEYS).find(([, value]) => value === tool)?.[0]?.toUpperCase() || '';
}

/**
 * @param {string} label
 * @param {string} tool
 * @returns {string}
 */
function getToolTitle(label, tool) {
  const hotkey = getHotkeyForTool(tool);
  return hotkey ? `${label} (${hotkey})` : label;
}

/**
 * @param {HTMLElement} root
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
function qs(root, selector) {
  return /** @type {HTMLElement|null} */ (root.querySelector(selector));
}

/**
 * @param {string} color
 * @returns {string}
 */
function resolveColor(color) {
  if (!color.startsWith('var(')) return color;
  const token = color.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#FFFFFF';
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {PointerEvent|MouseEvent} event
 * @returns {{x: number, y: number}}
 */
function getCanvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  return { x, y };
}

/**
 * @param {{x: number, y: number}} start
 * @param {{x: number, y: number}} end
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function createRectFromPoints(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/**
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isEditableTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/**
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<object>} strokes
 * @param {Array<string>} ids
 */
function drawSelectionOutlines(ctx, strokes, ids) {
  if (!ids.length) return;
  const selected = new Set(ids);
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#FFFFFF';
  strokes.filter(stroke => selected.has(stroke.id)).forEach((stroke) => {
    const bounds = getStrokeBounds(stroke);
    if (bounds) ctx.strokeRect(bounds.x - 8, bounds.y - 8, bounds.width + 16, bounds.height + 16);
  });
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number, width: number, height: number}|null} rect
 */
function drawSelectionRect(ctx, rect) {
  if (!rect) return;
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#A9C7FF';
  ctx.fillStyle = 'rgba(169, 199, 255, 0.08)';
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

/**
 * @param {Array<object>} value
 * @returns {Array<object>}
 */
function cloneStrokes(value = []) {
  return JSON.parse(JSON.stringify(Array.isArray(value) ? value : []));
}

/**
 * @returns {string}
 */
function createStepId() {
  return globalThis.crypto?.randomUUID?.() || `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * @param {HTMLElement} host
 * @param {object} options
 * @returns {object}
 */
export function createDrawingEditor(host, options = {}) {
  const width = Math.max(1, Number(options.width) || host.clientWidth || 1280);
  const height = Math.max(1, Number(options.height) || host.clientHeight || 720);
  const sequenceMode = options.sequenceMode === true;
  const showActions = options.showActions !== false;
  const initialSteps = normalizeDrawingSequenceSteps({
    steps: options.steps,
    strokes: options.strokes,
    durationSeconds: options.durationSeconds,
  });
  const initialStep = initialSteps[0] || { durationSeconds: 3, strokes: [] };
  const state = {
    tool: options.initialTool || 'select',
    color: '#FFFFFF',
    width: 3,
    playerNumber: Math.min(99, Math.max(1, Number(options.playerNumber) || 1)),
    strokes: sequenceMode ? cloneStrokes(initialStep.strokes) : cloneStrokes(options.strokes),
    previewStrokes: null,
    draft: null,
    durationSeconds: sequenceMode ? normalizeStepDuration(initialStep.durationSeconds) : Number(options.durationSeconds) || 3,
    showDuration: options.showDuration !== false,
    sequenceMode,
    steps: sequenceMode ? initialSteps : [],
    activeStepIndex: 0,
    isPreviewPlaying: false,
    previewTimer: 0,
    previewAnimationFrame: 0,
    selectedStrokeIds: [],
    selectionStartPoint: null,
    selectionRect: null,
    lastMovePoint: null,
    moveStarted: false,
    dragMode: '',
    history: { undo: [], redo: [] },
    backgroundImage: options.backgroundImage || '',
    disposed: false,
    locked: false,
  };

  const shell = document.createElement('div');
  shell.className = `drawing-editor-shell ${options.className || ''}`.trim();
  shell.dataset.tool = state.tool;
  shell.innerHTML = `
    <div class="drawing-editor-stage" style="--drawing-aspect:${width / height}">
      ${state.backgroundImage ? `<img class="drawing-editor-bg" src="${state.backgroundImage}" alt="" aria-hidden="true" />` : ''}
      <canvas class="drawing-editor-canvas" width="${width}" height="${height}"></canvas>
    </div>
    ${sequenceMode ? `
      <div class="drawing-sequence-strip" role="group" aria-label="Etapas de la secuencia">
        <button class="drawing-sequence-control" type="button" data-sequence-preview aria-label="Reproducir secuencia" title="Reproducir secuencia">
          ${renderIcon('play')}
        </button>
        <div class="drawing-sequence-steps" data-sequence-steps></div>
        <button class="drawing-sequence-control" type="button" data-sequence-add aria-label="Nueva etapa" title="Nueva etapa">
          ${renderIcon('plus')}
        </button>
        <button class="drawing-sequence-control" type="button" data-sequence-duplicate aria-label="Duplicar etapa" title="Duplicar etapa">
          ${renderIcon('copy')}
        </button>
        <button class="drawing-sequence-control danger" type="button" data-sequence-delete aria-label="Eliminar etapa" title="Eliminar etapa">
          ${renderIcon('trash')}
        </button>
      </div>
    ` : ''}
    <div class="drawing-toolbar" role="toolbar" aria-label="Herramientas de dibujo">
      <div class="drawing-toolbar-row">
        ${TOOL_OPTIONS.map(([tool, label, icon]) => `
          <button class="drawing-tool-btn${tool === state.tool ? ' active' : ''}" type="button" data-tool="${tool}" aria-label="${getToolTitle(label, tool)}" title="${getToolTitle(label, tool)}">
            ${renderIcon(icon)}
          </button>
        `).join('')}
      </div>
      <div class="drawing-toolbar-row drawing-toolbar-controls">
        <div class="drawing-color-row">
          ${QUICK_COLORS.map(color => `
            <button class="drawing-color-btn${resolveColor(color).toLowerCase() === state.color.toLowerCase() ? ' active' : ''}" type="button" data-color="${resolveColor(color)}" style="--drawing-color:${resolveColor(color)}" aria-label="Color"></button>
          `).join('')}
          <label class="drawing-color-picker" title="Color personalizado">
            ${renderIcon('plus')}
            <input type="color" data-color-picker value="${state.color}">
          </label>
        </div>
        <div class="drawing-width-row">
          ${STROKE_WIDTHS.map(widthOption => `
            <button class="drawing-width-btn${widthOption === state.width ? ' active' : ''}" type="button" data-width="${widthOption}" aria-label="Grosor ${widthOption}px">
              <span style="height:${widthOption}px"></span>
            </button>
          `).join('')}
        </div>
        <div class="drawing-size-row" aria-label="Tamano de seleccion">
          <button class="drawing-size-btn" type="button" data-size-down aria-label="Achicar seleccionado" title="Achicar seleccionado" disabled>
            ${renderIcon('minus')}
          </button>
          <button class="drawing-size-btn" type="button" data-size-up aria-label="Agrandar seleccionado" title="Agrandar seleccionado" disabled>
            ${renderIcon('plus')}
          </button>
        </div>
        <label class="drawing-player-field" data-player-controls hidden>
          <span>N</span>
          <input type="number" min="1" max="99" step="1" value="${state.playerNumber}" data-player-number aria-label="Numero de jugador">
        </label>
      </div>
      ${showActions ? `<div class="drawing-toolbar-row drawing-toolbar-actions">
        ${state.showDuration ? `<label class="drawing-duration-field">
          <span>${state.durationSeconds}s</span>
          <input type="range" min="0.5" max="10" step="0.5" value="${state.durationSeconds}" data-duration-slider>
        </label>` : ''}
        ${options.allowExport ? '<button class="drawing-action-btn" type="button" data-drawing-export>Exportar PNG</button>' : ''}
        <button class="drawing-action-btn" type="button" data-drawing-cancel>Cancelar</button>
        <button class="drawing-action-btn primary" type="button" data-drawing-save>${sequenceMode ? 'Guardar secuencia' : 'Guardar dibujo'}</button>
      </div>` : ''}
    </div>
  `;
  host.appendChild(shell);

  const stage = /** @type {HTMLElement} */ (shell.querySelector('.drawing-editor-stage'));
  const canvas = /** @type {HTMLCanvasElement} */ (shell.querySelector('.drawing-editor-canvas'));
  const ctx = canvas.getContext('2d');
  let pointerDown = false;
  const fitStage = () => {
    const rect = shell.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const aspect = width / height;
    let stageWidth = rect.width;
    let stageHeight = stageWidth / aspect;
    if (stageHeight > rect.height) {
      stageHeight = rect.height;
      stageWidth = stageHeight * aspect;
    }
    stage.style.width = `${stageWidth}px`;
    stage.style.height = `${stageHeight}px`;
  };
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fitStage) : null;
  let changeTimer = 0;
  resizeObserver?.observe(shell);
  window.addEventListener('resize', fitStage);
  requestAnimationFrame(fitStage);

  const redraw = () => {
    if (!ctx) return;
    const visibleStrokes = state.previewStrokes || state.strokes;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStrokes(ctx, visibleStrokes);
    if (!state.previewStrokes && state.draft) drawStrokes(ctx, [state.draft]);
    if (!state.previewStrokes && !state.locked) {
      drawSelectionOutlines(ctx, state.strokes, state.selectedStrokeIds);
      drawSelectionRect(ctx, state.selectionRect);
    }
    updateSelectionUi();
  };

  const updateDurationUi = () => {
    const slider = /** @type {HTMLInputElement|null} */ (shell.querySelector('[data-duration-slider]'));
    const label = qs(shell, '.drawing-duration-field span');
    if (slider) slider.value = String(state.durationSeconds);
    if (label) label.textContent = `${state.durationSeconds}s`;
  };

  const syncCurrentStep = () => {
    if (!state.sequenceMode || !state.steps[state.activeStepIndex]) return;
    state.steps[state.activeStepIndex] = {
      ...state.steps[state.activeStepIndex],
      durationSeconds: normalizeStepDuration(state.durationSeconds),
      strokes: cloneStrokes(state.strokes),
    };
  };

  const renderSequenceControls = () => {
    if (!state.sequenceMode) return;
    const stepsHost = qs(shell, '[data-sequence-steps]');
    if (!stepsHost) return;
    stepsHost.innerHTML = state.steps.map((step, index) => {
      const isActive = index === state.activeStepIndex;
      const stepNumber = index + 1;
      return `
        <button
          class="drawing-sequence-step${isActive ? ' active' : ''}"
          type="button"
          data-sequence-step="${index}"
          aria-pressed="${isActive ? 'true' : 'false'}"
          aria-label="Etapa ${stepNumber}"
          title="${step.label || `Etapa ${stepNumber}`}"
        >
          <span>${stepNumber}</span>
          <small>${normalizeStepDuration(step.durationSeconds)}s</small>
        </button>
      `;
    }).join('');

    const previewButton = qs(shell, '[data-sequence-preview]');
    if (previewButton) {
      previewButton.innerHTML = renderIcon(state.isPreviewPlaying ? 'pause' : 'play');
      previewButton.setAttribute('aria-label', state.isPreviewPlaying ? 'Pausar secuencia' : 'Reproducir secuencia');
      previewButton.setAttribute('title', state.isPreviewPlaying ? 'Pausar secuencia' : 'Reproducir secuencia');
    }

    const deleteButton = /** @type {HTMLButtonElement|null} */ (shell.querySelector('[data-sequence-delete]'));
    if (deleteButton) deleteButton.disabled = state.steps.length <= 1;
  };

  const stopSequencePreview = ({ restore = true } = {}) => {
    if (!state.sequenceMode) return;
    window.clearTimeout(state.previewTimer);
    if (state.previewAnimationFrame) window.cancelAnimationFrame(state.previewAnimationFrame);
    state.previewTimer = 0;
    state.previewAnimationFrame = 0;
    state.isPreviewPlaying = false;
    state.previewStrokes = null;
    if (restore && state.steps[state.activeStepIndex]) {
      state.strokes = cloneStrokes(state.steps[state.activeStepIndex].strokes);
      state.durationSeconds = normalizeStepDuration(state.steps[state.activeStepIndex].durationSeconds);
      updateDurationUi();
      redraw();
    }
    renderSequenceControls();
  };

  const loadSequenceStep = (index) => {
    if (!state.sequenceMode || !state.steps[index]) return;
    stopSequencePreview();
    syncCurrentStep();
    state.activeStepIndex = index;
    state.strokes = cloneStrokes(state.steps[index].strokes);
    state.durationSeconds = normalizeStepDuration(state.steps[index].durationSeconds);
    state.selectedStrokeIds = [];
    state.selectionRect = null;
    state.history = { undo: [], redo: [] };
    updateDurationUi();
    renderSequenceControls();
    redraw();
  };

  const createStepFromCurrent = (label) => ({
    id: createStepId(),
    label,
    durationSeconds: normalizeStepDuration(state.durationSeconds),
    strokes: cloneStrokes(state.strokes),
  });

  const addSequenceStep = ({ duplicate = false } = {}) => {
    if (!state.sequenceMode) return;
    stopSequencePreview();
    syncCurrentStep();
    const nextIndex = state.steps.length;
    const step = duplicate
      ? createStepFromCurrent(`Etapa ${nextIndex + 1}`)
      : { ...createStepFromCurrent(`Etapa ${nextIndex + 1}`), strokes: cloneStrokes(state.strokes) };
    state.steps = [...state.steps, step];
    loadSequenceStep(nextIndex);
  };

  const deleteSequenceStep = () => {
    if (!state.sequenceMode || state.steps.length <= 1) return;
    stopSequencePreview();
    syncCurrentStep();
    const nextSteps = state.steps.filter((_, index) => index !== state.activeStepIndex);
    state.steps = nextSteps.map((step, index) => ({
      ...step,
      label: step.label || `Etapa ${index + 1}`,
    }));
    const nextIndex = Math.max(0, Math.min(state.activeStepIndex, state.steps.length - 1));
    state.activeStepIndex = nextIndex;
    state.strokes = cloneStrokes(state.steps[nextIndex].strokes);
    state.durationSeconds = normalizeStepDuration(state.steps[nextIndex].durationSeconds);
    state.selectedStrokeIds = [];
    state.history = { undo: [], redo: [] };
    updateDurationUi();
    renderSequenceControls();
    redraw();
  };

  const playSequencePreview = () => {
    if (!state.sequenceMode) return;
    if (state.isPreviewPlaying) {
      stopSequencePreview();
      return;
    }
    syncCurrentStep();
    state.isPreviewPlaying = true;
    state.selectedStrokeIds = [];
    const sequence = { steps: state.steps };
    const totalSeconds = Math.max(0.5, getDrawingSequenceDuration(sequence));
    const startedAt = performance.now();

    const showFrame = (now) => {
      if (!state.isPreviewPlaying || state.disposed) {
        stopSequencePreview();
        return;
      }
      const elapsedSeconds = Math.min(totalSeconds, Math.max(0, (now - startedAt) / 1000));
      const activeStep = getDrawingSequenceStepAtTime({ steps: state.steps }, elapsedSeconds);
      const nextIndex = Math.max(0, state.steps.findIndex(step => step.id === activeStep?.id));
      state.activeStepIndex = nextIndex;
      state.previewStrokes = getDrawingSequenceStrokesAtTime({ steps: state.steps }, elapsedSeconds);
      state.durationSeconds = normalizeStepDuration(state.steps[nextIndex]?.durationSeconds);
      state.selectedStrokeIds = [];
      updateDurationUi();
      renderSequenceControls();
      redraw();

      if (elapsedSeconds >= totalSeconds) {
        stopSequencePreview({ restore: false });
        return;
      }
      state.previewAnimationFrame = window.requestAnimationFrame(showFrame);
    };

    state.previewAnimationFrame = window.requestAnimationFrame(showFrame);
  };

  const getSerializableSteps = () => {
    if (!state.sequenceMode) return [];
    syncCurrentStep();
    return state.steps.map((step, index) => ({
      id: step.id || `step-${index + 1}`,
      label: step.label || `Etapa ${index + 1}`,
      durationSeconds: normalizeStepDuration(step.durationSeconds),
      strokes: cloneStrokes(step.strokes),
    }));
  };

  const setActiveButton = (selector, value, attr) => {
    shell.querySelectorAll(selector).forEach((button) => {
      button.classList.toggle('active', button.getAttribute(attr) === String(value));
    });
  };

  const updateToolUi = () => {
    shell.dataset.tool = state.tool;
    setActiveButton('[data-tool]', state.tool, 'data-tool');
    const playerControls = qs(shell, '[data-player-controls]');
    if (playerControls) playerControls.toggleAttribute('hidden', state.tool !== 'player');
  };

  const updateSelectionUi = () => {
    shell.querySelectorAll('[data-size-down], [data-size-up]').forEach((button) => {
      if (button instanceof HTMLButtonElement) button.disabled = state.locked || state.selectedStrokeIds.length === 0;
    });
  };

  const push = () => {
    state.history = pushHistory(state.history, state.strokes);
  };

  const notifyChange = () => {
    if (state.disposed || state.locked || typeof options.onChange !== 'function') return;
    window.clearTimeout(changeTimer);
    changeTimer = window.setTimeout(() => {
      if (!state.disposed && !state.locked) options.onChange(api.getState());
    }, 0);
  };

  const selectOnly = (id) => {
    state.selectedStrokeIds = id ? [id] : [];
  };

  const switchToSelect = () => {
    state.tool = 'select';
    updateToolUi();
  };

  const scaleSelection = (factor) => {
    if (!state.selectedStrokeIds.length) return;
    push();
    state.strokes = scaleStrokes(state.strokes, state.selectedStrokeIds, factor);
    redraw();
    notifyChange();
  };

  const eraseAtPoints = (points) => {
    const nextStrokes = eraseStrokesAlongPath(state.strokes, points, 8);
    if (nextStrokes !== state.strokes) {
      if (!state.moveStarted) {
        push();
        state.moveStarted = true;
      }
      const remainingIds = new Set(nextStrokes.map(stroke => stroke.id));
      state.strokes = nextStrokes;
      state.selectedStrokeIds = state.selectedStrokeIds.filter(id => remainingIds.has(id));
    }
    redraw();
  };

  const finalizeDraft = () => {
    if (!state.draft) return;
    const stroke = state.draft;
    state.strokes = [...state.strokes, stroke];
    state.draft = null;
    if (stroke.tool === 'freehand') {
      state.selectedStrokeIds = [];
      redraw();
      notifyChange();
      return;
    }
    selectOnly(stroke.id);
    switchToSelect();
    redraw();
    notifyChange();
  };

  const openTextInput = (point) => {
    const rect = canvas.getBoundingClientRect();
    const input = document.createElement('input');
    input.className = 'drawing-text-input';
    input.style.left = `${(point.x / canvas.width) * rect.width}px`;
    input.style.top = `${(point.y / canvas.height) * rect.height}px`;
    input.placeholder = 'Texto';
    stage.appendChild(input);
    input.focus();
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const text = input.value.trim();
      input.remove();
      if (!text) return;
      push();
      const stroke = createStroke('text', {
        color: state.color,
        width: state.width,
        points: [point],
        text,
        fontSize: Math.max(18, state.width * 8),
      });
      state.strokes = [...state.strokes, stroke];
      selectOnly(stroke.id);
      switchToSelect();
      redraw();
      notifyChange();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') commit();
      if (event.key === 'Escape') input.remove();
    });
    input.addEventListener('blur', commit, { once: true });
  };

  const getCompositeDataUrl = async () => {
    const output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    const outputCtx = output.getContext('2d');
    if (!outputCtx) return canvas.toDataURL('image/png');
    if (state.backgroundImage) {
      const image = await loadImage(state.backgroundImage);
      outputCtx.drawImage(image, 0, 0, output.width, output.height);
    }
    drawStrokes(outputCtx, state.strokes);
    return output.toDataURL('image/png');
  };

  const keydown = (event) => {
    if (state.disposed) return;
    if (state.locked) return;
    if (!isEditableTarget(event.target) && (event.key === 'Backspace' || event.key === 'Delete') && state.selectedStrokeIds.length) {
      event.preventDefault();
      push();
      state.strokes = removeStrokesByIds(state.strokes, state.selectedStrokeIds);
      state.selectedStrokeIds = [];
      redraw();
      notifyChange();
      return;
    }
    if (isEditableTarget(event.target)) return;
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const nextTool = HOTKEYS[event.key.toLowerCase()];
      if (nextTool) {
        event.preventDefault();
        stopSequencePreview();
        state.tool = nextTool;
        updateToolUi();
        return;
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      api.close(false);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      api.save();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      const result = undoHistory(state.history, state.strokes);
      state.history = result.history;
      state.strokes = result.strokes;
      state.selectedStrokeIds = [];
      redraw();
      notifyChange();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      const result = redoHistory(state.history, state.strokes);
      state.history = result.history;
      state.strokes = result.strokes;
      state.selectedStrokeIds = [];
      redraw();
      notifyChange();
    }
  };
  document.addEventListener('keydown', keydown);

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (state.locked) return;
    stopSequencePreview();
    const point = getCanvasPoint(canvas, event);
    state.lastMovePoint = null;
    state.moveStarted = false;
    state.dragMode = '';
    state.selectionStartPoint = null;
    state.selectionRect = null;

    if (state.tool === 'select') {
      const selected = findStrokeAtPoint(state.strokes, point, 8);
      pointerDown = true;
      canvas.setPointerCapture?.(event.pointerId);
      if (selected) {
        if (!state.selectedStrokeIds.includes(selected.id)) selectOnly(selected.id);
        state.dragMode = 'move';
        state.lastMovePoint = point;
      } else {
        state.selectedStrokeIds = [];
        state.dragMode = 'marquee';
        state.selectionStartPoint = point;
        state.selectionRect = createRectFromPoints(point, point);
      }
      redraw();
      return;
    }

    if (state.tool === 'text') {
      state.selectedStrokeIds = [];
      openTextInput(point);
      return;
    }

    if (state.tool === 'eraser') {
      pointerDown = true;
      state.dragMode = 'erase';
      state.lastMovePoint = point;
      canvas.setPointerCapture?.(event.pointerId);
      eraseAtPoints([point]);
      return;
    }

    if (state.tool === 'player' || FIXED_TOOL_STYLES[state.tool]) {
      push();
      const fixedStyle = FIXED_TOOL_STYLES[state.tool] || {};
      const stroke = createStroke(state.tool, {
        color: fixedStyle.color || state.color,
        width: state.width,
        points: [point],
        text: state.tool === 'player' ? String(state.playerNumber) : '',
        radius: fixedStyle.radius || 18,
      });
      state.strokes = [...state.strokes, stroke];
      selectOnly(stroke.id);
      if (state.tool === 'player') {
        state.playerNumber = Math.min(99, state.playerNumber + 1);
        const numberInput = /** @type {HTMLInputElement|null} */ (shell.querySelector('[data-player-number]'));
        if (numberInput) numberInput.value = String(state.playerNumber);
      }
      switchToSelect();
      redraw();
      notifyChange();
      return;
    }

    push();
    state.selectedStrokeIds = [];
    pointerDown = true;
    canvas.setPointerCapture?.(event.pointerId);
    state.draft = createStroke(state.tool, {
      color: state.color,
      width: state.width,
      points: [point, point],
    });
    redraw();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (state.tool === 'select') {
      if (!pointerDown) return;
      event.preventDefault();
      const point = getCanvasPoint(canvas, event);

      if (state.dragMode === 'marquee' && state.selectionStartPoint) {
        state.selectionRect = createRectFromPoints(state.selectionStartPoint, point);
        state.selectedStrokeIds = findStrokesInRect(state.strokes, state.selectionRect).map(stroke => stroke.id);
        redraw();
        return;
      }

      if (state.dragMode !== 'move' || !state.selectedStrokeIds.length || !state.lastMovePoint) return;
      const dx = point.x - state.lastMovePoint.x;
      const dy = point.y - state.lastMovePoint.y;
      if (dx === 0 && dy === 0) return;
      if (!state.moveStarted) {
        push();
        state.moveStarted = true;
      }
      state.strokes = moveStrokes(state.strokes, state.selectedStrokeIds, dx, dy);
      state.lastMovePoint = point;
      redraw();
      return;
    }

    if (state.tool === 'eraser') {
      if (!pointerDown || state.dragMode !== 'erase' || !state.lastMovePoint) return;
      event.preventDefault();
      const point = getCanvasPoint(canvas, event);
      eraseAtPoints([state.lastMovePoint, point]);
      state.lastMovePoint = point;
      return;
    }

    if (!pointerDown || !state.draft) return;
    event.preventDefault();
    const point = getCanvasPoint(canvas, event);
    if (state.tool === 'freehand') {
      state.draft.points = [...state.draft.points, point];
    } else {
      state.draft.points = [state.draft.points[0], point];
    }
    redraw();
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!pointerDown) return;
    event.preventDefault();
    pointerDown = false;
    state.lastMovePoint = null;
    state.moveStarted = false;
    canvas.releasePointerCapture?.(event.pointerId);
    if (state.tool === 'select') {
      if (state.dragMode === 'marquee' && state.selectionRect) {
        state.selectedStrokeIds = findStrokesInRect(state.strokes, state.selectionRect).map(stroke => stroke.id);
      }
      state.selectionStartPoint = null;
      state.selectionRect = null;
      state.dragMode = '';
      redraw();
      notifyChange();
      return;
    }
    if (state.tool === 'eraser') {
      state.dragMode = '';
      redraw();
      notifyChange();
      return;
    }
    finalizeDraft();
  });

  canvas.addEventListener('pointercancel', (event) => {
    pointerDown = false;
    state.lastMovePoint = null;
    state.moveStarted = false;
    state.dragMode = '';
    state.selectionStartPoint = null;
    state.selectionRect = null;
    state.draft = null;
    canvas.releasePointerCapture?.(event.pointerId);
    redraw();
  });

  shell.querySelectorAll('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      stopSequencePreview();
      state.tool = button.getAttribute('data-tool') || 'arrow';
      updateToolUi();
    });
  });
  shell.querySelectorAll('[data-color]').forEach((button) => {
    button.addEventListener('click', () => {
      state.color = button.getAttribute('data-color') || '#FFFFFF';
      setActiveButton('[data-color]', state.color, 'data-color');
    });
  });
  qs(shell, '[data-color-picker]')?.addEventListener('input', (event) => {
    state.color = /** @type {HTMLInputElement} */ (event.currentTarget).value;
    shell.querySelectorAll('[data-color]').forEach(button => button.classList.remove('active'));
  });
  shell.querySelectorAll('[data-width]').forEach((button) => {
    button.addEventListener('click', () => {
      state.width = Number(button.getAttribute('data-width')) || 3;
      setActiveButton('[data-width]', state.width, 'data-width');
    });
  });
  qs(shell, '[data-size-down]')?.addEventListener('click', () => scaleSelection(0.85));
  qs(shell, '[data-size-up]')?.addEventListener('click', () => scaleSelection(1.15));
  qs(shell, '[data-duration-slider]')?.addEventListener('input', (event) => {
    stopSequencePreview();
    state.durationSeconds = normalizeStepDuration(Number(/** @type {HTMLInputElement} */ (event.currentTarget).value));
    syncCurrentStep();
    updateDurationUi();
    renderSequenceControls();
    notifyChange();
  });
  qs(shell, '[data-player-number]')?.addEventListener('input', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.currentTarget);
    state.playerNumber = Math.min(99, Math.max(1, Number(input.value) || 1));
    input.value = String(state.playerNumber);
  });
  qs(shell, '[data-sequence-steps]')?.addEventListener('click', (event) => {
    const button = /** @type {HTMLElement|null} */ (event.target)?.closest?.('[data-sequence-step]');
    if (!button) return;
    loadSequenceStep(Number(button.getAttribute('data-sequence-step')));
  });
  qs(shell, '[data-sequence-preview]')?.addEventListener('click', playSequencePreview);
  qs(shell, '[data-sequence-add]')?.addEventListener('click', () => addSequenceStep());
  qs(shell, '[data-sequence-duplicate]')?.addEventListener('click', () => addSequenceStep({ duplicate: true }));
  qs(shell, '[data-sequence-delete]')?.addEventListener('click', deleteSequenceStep);

  const api = {
    element: shell,
    canvas,
    getState() {
      const payload = serializeDrawing(state.strokes, { width: canvas.width, height: canvas.height });
      if (state.sequenceMode) {
        payload.steps = getSerializableSteps();
        payload.durationSeconds = getDrawingSequenceDuration({ steps: payload.steps });
      } else if (state.showDuration) {
        payload.durationSeconds = state.durationSeconds;
      }
      return payload;
    },
    async getCompositeDataUrl() {
      return getCompositeDataUrl();
    },
    loadDrawing(drawing = {}) {
      if (state.sequenceMode) syncCurrentStep();
      state.previewStrokes = null;
      state.strokes = cloneStrokes(drawing.strokes);
      state.durationSeconds = normalizeStepDuration(drawing.durationSeconds, state.durationSeconds);
      state.selectedStrokeIds = [];
      state.selectionStartPoint = null;
      state.selectionRect = null;
      state.lastMovePoint = null;
      state.moveStarted = false;
      state.dragMode = '';
      state.draft = null;
      state.history = { undo: [], redo: [] };
      updateDurationUi();
      updateSelectionUi();
      redraw();
    },
    setPreviewStrokes(strokes) {
      state.previewStrokes = cloneStrokes(strokes);
      state.selectedStrokeIds = [];
      redraw();
    },
    clearPreview() {
      state.previewStrokes = null;
      redraw();
    },
    setLocked(locked) {
      state.locked = Boolean(locked);
      if (!state.locked) state.previewStrokes = null;
      shell.classList.toggle('drawing-editor-shell--locked', state.locked);
      updateSelectionUi();
      redraw();
    },
    async save() {
      if (state.locked) return;
      const payload = {
        ...api.getState(),
        imageDataUrl: options.includeImageData ? await getCompositeDataUrl() : undefined,
      };
      await options.onSave?.(payload);
      api.close(true);
    },
    close(saved = false) {
      state.disposed = true;
      window.clearTimeout(changeTimer);
      stopSequencePreview();
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('resize', fitStage);
      resizeObserver?.disconnect();
      shell.remove();
      if (!saved) options.onCancel?.();
    },
  };

  updateToolUi();
  renderSequenceControls();
  qs(shell, '[data-drawing-cancel]')?.addEventListener('click', () => api.close(false));
  qs(shell, '[data-drawing-save]')?.addEventListener('click', () => api.save());
  qs(shell, '[data-drawing-export]')?.addEventListener('click', async () => {
    await options.onExport?.(await getCompositeDataUrl(), api.getState());
  });

  redraw();
  return api;
}
