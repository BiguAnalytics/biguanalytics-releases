// @ts-check
import {
  findWalkthroughTarget,
  getWalkthroughPopoverPosition,
  getWalkthroughSpotlightRect,
  resolveAvailableWalkthroughSteps,
} from './walkthrough.js';

export const PDF_TEMPLATE_EDITOR_WALKTHROUGH_COMPLETED_FLAG = 'pdfTemplateEditor.walkthrough.completed';

export const PDF_TEMPLATE_EDITOR_WALKTHROUGH_STEPS = [
  {
    id: 'intro',
    targetIds: ['pdf-template-editor-root'],
    title: 'Editor de plantillas PDF',
    description: 'Acá podés diseñar cómo se va a ver el informe PDF: elegir bloques, ordenarlos y distribuirlos por páginas.',
    placement: 'bottom',
  },
  {
    id: 'library',
    targetIds: ['pdf-template-block-library'],
    title: 'Biblioteca de bloques',
    description: 'Arrastrá bloques como marcador, KPIs, gráficos, análisis IA o notas hacia una página.',
    placement: 'right',
  },
  {
    id: 'page',
    targetIds: ['pdf-template-page-grid'],
    title: 'Página del informe',
    description: 'Cada página representa una hoja del PDF. Los bloques se acomodan sobre una grilla para mantener el diseño ordenado.',
    placement: 'left',
  },
  {
    id: 'move-resize',
    targetIds: ['pdf-template-block'],
    title: 'Mover y redimensionar',
    description: 'Podés mover los bloques y ajustar su tamaño para darle más importancia a ciertas secciones.',
    placement: 'left',
    optional: true,
    targetWaitMs: 80,
  },
  {
    id: 'properties',
    targetIds: ['pdf-template-properties'],
    title: 'Propiedades del bloque',
    description: 'Desde acá podés cambiar título, filtros, equipo, período o métricas según el tipo de bloque.',
    placement: 'left',
  },
  {
    id: 'add-page',
    targetIds: ['pdf-template-add-page'],
    title: 'Agregar páginas',
    description: 'Creá nuevas páginas para separar resumen, formaciones fijas, disciplina, rucks, recomendaciones o notas.',
    placement: 'bottom',
  },
  {
    id: 'save',
    targetIds: ['pdf-template-save'],
    title: 'Guardar plantilla',
    description: 'Guardá tu plantilla localmente para reutilizarla en otros partidos.',
    placement: 'bottom',
  },
  {
    id: 'preview-export',
    targetIds: ['pdf-template-preview'],
    title: 'Usar en exportación',
    description: 'Al exportar el PDF, vas a poder elegir esta plantilla para generar el informe con tu diseño.',
    placement: 'bottom',
  },
];

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
 * @param {object|null|undefined} settings
 * @returns {{completed: boolean}}
 */
export function getPdfTemplateEditorWalkthroughSettings(settings = {}) {
  return {
    completed: settings?.pdfTemplateEditor?.walkthrough?.completed === true,
  };
}

/**
 * @param {object|null|undefined} settings
 * @returns {boolean}
 */
export function isPdfTemplateEditorWalkthroughCompleted(settings = {}) {
  return getPdfTemplateEditorWalkthroughSettings(settings).completed === true;
}

/**
 * @param {object|null|undefined} settings
 * @param {{force?: boolean}} [options]
 * @returns {boolean}
 */
export function shouldShowPdfTemplateEditorWalkthrough(settings = {}, options = {}) {
  if (options.force === true) return true;
  return !isPdfTemplateEditorWalkthroughCompleted(settings);
}

/**
 * @param {object|null|undefined} settings
 * @returns {object}
 */
export function buildPdfTemplateEditorWalkthroughCompletedSettings(settings = {}) {
  return {
    pdfTemplateEditor: {
      ...(settings.pdfTemplateEditor || {}),
      walkthrough: {
        ...(settings.pdfTemplateEditor?.walkthrough || {}),
        completed: true,
      },
    },
  };
}

/**
 * @param {object|null|undefined} settings
 * @returns {object}
 */
export function buildPdfTemplateEditorWalkthroughResetSettings(settings = {}) {
  return {
    pdfTemplateEditor: {
      ...(settings.pdfTemplateEditor || {}),
      walkthrough: {
        ...(settings.pdfTemplateEditor?.walkthrough || {}),
        completed: false,
      },
    },
  };
}

/**
 * @param {Document} documentRef
 * @returns {HTMLElement}
 */
function ensureWalkthroughRoot(documentRef) {
  const existing = documentRef.querySelector('[data-pdf-template-walkthrough-root]');
  if (existing) return /** @type {HTMLElement} */ (existing);
  const root = documentRef.createElement('div');
  root.className = 'walkthrough-root pdf-template-walkthrough-root';
  root.dataset.pdfTemplateWalkthroughRoot = 'true';
  documentRef.body.appendChild(root);
  return root;
}

/**
 * @param {HTMLElement} root
 * @param {Element} target
 * @param {object} step
 * @param {number} index
 * @param {number} total
 */
