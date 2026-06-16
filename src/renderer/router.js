// @ts-check
import { canAccessRoute, getAccessState } from './auth/access-guard.js';
import { setSidebarActive } from './components/sidebar.js';
import { renderClipPlayer } from './views/clip-player.js';
import { renderDashboard } from './views/dashboard.js';
import { renderHeatmap } from './views/heatmap.js';
import { renderHome } from './views/home.js';
import { renderSeason } from './views/season.js';
import { renderSettings } from './views/settings.js';
import { renderTacticalBoard } from './views/tactical-board.js';
import { renderTagging } from './views/tagging.js';
import { markStartup } from './startup-timing.js';

const routes = {
  home: renderHome,
  tagging: renderTagging,
  dashboard: renderDashboard,
  heatmap: renderHeatmap,
  clips: renderClipPlayer,
  tactical: renderTacticalBoard,
  season: renderSeason,
  settings: renderSettings,
};

let currentRoute = null;
let currentHash = null;
let currentCleanup = null;
let transitionToken = 0;
let routerInitialized = false;

const ROUTE_TRANSITION_MS = 200;
const ROUTE_LAYER_CLASS = 'route-transition-layer';
const ROUTE_ENTER_CLASS = 'route-transition-enter';
const ROUTE_EXIT_CLASS = 'route-transition-exit';
const ROUTE_ENTERING_CLASS = 'is-route-entering';
const ROUTE_EXITING_CLASS = 'is-route-exiting';

/**
 * @param {string} route
 * @param {object} params
 * @returns {string}
 */
function buildHash(route, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `#${route}?${query}` : `#${route}`;
}

/**
 * @param {string} hash
 * @returns {{route: string, params: object}}
 */
function parseHash(hash) {
  const [route = 'home', query = ''] = hash.replace(/^#/, '').split('?');
  return {
    route: route || 'home',
    params: Object.fromEntries(new URLSearchParams(query)),
  };
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * @param {HTMLElement} container
 */
function clearRouteTransitionState(container) {
  container.classList.remove(
    ROUTE_ENTER_CLASS,
    ROUTE_EXIT_CLASS,
    ROUTE_ENTERING_CLASS,
    ROUTE_EXITING_CLASS,
  );
}

/**
 * @param {FrameRequestCallback} callback
 */
function onNextFrame(callback) {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback);
    return;
  }
  window.setTimeout(() => callback(0), 0);
}

/**
 * @param {HTMLElement} container
 */
function prepareRouteEnter(container) {
  container.classList.add(ROUTE_LAYER_CLASS);
  if (prefersReducedMotion()) return;

  container.classList.add(ROUTE_ENTER_CLASS, ROUTE_ENTERING_CLASS);
}

/**
 * @param {HTMLElement} container
 */
function startRouteEnter(container) {
  prepareRouteEnter(container);
  if (prefersReducedMotion()) return;

  onNextFrame(() => {
    container.classList.remove(ROUTE_ENTERING_CLASS);
    window.setTimeout(() => {
      container.classList.remove(ROUTE_ENTER_CLASS);
    }, ROUTE_TRANSITION_MS);
  });
}

/**
 * @param {HTMLElement} container
 */
function startRouteExit(container) {
  clearRouteTransitionState(container);
  container.classList.add(ROUTE_LAYER_CLASS, ROUTE_EXIT_CLASS, ROUTE_EXITING_CLASS);
}

/**
 * @param {string} route
 * @param {object} params
 */
function dispatchRouteChanged(route, params) {
  markStartup('route:current', { route });
  window.dispatchEvent(new CustomEvent('bigu:route-changed', {
    detail: { route, params: { ...params } },
  }));
}

/**
 * @param {HTMLElement} container
 * @param {string} route
 * @param {object} params
 * @param {unknown} cleanup
 * @param {number} token
 */
function finalizeRouteRender(container, route, params, cleanup, token) {
  if (token !== transitionToken) return;
  if (typeof cleanup === 'function') currentCleanup = cleanup;
  startRouteEnter(container);
  dispatchRouteChanged(route, params);
}

/**
 * @param {HTMLElement} container
 * @param {unknown} error
 * @param {number} token
 */
function handleRouteRenderError(container, error, token) {
  if (token === transitionToken) startRouteEnter(container);
  window.setTimeout(() => {
    throw error;
  });
}

/**
 * @param {HTMLElement} container
 * @param {string} route
 * @param {object} params
 * @param {function} renderFn
 * @param {number} token
 */
function renderRoute(container, route, params, renderFn, token) {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  currentRoute = route;
  setSidebarActive(route);
  document.body.dataset.route = route;
  currentHash = buildHash(route, params);
  if (window.location.hash !== currentHash) window.location.hash = currentHash;

  clearRouteTransitionState(container);
  prepareRouteEnter(container);
  let cleanup;
  try {
    cleanup = renderFn(container, params);
  } catch (error) {
    handleRouteRenderError(container, error, token);
    return;
  }

  if (cleanup && typeof cleanup.then === 'function') {
    cleanup
      .then((resolvedCleanup) => finalizeRouteRender(container, route, params, resolvedCleanup, token))
      .catch((error) => handleRouteRenderError(container, error, token));
    return;
  }

  finalizeRouteRender(container, route, params, cleanup, token);
}

/**
 * Navigates to a route.
 * @param {string} route - Route name
 * @param {object} [params] - Route params
 */
export function navigate(route, params = {}) {
  const container = document.getElementById('main-content-body');
  if (!container) return;
  if (!canAccessRoute(route)) {
    window.dispatchEvent(new CustomEvent('bigu:access-denied', {
      detail: getAccessState(),
    }));
    return;
  }

  const renderFn = routes[route];
  if (renderFn) {
    const token = ++transitionToken;
    const hasMountedRoute = Boolean(currentRoute);

    setSidebarActive(route);
    document.body.dataset.route = route;
    currentHash = buildHash(route, params);
    if (window.location.hash !== currentHash) window.location.hash = currentHash;

    if (hasMountedRoute && !prefersReducedMotion()) {
      startRouteExit(container);
      window.setTimeout(() => {
        if (token !== transitionToken) return;
        renderRoute(container, route, params, renderFn, token);
      }, ROUTE_TRANSITION_MS);
      return;
    }

    renderRoute(container, route, params, renderFn, token);
  }
}

/**
 * Initializes the router, listens for hash changes.
 */
export function initRouter() {
  const initial = parseHash(window.location.hash || '#home');
  if (routerInitialized) {
    navigate(initial.route, initial.params);
    return;
  }
  routerInitialized = true;
  navigate(initial.route, initial.params);

  window.addEventListener('hashchange', () => {
    if (window.location.hash !== currentHash) {
      const next = parseHash(window.location.hash || '#home');
      navigate(next.route, next.params);
    }
  });
}

/**
 * Gets the current route name.
 * @returns {string}
 */
export function getCurrentRoute() {
  return currentRoute || 'home';
}
