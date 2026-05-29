// @ts-check
import {
  createStroke,
  drawStrokes,
  eraseStrokeAtPoint,
  pushHistory,
  redoHistory,
  serializeDrawing,
  undoHistory,
} from '../drawing/drawing-engine.js';

const TOOL_OPTIONS = [
  ['arrow', 'Flecha', '->'],
  ['line', 'Linea', '/'],
  ['ellipse', 'Circulo', 'O'],
  ['rect', 'Rectangulo', '[]'],
  ['freehand', 'Trazo libre', '~'],
  ['text', 'Texto', 'T'],
  ['eraser', 'Borrador', 'X'],
];

const QUICK_COLORS = [
  '#FFFFFF',
  'var(--color-accent)',
  'var(--tag-sucio)',
  'var(--tag-ganado)',
  'var(--tag-ataque)',
  '#050917',
];

const STROKE_WIDTHS = [1, 3, 6];

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
 * @param {HTMLElement} host
 * @param {object} options
 * @returns {object}
 */
export function createDrawingEditor(host, options = {}) {
  const width = Math.max(1, Number(options.width) || host.clientWidth || 1280);
  const height = Math.max(1, Number(options.height) || host.clientHeight || 720);
  const state = {
    tool: 'arrow',
    color: '#FFFFFF',
    width: 3,
    strokes: Array.isArray(options.strokes) ? JSON.parse(JSON.stringify(options.strokes)) : [],
    draft: null,
    durationSeconds: Number(options.durationSeconds) || 3,
    history: { undo: [], redo: [] },
    backgroundImage: options.backgroundImage || '',
    disposed: false,
  };

  const shell = document.createElement('div');
  shell.className = `drawing-editor-shell ${options.className || ''}`.trim();
  shell.innerHTML = `
    ${state.backgroundImage ? `<img class="drawing-editor-bg" src="${state.backgroundImage}" alt="" aria-hidden="true" />` : ''}
    <canvas class="drawing-editor-canvas" width="${width}" height="${height}"></canvas>
    <div class="drawing-toolbar" role="toolbar" aria-label="Herramientas de dibujo">
      <div class="drawing-toolbar-row">
        ${TOOL_OPTIONS.map(([tool, label, icon]) => `
          <button class="drawing-tool-btn${tool === state.tool ? ' active' : ''}" type="button" data-tool="${tool}" aria-label="${label}" title="${label}">${icon}</button>
        `).join('')}
      </div>
      <div class="drawing-toolbar-row drawing-toolbar-controls">
        <div class="drawing-color-row">
          ${QUICK_COLORS.map(color => `
            <button class="drawing-color-btn${resolveColor(color).toLowerCase() === state.color.toLowerCase() ? ' active' : ''}" type="button" data-color="${resolveColor(color)}" style="--drawing-color:${resolveColor(color)}" aria-label="Color"></button>
          `).join('')}
          <label class="drawing-color-picker" title="Color personalizado">
            +
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
      </div>
      <div class="drawing-toolbar-row drawing-toolbar-actions">
        <label class="drawing-duration-field">
          <span>${state.durationSeconds}s</span>
          <input type="range" min="0.5" max="10" step="0.5" value="${state.durationSeconds}" data-duration-slider>
        </label>
        ${options.allowExport ? '<button class="drawing-action-btn" type="button" data-drawing-export>Exportar PNG</button>' : ''}
        <button class="drawing-action-btn" type="button" data-drawing-cancel>Cancelar</button>
        <button class="drawing-action-btn primary" type="button" data-drawing-save>Guardar dibujo</button>
      </div>
    </div>
  `;
  host.appendChild(shell);

  const canvas = /** @type {HTMLCanvasElement} */ (shell.querySelector('.drawing-editor-canvas'));
  const ctx = canvas.getContext('2d');
  let pointerDown = false;

  const redraw = () => {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStrokes(ctx, state.strokes);
    if (state.draft) drawStrokes(ctx, [state.draft]);
  };

  const setActiveButton = (selector, value, attr) => {
    shell.querySelectorAll(selector).forEach((button) => {
      button.classList.toggle('active', button.getAttribute(attr) === String(value));
    });
  };

  const push = () => {
    state.history = pushHistory(state.history, state.strokes);
  };

  const finalizeDraft = () => {
    if (!state.draft) return;
    state.strokes = [...state.strokes, state.draft];
    state.draft = null;
    redraw();
  };

  const openTextInput = (point) => {
    const rect = canvas.getBoundingClientRect();
    const input = document.createElement('input');
    input.className = 'drawing-text-input';
    input.style.left = `${(point.x / canvas.width) * rect.width}px`;
    input.style.top = `${(point.y / canvas.height) * rect.height}px`;
    input.placeholder = 'Texto';
    shell.appendChild(input);
    input.focus();
    const commit = () => {
      const text = input.value.trim();
      input.remove();
      if (!text) return;
      push();
      state.strokes = [...state.strokes, createStroke('text', {
        color: state.color,
        width: state.width,
        points: [point],
        text,
        fontSize: Math.max(18, state.width * 8),
      })];
      redraw();
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
      redraw();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      const result = redoHistory(state.history, state.strokes);
      state.history = result.history;
      state.strokes = result.strokes;
      redraw();
    }
  };
  document.addEventListener('keydown', keydown);

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const point = getCanvasPoint(canvas, event);
    if (state.tool === 'text') {
      openTextInput(point);
      return;
    }
    push();
    if (state.tool === 'eraser') {
      state.strokes = eraseStrokeAtPoint(state.strokes, point, 8);
      redraw();
      return;
    }
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
    canvas.releasePointerCapture?.(event.pointerId);
    finalizeDraft();
  });

  canvas.addEventListener('pointercancel', (event) => {
    pointerDown = false;
    state.draft = null;
    canvas.releasePointerCapture?.(event.pointerId);
    redraw();
  });

  shell.querySelectorAll('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tool = button.getAttribute('data-tool') || 'arrow';
      setActiveButton('[data-tool]', state.tool, 'data-tool');
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
  qs(shell, '[data-duration-slider]')?.addEventListener('input', (event) => {
    state.durationSeconds = Number(/** @type {HTMLInputElement} */ (event.currentTarget).value);
    const label = qs(shell, '.drawing-duration-field span');
    if (label) label.textContent = `${state.durationSeconds}s`;
  });

  const api = {
    element: shell,
    canvas,
    getState() {
      return {
        ...serializeDrawing(state.strokes, { width: canvas.width, height: canvas.height }),
        durationSeconds: state.durationSeconds,
      };
    },
    async getCompositeDataUrl() {
      return getCompositeDataUrl();
    },
    async save() {
      const payload = {
        ...api.getState(),
        imageDataUrl: options.includeImageData ? await getCompositeDataUrl() : undefined,
      };
      await options.onSave?.(payload);
      api.close(true);
    },
    close(saved = false) {
      state.disposed = true;
      document.removeEventListener('keydown', keydown);
      shell.remove();
      if (!saved) options.onCancel?.();
    },
  };

  qs(shell, '[data-drawing-cancel]')?.addEventListener('click', () => api.close(false));
  qs(shell, '[data-drawing-save]')?.addEventListener('click', () => api.save());
  qs(shell, '[data-drawing-export]')?.addEventListener('click', async () => {
    await options.onExport?.(await getCompositeDataUrl(), api.getState());
  });

  redraw();
  return api;
}
