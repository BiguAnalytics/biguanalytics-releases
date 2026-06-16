// @ts-check
import { renderDashboard } from './dashboard.js';

/**
 * Renders Heatmap as a first-class route while reusing Dashboard data and charts.
 * @param {HTMLElement} container
 * @param {{matchId?: string}} params
 */
export function renderHeatmap(container, params = {}) {
  return renderDashboard(container, { ...params, focusSection: 'heatmap' });
}
