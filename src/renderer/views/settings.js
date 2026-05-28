// @ts-check
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { navigate } from '../router.js';
import { applyAppTheme, normalizeTheme } from '../theme.js';

const DEFAULT_AUTO_CLOSE_MS = 8000;
const ALERT_THRESHOLD_FIELDS = [
  { key: 'ruckWinPctMin', label: '% Rucks ganados', comparator: '<', defaultValue: 50, suffix: '%' },
  { key: 'penaltiesMax', label: 'Penales totales', comparator: '>', defaultValue: 15, suffix: '' },
  { key: 'lineoutWinPctMin', label: '% Line Outs ganados', comparator: '<', defaultValue: 40, suffix: '%' },
  { key: 'scrumWinPctMin', label: '% Scrums ganados', comparator: '<', defaultValue: 50, suffix: '%' },
  { key: 'breakLinesConcededMax', label: 'Break Lines concedidas', comparator: '>', defaultValue: 5, suffix: '' },
];

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
 * @param {{querySelector: function(string): {value?: string}|null}} container
 * @returns {'dark'|'light'}
 */
export function getSelectedThemeValue(container) {
  return normalizeTheme(container.querySelector('input[name="theme"]:checked')?.value);
}

/**
 * @param {HTMLElement} container
 * @returns {object}
 */
export function getAlertThresholdPayload(container) {
  return ALERT_THRESHOLD_FIELDS.reduce((payload, field) => {
    const input = /** @type {HTMLInputElement|null} */ (container.querySelector(`[data-alert-threshold="${field.key}"]`));
    const value = Number(input?.value);
    payload[field.key] = Number.isFinite(value) && value >= 0 ? value : field.defaultValue;
    return payload;
  }, {});
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
          <fieldset class="settings-theme-field">
            <legend class="form-label">Tema visual</legend>
            <div class="settings-theme-grid">
              <label class="settings-theme-option">
                <input type="radio" name="theme" value="dark" id="theme-dark" />
                <span>
                  <strong>Oscuro</strong>
                  <small>Interfaz original para cabina y video.</small>
                </span>
              </label>
              <label class="settings-theme-option">
                <input type="radio" name="theme" value="light" id="theme-light" />
                <span>
                  <strong>Claro</strong>
                  <small>Mayor luminosidad para lectura y revision.</small>
                </span>
              </label>
            </div>
          </fieldset>
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
          <fieldset class="settings-alert-thresholds">
            <legend class="form-label">Umbrales de alerta</legend>
            <div class="settings-alert-list">
              ${ALERT_THRESHOLD_FIELDS.map(field => `
                <label class="settings-alert-row">
                  <span>
                    <strong>${field.label}</strong>
                    <small>Alerta cuando ${field.comparator} ${field.defaultValue}${field.suffix}</small>
                  </span>
                  <input
                    class="form-input"
                    type="number"
                    min="0"
                    step="1"
                    data-alert-threshold="${field.key}"
                    aria-label="${field.label}"
                  />
                </label>
              `).join('')}
            </div>
          </fieldset>
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
  const themeInput = /** @type {HTMLInputElement|null} */ (container.querySelector(`input[name="theme"][value="${normalizeTheme(settings.theme)}"]`));
  if (themeInput) themeInput.checked = true;
  statsOnly.checked = Boolean(settings.statsOnlyMode);
  autoClose.value = String(getAutoCloseSecondsValue(settings.tagging?.autoCloseMs));
  ALERT_THRESHOLD_FIELDS.forEach((field) => {
    const input = /** @type {HTMLInputElement|null} */ (container.querySelector(`[data-alert-threshold="${field.key}"]`));
    if (input) input.value = String(settings.alerts?.[field.key] ?? field.defaultValue);
  });

  let thresholdSaveTimer = null;
  const saveThresholds = () => {
    if (thresholdSaveTimer) window.clearTimeout(thresholdSaveTimer);
    thresholdSaveTimer = window.setTimeout(async () => {
      await window.api.settings.set({
        alerts: getAlertThresholdPayload(container),
      });
      if (feedback) feedback.textContent = 'Umbrales guardados.';
    }, 250);
  };

  container.querySelectorAll('[data-alert-threshold]').forEach((input) => {
    input.addEventListener('input', saveThresholds);
    input.addEventListener('change', saveThresholds);
  });

  container.querySelector('#settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const selectedTheme = getSelectedThemeValue(container);
    await window.api.settings.set({
      theme: selectedTheme,
      statsOnlyMode: statsOnly.checked,
      alerts: getAlertThresholdPayload(container),
      tagging: {
        autoCloseMs: getAutoCloseMsFromSeconds(autoClose.value),
      },
    });
    applyAppTheme(selectedTheme);
    if (feedback) feedback.textContent = 'Ajustes guardados.';
  });
}
