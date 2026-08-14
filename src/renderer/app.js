// @ts-check
import {
  getAccessState,
  isAllowedAccessState,
  renderAccessGate,
  resolveStartupAccess,
  runBackgroundAccessVerification,
} from './auth/access-guard.js';
import { syncService } from './cloud/sync-service.js';
import { getDisplayUserFromProfile } from './auth/license-service.js';
import { createSidebar, updateCurrentSidebarProfile } from './components/sidebar.js';
import { createAIChatbot } from './components/ai-chatbot.js';
import { createWalkthroughController } from './components/walkthrough.js';
import { createTopbar, setTopbarActions, updateTopbarLicense } from './components/topbar.js';
import { initRouter, navigate } from './router.js';
import { loadAndApplyTheme } from './theme.js';
import { markStartup } from './startup-timing.js';
import { renderBiguLogo, wireBiguLogoFallback } from './brand-logo.js';

const STARTUP_AUTH_DELAY_MS = 1500;
const SHELL_BACKGROUND_WORK_DELAY_MS = 1200;
const STARTUP_SPLASH_MIN_MS = 900;
const STARTUP_SPLASH_MAX_MS = 2000;
let shellMounted = false;
let walkthroughCleanup = null;

/**
 * Initializes the application.
 */
async function initApp() {
  const app = document.getElementById('app');
  if (!app) return;
  const startupSplash = showStartupSplash();
  wireGlobalErrorToasts();
  loadAndApplyTheme().catch(() => {});
  ensureAmbientGlows();
  ensureTitlebar(app);

  setStartupSplashStatus(startupSplash, 'VERIFICANDO LICENCIA...');
  const startupAccess = await resolveStartupAccess({
    onLocalAccess: () => setStartupSplashStatus(startupSplash, 'ACCESO LOCAL VERIFICADO'),
    onBlockingStart: () => setStartupSplashStatus(startupSplash, 'VERIFICANDO LICENCIA...'),
  });

  if (isAllowedAccessState(startupAccess.access)) {
    await mountAppShell(app, startupAccess.access);
    if (startupAccess.source === 'local_grace') {
      hideStartupSplash(startupSplash);
    } else {
      hideStartupSplashAfterInitialData(startupSplash);
    }
    if (startupAccess.shouldRunBackgroundVerification) startBackgroundAccessRefresh(app);
    return;
  }

  const resolvedAccess = await renderAccessGate(app, {
    initialAccess: startupAccess.access,
    onActive: async (nextAccess) => {
      await mountAppShell(app, nextAccess);
      hideStartupSplash(startupSplash);
    },
  });
  if (isAllowedAccessState(resolvedAccess)) {
    await mountAppShell(app, resolvedAccess);
    hideStartupSplashAfterInitialData(startupSplash);
  } else {
    hideStartupSplash(startupSplash);
  }
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getUserFacingErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.replace(/^Error invoking remote method '[^']+':\s*/i, '').slice(0, 240) || 'No se pudo completar la operacion.';
}

function ensureAppToast() {
  let toast = document.getElementById('app-toast');
  if (toast) return toast;
  toast = document.createElement('div');
  toast.id = 'app-toast';
  toast.className = 'app-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;
  document.body.appendChild(toast);
  return toast;
}

function hideAppToast(toast) {
  toast.classList.add('closing');
  window.setTimeout(() => {
    toast.hidden = true;
    toast.classList.remove('closing');
  }, 200);
}

/**
 * @param {string} message
 * @param {'error'|'info'} [tone]
 */
function showAppToast(message, tone = 'error') {
  const toast = ensureAppToast();
  window.clearTimeout(Number(toast.dataset.timer || 0));
  window.clearTimeout(Number(toast.dataset.closeTimer || 0));
  toast.hidden = false;
  toast.classList.remove('closing');
  toast.dataset.tone = tone;
  toast.innerHTML = '';
  const label = document.createElement('span');
  label.textContent = message;
  const progress = document.createElement('span');
  progress.className = 'app-toast-progress';
  progress.setAttribute('aria-hidden', 'true');
  toast.append(label, progress);
  toast.dataset.timer = String(window.setTimeout(() => {
    hideAppToast(toast);
  }, 5000));
}

/**
 * @returns {HTMLElement}
 */
function showStartupSplash() {
  const existing = document.querySelector('.bigu-startup-splash');
  if (existing) return existing;
  const splash = document.createElement('div');
  splash.className = 'bigu-startup-splash';
  splash.setAttribute('role', 'status');
  splash.setAttribute('aria-live', 'polite');
  splash.dataset.startupStage = 'loading';
  splash.innerHTML = `
    <div class="bigu-startup-brand">
      ${renderBiguLogo({ className: 'bigu-startup-logo', ariaHidden: true })}
      <div class="bigu-startup-wordmark">Bigu<span>Analytics</span></div>
      <div class="bigu-startup-progress" aria-hidden="true">
        <span class="bigu-startup-progress-indicator"></span>
      </div>
      <div class="bigu-startup-status">Cargando...</div>
    </div>
  `;
  document.body.appendChild(splash);
  wireBiguLogoFallback(splash);
  markStartup('splash:shown');
  return splash;
}

