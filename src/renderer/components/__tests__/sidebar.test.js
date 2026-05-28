import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const sidebarSource = readFileSync(new URL('../sidebar.js', import.meta.url), 'utf8');
const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');

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
});
