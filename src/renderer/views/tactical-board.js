// @ts-check
import { createDrawingEditor } from '../components/drawing-editor.js';
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';

const FIELD_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720">
  <rect width="1200" height="720" fill="#080E1A"/>
  <rect x="70" y="70" width="1060" height="580" fill="none" stroke="rgba(240,244,248,0.32)" stroke-width="4"/>
  <rect x="94" y="94" width="1012" height="532" fill="none" stroke="rgba(240,244,248,0.22)" stroke-width="2"/>
  ${[194, 314, 434, 554, 674, 794, 914, 1034].map(x => `<line x1="${x}" y1="70" x2="${x}" y2="650" stroke="rgba(240,244,248,0.18)" stroke-width="2"/>`).join('')}
  ${[190, 360, 530].map(y => `<line x1="70" y1="${y}" x2="1130" y2="${y}" stroke="rgba(240,244,248,0.12)" stroke-width="1.5"/>`).join('')}
  <path d="M136 290 L70 270 M136 430 L70 450 M136 290 L136 430" fill="none" stroke="rgba(240,244,248,0.26)" stroke-width="3"/>
  <path d="M1064 290 L1130 270 M1064 430 L1130 450 M1064 290 L1064 430" fill="none" stroke="rgba(240,244,248,0.26)" stroke-width="3"/>
</svg>`;

/**
 * @returns {string}
 */
function getFieldDataUrl() {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(FIELD_SVG)}`;
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
 * @param {HTMLElement} container
 */
export function renderTacticalBoard(container) {
  setSidebarExpanded(false);
  updateTopbarContext('Tablero tactico');
  setTopbarActions([
    { id: 'new', label: 'Nuevo tablero' },
    { id: 'export', label: 'Exportar PNG' },
  ], (id) => {
    if (id === 'new') createNewBoard();
    if (id === 'export') exportActiveBoard();
  });

  let disposed = false;
  let boards = [];
  let activeBoard = null;
  let editor = null;

  load();

  return () => {
    disposed = true;
    editor?.close?.(false);
    document.querySelector('.tactical-board-context-menu')?.remove();
  };

  async function load(selectedId = null) {
    boards = await window.api.tacticalBoards.list();
    if (selectedId) activeBoard = await window.api.tacticalBoards.get(selectedId);
    else if (activeBoard?.id) activeBoard = await window.api.tacticalBoards.get(activeBoard.id).catch(() => null);
    else activeBoard = boards.length ? await window.api.tacticalBoards.get(boards[0].id) : null;
    if (!disposed) render();
  }

  function render() {
    container.innerHTML = `
      <section class="tactical-board-view view-enter">
        <main class="tactical-board-main">
          <div class="tactical-canvas-frame">
            <div class="tactical-canvas-host" data-tactical-canvas-host></div>
          </div>
        </main>
        <aside class="tactical-board-library" aria-label="Biblioteca de tableros">
          <button class="btn btn-primary btn-sm tactical-new-btn" type="button" data-board-new>Nuevo tablero</button>
          <div class="tactical-board-list">
            ${boards.map(board => `
              <article class="tactical-board-item${activeBoard?.id === board.id ? ' active' : ''}" data-board-id="${escapeHtml(board.id)}">
                <button class="tactical-board-load" type="button" data-board-load="${escapeHtml(board.id)}">
                  <span class="tactical-board-thumb">${board.thumbnail ? `<img src="${board.thumbnail}" alt="">` : ''}</span>
                  <span class="tactical-board-name" data-board-rename>${escapeHtml(board.name)}</span>
                  <small>${escapeHtml((board.updatedAt || board.date || '').slice(0, 10))}</small>
                </button>
                <button class="tactical-board-delete" type="button" data-board-delete="${escapeHtml(board.id)}">Eliminar</button>
              </article>
            `).join('') || '<p class="tactical-empty">Sin tableros guardados.</p>'}
          </div>
          <button class="btn btn-secondary btn-sm" type="button" data-board-export>Exportar PNG</button>
        </aside>
      </section>
    `;

    container.querySelector('[data-board-new]')?.addEventListener('click', createNewBoard);
    container.querySelector('[data-board-export]')?.addEventListener('click', exportActiveBoard);
    container.querySelectorAll('[data-board-load]').forEach(button => {
      button.addEventListener('click', () => load(button.getAttribute('data-board-load')));
    });
    container.querySelectorAll('[data-board-delete]').forEach(button => {
      button.addEventListener('click', () => deleteBoard(button.getAttribute('data-board-delete')));
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
  }

  function mountEditor() {
    editor?.close?.(false);
    const host = /** @type {HTMLElement|null} */ (container.querySelector('[data-tactical-canvas-host]'));
    if (!host) return;
    editor = createDrawingEditor(host, {
      width: activeBoard?.canvas?.width || 1200,
      height: activeBoard?.canvas?.height || 720,
      backgroundImage: getFieldDataUrl(),
      strokes: activeBoard?.strokes || [],
      includeImageData: true,
      allowExport: true,
      onSave: saveActiveBoard,
      onExport: async (dataUrl) => {
        await window.api.tacticalBoards.exportPng(dataUrl, `${activeBoard?.name || 'tablero-tactico'}.png`);
      },
      onCancel: () => {
        editor = null;
      },
    });
  }

  async function saveActiveBoard(payload) {
    const data = {
      name: activeBoard?.name || 'Nuevo tablero',
      thumbnail: payload.imageDataUrl,
      canvas: payload.canvas,
      strokes: payload.strokes,
    };
    activeBoard = activeBoard?.id
      ? await window.api.tacticalBoards.update(activeBoard.id, data)
      : await window.api.tacticalBoards.create(data);
    await load(activeBoard.id);
  }

  async function createNewBoard() {
    activeBoard = await window.api.tacticalBoards.create({
      name: 'Nuevo tablero',
      thumbnail: '',
      canvas: { width: 1200, height: 720 },
      strokes: [],
    });
    await load(activeBoard.id);
  }

  async function deleteBoard(id) {
    if (!id) return;
    await window.api.tacticalBoards.delete(id);
    activeBoard = null;
    await load();
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
    input.setAttribute('aria-label', 'Nombre del tablero');
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
    await window.api.tacticalBoards.exportPng(await editor.getCompositeDataUrl(), `${activeBoard?.name || 'tablero-tactico'}.png`);
  }
}