/**
 * @param {HTMLElement} splash
 */
function hideStartupSplash(splash) {
  if (!splash?.isConnected) return;
  splash.classList.add('is-hiding');
  window.setTimeout(() => {
    splash.remove();
    markStartup('splash:hidden');
  }, 180);
}

/**
 * @param {HTMLElement} splash
 * @param {string} text
 */
function setStartupSplashStatus(splash, text) {
  const status = splash?.querySelector?.('.bigu-startup-status');
  if (splash) {
    const normalized = String(text || '').toLowerCase();
    splash.dataset.startupStage = normalized.includes('verificado') ? 'verified' : 'checking';
  }
  if (status) status.textContent = text;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

/**
 * @param {HTMLElement} splash
 */
function hideStartupSplashAfterInitialData(splash) {
  const initialDataReady = new Promise(resolve => {
    window.addEventListener('bigu:home-initial-data-ready', resolve, { once: true });
  });
  Promise.all([
    wait(STARTUP_SPLASH_MIN_MS),
    Promise.race([initialDataReady, wait(STARTUP_SPLASH_MAX_MS)]),
  ]).then(() => hideStartupSplash(splash)).catch(() => hideStartupSplash(splash));
}

/**
 * @param {HTMLElement} app
 */
function wireGlobalErrorToasts() {
  if (window.biguShowToast) return;
  window.biguShowToast = showAppToast;
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    showAppToast(getUserFacingErrorMessage(event.reason));
  });
  window.addEventListener('error', (event) => {
    showAppToast(getUserFacingErrorMessage(event.error || event.message));
  });
}

/**
 * @param {HTMLElement} app
 * @param {object} accessState
 */
async function mountAppShell(app, accessState) {
  markStartup('renderer:shell-mount:start');
  if (shellMounted && app.querySelector('.app-layout')) {
    await updateShellForAccess(accessState);
    return;
  }
  window.biguSyncCleanup?.();
  window.biguSyncCleanup = null;
  stopWalkthroughController();
  app.innerHTML = '';
  document.querySelectorAll('.ai-chatbot-root').forEach(node => node.remove());
  document.body.classList.remove('has-ai-chatbot-visible');
  window.biguAuthOnlineCleanup?.();

  const layout = document.createElement('div');
  layout.className = 'app-layout';

  const sidebar = createSidebar('home', (navId) => {
    navigate(navId);
  });
  layout.appendChild(sidebar);

  const mainContent = document.createElement('div');
  mainContent.className = 'main-content';

  const topbar = createTopbar({
    context: 'Temporada 2026',
    showLogo: true,
    license: accessState,
    actions: [
      { id: 'season', label: 'Temporada' },
      { id: 'settings', label: 'Ajustes' },
    ],
  });
  mainContent.appendChild(topbar);
  setTopbarActions([
    { id: 'season', label: 'Temporada' },
    { id: 'settings', label: 'Ajustes' },
  ], (id) => navigate(id));

  const contentBody = document.createElement('div');
  contentBody.className = 'main-content-body';
  contentBody.id = 'main-content-body';
  mainContent.appendChild(contentBody);

  layout.appendChild(mainContent);
  app.appendChild(layout);
  shellMounted = true;
  markStartup('shell:mounted');
  markStartup('renderer:shell-dom-ready');
  document.body.appendChild(createAIChatbot());
  markStartup('renderer:ai-chatbot-mounted');
  startWalkthroughController();

  const refreshAccessAfterReconnect = async () => {
    if (getAccessState()?.state !== 'offline_grace') return;
    await runBackgroundAccessVerification({
      onUpdate: async (nextAccess) => updateShellForAccess(nextAccess),
      onDenied: async (nextAccess) => {
        window.dispatchEvent(new CustomEvent('bigu:access-denied', {
          detail: nextAccess,
        }));
      },
    });
  };
  window.addEventListener('online', refreshAccessAfterReconnect);
  window.biguAuthOnlineCleanup = () => window.removeEventListener('online', refreshAccessAfterReconnect);

  window.addEventListener('bigu:access-denied', async () => {
    window.biguAuthOnlineCleanup?.();
    stopWalkthroughController();
    document.querySelectorAll('.ai-chatbot-root').forEach(node => node.remove());
    shellMounted = false;
    await renderAccessGate(app, {
      onActive: async (nextAccess) => mountAppShell(app, nextAccess),
    });
  }, { once: true });

  markStartup('renderer:router-init:start');
  initRouter();
  markStartup('renderer:router-init:end');
  scheduleShellBackgroundWork(accessState);
}

