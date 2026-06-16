// @ts-check

/**
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
function formatAccessDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleString('es-UY', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const LICENSE_BADGE_COPY = {
  local_verified: 'LOCAL VERIFICADO',
  verifying_online: 'VERIFICANDO ONLINE',
  online_verified: 'ONLINE VERIFICADO',
  offline_mode: 'MODO OFFLINE',
  session_expired: 'SESIÓN EXPIRADA',
  license_expired: 'LICENCIA VENCIDA',
};

const TOPBAR_ACTION_TOUR_IDS = {
  export: 'export-pdf',
  settings: 'settings',
};

/**
 * @param {object} license
 * @returns {{label: string, title: string}|null}
 */
function getLicenseBadgeCopy(license) {
  const verificationStatus = license.verificationStatus || '';
  if (LICENSE_BADGE_COPY[verificationStatus]) {
    return {
      label: LICENSE_BADGE_COPY[verificationStatus],
      title: verificationStatus === 'local_verified' || verificationStatus === 'offline_mode'
        ? `Offline disponible hasta: ${formatAccessDate(license.offlineGraceExpiresAt)}`
        : LICENSE_BADGE_COPY[verificationStatus],
    };
  }
  if (license.state === 'offline_grace') {
    return {
      label: 'LOCAL VERIFICADO',
      title: `Offline disponible hasta: ${formatAccessDate(license.offlineGraceExpiresAt)}`,
    };
  }
  if (license.state === 'renewal_required') {
    return { label: 'LICENCIA VENCIDA', title: 'Offline vencido' };
  }
  if (license.state === 'active') {
    return { label: 'ONLINE VERIFICADO', title: 'Online verificado' };
  }
  if (license.state === 'unauthenticated') {
    return { label: 'SESIÓN EXPIRADA', title: 'Sesion expirada' };
  }
  if (license.state === 'expired_license') {
    return { label: 'LICENCIA VENCIDA', title: 'Licencia vencida' };
  }
  return null;
}

/**
 * LicenseBadge
 * @param {object|null|undefined} license
 * @returns {string}
 */
function renderLicenseBadge(license) {
  if (!license) return '';
  const userEmail = license.user?.email || license.profile?.email || '';
  const clubName = license.club?.name || 'Club';
  const copy = getLicenseBadgeCopy(license);
  if (!copy) return '';
  const verificationStatus = license.verificationStatus || license.state;

  return `
    <div class="topbar-license" data-license-state="${escapeHtml(license.state)}" data-license-verification="${escapeHtml(verificationStatus)}" title="${escapeHtml(copy.title)} · ${escapeHtml(userEmail)}">
      <span>${escapeHtml(copy.label)}</span>
      <small>${escapeHtml(clubName)}${userEmail ? ` · ${escapeHtml(userEmail)}` : ''}</small>
    </div>
  `;
}

/**
 * @param {{id: string, label: string, tourId?: string}} action
 * @returns {string}
 */
function renderTopbarAction(action) {
  const tourId = action.tourId || TOPBAR_ACTION_TOUR_IDS[action.id] || '';
  return `
    <button class="topbar-action-btn" type="button" data-action="${escapeHtml(action.id)}"${tourId ? ` data-tour-id="${escapeHtml(tourId)}"` : ''}>
      ${escapeHtml(action.label)}
    </button>
  `;
}

/**
 * Creates the topbar DOM element.
 * @param {object} options
 * @param {string} [options.context] - Context text to show
 * @param {boolean} [options.showLogo] - Whether to show the logo
 * @param {object} [options.license] - Active license state
 * @param {Array<{id: string, label: string}>} [options.actions] - Topbar actions
 * @returns {HTMLElement}
 */
export function createTopbar({ context = '', showLogo = true, license = null, actions = [] } = {}) {
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
    ${renderLicenseBadge(license)}
    <div class="topbar-actions">
      ${actions.map(renderTopbarAction).join('')}
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

  actionsEl.innerHTML = actions.map(renderTopbarAction).join('');

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

/**
 * @param {object|null|undefined} license
 */
export function updateTopbarLicense(license) {
  const existing = document.querySelector('.topbar-license');
  if (existing) existing.remove();
  const actions = document.querySelector('.topbar-actions');
  if (!actions) return;
  actions.insertAdjacentHTML('beforebegin', renderLicenseBadge(license));
}
