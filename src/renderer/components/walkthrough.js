// @ts-check

const PROFILE_ROLE_VALUES = new Set(['jugador', 'entrenador', 'analista', 'staff', 'otro']);
const PLAYER_POSITION_VALUES = new Set([
  'pilar',
  'hooker',
  'segunda_linea',
  'ala',
  'octavo',
  'medio_scrum',
  'apertura',
  'centro',
  'wing',
  'fullback',
  'otro',
]);

const VIEWPORT_MARGIN = 16;
const TARGET_GAP = 14;
const DEFAULT_TARGET_WAIT_MS = 900;
const OPTIONAL_TARGET_WAIT_MS = 160;
const TARGET_RETRY_MS = 80;

export const WALKTHROUGH_COMPLETED_FLAG = 'onboarding.walkthrough.v1.completed';

export const WALKTHROUGH_STEPS = [
  {
    id: 'new-match',
    targetIds: ['new-match'],
    title: 'Nuevo partido',
    description: 'Crea un partido para cargar video, registrar eventos y generar analisis.',
    placement: 'bottom',
  },
  {
    id: 'sidebar-tagging',
    targetIds: ['sidebar-tagging'],
    title: 'Tagging',
    description: 'Desde Tagging vas a cargar el video y marcar eventos con hotkeys.',
    placement: 'right',
  },
  {
    id: 'sidebar-dashboard',
    targetIds: ['sidebar-dashboard'],
    title: 'Dashboard',
    description: 'El dashboard resume metricas, graficos, alertas y analisis post-partido.',
    placement: 'right',
  },
  {
    id: 'ai',
    targetIds: ['ai-panel', 'ai-chatbot'],
    title: 'IA',
    description: 'La IA genera lectura post-partido, patrones y recomendaciones cuando esta habilitada.',
    placement: 'left',
    optional: true,
    targetWaitMs: OPTIONAL_TARGET_WAIT_MS,
  },
  {
    id: 'export-pdf',
    targetIds: ['export-pdf'],
    title: 'Exportar PDF',
    description: 'Cuando estes en Dashboard, podes generar un PDF presentable para compartir el analisis.',
    placement: 'bottom',
    optional: true,
    targetWaitMs: OPTIONAL_TARGET_WAIT_MS,
  },
  {
    id: 'settings',
    targetIds: ['settings'],
    title: 'Ajustes',
    description: 'Desde Ajustes podes revisar conexion IA, preferencias y configuracion de la app.',
    placement: 'right',
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
 * @param {unknown} value
 * @returns {string}
 */
function readText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

/**
 * @param {unknown} value
 * @param {Set<string>} allowed
 * @returns {string}
 */
function readAllowedValue(value, allowed) {
  const normalized = readText(value).toLowerCase();
  return allowed.has(normalized) ? normalized : '';
}

/**
 * @param {object|null|undefined} profile
 * @returns {boolean}
 */
function isProfileComplete(profile = {}) {
  if (profile?.profile_complete === true || profile?.personal_info_complete === true) return true;
  const firstName = readText(profile?.first_name);
  const lastName = readText(profile?.last_name);
  const age = Number(profile?.age);
  const appRole = readAllowedValue(profile?.app_role, PROFILE_ROLE_VALUES);
  const expectedPlayer = appRole === 'jugador';
  const position = readAllowedValue(profile?.position, PLAYER_POSITION_VALUES);
  return Boolean(
    firstName
      && lastName
      && Number.isFinite(age)
      && age >= 12
      && age <= 100
      && appRole
      && typeof profile?.is_player === 'boolean'
      && profile.is_player === expectedPlayer
      && (!expectedPlayer || position)
  );
}

/**
 * @param {object|null|undefined} accessState
 * @returns {string}
 */
export function getWalkthroughIdentityKey(accessState = {}) {
  const profileId = readText(accessState?.profile?.id || accessState?.user?.id || accessState?.profile?.user_id);
  const deviceId = readText(accessState?.device?.id || accessState?.device_id);
  if (!profileId || !deviceId) return '';
  return `${profileId}::${deviceId}`;
}

/**
 * @param {object|null|undefined} settings
 * @returns {{completed?: boolean, identityKey?: string, completedByIdentity?: Record<string, boolean>}}
 */
function getWalkthroughSettings(settings = {}) {
  return settings?.onboarding?.walkthrough?.v1 || {};
}

/**
 * @param {object|null|undefined} settings
 * @param {string} identityKey
 * @returns {boolean}
 */
export function isWalkthroughCompleted(settings = {}, identityKey = '') {
  const walkthrough = getWalkthroughSettings(settings);
  if (!identityKey) return walkthrough.completed === true;
  if (walkthrough.completedByIdentity?.[identityKey] === true) return true;
  return walkthrough.completed === true && walkthrough.identityKey === identityKey;
}

/**
 * @param {object|null|undefined} accessState
 * @returns {boolean}
 */
function isApprovedWalkthroughAccess(accessState = {}) {
  const accessAllowed = accessState?.state === 'active' || accessState?.state === 'offline_grace';
  const deviceApproved = String(accessState?.device?.status || '').toLowerCase() === 'approved';
  return Boolean(accessAllowed && deviceApproved && isProfileComplete(accessState?.profile));
}

/**
 * @param {{accessState?: object, settings?: object, route?: string, homeReady?: boolean, hasBlockingUi?: boolean, force?: boolean}} input
 * @returns {boolean}
 */
export function isWalkthroughEligible(input = {}) {
  const route = input.route || 'home';
  const identityKey = getWalkthroughIdentityKey(input.accessState || {});
  if (route !== 'home') return false;
  if (input.homeReady !== true) return false;
  if (input.hasBlockingUi === true) return false;
  if (!identityKey) return false;
  if (!isApprovedWalkthroughAccess(input.accessState || {})) return false;
  if (!input.force && isWalkthroughCompleted(input.settings || {}, identityKey)) return false;
  return true;
}

/**
 * @param {object} settings
 * @param {object|string} accessState
 * @returns {object}
 */
export function buildWalkthroughCompletedSettings(settings = {}, accessState = {}) {
  const identityKey = typeof accessState === 'string' ? accessState : getWalkthroughIdentityKey(accessState);
  const current = getWalkthroughSettings(settings);
  const completedByIdentity = {
    ...(current.completedByIdentity || {}),
  };
  if (identityKey) completedByIdentity[identityKey] = true;
  return {
    onboarding: {
      ...(settings.onboarding || {}),
      walkthrough: {
        ...(settings.onboarding?.walkthrough || {}),
        v1: {
          ...current,
          completed: true,
          identityKey,
          completedByIdentity,
        },
      },
    },
  };
}

/**
 * @param {object} settings
 * @param {object|string} accessState
 * @returns {object}
 */
export function buildWalkthroughResetSettings(settings = {}, accessState = {}) {
  const identityKey = typeof accessState === 'string' ? accessState : getWalkthroughIdentityKey(accessState);
  const current = getWalkthroughSettings(settings);
  const completedByIdentity = {
    ...(current.completedByIdentity || {}),
  };
  if (identityKey) delete completedByIdentity[identityKey];
  return {
    onboarding: {
      ...(settings.onboarding || {}),
      walkthrough: {
        ...(settings.onboarding?.walkthrough || {}),
        v1: {
          ...current,
          completed: false,
          identityKey,
          completedByIdentity,
        },
      },
    },
  };
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeAttributeSelector(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/**
 * @param {Element|null|undefined} target
 * @returns {boolean}
 */
function isUsableTarget(target) {
  if (!target || target.hidden === true) return false;
  const rect = target.getBoundingClientRect?.();
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

/**
 * @param {Document|object} documentRef
 * @param {object} step
 * @returns {Element|null}
 */
export function findWalkthroughTarget(documentRef, step) {
  const targetIds = Array.isArray(step?.targetIds) ? step.targetIds : [step?.targetId || step?.id].filter(Boolean);
  for (const targetId of targetIds) {
    const target = documentRef?.querySelector?.(`[data-tour-id="${escapeAttributeSelector(targetId)}"]`);
    if (isUsableTarget(target)) return target;
  }
  return null;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * @param {object} step
 * @param {{documentRef?: Document|object, timeoutMs?: number, intervalMs?: number}} [options]
 * @returns {Promise<Element|null>}
 */
async function waitForWalkthroughTarget(step, options = {}) {
  const documentRef = options.documentRef || globalThis.document;
  const timeoutMs = Number(step.targetWaitMs ?? options.timeoutMs ?? DEFAULT_TARGET_WAIT_MS);
  const intervalMs = Number(options.intervalMs || TARGET_RETRY_MS);
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const target = findWalkthroughTarget(documentRef, step);
    if (target) return target;
    if (timeoutMs <= 0) break;
    await wait(intervalMs);
  }

  return findWalkthroughTarget(documentRef, step);
}

/**
 * @param {Array<object>} steps
 * @param {{documentRef?: Document|object, timeoutMs?: number, intervalMs?: number}} [options]
 * @returns {Promise<Array<object>>}
 */
export async function resolveAvailableWalkthroughSteps(steps = WALKTHROUGH_STEPS, options = {}) {
  const available = [];
  for (const step of steps) {
    const target = await waitForWalkthroughTarget(step, {
      ...options,
      timeoutMs: step.optional ? OPTIONAL_TARGET_WAIT_MS : options.timeoutMs,
    });
    if (target) available.push({ ...step });
  }
  return available;
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
 * @param {object} rect
 * @returns {{top: number, left: number, right: number, bottom: number, width: number, height: number}}
 */
function normalizeRect(rect) {
  const left = Number(rect?.left) || 0;
  const top = Number(rect?.top) || 0;
  const width = Number(rect?.width) || Math.max(0, (Number(rect?.right) || left) - left);
  const height = Number(rect?.height) || Math.max(0, (Number(rect?.bottom) || top) - top);
  return {
    top,
    left,
    width,
    height,
    right: Number(rect?.right) || left + width,
    bottom: Number(rect?.bottom) || top + height,
  };
}

/**
 * @param {object} targetRect
 * @param {number} [padding]
 * @param {{width?: number, height?: number}} [viewport]
 * @returns {{top: number, left: number, width: number, height: number}}
 */
export function getWalkthroughSpotlightRect(targetRect, padding = 7, viewport = {}) {
  const rect = normalizeRect(targetRect);
  const safePadding = Math.max(0, Number(padding) || 0);
  const minInset = 8;
  const viewportWidth = Number(viewport?.width);
  const viewportHeight = Number(viewport?.height);
  const hasViewportWidth = Number.isFinite(viewportWidth) && viewportWidth > 0;
  const hasViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0;
  const left = Math.max(minInset, rect.left - safePadding);
  const top = Math.max(minInset, rect.top - safePadding);
  const maxWidth = hasViewportWidth
    ? Math.max(0, Math.max(minInset * 2, viewportWidth) - left - minInset)
    : rect.width + safePadding * 2;
  const maxHeight = hasViewportHeight
    ? Math.max(0, Math.max(minInset * 2, viewportHeight) - top - minInset)
    : rect.height + safePadding * 2;

  return {
    top,
    left,
    width: Math.min(rect.width + safePadding * 2, maxWidth),
    height: Math.min(rect.height + safePadding * 2, maxHeight),
  };
}

/**
 * @param {Element|object|null|undefined} target
 * @returns {Array<Element|object>}
 */
export function getWalkthroughScrollParents(target) {
  const ownerDocument = target?.ownerDocument || globalThis.document;
  const windowRef = ownerDocument?.defaultView || globalThis.window;
  const getStyle = windowRef?.getComputedStyle;
  const parents = [];
  let current = target?.parentElement || null;

  while (current) {
    const style = getStyle?.(current) || {};
    const overflow = `${style.overflow || ''} ${style.overflowX || ''} ${style.overflowY || ''}`;
    if (/(auto|scroll|overlay)/.test(overflow)) parents.push(current);
    if (
      current === ownerDocument?.body
      || current === ownerDocument?.documentElement
      || current === ownerDocument?.scrollingElement
    ) {
      break;
    }
    current = current.parentElement || null;
  }

  return parents;
}

/**
 * @param {Element|object|null|undefined} target
 * @param {Window} windowRef
 * @returns {boolean}
 */
function scrollWalkthroughTargetIntoView(target, windowRef) {
  const rect = normalizeRect(target?.getBoundingClientRect?.());
  const viewportWidth = Number(windowRef?.innerWidth) || 1024;
  const viewportHeight = Number(windowRef?.innerHeight) || 768;
  const outsideViewport = rect.top < VIEWPORT_MARGIN
    || rect.left < VIEWPORT_MARGIN
    || rect.bottom > viewportHeight - VIEWPORT_MARGIN
    || rect.right > viewportWidth - VIEWPORT_MARGIN;
  if (!outsideViewport) return false;
  target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  return true;
}

/**
 * @param {Element|object|null|undefined} target
 * @param {() => void} onScroll
 * @returns {() => void}
 */
function watchWalkthroughScrollParents(target, onScroll) {
  const scrollParents = getWalkthroughScrollParents(target);
  scrollParents.forEach(parent => parent.addEventListener?.('scroll', onScroll, { passive: true }));
  return () => {
    scrollParents.forEach(parent => parent.removeEventListener?.('scroll', onScroll));
  };
}

/**
 * @param {string} placement
 * @param {{top: number, left: number, right: number, bottom: number, width: number, height: number}} target
 * @param {{width: number, height: number}} popover
 * @returns {{top: number, left: number}}
 */
function getPlacementPosition(placement, target, popover) {
  if (placement === 'top') {
    return {
      top: target.top - popover.height - TARGET_GAP,
      left: target.left + (target.width / 2) - (popover.width / 2),
    };
  }
  if (placement === 'right') {
    return {
      top: target.top + (target.height / 2) - (popover.height / 2),
      left: target.right + TARGET_GAP,
    };
  }
  if (placement === 'left') {
    return {
      top: target.top + (target.height / 2) - (popover.height / 2),
      left: target.left - popover.width - TARGET_GAP,
    };
  }
  return {
    top: target.bottom + TARGET_GAP,
    left: target.left + (target.width / 2) - (popover.width / 2),
  };
}

/**
 * @param {{top: number, left: number}} position
 * @param {{width: number, height: number}} popover
 * @param {{width: number, height: number}} viewport
 * @returns {boolean}
 */
function fitsViewport(position, popover, viewport) {
  return position.left >= VIEWPORT_MARGIN
    && position.top >= VIEWPORT_MARGIN
    && position.left + popover.width <= viewport.width - VIEWPORT_MARGIN
    && position.top + popover.height <= viewport.height - VIEWPORT_MARGIN;
}

/**
 * @param {object} targetRect
 * @param {{width: number, height: number}} popoverSize
 * @param {{width: number, height: number}} viewport
 * @param {string} [preferredPlacement]
 * @returns {{top: number, left: number, placement: string}}
 */
export function getWalkthroughPopoverPosition(targetRect, popoverSize, viewport, preferredPlacement = 'bottom') {
  const target = normalizeRect(targetRect);
  const popover = {
    width: Math.max(280, Number(popoverSize?.width) || 360),
    height: Math.max(160, Number(popoverSize?.height) || 220),
  };
  const safeViewport = {
    width: Math.max(VIEWPORT_MARGIN * 2 + popover.width, Number(viewport?.width) || 1024),
    height: Math.max(VIEWPORT_MARGIN * 2 + popover.height, Number(viewport?.height) || 768),
  };
  const placements = [...new Set([
    preferredPlacement,
    target.left < safeViewport.width * 0.28 ? 'right' : 'bottom',
    'bottom',
    'top',
    'right',
    'left',
  ])];

  for (const placement of placements) {
    const position = getPlacementPosition(placement, target, popover);
    if (fitsViewport(position, popover, safeViewport)) {
      return { ...position, placement };
    }
  }

  const fallback = getPlacementPosition(preferredPlacement, target, popover);
  return {
    placement: preferredPlacement,
    left: clamp(fallback.left, VIEWPORT_MARGIN, safeViewport.width - popover.width - VIEWPORT_MARGIN),
    top: clamp(fallback.top, VIEWPORT_MARGIN, safeViewport.height - popover.height - VIEWPORT_MARGIN),
  };
}

/**
 * @param {Document|object} documentRef
 * @returns {boolean}
 */
export function hasBlockingWalkthroughSurface(documentRef = globalThis.document) {
  if (!documentRef?.querySelector) return false;
  const blockingSelector = [
    '.bigu-startup-splash:not(.is-hiding)',
    '.access-shell',
    '.modal-overlay',
    '.account-profile-backdrop',
    '[data-account-profile-modal]',
  ].join(',');
  if (documentRef.querySelector(blockingSelector)) return true;
  return Array.from(documentRef.querySelectorAll?.('[role="dialog"][aria-modal="true"]') || [])
    .some(dialog => !dialog.closest?.('.walkthrough-root'));
}

/**
 * @param {Document} documentRef
 * @returns {HTMLElement}
 */
function ensureWalkthroughRoot(documentRef) {
  const existing = documentRef.querySelector('[data-walkthrough-root]');
  if (existing) return /** @type {HTMLElement} */ (existing);
  const root = documentRef.createElement('div');
  root.className = 'walkthrough-root';
  root.dataset.walkthroughRoot = 'true';
  documentRef.body.appendChild(root);
  return root;
}

/**
 * @param {HTMLElement} root
 * @param {Element} target
 * @param {object} step
 * @param {number} stepIndex
 * @param {number} total
 */
function renderWalkthroughMarkup(root, target, step, stepIndex, total) {
  root.innerHTML = `
    <div class="walkthrough-spotlight" aria-hidden="true"></div>
    <section class="walkthrough-card" role="dialog" aria-modal="true" aria-labelledby="walkthrough-title">
      <div class="walkthrough-counter">Paso ${stepIndex + 1} de ${total}</div>
      <h2 id="walkthrough-title">${escapeHtml(step.title)}</h2>
      <p>${escapeHtml(step.description)}</p>
      <div class="walkthrough-actions">
        <button class="walkthrough-secondary" type="button" data-walkthrough-skip>Omitir</button>
        <span></span>
        <button class="walkthrough-secondary" type="button" data-walkthrough-back ${stepIndex === 0 ? 'disabled' : ''}>Atras</button>
        <button class="walkthrough-primary" type="button" data-walkthrough-next>${stepIndex === total - 1 ? 'Finalizar' : 'Siguiente'}</button>
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

  const targetRect = normalizeRect(target.getBoundingClientRect());
  const cardRect = card.getBoundingClientRect();
  const position = getWalkthroughPopoverPosition(targetRect, {
    width: cardRect.width || 360,
    height: cardRect.height || 220,
  }, {
    width: windowRef.innerWidth || 1024,
    height: windowRef.innerHeight || 768,
  }, placement);

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
 * @param {{windowRef?: Window, documentRef?: Document, settingsApi?: object, getAccessState?: function(): object}} [options]
 * @returns {{mount: function(): function, dispose: function(): void, evaluate: function(object=): Promise<void>}}
 */
export function createWalkthroughController(options = {}) {
  const windowRef = options.windowRef || globalThis.window;
  const documentRef = options.documentRef || globalThis.document;
  const settingsApi = options.settingsApi || windowRef?.api?.settings;
  const getAccessState = options.getAccessState || (() => null);

  let settings = null;
  let route = documentRef?.body?.dataset?.route || 'home';
  let homeReady = false;
  let active = false;
  let starting = false;
  let completing = false;
  let disposed = false;
  let pendingManualStart = false;
  let activeSteps = [];
  let stepIndex = 0;
  let root = null;
  let activeTarget = null;
  let evaluateTimer = 0;
  let frame = 0;
  let removeSettingsListener = null;
  let cleanupActiveScrollParents = null;

  const clearEvaluateTimer = () => {
    if (!evaluateTimer) return;
    windowRef.clearTimeout(evaluateTimer);
    evaluateTimer = 0;
  };

  const loadSettings = async () => {
    if (settings) return settings;
    settings = await settingsApi?.get?.() || {};
    return settings;
  };

  const cleanupRoot = () => {
    cleanupActiveScrollParents?.();
    cleanupActiveScrollParents = null;
    root?.remove();
    root = null;
    activeTarget = null;
  };

  const stopActive = () => {
    active = false;
    activeSteps = [];
    stepIndex = 0;
    cleanupRoot();
  };

  const schedulePosition = () => {
    if (!active || !root || !activeTarget) return;
    if (frame) return;
    const raf = windowRef.requestAnimationFrame || ((callback) => windowRef.setTimeout(callback, 16));
    frame = raf(() => {
      frame = 0;
      if (!active || !root || !activeTarget) return;
      const step = activeSteps[stepIndex];
      positionWalkthrough(root, activeTarget, step?.placement || 'bottom', windowRef);
    });
  };

  const complete = async () => {
    if (completing) return;
    completing = true;
    try {
      const currentSettings = await loadSettings();
      const nextPartial = buildWalkthroughCompletedSettings(currentSettings, getAccessState());
      settings = await settingsApi?.set?.(nextPartial) || nextPartial;
    } finally {
      completing = false;
      pendingManualStart = false;
      stopActive();
    }
  };

  const renderStep = () => {
    if (!active || !activeSteps.length) return;
    const step = activeSteps[stepIndex];
    const target = findWalkthroughTarget(documentRef, step);
    if (!target) {
      activeSteps.splice(stepIndex, 1);
      if (stepIndex >= activeSteps.length) stepIndex = Math.max(0, activeSteps.length - 1);
      if (!activeSteps.length) {
        stopActive();
        return;
      }
      renderStep();
      return;
    }

    root = ensureWalkthroughRoot(documentRef);
    activeTarget = target;
    scrollWalkthroughTargetIntoView(target, windowRef);
    renderWalkthroughMarkup(root, target, step, stepIndex, activeSteps.length);
    cleanupActiveScrollParents?.();
    const cleanupScrollParents = watchWalkthroughScrollParents(activeTarget, schedulePosition);
    cleanupActiveScrollParents = cleanupScrollParents;
    positionWalkthrough(root, target, step.placement || 'bottom', windowRef);
    schedulePosition();

    root.querySelector('[data-walkthrough-skip]')?.addEventListener('click', complete);
    root.querySelector('[data-walkthrough-back]')?.addEventListener('click', () => {
      if (stepIndex <= 0) return;
      stepIndex -= 1;
      renderStep();
    });
    root.querySelector('[data-walkthrough-next]')?.addEventListener('click', () => {
      if (stepIndex >= activeSteps.length - 1) {
        complete();
        return;
      }
      stepIndex += 1;
      renderStep();
    });

    /** @type {HTMLElement|null} */ (root.querySelector('[data-walkthrough-next]'))?.focus();
  };

  const start = async () => {
    if (starting || active) return;
    starting = true;
    try {
      activeSteps = await resolveAvailableWalkthroughSteps(WALKTHROUGH_STEPS, { documentRef });
      if (!activeSteps.length || disposed) return;
      const currentSettings = await loadSettings();
      const accessState = getAccessState();
      const force = pendingManualStart;
      if (!isWalkthroughEligible({
        accessState,
        settings: currentSettings,
        route,
        homeReady,
        hasBlockingUi: hasBlockingWalkthroughSurface(documentRef),
        force,
      })) return;
      active = true;
      pendingManualStart = false;
      stepIndex = 0;
      renderStep();
    } finally {
      starting = false;
    }
  };

  const scheduleEvaluate = (delay = 0) => {
    if (disposed) return;
    clearEvaluateTimer();
    evaluateTimer = windowRef.setTimeout(() => {
      evaluateTimer = 0;
      controller.evaluate().catch(() => {});
    }, delay);
  };

  const controller = {
    async evaluate(input = {}) {
      if (disposed || active || starting) return;
      const currentSettings = input.settings || await loadSettings();
      settings = currentSettings;
      if (route === 'home' && documentRef.querySelector?.('[data-tour-id="new-match"]')) homeReady = true;
      const blocked = hasBlockingWalkthroughSurface(documentRef);
      const eligible = isWalkthroughEligible({
        accessState: getAccessState(),
        settings: currentSettings,
        route,
        homeReady,
        hasBlockingUi: blocked,
        force: pendingManualStart || input.force === true,
      });
      if (blocked && route === 'home' && homeReady) {
        scheduleEvaluate(240);
        return;
      }
      if (!eligible) return;
      await start();
    },
    mount() {
      if (!windowRef || !documentRef || !settingsApi) return () => {};
      const onRouteChanged = (event) => {
        route = event?.detail?.route || 'home';
        homeReady = route === 'home' ? homeReady : false;
        if (active && route !== 'home') stopActive();
        scheduleEvaluate();
      };
      const onHomeReady = () => {
        homeReady = true;
        scheduleEvaluate();
      };
      const onAccessChanged = () => {
        if (active && !isApprovedWalkthroughAccess(getAccessState())) stopActive();
        scheduleEvaluate();
      };
      const onSettingsChanged = (event) => {
        settings = event?.detail || settings;
        scheduleEvaluate();
      };
      const onRestart = (event) => {
        settings = event?.detail?.settings || null;
        pendingManualStart = true;
        if (active) stopActive();
        scheduleEvaluate();
      };
      const onKeydown = (event) => {
        if (event.key === 'Escape' && active) complete();
      };

      windowRef.addEventListener('bigu:route-changed', onRouteChanged);
      windowRef.addEventListener('bigu:home-initial-data-ready', onHomeReady);
      windowRef.addEventListener('bigu:access-state-changed', onAccessChanged);
      windowRef.addEventListener('settings:changed', onSettingsChanged);
      windowRef.addEventListener('bigu:walkthrough-restart', onRestart);
      windowRef.addEventListener('keydown', onKeydown, true);
      windowRef.addEventListener('resize', schedulePosition);
      windowRef.addEventListener('scroll', schedulePosition, true);
      documentRef.addEventListener('scroll', schedulePosition, true);
      removeSettingsListener = settingsApi.onChanged?.((nextSettings) => {
        settings = nextSettings;
        scheduleEvaluate();
      }) || null;
      scheduleEvaluate();

      return () => {
        windowRef.removeEventListener('bigu:route-changed', onRouteChanged);
        windowRef.removeEventListener('bigu:home-initial-data-ready', onHomeReady);
        windowRef.removeEventListener('bigu:access-state-changed', onAccessChanged);
        windowRef.removeEventListener('settings:changed', onSettingsChanged);
        windowRef.removeEventListener('bigu:walkthrough-restart', onRestart);
        windowRef.removeEventListener('keydown', onKeydown, true);
        windowRef.removeEventListener('resize', schedulePosition);
        windowRef.removeEventListener('scroll', schedulePosition, true);
        documentRef.removeEventListener('scroll', schedulePosition, true);
        removeSettingsListener?.();
        clearEvaluateTimer();
        disposed = true;
        stopActive();
      };
    },
    dispose() {
      disposed = true;
      clearEvaluateTimer();
      removeSettingsListener?.();
      stopActive();
    },
  };

  return controller;
}
