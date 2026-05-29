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
    if (currentCleanup) {
      currentCleanup();
      currentCleanup = null;
    }

    currentRoute = route;
    setSidebarActive(route);
    currentHash = buildHash(route, params);
    window.location.hash = currentHash;
    const cleanup = renderFn(container, params);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
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
