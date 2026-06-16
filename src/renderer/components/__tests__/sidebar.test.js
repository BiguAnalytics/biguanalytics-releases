import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const sidebarSource = readFileSync(new URL('../sidebar.js', import.meta.url), 'utf8');
const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');
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

  it('exposes Heatmap as a first-class route and sidebar item', () => {
    expect(routerSource).toContain("import { renderHeatmap } from './views/heatmap.js';");
    expect(routerSource).toContain('heatmap: renderHeatmap');
    expect(sidebarSource).toContain("{ id: 'heatmap', label: 'Heatmap'");
    expect(sidebarSource).toContain('heatmap:');
  });

  it('uses the primary button gradient for the selected module', () => {
    const primaryGradient = /linear-gradient\(\s*110deg,\s*var\(--color-brand-red\)\s*0%,\s*var\(--color-brand-navy\)\s*48%,\s*var\(--color-brand-red\)\s*100%\s*\)/s;

    expect(sidebarCss).toMatch(new RegExp(`\\.sidebar-item\\.active\\s*{[\\s\\S]*${primaryGradient.source}`));
    expect(sidebarCss).toMatch(/\.sidebar-item\.active\s*{[\s\S]*box-shadow:\s*0 14px 34px rgba\(200,\s*16,\s*46,\s*0\.18\)/);
    expect(themeCss).toMatch(new RegExp(`:root\\[data-theme="light"\\]\\s+\\.sidebar-item\\.active\\s*{[\\s\\S]*${primaryGradient.source}`));
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
