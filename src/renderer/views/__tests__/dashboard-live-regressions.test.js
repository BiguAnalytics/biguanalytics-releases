import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardSource = readFileSync(new URL('../dashboard.js', import.meta.url), 'utf8');
const dashboardCss = readFileSync(new URL('../../../styles/components/dashboard.css', import.meta.url), 'utf8');

describe('dashboard live regressions', () => {
  it('toggles an already mounted customizer without rebuilding it into a hidden subtree', () => {
    const toggleStart = dashboardSource.indexOf("container.querySelector('[data-customizer-toggle]')");
    const toggleEnd = dashboardSource.indexOf("container.querySelectorAll('[data-kpi-slot]')", toggleStart);
    const toggleSource = dashboardSource.slice(toggleStart, toggleEnd);

    expect(toggleSource).toContain("const customizer = container.querySelector('.dashboard-customizer')");
    expect(toggleSource).toContain('customizer.hidden = !state.customizerOpen');
    expect(toggleSource).not.toContain('renderLoadedDashboard(container, state)');
  });

  it('returns focus to the notes trigger before hiding the drawer from assistive technology', () => {
    const closeStart = dashboardSource.indexOf('const closeNotesDrawer = () =>');
    const closeEnd = dashboardSource.indexOf('const captureToolbarSelection', closeStart);
    const closeSource = dashboardSource.slice(closeStart, closeEnd);
    const hideIndex = closeSource.indexOf("setAttribute('aria-hidden', 'true')");

    expect(closeSource).toContain("[data-dashboard-floating-actions] [data-notes-open]");
    expect(closeSource).toContain('.focus()');
    expect(closeSource.indexOf('.focus()')).toBeGreaterThanOrEqual(0);
    expect(closeSource.indexOf('.focus()')).toBeLessThan(hideIndex);
  });

  it('keeps the coach notes action scoped to the dashboard route', () => {
    const cleanupStart = dashboardSource.indexOf('function removeDashboardFloatingActions()');
    const cleanupEnd = dashboardSource.indexOf('function removeDashboardNotesDrawer', cleanupStart);
    const cleanupSource = dashboardSource.slice(cleanupStart, cleanupEnd);

    expect(cleanupSource).toContain("document.querySelectorAll('[data-dashboard-floating-actions]')");
    expect(dashboardSource).toContain('function renderDashboardFloatingActions(match, isActive = () => true)');
    expect(dashboardSource).toContain('renderDashboardFloatingActions(state.match, state.isActive);');
    expect(dashboardCss).toMatch(/body\[data-route\]:not\(\[data-route="dashboard"\]\)\s+\.dashboard-floating-actions\s*\{[^}]*display:\s*none\s*!important;[^}]*pointer-events:\s*none;/s);
  });
});
