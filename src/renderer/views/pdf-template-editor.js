// @ts-check
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { createPdfTemplateGrid, preventBlockOverlap, SIZE_PRESETS } from '../components/pdf-template-grid.js';
import { createPdfTemplateHistory } from '../components/pdf-template-history.js';
import {
  buildPdfTemplateEditorWalkthroughResetSettings,
  startPdfTemplateEditorWalkthrough,
} from '../components/pdf-template-walkthrough.js';
import { GRID_ROWS, validateTemplateLayout } from '../pdf/pdf-blocks.js';
import { PDF_BLOCK_CATEGORIES, PDF_BLOCK_TYPES, getPdfBlockMetadata } from '../pdf/pdf-block-registry.js';
import { navigate } from '../router.js';

const SYSTEM_TEMPLATE_ID = 'system-default';
const SYSTEM_TEMPLATE_FALLBACK = {
  id: SYSTEM_TEMPLATE_ID,
  name: 'Default BiguAnalytics',
  isSystem: true,
  isDefault: true,
  orientation: 'landscape',
  pages: [],
};
const PDF_TEMPLATE_MANAGER_UNAVAILABLE_MESSAGE = 'El gestor local de plantillas PDF no está disponible. Cerrá BiguAnalytics por completo y volvé a abrirlo para registrar el IPC.';

