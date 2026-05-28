// @ts-check
import { createSidebar } from './components/sidebar.js';
import { createTopbar, setTopbarActions } from './components/topbar.js';
import { initRouter, navigate } from './router.js';
import { loadAndApplyTheme } from './theme.js';

/**
 * Initializes the application.
 */
async function initApp() {
  const app = document.getElementById('app');
  if (!app) return;
  await loadAndApplyTheme();

  // Ambient glows
  const glowLeft = document.createElement('div');
  glowLeft.className = 'ambient-glow-left';
  document.body.appendChild(glowLeft);

  const glowRed = document.createElement('div');
  glowRed.className = 'ambient-glow-red';
  document.body.appendChild(glowRed);

  // App layout
  const layout = document.createElement('div');
  layout.className = 'app-layout';

  // Sidebar
  const sidebar = createSidebar('home', (navId) => {
    navigate(navId);
  });
  layout.appendChild(sidebar);

  // Main content area
  const mainContent = document.createElement('div');
  mainContent.className = 'main-content';

  // Custom titlebar (Electron)
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
  // Add to body, outside layout so it stays at the top absolute
  document.body.insertBefore(titlebar, app);

  // Titlebar events
  if (window.api && window.api.window) {
    document.getElementById('titlebar-min')?.addEventListener('click', () => window.api.window.minimize());
    document.getElementById('titlebar-max')?.addEventListener('click', () => window.api.window.maximize());
    document.getElementById('titlebar-close')?.addEventListener('click', () => window.api.window.close());
  }

  // Topbar
  const topbar = createTopbar({
    context: 'Temporada 2026',
    showLogo: true,
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

  // Content body
  const contentBody = document.createElement('div');
  contentBody.className = 'main-content-body';
  contentBody.id = 'main-content-body';
  mainContent.appendChild(contentBody);

  layout.appendChild(mainContent);
  app.appendChild(layout);

  // Initialize router
  initRouter();
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});
