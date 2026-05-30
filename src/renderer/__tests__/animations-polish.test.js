import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const appSource = read('src/renderer/app.js');
const routerSource = read('src/renderer/router.js');
const homeSource = read('src/renderer/views/home.js');
const dashboardSource = read('src/renderer/views/dashboard.js');
const tagPopupSource = read('src/renderer/components/tag-popup.js');
const timelineSource = read('src/renderer/components/timeline.js');
const kpiSource = read('src/renderer/components/kpi-card.js');
const baseCss = read('src/styles/base.css');
const matchCardCss = read('src/styles/components/match-card.css');
const sidebarCss = read('src/styles/components/sidebar.css');
const tagPopupCss = read('src/styles/components/tag-popup.css');
const timelineCss = read('src/styles/components/timeline.css');
const kpiCss = read('src/styles/components/kpi-card.css');
const dashboardCss = read('src/styles/components/dashboard.css');
const modalCss = read('src/styles/components/modal.css');

describe('animations and premium polish', () => {
  it('shows a launch-only animated BiguAnalytics splash with reduced-motion fallback', () => {
    expect(appSource).toContain('async function playLaunchSplash()');
    expect(appSource).toContain('bigu:splash-played');
    expect(appSource).toContain('className = \'bigu-splash\'');
    expect(appSource).toContain('await playLaunchSplash();');
    expect(baseCss).toContain('.bigu-splash');
    expect(baseCss).toContain('@keyframes bigu-bird-flight');
    expect(baseCss).toContain('@keyframes bigu-logo-line-draw');
    expect(baseCss).toContain('@keyframes bigu-splash-fade-out');
    expect(baseCss).toMatch(/\.bigu-splash-icon\s*{[^}]*animation:\s*bigu-bird-flight 600ms/s);
    expect(baseCss).toMatch(/\.bigu-splash-line line\s*{[^}]*animation:\s*bigu-logo-line-draw 400ms/s);
    expect(baseCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*\.bigu-splash/s);
  });

  it('centralizes route transitions and ambient route state in the router', () => {
    expect(routerSource).toContain('const ROUTE_TRANSITION_MS = 200');
    expect(routerSource).toContain('route-transition-exit');
    expect(routerSource).toContain('route-transition-enter');
    expect(routerSource).toContain('document.body.dataset.route = route');
    expect(routerSource).toContain('bigu:route-changed');
    expect(baseCss).toMatch(/\.route-transition-enter\s*{[^}]*animation:\s*route-enter 200ms cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)/s);
    expect(baseCss).toMatch(/\.route-transition-exit\s*{[^}]*animation:\s*route-exit 200ms cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)/s);
    expect(baseCss).toContain('body[data-route="dashboard"] .ambient-glow-blue');
    expect(baseCss).toContain('body[data-route="tagging"][data-playback="playing"] .ambient-glow-red');
  });

  it('adds tactile match cards, primary button loading, and sidebar timing polish', () => {
    expect(homeSource).toContain('pressMatchCardBeforeNavigate');
    expect(homeSource).toContain('is-pressing');
    expect(matchCardCss).toMatch(/\.match-card:hover\s*{[^}]*translateY\(-4px\)/s);
    expect(matchCardCss).toMatch(/\.match-card\.is-pressing\s*{[^}]*scale\(0\.98\)/s);
    expect(baseCss).toContain('.btn-primary.is-loading');
    expect(baseCss).toContain('bigu-button-spinner');
    expect(sidebarCss).toMatch(/\.sidebar\s*{[^}]*width 250ms cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)/s);
    expect(sidebarCss).toMatch(/\.sidebar\.expanded \.sidebar-item-label\s*{[^}]*transition-delay:\s*80ms/s);
    expect(sidebarCss).toContain('@keyframes sidebar-active-rail-in');
  });

  it('animates tag popups, timeline blocks, KPI cards, charts, toasts and modals', () => {
    expect(tagPopupSource).toContain('--popup-option-index');
    expect(tagPopupCss).toMatch(/animation:\s*tag-popup-in 120ms cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)/s);
    expect(tagPopupCss).toContain('calc(var(--popup-option-index, 0) * 30ms)');
    expect(timelineSource).toContain('newEventIds');
    expect(timelineSource).toContain('is-new');
    expect(timelineCss).toMatch(/\.timeline-playhead\s*{[^}]*transition:\s*left 100ms linear/s);
    expect(timelineCss).toContain('@keyframes timeline-block-scale-in');
    expect(kpiSource).toContain('data-count-up-value');
    expect(dashboardSource).toContain('animateDashboardKpis');
    expect(dashboardSource).toContain("chart.update('active')");
    expect(dashboardSource).toContain("window.Chart.defaults.animation = { duration: 600, easing: 'easeOutQuart' }");
    expect(kpiCss).toContain('@keyframes pulse-glow');
    expect(dashboardCss).toContain('dashboard-toast-progress');
    expect(modalCss).toMatch(/animation:\s*modal-enter 200ms cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)/s);
  });
});
