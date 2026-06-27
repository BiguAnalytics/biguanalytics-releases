// @ts-check
import { getPdfBlockMetadata } from '../pdf/pdf-block-registry.js';

export const GRID_COLUMNS = 12;
export const GRID_ROWS = {
  landscape: 24,
  portrait: 32,
};

export const SIZE_PRESETS = {
  small: { label: 'Pequeño', w: 3, h: 4 },
  medium: { label: 'Mediano', w: 6, h: 6 },
  large: { label: 'Grande', w: 8, h: 8 },
  full: { label: 'Ancho completo', w: 12, h: 6 },
};

/**
 * @param {string|number|null|undefined} value
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
 * @param {object} template
 * @returns {object}
 */
function cloneTemplate(template) {
  return JSON.parse(JSON.stringify(template || {}));
}

/**
 * @param {object} template
 * @returns {number}
 */
function getRowCount(template = {}) {
  return template.orientation === 'portrait' ? GRID_ROWS.portrait : GRID_ROWS.landscape;
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function overlaps(a, b) {
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {object} block
 * @param {number} rows
 * @returns {object}
 */
function clampBlock(block, rows) {
  const w = Math.max(1, Math.min(GRID_COLUMNS, Math.round(Number(block.w) || 3)));
  const h = Math.max(1, Math.min(rows, Math.round(Number(block.h) || 4)));
  return {
    ...block,
    w,
    h,
    x: Math.max(0, Math.min(GRID_COLUMNS - w, Math.round(Number(block.x) || 0))),
    y: Math.max(0, Math.min(rows - h, Math.round(Number(block.y) || 0))),
  };
}

/**
 * @param {object} block
 * @param {number} rows
 * @returns {object}
 */
function clampResizeBlock(block, rows) {
  const x = clamp(Math.round(Number(block.x) || 0), 0, GRID_COLUMNS - 1);
  const y = clamp(Math.round(Number(block.y) || 0), 0, rows - 1);
  return {
    ...block,
    x,
    y,
    w: clamp(Math.round(Number(block.w) || 1), 1, GRID_COLUMNS - x),
    h: clamp(Math.round(Number(block.h) || 1), 1, rows - y),
  };
}

/**
 * @param {object} block
 * @param {Array<object>} blocks
 * @param {object} page
 * @param {'portrait'|'landscape'} orientation
 * @returns {object}
 */
export function preventBlockOverlap(block, blocks = [], page = {}, orientation = 'landscape') {
  const rows = orientation === 'portrait' ? GRID_ROWS.portrait : GRID_ROWS.landscape;
  const others = blocks.filter(item => item.id !== block.id);
  let candidate = clampBlock(block, rows);
  if (!others.some(item => overlaps(candidate, item))) return candidate;

  for (let y = 0; y <= rows - candidate.h; y += 1) {
    for (let x = 0; x <= GRID_COLUMNS - candidate.w; x += 1) {
      const next = { ...candidate, x, y };
      if (!others.some(item => overlaps(next, item))) return next;
    }
  }
  return { ...candidate, invalid: true, pageId: page.id };
}

/**
 * @param {object} block
 * @param {{clientX?: number, clientY?: number}} event
 * @param {{left?: number, top?: number, width?: number, height?: number}} gridRect
 * @param {number} rows
 * @returns {object}
 */
export function getResizeCandidateFromPointer(block, event, gridRect, rows) {
  const width = Math.max(1, Number(gridRect?.width) || 1);
  const height = Math.max(1, Number(gridRect?.height) || 1);
  const left = Number(gridRect?.left) || 0;
  const top = Number(gridRect?.top) || 0;
  const rightColumn = clamp(
    Math.ceil(((Number(event?.clientX) - left) / width) * GRID_COLUMNS),
    Math.round(Number(block.x) || 0) + 1,
    GRID_COLUMNS,
  );
  const bottomRow = clamp(
    Math.ceil(((Number(event?.clientY) - top) / height) * rows),
    Math.round(Number(block.y) || 0) + 1,
    rows,
  );
  return clampResizeBlock({
    ...block,
    w: rightColumn - Math.round(Number(block.x) || 0),
    h: bottomRow - Math.round(Number(block.y) || 0),
  }, rows);
}

/**
 * @param {object} block
 * @param {Array<object>} blocks
 * @param {object} page
 * @param {'portrait'|'landscape'} orientation
 * @returns {object}
 */
export function preventBlockResizeOverlap(block, blocks = [], page = {}, orientation = 'landscape') {
  const rows = orientation === 'portrait' ? GRID_ROWS.portrait : GRID_ROWS.landscape;
  let candidate = clampResizeBlock(block, rows);
  const others = blocks.filter(item => item.id !== candidate.id);

  for (let iteration = 0; iteration < others.length; iteration += 1) {
    let changed = false;
    others.forEach((other) => {
      if (!overlaps(candidate, other)) return;
      const maxWidthBeforeOther = other.x > candidate.x ? other.x - candidate.x : candidate.w;
      const maxHeightBeforeOther = other.y > candidate.y ? other.y - candidate.y : candidate.h;
      if (maxWidthBeforeOther >= 1 && maxWidthBeforeOther < candidate.w) {
        candidate = { ...candidate, w: maxWidthBeforeOther };
        changed = true;
      }
      if (overlaps(candidate, other) && maxHeightBeforeOther >= 1 && maxHeightBeforeOther < candidate.h) {
        candidate = { ...candidate, h: maxHeightBeforeOther };
        changed = true;
      }
    });
    if (!changed) break;
  }

  const hasOverlap = others.some(item => overlaps(candidate, item));
  return hasOverlap ? { ...candidate, invalid: true, pageId: page.id } : candidate;
}

/**
 * @param {PointerEvent|DragEvent} event
 * @param {HTMLElement} grid
 * @param {object} block
 * @param {number} rows
 * @returns {{x: number, y: number}}
 */
function getGridPosition(event, grid, block, rows) {
  const rect = grid.getBoundingClientRect();
  const column = Math.floor(((event.clientX - rect.left) / Math.max(1, rect.width)) * GRID_COLUMNS);
  const row = Math.floor(((event.clientY - rect.top) / Math.max(1, rect.height)) * rows);
  return {
    x: Math.max(0, Math.min(GRID_COLUMNS - block.w, column)),
    y: Math.max(0, Math.min(rows - block.h, row)),
  };
}

/**
 * @param {object} block
 * @returns {string}
 */
function getBlockStyle(block) {
  return `grid-column: ${block.x + 1} / span ${block.w}; grid-row: ${block.y + 1} / span ${block.h};`;
}

/**
 * @param {object} block
 * @param {boolean} selected
 * @param {boolean} invalid
 * @returns {string}
 */
function renderBlock(block, selected, invalid) {
  const metadata = getPdfBlockMetadata(block.type);
  const title = block.settings?.title || block.settings?.text || metadata.label;
  return `
    <button
      class="pdf-template-grid-block${selected ? ' selected' : ''}${invalid ? ' invalid' : ''}"
      type="button"
      data-grid-block-id="${escapeHtml(block.id)}"
      data-grid-block-type="${escapeHtml(block.type)}"
      data-tour-id="pdf-template-block"
      style="${getBlockStyle(block)}"
      aria-label="${escapeHtml(title)}"
    >
      <span>${escapeHtml(title)}</span>
      <small class="pdf-template-technical-name">${escapeHtml(metadata.subtitle)}</small>
      <i class="pdf-template-grid-resize" data-grid-resize aria-hidden="true"></i>
    </button>
  `;
}

/**
 * @param {object} params
 * @returns {HTMLElement}
 */
export function createPdfTemplateGrid(params = {}) {
  const {
    template = { orientation: 'landscape', pages: [] },
    selectedBlockId = '',
    invalidBlockIds = new Set(),
    onAddBlock = () => {},
    onChange = () => {},
    onSelect = () => {},
  } = params;
  const rows = getRowCount(template);
  const shell = document.createElement('div');
  shell.className = 'pdf-template-grid-shell';
  shell.innerHTML = (Array.isArray(template.pages) ? template.pages : []).map((page, pageIndex) => `
    <section class="pdf-template-page-card" data-grid-page-index="${pageIndex}">
      <header>
        <span>Página ${pageIndex + 1}</span>
        <strong>${escapeHtml(page.title || `Página ${pageIndex + 1}`)}</strong>
      </header>
      <div
        class="pdf-template-grid-canvas"
        data-grid-canvas
        data-grid-page-index="${pageIndex}"
        data-tour-id="pdf-template-page-grid"
        style="--pdf-grid-rows:${rows};"
      >
        ${(Array.isArray(page.blocks) ? page.blocks : []).map(block => renderBlock(
          block,
          selectedBlockId === block.id,
          invalidBlockIds instanceof Set ? invalidBlockIds.has(block.id) : invalidBlockIds.includes?.(block.id),
        )).join('')}
      </div>
    </section>
  `).join('');

  shell.querySelectorAll('[data-grid-canvas]').forEach((canvas) => {
    const grid = /** @type {HTMLElement} */ (canvas);
    grid.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    grid.addEventListener('drop', (event) => {
      event.preventDefault();
      const pageIndex = Number(grid.dataset.gridPageIndex || 0);
      const type = event.dataTransfer.getData('application/x-bigu-pdf-block') || event.dataTransfer.getData('text/plain');
      const probe = document.elementFromPoint(event.clientX, event.clientY);
      const targetGrid = probe?.closest?.('[data-grid-canvas]') || grid;
      const preset = SIZE_PRESETS.medium;
      const position = getGridPosition(event, /** @type {HTMLElement} */ (targetGrid), preset, rows);
      if (type) onAddBlock(pageIndex, type, position);
    });
  });

  shell.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const block = target?.closest('[data-grid-block-id]');
    if (block) onSelect(block.getAttribute('data-grid-block-id') || '');
  });

  shell.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const blockEl = /** @type {HTMLElement|null} */ (target?.closest('[data-grid-block-id]') || null);
    if (!blockEl) return;
    const pageEl = /** @type {HTMLElement|null} */ (blockEl.closest('[data-grid-page-index]'));
    const canvas = /** @type {HTMLElement|null} */ (blockEl.closest('[data-grid-canvas]'));
    if (!pageEl || !canvas) return;

    event.preventDefault();
    blockEl.setPointerCapture?.(event.pointerId);
    const pageIndex = Number(pageEl.dataset.gridPageIndex || 0);
    const source = cloneTemplate(template);
    const page = source.pages?.[pageIndex];
    const block = page?.blocks?.find(item => item.id === blockEl.dataset.gridBlockId);
    if (!page || !block) return;
    const resizing = Boolean(target?.closest('[data-grid-resize]'));
    onSelect(block.id);

    const pointermove = (moveEvent) => {
      const probe = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const activeGrid = /** @type {HTMLElement} */ (probe?.closest?.('[data-grid-canvas]') || canvas);
      if (resizing) {
        Object.assign(block, preventBlockResizeOverlap(
          getResizeCandidateFromPointer(block, moveEvent, canvas.getBoundingClientRect(), rows),
          page.blocks,
          page,
          template.orientation,
        ));
      } else {
        Object.assign(block, preventBlockOverlap({ ...block, ...getGridPosition(moveEvent, activeGrid, block, rows) }, page.blocks, page, template.orientation));
      }
      onChange(source, { transient: true });
    };

    const pointerup = () => {
      onChange(source, { commit: true });
      window.removeEventListener('pointermove', pointermove);
      window.removeEventListener('pointerup', pointerup);
    };

    window.addEventListener('pointermove', pointermove);
    window.addEventListener('pointerup', pointerup, { once: true });
  });

  return shell;
}