const DEFAULT_SETTINGS_BY_BLOCK = {
  'section-title': { text: 'Nueva sección' },
  'text-block': { text: 'Texto editable' },
  'kpi-row': { metrics: ['ruckWinPct', 'penalties', 'lineoutWinPct', 'breakLines'] },
  'events-table': { maxRows: 12 },
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
 * @returns {string}
 */
function createId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
 * @returns {Set<string>}
 */
function getInvalidBlockIds(template) {
  const report = validateTemplateLayout(template);
  return new Set(report.errors.map(error => error.blockId).filter(Boolean));
}

/**
 * @param {object} template
 * @returns {string}
 */
function getValidationSummary(template) {
  const report = validateTemplateLayout(template);
  if (report.valid) return 'Plantilla válida.';
  const byCode = report.errors.reduce((count, error) => {
    count[error.code] = (count[error.code] || 0) + 1;
    return count;
  }, {});
  return Object.entries(byCode)
    .map(([code, count]) => {
      if (code === 'out-of-page') return `${count} fuera de página`;
      if (code === 'overlap') return `${count} superpuesto`;
      if (code === 'unknown-block') return `${count} desconocido`;
      return `${count} ${code}`;
    })
    .join(', ');
}

/**
 * @param {Array<object>} blocks
 * @returns {{x: number, y: number}}
 */
function findFreePosition(blocks = []) {
  const probe = { id: createId(), x: 0, y: 0, w: SIZE_PRESETS.medium.w, h: SIZE_PRESETS.medium.h };
  const placed = preventBlockOverlap(probe, blocks, {}, 'landscape');
  return { x: placed.x || 0, y: placed.y || 0 };
}

/**
 * @param {object} template
 * @returns {string}
 */
function renderTemplateOptions(template) {
  return Object.entries(SIZE_PRESETS).map(([key, preset]) => {
    const selected = template?.settings?.sizePreset === key ? 'selected' : '';
    return `<option value="${key}" ${selected}>${escapeHtml(preset.label)}</option>`;
  }).join('');
}

/**
 * @param {string} type
 * @returns {string}
 */
function getBlockLabel(type) {
  return getPdfBlockMetadata(type).label;
}

/**
 * @returns {string}
 */
function renderBlockLibrary() {
  return PDF_BLOCK_CATEGORIES.map((category) => {
    const blocks = PDF_BLOCK_TYPES
      .map(type => getPdfBlockMetadata(type))
      .filter(metadata => metadata.category === category);
    if (blocks.length === 0) return '';
    return `
      <section class="pdf-template-library-category" aria-label="${escapeHtml(category)}">
        <h3>${escapeHtml(category)}</h3>
        <div class="pdf-template-library-category-list">
          ${blocks.map(metadata => `
            <button class="pdf-template-library-block" type="button" draggable="true" data-library-block="${escapeHtml(metadata.type)}">
              <span>${escapeHtml(metadata.label)}</span>
              <small class="pdf-template-library-description">${escapeHtml(metadata.description)}</small>
              <em class="pdf-template-technical-name">${escapeHtml(metadata.subtitle)}</em>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }).join('');
}

export function getPdfTemplateManagerUnavailableMessage() {
  return PDF_TEMPLATE_MANAGER_UNAVAILABLE_MESSAGE;
}

/**
 * @param {object} api
 * @returns {Promise<{available: boolean, templates: Array<object>, message: string}>}
 */
export async function loadPdfTemplateManagerState(api = window.api) {
  try {
    const templates = await api?.pdfTemplates?.list?.();
    return {
      available: true,
      templates: Array.isArray(templates) && templates.length > 0 ? templates : [SYSTEM_TEMPLATE_FALLBACK],
      message: '',
    };
  } catch {
    return {
      available: false,
      templates: [SYSTEM_TEMPLATE_FALLBACK],
      message: PDF_TEMPLATE_MANAGER_UNAVAILABLE_MESSAGE,
    };
  }
}

/**
 * @param {Array<object>|{available?: boolean, templates?: Array<object>, message?: string}} managerState
 * @returns {string}
 */
function renderTemplateManager(managerState = []) {
  const state = Array.isArray(managerState)
    ? { available: true, templates: managerState, message: '' }
    : {
      available: managerState.available !== false,
      templates: Array.isArray(managerState.templates) ? managerState.templates : [SYSTEM_TEMPLATE_FALLBACK],
      message: managerState.message || '',
    };
  const disabled = state.available ? '' : 'disabled';
  return `
    <section class="pdf-template-editor-view view-enter" data-pdf-template-manager>
      <header class="pdf-template-header">
        <div>
          <span>Plantillas PDF</span>
          <h1>Plantillas PDF</h1>
        </div>
        <div class="pdf-template-actions">
          <button class="pdf-template-button secondary" type="button" data-template-import ${disabled}>Importar JSON</button>
          <button class="pdf-template-button primary" type="button" data-template-create ${disabled}>Crear nueva plantilla</button>
        </div>
      </header>
      ${state.message ? `<p class="pdf-template-feedback is-error" data-template-feedback role="status">${escapeHtml(state.message)}</p>` : ''}
      <div class="pdf-template-list">
        ${state.templates.map(template => `
          <article class="pdf-template-card${template.isDefault ? ' is-default' : ''}${template.corrupt || template.invalid ? ' is-invalid' : ''}" data-template-id="${escapeHtml(template.id)}">
            <header>
              <div>
                <span>${template.isSystem ? 'Sistema' : 'Local'}${template.isDefault ? ' / Default' : ''}</span>
                <h2>${escapeHtml(template.name)}</h2>
              </div>
              <strong>${escapeHtml(template.orientation || 'landscape')}</strong>
            </header>
            <p>${template.corrupt ? 'JSON corrupto. Se usará la plantilla default al exportar.' : template.invalid ? 'Tiene bloques inválidos. Abrila para corregirlos antes de exportar.' : `${template.pages?.length || 0} páginas / v${template.version || 1}`}</p>
            <div class="pdf-template-card-actions">
              <button type="button" data-template-open-editor ${!state.available || template.corrupt ? 'disabled' : ''}>Abrir editor</button>
              <button type="button" data-template-duplicate ${!state.available || template.corrupt ? 'disabled' : ''}>Duplicar</button>
              <button type="button" data-template-rename ${!state.available || template.isSystem || template.corrupt ? 'disabled' : ''}>Renombrar</button>
              <button type="button" data-template-default ${!state.available || template.isDefault || template.corrupt || template.invalid ? 'disabled' : ''}>Marcar default</button>
              <button type="button" data-template-export ${!state.available || template.corrupt || template.invalid ? 'disabled' : ''}>Exportar</button>
              <button type="button" data-template-delete ${!state.available || template.isSystem ? 'disabled' : ''}>Eliminar</button>
            </div>
          </article>
        `).join('')}
      </div>
      ${state.message ? '' : '<p class="pdf-template-feedback" data-template-feedback role="status"></p>'}
    </section>
  `;
}

/**
 * @param {object} template
 * @param {string} selectedBlockId
 * @returns {object|null}
 */
function findSelectedBlock(template, selectedBlockId) {
  for (const page of template.pages || []) {
    const block = (page.blocks || []).find(item => item.id === selectedBlockId);
    if (block) return block;
  }
  return null;
}

/**
 * @param {object|null} block
 * @returns {string}
 */
function renderProperties(block) {
  if (!block) {
    return '<div class="pdf-template-empty-panel">Selecciona un bloque.</div>';
  }
  const metadata = getPdfBlockMetadata(block.type);
  const settings = block.settings || {};
  return `
    <form class="pdf-template-properties-form" data-template-properties>
      <div class="pdf-template-property-heading">
        <span>${escapeHtml(metadata.category)}</span>
        <strong>${escapeHtml(metadata.label)}</strong>
        <small class="pdf-template-technical-name">${escapeHtml(metadata.subtitle)}</small>
        <p>${escapeHtml(metadata.description)}</p>
        ${metadata.unknown ? '<p class="pdf-template-unknown-warning">Bloque desconocido: revisá esta plantilla antes de exportar.</p>' : ''}
      </div>
      <label>
        <span>Título visible</span>
        <input type="text" data-property-title value="${escapeHtml(settings.title || '')}" placeholder="${escapeHtml(metadata.label)}">
      </label>
      <label class="pdf-template-checkbox">
        <input type="checkbox" data-property-show-title ${settings.showTitle === false ? '' : 'checked'}>
        <span>Mostrar título</span>
      </label>
      <label>
        <span>Tamaño</span>
        <select data-property-size>
          ${renderTemplateOptions(block)}
        </select>
      </label>
      <label>
        <span>Equipo</span>
        <select data-property-team>
          <option value="all" ${settings.team === 'all' ? 'selected' : ''}>Todos</option>
          <option value="bigua" ${settings.team === 'bigua' ? 'selected' : ''}>Bigua</option>
          <option value="rival" ${settings.team === 'rival' ? 'selected' : ''}>Rival</option>
        </select>
      </label>
      <label>
        <span>Período</span>
        <select data-property-period>
          <option value="all" ${settings.period === 'all' ? 'selected' : ''}>Partido completo</option>
          <option value="first" ${settings.period === 'first' ? 'selected' : ''}>Primer tiempo</option>
          <option value="second" ${settings.period === 'second' ? 'selected' : ''}>Segundo tiempo</option>
        </select>
      </label>
      <label>
        <span>Event type</span>
        <input type="text" data-property-event-type value="${escapeHtml(settings.eventType || '')}" placeholder="Opcional">
      </label>
      ${block.type === 'kpi-row' ? `
        <label>
          <span>Métricas</span>
          <input type="text" data-property-metrics value="${escapeHtml((settings.metrics || []).join(', '))}" placeholder="ruckWinPct, penalties">
        </label>
      ` : ''}
      ${block.type === 'events-table' ? `
        <label>
          <span>Máx. filas</span>
          <input type="number" min="1" max="50" step="1" data-property-max-rows value="${escapeHtml(settings.maxRows || 12)}">
        </label>
      ` : ''}
      ${block.type === 'text-block' || block.type === 'section-title' ? `
        <label>
          <span>Texto</span>
          <textarea data-property-text rows="5">${escapeHtml(settings.text || '')}</textarea>
        </label>
      ` : ''}
    </form>
  `;
}

/**
 * @param {object} template
 * @param {string} selectedBlockId
 * @returns {string}
 */
function renderEditorShell(template, selectedBlockId) {
  const selectedBlock = findSelectedBlock(template, selectedBlockId);
  return `
    <section class="pdf-template-editor-view pdf-template-builder view-enter" data-pdf-template-editor data-tour-id="pdf-template-editor-root">
      <header class="pdf-template-header">
        <div>
          <span>Plantillas PDF</span>
          <h1>${escapeHtml(template.name)}</h1>
        </div>
        <div class="pdf-template-actions">
          <button class="pdf-template-button secondary" type="button" data-editor-back>Volver</button>
          <button class="pdf-template-button secondary" type="button" data-editor-walkthrough>Ver tutorial de nuevo</button>
          <button class="pdf-template-button secondary" type="button" data-editor-preview data-tour-id="pdf-template-preview">Vista previa</button>
          <button class="pdf-template-button primary" type="button" data-editor-save data-tour-id="pdf-template-save">Guardar plantilla</button>
        </div>
      </header>
      <div class="pdf-template-toolbar">
        <button type="button" data-page-add data-tour-id="pdf-template-add-page">Agregar página</button>
        <button type="button" data-page-duplicate>Duplicar página</button>
        <button type="button" data-page-delete>Eliminar página</button>
        <label class="pdf-template-orientation-field">
          <span>Orientación</span>
          <select data-template-orientation>
            <option value="landscape" ${template.orientation === 'landscape' ? 'selected' : ''}>Horizontal</option>
            <option value="portrait" ${template.orientation === 'portrait' ? 'selected' : ''}>Vertical</option>
          </select>
        </label>
      </div>
      <div class="pdf-template-editor-layout">
        <aside class="pdf-template-sidebar" aria-label="Bloques" data-tour-id="pdf-template-block-library">
          <h2>Bloques</h2>
          <div class="pdf-template-block-library">
            ${renderBlockLibrary()}
          </div>
        </aside>
        <main class="pdf-template-stage" data-template-grid-host></main>
        <aside class="pdf-template-sidebar" aria-label="Propiedades" data-tour-id="pdf-template-properties">
          <h2>Propiedades</h2>
          <div data-template-properties-host>${renderProperties(selectedBlock)}</div>
          <p class="pdf-template-validation" data-template-validation>${escapeHtml(getValidationSummary(template))}</p>
        </aside>
      </div>
      <p class="pdf-template-feedback" data-template-feedback role="status"></p>
    </section>
  `;
}

/**
 * @param {HTMLElement} container
 * @param {string} message
 */
function setFeedback(container, message) {
  const feedback = container.querySelector('[data-template-feedback]');
  if (feedback) feedback.textContent = message;
}

/**
 * @param {object} template
 * @param {string} pageId
 * @returns {number}
 */
function getPageIndex(template, pageId) {
  const index = (template.pages || []).findIndex(page => page.id === pageId);
  return index >= 0 ? index : 0;
}

/**
 * @param {HTMLElement} container
 * @param {object} template
 * @param {object} params
 */
function mountEditor(container, template, params = {}, lifecycleState = {}) {
  const isActive = () => lifecycleState.disposed !== true
    && lifecycleState.isActive?.() !== false;
  let draft = cloneTemplate(template);
  let selectedBlockId = draft.pages?.[0]?.blocks?.[0]?.id || '';
  let selectedPageId = draft.pages?.[0]?.id || 'page-1';
  let walkthroughBootstrapped = false;
  const history = createPdfTemplateHistory(draft);

  const startWalkthrough = (force = false) => {
    if (lifecycleState.walkthroughTimer) window.clearTimeout(lifecycleState.walkthroughTimer);
    lifecycleState.walkthroughTimer = window.setTimeout(() => {
      lifecycleState.walkthroughTimer = 0;
      if (!isActive()) return;
      startPdfTemplateEditorWalkthrough({ force }).then(() => {
        if (!isActive()) document.querySelector('[data-pdf-template-walkthrough-root]')?.remove();
      }).catch(() => {});
    }, 0);
  };

  const ensureSelection = () => {
    const pages = Array.isArray(draft.pages) ? draft.pages : [];
    if (!pages.some(page => page.id === selectedPageId)) {
      selectedPageId = pages[0]?.id || '';
    }
    if (!findSelectedBlock(draft, selectedBlockId)) {
      const selectedPage = pages.find(page => page.id === selectedPageId) || pages[0];
      selectedBlockId = selectedPage?.blocks?.[0]?.id || '';
    }
  };

  const commitAndRender = (message = '') => {
    if (!isActive()) return;
    history.push(draft);
    render();
    if (message) setFeedback(container, message);
  };

  const restoreFromHistory = (nextDraft, message) => {
    if (!isActive()) return;
    draft = cloneTemplate(nextDraft);
    ensureSelection();
    render();
    setFeedback(container, message);
  };

  const isEditableShortcutTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
  };

  const handleKeydown = (event) => {
    if (!isActive()) return;
    if (!container.querySelector('[data-pdf-template-editor]')) return;
    const isUndoRedoShortcut = event.key.toLowerCase() === 'z';
    if (!event.ctrlKey || event.altKey || event.metaKey || !isUndoRedoShortcut) return;
    if (isEditableShortcutTarget(event.target)) return;
    event.preventDefault();
    if (event.shiftKey) {
      if (history.canRedo()) restoreFromHistory(history.redo(), 'Cambio rehecho.');
      return;
    }
    if (history.canUndo()) restoreFromHistory(history.undo(), 'Cambio deshecho.');
  };

  const previousCleanup = container.__pdfTemplateEditorKeydownCleanup;
  previousCleanup?.();
  window.addEventListener('keydown', handleKeydown, true);
  container.__pdfTemplateEditorKeydownCleanup = () => {
    window.removeEventListener('keydown', handleKeydown, true);
  };

  const render = () => {
    if (!isActive()) return;
    container.innerHTML = renderEditorShell(draft, selectedBlockId);
    const host = container.querySelector('[data-template-grid-host]');
    const grid = createPdfTemplateGrid({
      template: draft,
      selectedBlockId,
      invalidBlockIds: getInvalidBlockIds(draft),
      onSelect(blockId) {
        if (!isActive()) return;
        selectedBlockId = blockId;
        const page = (draft.pages || []).find(item => (item.blocks || []).some(block => block.id === blockId));
        if (page) selectedPageId = page.id;
        render();
      },
      onChange(nextTemplate, changeMeta = {}) {
        if (!isActive()) return;
        draft = nextTemplate;
        if (changeMeta.commit) {
          commitAndRender();
          return;
        }
        render();
      },
      onAddBlock(pageIndex, type, position) {
        if (!isActive()) return;
        addBlock(pageIndex, type, position);
      },
    });
    host?.appendChild(grid);
    wireEditor();
    if (!walkthroughBootstrapped) {
      walkthroughBootstrapped = true;
      startWalkthrough(false);
    }
  };

  const updateSelectedBlock = (updater, shouldRender = true) => {
    const page = (draft.pages || []).find(item => (item.blocks || []).some(block => block.id === selectedBlockId));
    const block = page?.blocks?.find(item => item.id === selectedBlockId);
    if (!block) return;
    updater(block, page);
    if (shouldRender) render();
  };

  const addBlock = (pageIndex, type, position = null) => {
    const page = draft.pages?.[pageIndex] || draft.pages?.[0];
    if (!page || !PDF_BLOCK_TYPES.includes(type)) return;
    const preset = SIZE_PRESETS.medium;
    const free = position || findFreePosition(page.blocks || []);
    const block = preventBlockOverlap({
      id: createId(),
      type,
      x: free.x,
      y: free.y,
      w: preset.w,
      h: preset.h,
      settings: {
        ...(DEFAULT_SETTINGS_BY_BLOCK[type] || {}),
        title: getBlockLabel(type),
        showTitle: true,
        sizePreset: 'medium',
      },
    }, page.blocks || [], page, draft.orientation);
    page.blocks = [...(page.blocks || []), block];
    selectedBlockId = block.id;
    selectedPageId = page.id;
    commitAndRender();
  };

  const wireEditor = () => {
    if (!isActive()) return;
    container.querySelectorAll('[data-library-block]').forEach((button) => {
      button.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('application/x-bigu-pdf-block', button.getAttribute('data-library-block') || '');
        event.dataTransfer?.setData('text/plain', button.getAttribute('data-library-block') || '');
      });
      button.addEventListener('click', () => {
        addBlock(getPageIndex(draft, selectedPageId), button.getAttribute('data-library-block') || '');
      });
    });

    container.querySelector('[data-editor-back]')?.addEventListener('click', () => {
      navigate('pdfTemplates', params.matchId ? { matchId: params.matchId } : {});
    });

    container.querySelector('[data-editor-walkthrough]')?.addEventListener('click', async () => {
      if (!isActive()) return;
      try {
        const currentSettings = await window.api.settings.get();
        if (!isActive()) return;
        await window.api.settings.set(buildPdfTemplateEditorWalkthroughResetSettings(currentSettings));
        if (!isActive()) return;
        startWalkthrough(true);
      } catch {
        if (isActive()) setFeedback(container, 'No se pudo reiniciar el tutorial.');
      }
    });

    container.querySelector('[data-page-add]')?.addEventListener('click', () => {
      const nextIndex = (draft.pages || []).length + 1;
      draft.pages = [...(draft.pages || []), { id: createId(), title: `Página ${nextIndex}`, blocks: [] }];
      selectedPageId = draft.pages[draft.pages.length - 1].id;
      selectedBlockId = '';
      commitAndRender();
    });

    container.querySelector('[data-page-duplicate]')?.addEventListener('click', () => {
      const pageIndex = getPageIndex(draft, selectedPageId);
      const source = draft.pages?.[pageIndex];
      if (!source) return;
      const copy = cloneTemplate(source);
      copy.id = createId();
      copy.title = `${source.title || 'Página'} copia`;
      copy.blocks = (copy.blocks || []).map(block => ({ ...block, id: createId() }));
      draft.pages.splice(pageIndex + 1, 0, copy);
      selectedPageId = copy.id;
      selectedBlockId = copy.blocks?.[0]?.id || '';
      commitAndRender();
    });

    container.querySelector('[data-page-delete]')?.addEventListener('click', () => {
      if ((draft.pages || []).length <= 1) {
        setFeedback(container, 'La plantilla debe tener al menos una página.');
        return;
      }
      const pageIndex = getPageIndex(draft, selectedPageId);
      draft.pages.splice(pageIndex, 1);
      selectedPageId = draft.pages[0].id;
      selectedBlockId = draft.pages[0].blocks?.[0]?.id || '';
      commitAndRender();
    });

    container.querySelector('[data-template-orientation]')?.addEventListener('change', (event) => {
      const select = /** @type {HTMLSelectElement} */ (event.currentTarget);
      draft.orientation = select.value === 'portrait' ? 'portrait' : 'landscape';
      const maxRows = GRID_ROWS[draft.orientation];
      draft.pages.forEach((page) => {
        page.blocks = (page.blocks || []).map(block => ({
          ...block,
          y: Math.min(block.y, maxRows - block.h),
        }));
      });
      commitAndRender();
    });

    container.querySelector('[data-editor-save]')?.addEventListener('click', async () => {
      if (!isActive()) return;
      const report = validateTemplateLayout(draft);
      try {
        draft = await window.api.pdfTemplates.update(draft.id, draft);
        if (!isActive()) return;
        history.push(draft);
        setFeedback(container, report.valid ? 'Plantilla guardada.' : `Borrador guardado con advertencias: ${getValidationSummary(draft)}.`);
      } catch (error) {
        if (isActive()) setFeedback(container, error instanceof Error ? error.message : 'No se pudo guardar la plantilla.');
      }
    });

    container.querySelector('[data-editor-preview]')?.addEventListener('click', async () => {
      if (!isActive()) return;
      try {
        const result = await window.api.analytics.previewPdf(params.matchId || '', {
          templateId: draft.id,
          pdfTemplateLayout: draft,
        });
        if (!isActive()) return;
        if (!result?.canceled && result?.filePath) {
          await window.api.files.open(result.filePath);
          setFeedback(container, 'Vista previa generada.');
        }
      } catch (error) {
        if (isActive()) setFeedback(container, error instanceof Error ? error.message : 'No se pudo generar la vista previa.');
      }
    });

    container.querySelector('[data-template-properties]')?.addEventListener('input', () => {
      updateSelectedBlock((block, page) => {
        const title = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-property-title]'))?.value || '';
        const showTitle = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-property-show-title]'))?.checked !== false;
        const team = /** @type {HTMLSelectElement|null} */ (container.querySelector('[data-property-team]'))?.value || 'all';
        const period = /** @type {HTMLSelectElement|null} */ (container.querySelector('[data-property-period]'))?.value || 'all';
        const eventType = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-property-event-type]'))?.value || '';
        const text = /** @type {HTMLTextAreaElement|null} */ (container.querySelector('[data-property-text]'))?.value;
        const metrics = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-property-metrics]'))?.value;
        const maxRows = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-property-max-rows]'))?.value;
        block.settings = {
          ...(block.settings || {}),
          title,
          showTitle,
          team,
          period,
          eventType,
        };
        if (typeof text === 'string') block.settings.text = text;
        if (metrics !== undefined) {
          block.settings.metrics = String(metrics || '').split(',').map(item => item.trim()).filter(Boolean).slice(0, 6);
        }
        if (maxRows !== undefined) block.settings.maxRows = Math.max(1, Math.min(50, Number(maxRows) || 12));
        Object.assign(block, preventBlockOverlap(block, page.blocks, page, draft.orientation));
      }, false);
      history.push(draft);
      const validation = container.querySelector('[data-template-validation]');
      if (validation) validation.textContent = getValidationSummary(draft);
    });

    container.querySelector('[data-property-size]')?.addEventListener('change', (event) => {
      const select = /** @type {HTMLSelectElement} */ (event.currentTarget);
      updateSelectedBlock((block, page) => {
        const preset = SIZE_PRESETS[select.value] || SIZE_PRESETS.medium;
        block.settings = { ...(block.settings || {}), sizePreset: select.value };
        Object.assign(block, preventBlockOverlap({ ...block, w: preset.w, h: preset.h }, page.blocks, page, draft.orientation));
      });
      history.push(draft);
    });
  };

  lifecycleState.cleanup = () => {
    if (lifecycleState.walkthroughTimer) window.clearTimeout(lifecycleState.walkthroughTimer);
    lifecycleState.walkthroughTimer = 0;
    container.__pdfTemplateEditorKeydownCleanup?.();
    container.__pdfTemplateEditorKeydownCleanup = null;
    document.querySelector('[data-pdf-template-walkthrough-root]')?.remove();
  };
  render();
}

