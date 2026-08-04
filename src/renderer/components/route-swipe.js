// @ts-check

const SWIPE_THRESHOLD = 72;
const SWIPE_MAX_OFFSET = 160;
const SWIPE_SETTLE_MS = 150;
const SWIPE_ROUTES = Object.freeze([
  'home',
  'tagging',
  'dashboard',
  'clips',
  'tactical',
  'season',
  'settings',
]);
const SWIPE_EXCLUDED_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'video',
  'canvas',
  '[contenteditable="true"]',
  '[data-no-route-swipe]',
  '[data-settings-choice-card]',
  '[data-match-card]',
  '[role="button"]',
].join(',');

/**
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isExcludedTarget(target) {
  return Boolean(target && /** @type {Element} */ (target).closest?.(SWIPE_EXCLUDED_SELECTOR));
}

/**
 * @param {string} currentRoute
 * @param {number} direction
 * @param {readonly string[]} routes
 * @returns {string|null}
 */
function getAdjacentRoute(currentRoute, direction, routes) {
  const currentIndex = routes.indexOf(currentRoute);
  if (currentIndex < 0) return null;
  return routes[currentIndex + direction] || null;
}

/**
 * @param {HTMLElement} container
 * @param {{getCurrentRoute?: () => string, navigate?: (route: string) => void, routes?: readonly string[]}} [options]
 * @returns {() => void}
 */
export function initRouteSwipe(container, options = {}) {
  if (!container || typeof options.navigate !== 'function') return () => {};

  const getCurrentRoute = options.getCurrentRoute || (() => 'home');
  const navigate = options.navigate;
  const routes = options.routes || SWIPE_ROUTES;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let isTracking = false;
  let isHorizontal = false;
  let settleTimer = 0;

  const resetVisualState = () => {
    window.clearTimeout(settleTimer);
    container.classList.remove(
      'is-route-swipe-ready',
      'is-route-swiping',
      'is-route-swipe-cancelling',
      'is-route-swipe-committing',
      'is-route-swipe-blocked',
    );
    container.style.removeProperty('--route-swipe-offset');
    container.style.removeProperty('--route-swipe-progress');
  };

  const releasePointer = () => {
    if (pointerId === null) return;
    if (container.hasPointerCapture?.(pointerId)) container.releasePointerCapture(pointerId);
    pointerId = null;
  };

  /** @param {PointerEvent} event */
  const handlePointerDown = (event) => {
    if (!event.isPrimary || pointerId !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (isExcludedTarget(event.target)) return;

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    lastX = event.clientX;
    isTracking = true;
    isHorizontal = false;
    container.setPointerCapture?.(event.pointerId);
  };

  /** @param {PointerEvent} event */
  const handlePointerMove = (event) => {
    if (!isTracking || event.pointerId !== pointerId) return;

    lastX = event.clientX;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!isHorizontal) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        isTracking = false;
        releasePointer();
        resetVisualState();
        return;
      }
      isHorizontal = true;
      container.classList.add('is-route-swipe-ready');
    }

    event.preventDefault();
    const direction = deltaX < 0 ? 1 : -1;
    const nextRoute = getAdjacentRoute(getCurrentRoute(), direction, routes);
    const resistance = nextRoute ? 0.34 : 0.12;
    const offset = Math.max(-SWIPE_MAX_OFFSET, Math.min(SWIPE_MAX_OFFSET, deltaX * resistance));
    container.classList.add('is-route-swiping');
    container.classList.toggle('is-route-swipe-blocked', !nextRoute);
    container.style.setProperty('--route-swipe-offset', `${offset}px`);
    container.style.setProperty(
      '--route-swipe-progress',
      Math.min(Math.abs(deltaX) / SWIPE_THRESHOLD, 1).toFixed(3),
    );
  };

  /** @param {PointerEvent} event */
  const finishGesture = (event) => {
    if (!isTracking || event.pointerId !== pointerId) return;

    const deltaX = lastX - startX;
    const wasHorizontal = isHorizontal;
    const direction = deltaX < 0 ? 1 : -1;
    const nextRoute = wasHorizontal
      ? getAdjacentRoute(getCurrentRoute(), direction, routes)
      : null;
    const shouldNavigate = Boolean(nextRoute && Math.abs(deltaX) >= SWIPE_THRESHOLD);
    isTracking = false;
    isHorizontal = false;
    releasePointer();

    if (shouldNavigate) {
      container.classList.remove('is-route-swiping', 'is-route-swipe-ready', 'is-route-swipe-blocked');
      container.classList.add('is-route-swipe-committing');
      container.style.setProperty('--route-swipe-offset', `${direction * SWIPE_MAX_OFFSET}px`);
      settleTimer = window.setTimeout(() => {
        resetVisualState();
        navigate(nextRoute);
      }, SWIPE_SETTLE_MS);
      return;
    }

    if (wasHorizontal) {
      container.classList.remove('is-route-swipe-ready', 'is-route-swipe-blocked');
      container.classList.add('is-route-swipe-cancelling');
      container.style.setProperty('--route-swipe-offset', '0px');
      settleTimer = window.setTimeout(resetVisualState, SWIPE_SETTLE_MS);
      return;
    }

    resetVisualState();
  };

  /** @param {PointerEvent} event */
  const handlePointerCancel = (event) => {
    if (event.pointerId !== pointerId) return;
    isTracking = false;
    isHorizontal = false;
    releasePointer();
    resetVisualState();
  };

  container.addEventListener('pointerdown', handlePointerDown);
  container.addEventListener('pointermove', handlePointerMove, { passive: false });
  container.addEventListener('pointerup', finishGesture);
  container.addEventListener('pointercancel', handlePointerCancel);

  return () => {
    isTracking = false;
    isHorizontal = false;
    releasePointer();
    resetVisualState();
    container.removeEventListener('pointerdown', handlePointerDown);
    container.removeEventListener('pointermove', handlePointerMove);
    container.removeEventListener('pointerup', finishGesture);
    container.removeEventListener('pointercancel', handlePointerCancel);
  };
}
