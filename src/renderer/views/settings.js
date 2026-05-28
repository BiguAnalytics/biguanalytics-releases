// @ts-check
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { navigate } from '../router.js';

const DEFAULT_AUTO_CLOSE_MS = 8000;

/**
 * @param {number|null|undefined} autoCloseMs
 * @returns {number}
 */
export function getAutoCloseSecondsValue(autoCloseMs) {
  const value = Number(autoCloseMs);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_AUTO_CLOSE_MS / 1000;
  return Math.round((value / 1000) * 10) / 10;
}

/**
 * @param {string|number|null|undefined} seconds
 * @returns {number}
 */
export function getAutoCloseMsFromSeconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_AUTO_CLOSE_MS;
  return Math.round(value * 1000);
}

/**
 * @param {HTMLElement} container
 */
export async function renderSettings(container) {
  setSidebarExpanded(true);
  updateTopbarContext('Configuracion');
  setTopbarActions([
    { id: 'home', label: 'Inicio' },
  ], (id) => navigate(id));

  container.innerHTML = `
    <section class="settings-view view-enter">
      <div class="construction-panel settings-panel">
        <span class="construction-eyebrow">Ajustes</span>
        <h1 class="construction-title">Preferencias de tagging</h1>
        <p class="construction-text">Opciones operativas para el flujo de analisis durante el partido.</p>
        <form class="settings-form" id="settings-form">
          <label class="settings-toggle">
            <input type="checkbox" id="stats-only-mode" />
            <span>
              <strong>Modo solo estadisticas</strong>
              <small>Oculta el reproductor y permite cargar eventos con timestamp manual u omitido.</small>
            </span>
          </label>
          <label class="form-group">
            <span class="form-label">Auto-cierre de popup (segundos)</span>
            <input class="form-input" type="number" id="tagging-auto-close" min="1" step="0.5" />
          </label>
          <button class="btn btn-primary" type="submit">Guardar ajustes</button>
          <p class="settings-feedback" id="settings-feedback" role="status"></p>
        </form>
      </div>
    </section>
  `;

  const settings = await window.api.settings.get();
  const statsOnly = /** @type {HTMLInputElement} */ (container.querySelector('#stats-only-mode'));
  const autoClose = /** @type {HTMLInputElement} */ (container.querySelector('#tagging-auto-close'));
  const feedback = container.querySelector('#settings-feedback');
  statsOnly.checked = Boolean(settings.statsOnlyMode);
  autoClose.value = String(getAutoCloseSecondsValue(settings.tagging?.autoCloseMs));

  container.querySelector('#settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await window.api.settings.set({
      statsOnlyMode: statsOnly.checked,
      tagging: {
        autoCloseMs: getAutoCloseMsFromSeconds(autoClose.value),
      },
    });
    if (feedback) feedback.textContent = 'Ajustes guardados.';
  });
}