/**
 * @param {{title: string, submitLabel: string, initialValue?: string, fallbackName?: string, onSubmit: function(string): Promise<void>}} params
 */
function openTemplateNameDialog({
  title,
  submitLabel,
  initialValue = '',
  fallbackName = 'Nueva plantilla PDF',
  onSubmit,
}) {
  document.querySelector('[data-template-name-dialog]')?.remove();
  const dialog = document.createElement('div');
  dialog.className = 'pdf-template-name-dialog-backdrop';
  dialog.setAttribute('data-template-name-dialog', '');
  dialog.setAttribute('role', 'presentation');
  dialog.innerHTML = `
    <form class="pdf-template-name-dialog" role="dialog" aria-modal="true" aria-labelledby="template-name-title">
      <header>
        <strong id="template-name-title">${escapeHtml(title)}</strong>
        <button type="button" data-template-name-cancel aria-label="Cerrar">x</button>
      </header>
      <label>
        <span>Nombre</span>
        <input type="text" data-template-name-input maxlength="80" autocomplete="off">
      </label>
      <p data-template-name-error aria-live="polite"></p>
      <footer>
        <button type="button" class="pdf-template-button secondary" data-template-name-cancel>Cancelar</button>
        <button type="submit" class="pdf-template-button primary" data-template-name-submit>${escapeHtml(submitLabel)}</button>
      </footer>
    </form>
  `;
  document.body.appendChild(dialog);

  const form = dialog.querySelector('form');
  const input = /** @type {HTMLInputElement|null} */ (dialog.querySelector('[data-template-name-input]'));
  const error = dialog.querySelector('[data-template-name-error]');
  const submitButton = /** @type {HTMLButtonElement|null} */ (dialog.querySelector('[data-template-name-submit]'));
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
  dialog.querySelectorAll('[data-template-name-cancel]').forEach(button => {
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

/**
 * @param {HTMLElement} container
 * @param {object} params
 */
async function mountManager(container, params = {}, isActive = () => true) {
  const loadTemplates = async () => {
    const managerState = await loadPdfTemplateManagerState();
    if (!isActive()) return;
    container.innerHTML = renderTemplateManager(managerState);
    wireManager();
  };

  const wireManager = () => {
    container.querySelector('[data-template-create]')?.addEventListener('click', async () => {
      openTemplateNameDialog({
        title: 'Nueva plantilla PDF',
        submitLabel: 'Crear plantilla',
        fallbackName: 'Nueva plantilla PDF',
        onSubmit: async (name) => {
          const template = await window.api.pdfTemplates.create({ name });
          if (!isActive()) return;
          navigate('pdfTemplates', { id: template.id, ...(params.matchId ? { matchId: params.matchId } : {}) });
        },
      });
    });

    container.querySelector('[data-template-import]')?.addEventListener('click', async () => {
      try {
        const imported = await window.api.pdfTemplates.import();
        if (!isActive()) return;
        if (!imported?.canceled) await loadTemplates();
      } catch (error) {
        if (isActive()) setFeedback(container, error instanceof Error ? error.message : 'No se pudo importar la plantilla.');
      }
    });

    container.querySelectorAll('[data-template-id]').forEach((card) => {
      const id = card.getAttribute('data-template-id') || '';
      card.querySelector('[data-template-open-editor]')?.addEventListener('click', async () => {
        if (!isActive()) return;
        if (id === SYSTEM_TEMPLATE_ID) {
          const copy = await window.api.pdfTemplates.duplicate(id, { name: 'Default editable' });
          if (!isActive()) return;
          navigate('pdfTemplates', { id: copy.id, ...(params.matchId ? { matchId: params.matchId } : {}) });
          return;
        }
        navigate('pdfTemplates', { id, ...(params.matchId ? { matchId: params.matchId } : {}) });
      });
      card.querySelector('[data-template-duplicate]')?.addEventListener('click', async () => {
        try {
          await window.api.pdfTemplates.duplicate(id);
          if (!isActive()) return;
          await loadTemplates();
        } catch (error) {
          if (isActive()) setFeedback(container, error instanceof Error ? error.message : 'No se pudo duplicar la plantilla.');
        }
      });
      card.querySelector('[data-template-rename]')?.addEventListener('click', async () => {
        try {
          const current = await window.api.pdfTemplates.get(id);
          if (!isActive()) return;
          openTemplateNameDialog({
            title: 'Renombrar plantilla',
            submitLabel: 'Guardar nombre',
            initialValue: current.name || 'Plantilla PDF',
            fallbackName: current.name || 'Plantilla PDF',
            onSubmit: async (name) => {
              await window.api.pdfTemplates.update(id, { ...current, name });
              if (!isActive()) return;
              await loadTemplates();
            },
          });
        } catch (error) {
          if (isActive()) setFeedback(container, error instanceof Error ? error.message : 'No se pudo renombrar la plantilla.');
        }
      });
      card.querySelector('[data-template-delete]')?.addEventListener('click', async () => {
        if (!window.confirm('Eliminar esta plantilla PDF?')) return;
        try {
          await window.api.pdfTemplates.delete(id);
          if (!isActive()) return;
          await loadTemplates();
        } catch (error) {
          if (isActive()) setFeedback(container, error instanceof Error ? error.message : 'No se pudo eliminar la plantilla.');
        }
      });
      card.querySelector('[data-template-default]')?.addEventListener('click', async () => {
        try {
          await window.api.pdfTemplates.setDefault(id);
          if (!isActive()) return;
          await loadTemplates();
        } catch (error) {
          if (isActive()) setFeedback(container, error instanceof Error ? error.message : 'No se pudo marcar como default.');
        }
      });
      card.querySelector('[data-template-export]')?.addEventListener('click', async () => {
        try {
          const result = await window.api.pdfTemplates.export(id);
          if (!isActive()) return;
          if (!result?.canceled) setFeedback(container, 'Plantilla exportada.');
        } catch (error) {
          if (isActive()) setFeedback(container, error instanceof Error ? error.message : 'No se pudo exportar la plantilla.');
        }
      });
    });
  };

  await loadTemplates();
}

/**
 * @param {HTMLElement} container
 * @param {{id?: string, matchId?: string}} params
 */
export function renderPdfTemplateEditor(container, params = {}, lifecycle = {}) {
  const state = {
    disposed: false,
    cleanup: null,
    walkthroughTimer: 0,
    isActive: () => lifecycle?.isCurrent?.() !== false && lifecycle?.signal?.aborted !== true,
  };
  const cleanup = () => {
    state.disposed = true;
    if (state.walkthroughTimer) window.clearTimeout(state.walkthroughTimer);
    state.walkthroughTimer = 0;
    state.cleanup?.();
    state.cleanup = null;
    container.__pdfTemplateEditorKeydownCleanup?.();
    container.__pdfTemplateEditorKeydownCleanup = null;
    document.querySelector('[data-pdf-template-walkthrough-root]')?.remove();
    document.querySelector('[data-template-name-dialog]')?.remove();
  };
  container.__pdfTemplateEditorKeydownCleanup?.();
  container.__pdfTemplateEditorKeydownCleanup = null;
  setSidebarExpanded(false);
  updateTopbarContext('Plantillas PDF');
  setTopbarActions([
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'settings', label: 'Ajustes' },
  ], (id) => navigate(id, params.matchId && id === 'dashboard' ? { matchId: params.matchId } : {}));

  container.innerHTML = `
    <section class="pdf-template-editor-view view-enter">
      <div class="pdf-template-loading">Cargando plantillas PDF...</div>
    </section>
  `;

  void mountPdfTemplateEditor(container, params, state).catch(() => {
    if (state.disposed || !state.isActive()) return;
    container.innerHTML = renderTemplateManager({
      available: false,
      templates: [SYSTEM_TEMPLATE_FALLBACK],
      message: PDF_TEMPLATE_MANAGER_UNAVAILABLE_MESSAGE,
    });
  });
  return cleanup;
}

async function mountPdfTemplateEditor(container, params, state) {
  const isActive = () => !state.disposed && state.isActive();
  if (params.id) {
    try {
      const template = await window.api.pdfTemplates.get(params.id);
      if (!isActive()) return;
      mountEditor(container, template, params, state);
    } catch {
      if (!isActive()) return;
      container.innerHTML = renderTemplateManager({
        available: false,
        templates: [SYSTEM_TEMPLATE_FALLBACK],
        message: PDF_TEMPLATE_MANAGER_UNAVAILABLE_MESSAGE,
      });
    }
    return;
  }

  await mountManager(container, params, isActive);
}
