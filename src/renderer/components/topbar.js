// @ts-check

/**
 * Creates the topbar DOM element.
 * @param {object} options
 * @param {string} [options.context] - Context text to show
 * @param {boolean} [options.showLogo] - Whether to show the logo
 * @param {Array<{id: string, label: string}>} [options.actions] - Topbar actions
 * @returns {HTMLElement}
 */
export function createTopbar({ context = '', showLogo = true, actions = [] } = {}) {
  const topbar = document.createElement('header');
  topbar.className = 'topbar';
  topbar.id = 'topbar';

  topbar.innerHTML = `
    ${showLogo ? `
      <div class="topbar-logo">
        <span class="topbar-logo-text">Bigu<span class="accent">Analytics</span></span>
      </div>
      <div class="topbar-divider"></div>
    ` : ''}
    <span class="topbar-context">${context}</span>
    <div class="topbar-spacer"></div>
    <div class="topbar-actions">
      ${actions.map(action => `
        <button class="topbar-action-btn" type="button" data-action="${action.id}">
          ${action.label}
        </button>
      `).join('')}
    </div>
  `;

  return topbar;
}

/**
 * Updates topbar actions and wires click handling.
 * @param {Array<{id: string, label: string}>} actions
 * @param {(id: string) => void} onAction
 */
export function setTopbarActions(actions = [], onAction = () => {}) {
  const actionsEl = document.querySelector('.topbar-actions');
  if (!actionsEl) return;

  actionsEl.innerHTML = actions.map(action => `
    <button class="topbar-action-btn" type="button" data-action="${action.id}">
      ${action.label}
    </button>
  `).join('');

  actionsEl.querySelectorAll('[data-action]').forEach(action => {
    action.addEventListener('click', () => {
      onAction(action.dataset.action);
    });
  });
}

/**
 * Updates topbar context text.
 * @param {string} text
 */
export function updateTopbarContext(text) {
  const ctx = document.querySelector('.topbar-context');
  if (ctx) ctx.textContent = text;
}