function renderStep(root, target, step, index, total) {
  root.innerHTML = `
    <div class="walkthrough-spotlight" aria-hidden="true"></div>
    <section class="walkthrough-card" role="dialog" aria-modal="true" aria-labelledby="pdf-template-walkthrough-title">
      <div class="walkthrough-counter">Paso ${index + 1} de ${total}</div>
      <h2 id="pdf-template-walkthrough-title">${escapeHtml(step.title)}</h2>
      <p>${escapeHtml(step.description)}</p>
      <div class="walkthrough-actions">
        <button class="walkthrough-secondary" type="button" data-pdf-template-walkthrough-skip>Omitir</button>
        <span></span>
        <button class="walkthrough-secondary" type="button" data-pdf-template-walkthrough-back ${index === 0 ? 'disabled' : ''}>Atras</button>
        <button class="walkthrough-primary" type="button" data-pdf-template-walkthrough-next>${index === total - 1 ? 'Finalizar' : 'Siguiente'}</button>
      </div>
    </section>
  `;
  root.dataset.activeTarget = target.getAttribute('data-tour-id') || step.id;
}

/**
 * @param {HTMLElement} root
 * @param {Element} target
 * @param {string} placement
 * @param {Window} windowRef
 */
function positionWalkthrough(root, target, placement, windowRef) {
  const card = /** @type {HTMLElement|null} */ (root.querySelector('.walkthrough-card'));
  const spotlight = /** @type {HTMLElement|null} */ (root.querySelector('.walkthrough-spotlight'));
  if (!card || !spotlight) return;
  const targetRect = target.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const position = getWalkthroughPopoverPosition(targetRect, {
    width: cardRect.width || 360,
    height: cardRect.height || 220,
  }, {
    width: windowRef.innerWidth || 1024,
    height: windowRef.innerHeight || 768,
  }, placement || 'bottom');
  card.style.left = `${Math.round(position.left)}px`;
  card.style.top = `${Math.round(position.top)}px`;
  card.dataset.placement = position.placement;

  const spotlightRect = getWalkthroughSpotlightRect(targetRect, 7, {
    width: windowRef.innerWidth || 1024,
    height: windowRef.innerHeight || 768,
  });
  spotlight.style.left = `${Math.round(spotlightRect.left)}px`;
  spotlight.style.top = `${Math.round(spotlightRect.top)}px`;
  spotlight.style.width = `${Math.round(spotlightRect.width)}px`;
  spotlight.style.height = `${Math.round(spotlightRect.height)}px`;
}

/**
 * @param {{documentRef?: Document, windowRef?: Window, settingsApi?: object, force?: boolean}} [options]
 * @returns {Promise<{started: boolean, completed?: boolean}>}
 */
export async function startPdfTemplateEditorWalkthrough(options = {}) {
  const documentRef = options.documentRef || globalThis.document;
  const windowRef = options.windowRef || globalThis.window;
  const settingsApi = options.settingsApi || windowRef?.api?.settings;
  const settings = await settingsApi?.get?.() || {};
  if (!shouldShowPdfTemplateEditorWalkthrough(settings, { force: options.force === true })) {
    return { started: false };
  }

  const steps = await resolveAvailableWalkthroughSteps(PDF_TEMPLATE_EDITOR_WALKTHROUGH_STEPS, {
    documentRef,
    timeoutMs: 80,
    intervalMs: 20,
  });
  if (steps.length === 0) return { started: false };

  const root = ensureWalkthroughRoot(documentRef);
  let index = 0;
  let disposed = false;
  let frame = 0;
  let activeTarget = null;

  const cleanup = () => {
    disposed = true;
    if (frame) windowRef.cancelAnimationFrame?.(frame);
    root.remove();
    windowRef.removeEventListener('resize', schedulePosition);
    windowRef.removeEventListener('scroll', schedulePosition, true);
    documentRef.removeEventListener('scroll', schedulePosition, true);
  };

  const complete = async () => {
    const latestSettings = await settingsApi?.get?.() || settings;
    await settingsApi?.set?.(buildPdfTemplateEditorWalkthroughCompletedSettings(latestSettings));
    cleanup();
  };

  function schedulePosition() {
    if (disposed || frame) return;
    const raf = windowRef.requestAnimationFrame || ((callback) => windowRef.setTimeout(callback, 16));
    frame = raf(() => {
      frame = 0;
      if (disposed || !activeTarget) return;
      positionWalkthrough(root, activeTarget, steps[index]?.placement || 'bottom', windowRef);
    });
  }

  const render = () => {
    const step = steps[index];
    const target = findWalkthroughTarget(documentRef, step);
    if (!target) {
      steps.splice(index, 1);
      if (index >= steps.length) index = Math.max(0, steps.length - 1);
      if (steps.length === 0) {
        cleanup();
        return;
      }
      render();
      return;
    }
    activeTarget = target;
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    renderStep(root, target, step, index, steps.length);
    positionWalkthrough(root, target, step.placement || 'bottom', windowRef);
    schedulePosition();

    root.querySelector('[data-pdf-template-walkthrough-skip]')?.addEventListener('click', complete);
    root.querySelector('[data-pdf-template-walkthrough-back]')?.addEventListener('click', () => {
      if (index <= 0) return;
      index -= 1;
      render();
    });
    root.querySelector('[data-pdf-template-walkthrough-next]')?.addEventListener('click', () => {
      if (index >= steps.length - 1) {
        complete();
        return;
      }
      index += 1;
      render();
    });
    /** @type {HTMLElement|null} */ (root.querySelector('[data-pdf-template-walkthrough-next]'))?.focus();
  };

  windowRef.addEventListener('resize', schedulePosition);
  windowRef.addEventListener('scroll', schedulePosition, true);
  documentRef.addEventListener('scroll', schedulePosition, true);
  render();
  return { started: true };
}
