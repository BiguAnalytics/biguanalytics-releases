import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const appSource = read('src/renderer/app.js');
const brandLogoSource = read('src/renderer/brand-logo.js');
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
  it('shows a lightweight startup splash outside the Home view', () => {
    expect(appSource).toContain('const STARTUP_SPLASH_MIN_MS = 900');
    expect(appSource).toContain('const STARTUP_SPLASH_MAX_MS = 2000');
    expect(appSource).toContain('function showStartupSplash()');
    expect(appSource).toContain('function hideStartupSplash');
    expect(appSource).toContain("markStartup('splash:shown'");
    expect(appSource).toContain("markStartup('splash:hidden'");
    expect(appSource).toContain("markStartup('auth:license-check:scheduled'");
    expect(appSource).toContain('bigu-startup-logo');
    expect(appSource).toContain('renderBiguLogo');
    expect(appSource).toContain('wireBiguLogoFallback');
    expect(appSource).not.toContain('../../LOGO.svg');
    expect(brandLogoSource).toContain("new URL('./assets/bigu-logo.svg', import.meta.url)");
    expect(brandLogoSource).toContain('wireBiguLogoFallback');
    expect(brandLogoSource).toContain("addEventListener('error'");
    expect(appSource).not.toContain('>BA</div>');
    expect(homeSource).toContain('mountHomeView(container);');
    expect(appSource).not.toContain('playLaunchSplash');
    expect(appSource).not.toContain('SPLASH_DURATION_MS');
    expect(appSource).not.toContain('sessionStorage?.getItem');
    expect(appSource).not.toContain('sessionStorage?.setItem');
    expect(baseCss).toContain('.bigu-startup-splash');
    expect(baseCss).toContain('.bigu-startup-brand');
    expect(baseCss).toContain('.bigu-startup-logo');
    expect(baseCss).not.toContain('getBiguLogoSvg');
  });

  it('centralizes flicker-free route transitions and ambient route state in the router', () => {
    expect(routerSource).toContain('const ROUTE_TRANSITION_MS = 600');
    expect(routerSource).toContain('route-transition-layer');
    expect(routerSource).toContain('route-transition-exit');
    expect(routerSource).toContain('route-transition-enter');
    expect(routerSource).toContain('is-route-exiting');
    expect(routerSource).toContain('is-route-entering');
    expect(routerSource).toContain('prepareRouteEnter(container);');
    expect(routerSource).toContain('finalizeRouteRender');
    expect(routerSource).toContain('document.body.dataset.route = route');
    expect(routerSource).toContain('bigu:route-changed');
    expect(baseCss).toMatch(/\.route-transition-layer\s*{[^}]*transition:[^}]*opacity var\(--duration-module-slide\) var\(--ease-smooth\)[^}]*transform var\(--duration-module-slide\) var\(--ease-smooth\)/s);
    expect(baseCss).toMatch(/\.route-transition-layer\s*{[^}]*backface-visibility:\s*hidden/s);
    expect(baseCss).toContain('translate3d(0, 12px, 0)');
    expect(baseCss).toContain('translate3d(0, -8px, 0)');
    expect(baseCss).toMatch(/\.view-enter\s*{[^}]*opacity:\s*1/s);
    expect(baseCss).not.toMatch(/\.view-enter\s*{[^}]*animation:/s);
    expect(baseCss).not.toMatch(/\.route-transition-enter\s*{[^}]*animation:/s);
    expect(baseCss).not.toMatch(/\.route-transition-exit\s*{[^}]*animation:/s);
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
    expect(sidebarCss).toMatch(/\.sidebar\s*{[^}]*width var\(--duration-base\) var\(--ease-smooth\)/s);
    expect(sidebarCss).toMatch(/\.sidebar\.expanded \.sidebar-item-label\s*{[^}]*transition-delay:\s*var\(--duration-fast\)/s);
    expect(sidebarCss).toContain('@keyframes sidebar-active-rail-in');
  });

  it('animates tag popups, timeline blocks, KPI cards, charts, toasts and modals', () => {
    expect(tagPopupSource).toContain('--popup-option-index');
    expect(tagPopupCss).toMatch(/animation:\s*tag-popup-in 120ms cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)/s);
    expect(tagPopupCss).toContain('calc(var(--popup-option-index, 0) * 30ms)');
    expect(timelineSource).toContain('newEventIds');
    expect(timelineSource).toContain('is-new');
    expect(timelineCss).toMatch(/\.timeline-playhead\s*{[^}]*transition:\s*left var\(--duration-fast\) var\(--ease-smooth\)/s);
    expect(timelineCss).toContain('@keyframes timeline-block-scale-in');
    expect(kpiSource).toContain('data-count-up-value');
    expect(dashboardSource).toContain('animateDashboardKpis');
    expect(dashboardSource).toContain("chart.update('none')");
    expect(dashboardSource).not.toContain("chart.update('active')");
    expect(dashboardSource).toContain("window.Chart.defaults.animation = { duration: 600, easing: 'easeOutQuart' }");
    expect(kpiCss).toContain('@keyframes pulse-glow');
    expect(dashboardCss).toContain('dashboard-toast-progress');
    expect(modalCss).toMatch(/animation:\s*modal-enter 200ms cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)/s);
  });
});
