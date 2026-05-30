// @ts-check
import { renderAccessGate } from './auth/access-guard.js';
import { getDisplayUserFromProfile } from './auth/license-service.js';
import { createSidebar } from './components/sidebar.js';
import { createAIChatbot } from './components/ai-chatbot.js';
import { createTopbar, setTopbarActions } from './components/topbar.js';
import { initRouter, navigate } from './router.js';
import { loadAndApplyTheme } from './theme.js';

/**
 * Initializes the application.
 */
async function initApp() {
  const app = document.getElementById('app');
  if (!app) return;
  wireGlobalErrorToasts();
  await loadAndApplyTheme();
  ensureAmbientGlows();
  ensureTitlebar(app);

  const access = await renderAccessGate(app, {
    onActive: async (nextAccess) => {
      await mountAppShell(app, nextAccess);
    },
  });
  if (access.state === 'active') {
    await mountAppShell(app, access);
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

/**
 * @param {string} message
 * @param {'error'|'info'} [tone]
 */
function showAppToast(message, tone = 'error') {
  const toast = ensureAppToast();
  toast.hidden = false;
  toast.dataset.tone = tone;
  toast.textContent = message;
  window.clearTimeout(Number(toast.dataset.timer || 0));
  toast.dataset.timer = String(window.setTimeout(() => {
    toast.hidden = true;
  }, 5000));
}

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
  await syncLicensedUserSettings(accessState);
  app.innerHTML = '';
  document.querySelectorAll('.ai-chatbot-root').forEach(node => node.remove());
  document.body.classList.remove('has-ai-chatbot-visible');

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
  document.body.appendChild(createAIChatbot());

  window.addEventListener('bigu:access-denied', async () => {
    document.querySelectorAll('.ai-chatbot-root').forEach(node => node.remove());
    await renderAccessGate(app, {
      onActive: async (nextAccess) => mountAppShell(app, nextAccess),
    });
  }, { once: true });

  initRouter();
}

/**
 * @param {object} accessState
 */
async function syncLicensedUserSettings(accessState) {
  if (accessState?.state !== 'active' || !accessState.profile || !window.api?.settings?.set) return;
  await window.api.settings.set({
    user: getDisplayUserFromProfile(accessState.profile),
  });
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
      <div class="titlebar-btn minimize" id="titlebar-min">
        <svg viewBox="0 0 16 16"><path fill="currentColor" d="M14 8v1H3V8h11z"/></svg>
      </div>
      <div class="titlebar-btn maximize" id="titlebar-max">
        <svg viewBox="0 0 16 16"><path fill="currentColor" d="M3 3v10h10V3H3zm9 9H4V4h8v8z"/></svg>
      </div>
      <div class="titlebar-btn close" id="titlebar-close">
        <svg viewBox="0 0 16 16"><path fill="currentColor" d="M8.7 8l3.6 3.6-.7.7L8 8.7 4.4 12.3l-.7-.7L7.3 8 3.7 4.4l.7-.7L8 7.3l3.6-3.6.7.7L8.7 8z"/></svg>
      </div>
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
  initApp();
});
