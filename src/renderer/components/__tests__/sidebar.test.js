import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { getSidebarIndicatorPosition } from '../sidebar.js';

const sidebarSource = readFileSync(new URL('../sidebar.js', import.meta.url), 'utf8');
const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');
const tokensCss = readFileSync(new URL('../../../styles/tokens.css', import.meta.url), 'utf8');
const baseCss = readFileSync(new URL('../../../styles/base.css', import.meta.url), 'utf8');
const layoutCss = readFileSync(new URL('../../../styles/layout.css', import.meta.url), 'utf8');
const sidebarCss = readFileSync(new URL('../../../styles/components/sidebar.css', import.meta.url), 'utf8');
const themeCss = readFileSync(new URL('../../../styles/theme.css', import.meta.url), 'utf8');

describe('sidebar active route', () => {
  it('exposes a route-driven active state updater', () => {
    expect(sidebarSource).toContain('export function setSidebarActive(activeId)');
    expect(sidebarSource).toContain("sidebar.querySelectorAll('.sidebar-item')");
    expect(sidebarSource).toContain("item.classList.toggle('active', item.dataset.nav === activeId)");
  });

  it('keeps the Tagging module active when navigation is driven outside the sidebar', () => {
    expect(routerSource).toContain("import { setSidebarActive } from './components/sidebar.js'");
    expect(routerSource).toContain('setSidebarActive(route)');
  });

  it('exposes Clips as a first-class route and removes Heatmap from primary navigation', () => {
    expect(routerSource).toContain("import { renderClipPlayer } from './views/clip-player.js';");
    expect(routerSource).toContain('clips: renderClipPlayer');
    expect(routerSource).not.toContain("import { renderHeatmap } from './views/heatmap.js';");
    expect(routerSource).not.toContain('heatmap: renderHeatmap');
    expect(sidebarSource).toContain("{ id: 'clips', label: 'Clips'");
    expect(sidebarSource).toContain('clips:');
    expect(sidebarSource).not.toContain("{ id: 'heatmap', label: 'Heatmap'");
  });

  it('uses the primary button gradient for the selected module', () => {
    const primaryGradient = /linear-gradient\(\s*110deg,\s*var\(--color-brand-red\)\s*0%,\s*var\(--color-brand-navy\)\s*48%,\s*var\(--color-brand-red\)\s*100%\s*\)/s;

    expect(sidebarCss).toMatch(new RegExp(`\\.sidebar-active-indicator\\s*{[\\s\\S]*${primaryGradient.source}`));
    expect(sidebarCss).toMatch(/\.sidebar-active-indicator\s*{[\s\S]*box-shadow:\s*0 14px 34px rgba\(200,\s*16,\s*46,\s*0\.18\)/);
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.sidebar-item\.active\s*{[\s\S]*background:\s*transparent/s);
    expect(themeCss).toMatch(/:root\[data-theme="light"\]\s+\.sidebar-item\.active:hover\s*{[\s\S]*background:\s*transparent/s);
  });

  it('keeps one active indicator and previews the target while dragging', () => {
    expect(sidebarSource).toContain('data-sidebar-active-indicator');
    expect(sidebarSource).toContain('pointerdown');
    expect(sidebarSource).toContain('pointermove');
    expect(sidebarSource).toContain('pointerup');
    expect(sidebarSource).toContain('setPointerCapture');
    expect(sidebarSource).toContain('elementFromPoint');
    expect(sidebarCss).toMatch(/\.sidebar-active-indicator\s*{[\s\S]*transform:\s*translate3d\(/s);
    expect(sidebarCss).toMatch(/\.sidebar-active-indicator\s*{[\s\S]*transition:[\s\S]*transform/s);
    expect(sidebarCss).toMatch(/\.sidebar-item\.active\s*{[\s\S]*background:\s*transparent/s);
  });

  it('slows module slides and fills the active module when the sidebar expands', () => {
    expect(tokensCss).toContain('--duration-module-slide: 600ms;');
    expect(sidebarCss).toMatch(/\.sidebar-active-indicator\s*{[\s\S]*transform var\(--duration-module-slide\)/s);
    expect(sidebarCss).toMatch(/\.sidebar\.expanded\s+\.sidebar-active-indicator\s*{[\s\S]*width:\s*calc\(100%\s*-/s);
    expect(layoutCss).toMatch(/\.main-content-body\.is-route-swipe-committing[\s\S]*transition:\s*transform var\(--duration-module-slide\)/s);
    expect(baseCss).toMatch(/::view-transition-old\(route-content\),[\s\S]*animation-duration:\s*var\(--duration-module-slide\)/s);
    expect(baseCss).toMatch(/\.route-transition-layer\s*{[\s\S]*transform var\(--duration-module-slide\)/s);
    expect(routerSource).toContain('const ROUTE_TRANSITION_MS = 600;');
    expect(sidebarSource).toContain("sidebar.addEventListener('transitionend'");
    expect(sidebarSource).toContain("event.propertyName !== 'width'");
  });

  it('calculates the indicator position relative to the nav viewport', () => {
    expect(getSidebarIndicatorPosition(
      { left: 18, top: 96, width: 220, height: 44 },
      { left: 10, top: 24 },
    )).toEqual({ x: 8, y: 72, width: 220, height: 44 });
  });

  it('hydrates the sidebar profile from licensed personal data saved in settings', () => {
    expect(sidebarSource).toContain('settings?.user');
    expect(sidebarSource).toContain('data-profile-name');
    expect(sidebarSource).toContain('data-profile-role');
    expect(sidebarSource).toContain('getInitials(name)');
    expect(sidebarSource).toContain('getSidebarDisplayName');
    expect(sidebarSource).not.toContain('const name = user.name || user.email ||');
  });

  it('opens an account profile dialog from the bottom profile block', () => {
    expect(sidebarSource).toContain('data-profile-open');
    expect(sidebarSource).toContain('openAccountProfileModal');
    expect(sidebarSource).toContain('biguanalytics@gmail.com');
    expect(sidebarSource).toContain('licenseService.updatePersonalInfo');
    expect(sidebarSource).toContain('name="position"');
    expect(sidebarSource).not.toContain('name="isPlayer"');
    expect(sidebarSource).toContain('PROFILE_ROLE_OPTIONS');
    expect(sidebarSource).toContain('PLAYER_POSITION_OPTIONS');
  });
});