function startWalkthroughController() {
  if (walkthroughCleanup) return;
  const controller = createWalkthroughController({ getAccessState });
  walkthroughCleanup = controller.mount();
}

function stopWalkthroughController() {
  walkthroughCleanup?.();
  walkthroughCleanup = null;
}

/**
 * @param {object} accessState
 */
function scheduleShellBackgroundWork(accessState) {
  window.setTimeout(() => {
    updateShellForAccess(accessState).catch((error) => {
      showAppToast(getUserFacingErrorMessage(error));
    });
  }, SHELL_BACKGROUND_WORK_DELAY_MS);
}

/**
 * @param {HTMLElement} app
 */
function startBackgroundAccessRefresh(app) {
  markStartup('auth:license-check:scheduled', { delayMs: STARTUP_AUTH_DELAY_MS });
  window.setTimeout(() => {
    runBackgroundAccessVerification({
      onUpdate: async (nextAccess) => updateShellForAccess(nextAccess),
      onDenied: async (nextAccess) => {
        window.dispatchEvent(new CustomEvent('bigu:access-denied', {
          detail: nextAccess,
        }));
      },
    }).catch((error) => {
      showAppToast(getUserFacingErrorMessage(error));
    });
  }, STARTUP_AUTH_DELAY_MS);
}

/**
 * @param {object} accessState
 */
async function updateShellForAccess(accessState) {
  if (!accessState) return;
  persistLicensedUserSettings(accessState);
  updateTopbarLicense(accessState);
  if (accessState.profile) {
    const user = getDisplayUserFromProfile(accessState.profile);
    updateCurrentSidebarProfile(user);
    window.dispatchEvent(new CustomEvent('bigu:home-profile-updated', {
      detail: { access: accessState, user },
    }));
  }
  startBackgroundSyncIfAllowed(accessState);
}

/**
 * @param {object} accessState
 */
function startBackgroundSyncIfAllowed(accessState) {
  if (!isAllowedAccessState(accessState) || window.biguSyncCleanup) return;
  window.biguSyncCleanup = syncService.startAutoSync();
}

/**
 * @param {object} accessState
 */
function persistLicensedUserSettings(accessState) {
  if (accessState?.state !== 'active' || !accessState.profile || !window.api?.settings?.set) return;
  window.api.settings.set({
    user: getDisplayUserFromProfile(accessState.profile),
  }).catch(() => {});
}

function ensureAmbientGlows() {
  if (!document.querySelector('.ambient-glow-left')) {
    const glowLeft = document.createElement('div');
    glowLeft.className = 'ambient-glow-left';
    document.body.appendChild(glowLeft);
  }
  if (!document.querySelector('.ambient-glow-red')) {
    const glowRed = document.createElement('div');
    glowRed.className = 'ambient-glow-red';
    document.body.appendChild(glowRed);
  }
  if (!document.querySelector('.ambient-glow-blue')) {
    const glowBlue = document.createElement('div');
    glowBlue.className = 'ambient-glow-blue';
    document.body.appendChild(glowBlue);
  }
}

/**
 * @param {HTMLElement} app
 */
function ensureTitlebar(app) {
  if (document.querySelector('.custom-titlebar')) return;
  const titlebar = document.createElement('div');
  titlebar.className = 'custom-titlebar';
  titlebar.innerHTML = `
    <div class="titlebar-buttons">
      <button class="titlebar-btn minimize" id="titlebar-min" type="button" aria-label="Minimizar ventana">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M14 8v1H3V8h11z"/></svg>
      </button>
      <button class="titlebar-btn maximize" id="titlebar-max" type="button" aria-label="Maximizar ventana">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 3v10h10V3H3zm9 9H4V4h8v8z"/></svg>
      </button>
      <button class="titlebar-btn close" id="titlebar-close" type="button" aria-label="Cerrar ventana">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8.7 8l3.6 3.6-.7.7L8 8.7 4.4 12.3l-.7-.7L7.3 8 3.7 4.4l.7-.7L8 7.3l3.6-3.6.7.7L8.7 8z"/></svg>
      </button>
    </div>
  `;
  document.body.insertBefore(titlebar, app);

  if (window.api?.window) {
    document.getElementById('titlebar-min')?.addEventListener('click', () => window.api.window.minimize());
    document.getElementById('titlebar-max')?.addEventListener('click', () => window.api.window.maximize());
    document.getElementById('titlebar-close')?.addEventListener('click', () => window.api.window.close());
  }
}

document.addEventListener('DOMContentLoaded', () => {
  markStartup('renderer:dom-content-loaded');
  initApp()
    .then(() => markStartup('renderer:ready'))
    .catch((error) => {
      markStartup('renderer:ready:error', {
        error: error instanceof Error ? error.message.slice(0, 160) : String(error || 'unknown'),
      });
      throw error;
    });
});
