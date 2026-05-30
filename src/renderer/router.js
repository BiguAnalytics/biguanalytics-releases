// @ts-check
import { setSidebarActive } from './components/sidebar.js';
import { renderDashboard } from './views/dashboard.js';
import { renderHome } from './views/home.js';
import { renderSeason } from './views/season.js';
import { renderSettings } from './views/settings.js';
import { renderTacticalBoard } from './views/tactical-board.js';
import { renderTagging } from './views/tagging.js';

const routes = {
  home: renderHome,
  tagging: renderTagging,
  dashboard: renderDashboard,
  tactical: renderTacticalBoard,
  season: renderSeason,
  settings: renderSettings,
};

let currentRoute = null;
let currentHash = null;
let currentCleanup = null;
let transitionToken = 0;

const ROUTE_TRANSITION_MS = 200;

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
 * @param {string} route
 * @param {object} params
 * @param {function} renderFn
 */
function renderRoute(container, route, params, renderFn) {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  currentRoute = route;
  setSidebarActive(route);
  document.body.dataset.route = route;
  currentHash = buildHash(route, params);
  if (window.location.hash !== currentHash) window.location.hash = currentHash;

  container.classList.remove('route-transition-exit', 'route-transition-enter');
  const cleanup = renderFn(container, params);
  if (typeof cleanup === 'function') currentCleanup = cleanup;
  container.classList.add('route-transition-enter');
  window.setTimeout(() => {
    container.classList.remove('route-transition-enter');
  }, ROUTE_TRANSITION_MS);

  window.dispatchEvent(new CustomEvent('bigu:route-changed', {
    detail: { route, params: { ...params } },
  }));
}

/**
 * Navigates to a route.
 * @param {string} route - Route name
 * @param {object} [params] - Route params
 */
export function navigate(route, params = {}) {
  const container = document.getElementById('main-content-body');
  if (!container) return;

  const renderFn = routes[route];
  if (renderFn) {
    const token = ++transitionToken;
    const hasMountedRoute = Boolean(currentRoute);

    setSidebarActive(route);
    document.body.dataset.route = route;
    currentHash = buildHash(route, params);
    if (window.location.hash !== currentHash) window.location.hash = currentHash;

    if (hasMountedRoute && !prefersReducedMotion()) {
      container.classList.remove('route-transition-enter');
      container.classList.add('route-transition-exit');
      window.setTimeout(() => {
        if (token !== transitionToken) return;
        renderRoute(container, route, params, renderFn);
      }, ROUTE_TRANSITION_MS);
      return;
    }

    renderRoute(container, route, params, renderFn);
  }
}

/**
 * Initializes the router, listens for hash changes.
 */
export function initRouter() {
  const initial = parseHash(window.location.hash || '#home');
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
