// @ts-check
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { buildWalkthroughResetSettings } from '../components/walkthrough.js';
import { buildPdfTemplateEditorWalkthroughResetSettings } from '../components/pdf-template-walkthrough.js';
import { getAccessState } from '../auth/access-guard.js';
import { navigate } from '../router.js';
import { applyAppTheme, normalizeTheme } from '../theme.js';
import { DEFAULT_EVENT_LABELS } from '../tagging/event-labels.js';

const DEFAULT_AUTO_CLOSE_MS = 8000;
const DEFAULT_CLIP_PRE_ROLL_SECONDS = 5;
const DEFAULT_CLIP_POST_ROLL_SECONDS = 8;
const DEFAULT_CLIP_OUTPUT_MODE = 'combined';
const DEFAULT_CLIP_EXPORT_QUALITY = 'reencode';
const DEFAULT_MICROPHONE_SETTINGS = {
  deviceId: '',
  label: 'Microfono predeterminado',
  language: 'es-AR',
};
const HOTKEY_CAPTURE_PROMPT = 'Pulse una tecla';
const ALERT_THRESHOLD_FIELDS = [
  { key: 'ruckWinPctMin', label: '% Rucks ganados', comparator: '<', defaultValue: 50, suffix: '%' },
  { key: 'penaltiesMax', label: 'Penales totales', comparator: '>', defaultValue: 15, suffix: '' },
  { key: 'lineoutWinPctMin', label: '% Line Outs ganados', comparator: '<', defaultValue: 40, suffix: '%' },
  { key: 'scrumWinPctMin', label: '% Scrums ganados', comparator: '<', defaultValue: 50, suffix: '%' },
  { key: 'breakLinesConcededMax', label: 'Break Lines concedidas', comparator: '>', defaultValue: 5, suffix: '' },
];

const DEFAULT_TAGGING_HOTKEYS = {
  ruck: 'R',
  scrum: 'S',
  lineout: 'L',
  penal: 'P',
  points: 'T',
  'break-line': 'B',
  kick: 'K',
  maul: 'M',
  turnover: 'V',
  card: 'A',
  note: 'N',
};

const DEFAULT_HOTKEY_FIELDS = [
  { key: 'ruck', label: 'Ruck', original: 'R' },
  { key: 'scrum', label: 'Scrum', original: 'S' },
  { key: 'lineout', label: 'Line Out', original: 'L' },
  { key: 'penal', label: 'Penal / Free Kick', original: 'P' },
  { key: 'points', label: 'Try y puntos', original: 'T' },
  { key: 'break-line', label: 'Break Line', original: 'B' },
  { key: 'kick', label: 'Kick', original: 'K' },
  { key: 'maul', label: 'Maul', original: 'M' },
  { key: 'turnover', label: 'Turnover', original: 'V' },
  { key: 'card', label: 'Tarjeta', original: 'A' },
  { key: 'note', label: 'Nota libre', original: 'N' },
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
function normalizeHotkeyInput(value) {
  const match = String(value || '').trim().toUpperCase().match(/[A-Z0-9]/);
  return match ? match[0] : '';
}

/**
 * @param {{key?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean}} event
 * @returns {string}
 */
export function getRecordedHotkeyValue(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return '';
  const key = String(event.key || '');
  if (key.length !== 1) return '';
  return normalizeHotkeyInput(key);
}

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
function normalizeCustomHotkeyId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @param {string|null|undefined} value
 * @returns {Array<string>}
 */
function parseResultOptions(value) {
  return String(value || '')
    .split(',')
    .map(option => option.trim())
    .filter(Boolean);
}

/**
 * @param {Array<object>} hotkeys
 * @returns {string}
 */
function buildCustomHotkeyRows(hotkeys = []) {
  const rows = Array.isArray(hotkeys) && hotkeys.length > 0 ? hotkeys : [{ id: '', hotkey: '', label: '', resultOptions: [] }];
  return rows.map((hotkey) => `
    <div class="settings-custom-hotkey-row" data-custom-hotkey-row data-custom-hotkey-id="${escapeHtml(hotkey.id || '')}">
      <div class="settings-hotkey-capture">
        <span>Tecla</span>
        <div class="settings-hotkey-capture-control">
          <input class="form-input settings-hotkey-input" type="text" maxlength="1" readonly data-custom-hotkey-key value="${escapeHtml(hotkey.hotkey || '')}" aria-label="Tecla del atajo personalizado" />
          <button class="settings-hotkey-record" type="button" data-hotkey-record aria-pressed="false">Cambiar</button>
        </div>
      </div>
      <label>
        <span>Nombre</span>
        <input class="form-input" type="text" data-custom-hotkey-label value="${escapeHtml(hotkey.label || '')}" placeholder="Ej: Salida rapida" />
      </label>
      <label>
        <span>Opciones</span>
        <input class="form-input" type="text" data-custom-hotkey-options value="${escapeHtml((hotkey.resultOptions || []).join(', '))}" placeholder="buena, mala" />
      </label>
      <button class="settings-hotkey-remove" type="button" data-custom-hotkey-remove aria-label="Eliminar atajo">x</button>
    </div>
  `).join('');
}

let activeHotkeyRecording = null;

function finishHotkeyRecording() {
  if (!activeHotkeyRecording) return;
  document.removeEventListener('keydown', activeHotkeyRecording.handleKeydown, true);
  activeHotkeyRecording.button.textContent = activeHotkeyRecording.idleLabel;
  activeHotkeyRecording.button.classList.remove('is-recording');
  activeHotkeyRecording.button.setAttribute('aria-pressed', 'false');
  activeHotkeyRecording.input.classList.remove('is-recording');
  activeHotkeyRecording = null;
}

/**
 * @param {HTMLInputElement} input
 * @param {HTMLButtonElement} button
 */
function beginHotkeyRecording(input, button) {
  finishHotkeyRecording();
  const idleLabel = button.dataset.idleLabel || button.textContent || 'Cambiar';
  button.dataset.idleLabel = idleLabel;

  const handleKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finishHotkeyRecording();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextHotkey = getRecordedHotkeyValue(event);
    if (!nextHotkey) return;
    input.value = nextHotkey;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    finishHotkeyRecording();
  };

  activeHotkeyRecording = { input, button, idleLabel, handleKeydown };
  button.textContent = HOTKEY_CAPTURE_PROMPT;
  button.classList.add('is-recording');
  button.setAttribute('aria-pressed', 'true');
  input.classList.add('is-recording');
  input.focus();
  document.addEventListener('keydown', handleKeydown, true);
}

/**
 * @param {HTMLElement} container
 * @param {HTMLElement|null} customHotkeyList
 */
function resetHotkeyDefaults(container, customHotkeyList) {
  DEFAULT_HOTKEY_FIELDS.forEach((field) => {
    const input = /** @type {HTMLInputElement|null} */ (container.querySelector(`[data-default-hotkey="${field.key}"]`));
    if (input) input.value = DEFAULT_TAGGING_HOTKEYS[field.key] || field.original;
    const labelInput = /** @type {HTMLInputElement|null} */ (container.querySelector(`[data-default-hotkey-label="${field.key}"]`));
    if (labelInput) labelInput.value = field.label;
  });
  if (customHotkeyList) customHotkeyList.innerHTML = buildCustomHotkeyRows([]);
}

/**
 * @param {HTMLElement} container
 * @param {object} settings
 * @returns {Record<string, string>}
 */
export function getDefaultHotkeyPayload(container, settings = {}) {
  return DEFAULT_HOTKEY_FIELDS.reduce((payload, field) => {
    const input = /** @type {HTMLInputElement|null} */ (container.querySelector(`[data-default-hotkey="${field.key}"]`));
    payload[field.key] = normalizeHotkeyInput(input?.value) || settings.tagging?.hotkeys?.[field.key] || field.original;
    return payload;
  }, {});
}

/**
 * @param {{querySelector: function(string): {value?: string}|null}} container
 * @param {object} settings
 * @returns {Record<string, string>}
 */
export function getDefaultHotkeyLabelPayload(container, settings = {}) {
  return DEFAULT_HOTKEY_FIELDS.reduce((payload, field) => {
    const input = /** @type {HTMLInputElement|null} */ (container.querySelector(`[data-default-hotkey-label="${field.key}"]`));
    const fallback = settings.tagging?.hotkeyLabels?.[field.key] || field.label;
    payload[field.key] = String(input?.value || fallback).trim() || fallback;
    return payload;
  }, {});
}

/**
 * @param {HTMLElement} container
 * @returns {Array<object>}
 */
export function getCustomHotkeyPayload(container, settings = {}) {
  const rows = typeof container.querySelectorAll === 'function'
    ? Array.from(container.querySelectorAll('[data-custom-hotkey-row]'))
    : [];
  if (rows.length === 0) return Array.isArray(settings.tagging?.customHotkeys) ? settings.tagging.customHotkeys : [];
  return rows
    .map((row) => {
      const element = /** @type {HTMLElement} */ (row);
      const label = /** @type {HTMLInputElement|null} */ (element.querySelector('[data-custom-hotkey-label]'))?.value.trim() || '';
      const hotkey = normalizeHotkeyInput(/** @type {HTMLInputElement|null} */ (element.querySelector('[data-custom-hotkey-key]'))?.value);
      const id = normalizeCustomHotkeyId(element.dataset.customHotkeyId || label);
      const resultOptions = parseResultOptions(/** @type {HTMLInputElement|null} */ (element.querySelector('[data-custom-hotkey-options]'))?.value);
      return { id, hotkey, label, resultOptions };
    })
    .filter(hotkey => hotkey.id && hotkey.hotkey && hotkey.label);
}

/**
 * @param {HTMLElement} container
 * @param {object} settings
 * @returns {{hotkeys: Record<string, string>, hotkeyLabels: Record<string, string>, customHotkeys: Array<object>}}
 */
export function getHotkeySettingsPayload(container, settings = {}) {
  return {
    hotkeys: getDefaultHotkeyPayload(container, settings),
    hotkeyLabels: getDefaultHotkeyLabelPayload(container, settings),
    // Kept as a stable source marker for settings payload audits.
    // customHotkeys: getCustomHotkeyPayload(container)
    customHotkeys: getCustomHotkeyPayload(container, settings),
  };
}

/**
 * @param {object} settings
 * @returns {string}
 */
function buildHotkeySettingsMarkup(settings = {}) {
  const labels = settings.tagging?.hotkeyLabels || {};
  return `
    <div class="settings-hotkeys-content" data-settings-hotkeys>
      <fieldset class="settings-hotkeys-section">
        <legend class="form-label">Atajos de tagging</legend>
        <div class="settings-hotkey-list">
          ${DEFAULT_HOTKEY_FIELDS.map(field => `
            <div class="settings-hotkey-row" data-hotkey-row>
              <label>
                <span>Nombre</span>
                <input class="form-input" type="text" data-default-hotkey-label="${field.key}" value="${escapeHtml(labels[field.key] || DEFAULT_EVENT_LABELS[field.key] || field.label)}" aria-label="Nombre del evento ${field.label}" />
              </label>
              <div class="settings-hotkey-capture">
                <span>Tecla <small>Original ${field.original}</small></span>
                <div class="settings-hotkey-capture-control">
                  <input class="form-input settings-hotkey-input" type="text" maxlength="1" readonly data-default-hotkey="${field.key}" aria-label="Atajo para ${field.label}" />
                  <button class="settings-hotkey-record" type="button" data-hotkey-record aria-label="Cambiar atajo para ${field.label}" aria-pressed="false">Cambiar</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </fieldset>
      <fieldset class="settings-hotkeys-section">
        <legend class="form-label">Atajos personalizados</legend>
        <div class="settings-custom-hotkey-list" id="custom-hotkeys-list" aria-label="Atajos personalizados"></div>
        <button class="settings-hotkey-add" type="button" data-custom-hotkey-add>Agregar atajo</button>
      </fieldset>
      <div class="settings-hotkey-actions">
        <button class="settings-hotkey-reset" type="button" data-hotkey-reset>Restablecer predeterminados</button>
      </div>
    </div>
  `;
}

/**
 * Keeps the whole settings choice card interactive, including its text and empty space.
 * @param {{querySelectorAll?: function(string): ArrayLike<HTMLElement>}} container
 */
export function wireSettingsChoiceCards(container) {
  if (typeof container?.querySelectorAll !== 'function') return;
  container.querySelectorAll('label.settings-toggle, label.settings-theme-option').forEach((label) => {
    if (label.dataset.choiceCardClickBound === 'true') return;
    const input = label.querySelector('input[type="checkbox"], input[type="radio"]');
    if (!input) return;
    label.dataset.choiceCardClickBound = 'true';
    label.addEventListener('click', (event) => {
      if (event.target === input) return;
      event.preventDefault();
      input.click();
    });
  });
}

/**
 * @param {string|number|null|undefined} value
 * @param {number} fallback
 * @param {number} min
 * @returns {number}
 */
function normalizeClipSecondsInput(value, fallback, min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min) return fallback;
  return Math.min(60, Math.round(numeric));
}

/**
 * @param {HTMLElement|{querySelector: function(string): {value?: string}|null}} container
 * @returns {{clipPreRollSeconds: number, clipPostRollSeconds: number, clipOutputModeDefault: 'combined'|'separate', clipExportQuality: 'copy'|'reencode'}}
 */
export function getClipExportSettingsPayload(container) {
  const preRoll = /** @type {{value?: string}|null} */ (container.querySelector('#clip-pre-roll'));
  const postRoll = /** @type {{value?: string}|null} */ (container.querySelector('#clip-post-roll'));
  const outputMode = /** @type {{value?: string}|null} */ (container.querySelector('#clip-output-mode'));
  const quality = /** @type {{value?: string}|null} */ (container.querySelector('#clip-export-quality'));
  const normalizedOutputMode = outputMode?.value === 'separate' ? 'separate' : DEFAULT_CLIP_OUTPUT_MODE;
  const normalizedQuality = quality?.value === 'copy' ? 'copy' : DEFAULT_CLIP_EXPORT_QUALITY;
  return {
    clipPreRollSeconds: normalizeClipSecondsInput(preRoll?.value, DEFAULT_CLIP_PRE_ROLL_SECONDS, 0),
    clipPostRollSeconds: normalizeClipSecondsInput(postRoll?.value, DEFAULT_CLIP_POST_ROLL_SECONDS, 1),
    clipOutputModeDefault: normalizedOutputMode,
    clipExportQuality: normalizedQuality,
  };
}

/**
 * @param {HTMLElement|{querySelector: function(string): {value?: string, selectedOptions?: Array<{textContent?: string, dataset?: object}>}|null}} container
 * @returns {{deviceId: string, label: string, language: 'es-AR'}}
 */
export function getMicrophoneSettingsPayload(container) {
  const select = /** @type {{value?: string, selectedOptions?: Array<{textContent?: string, dataset?: {deviceLabel?: string}}>}|null} */ (container.querySelector('[data-microphone-select]'));
  const selected = select?.selectedOptions?.[0];
  const label = selected?.dataset?.deviceLabel || selected?.textContent?.trim() || DEFAULT_MICROPHONE_SETTINGS.label;
  return {
    deviceId: String(select?.value || ''),
    label: label || DEFAULT_MICROPHONE_SETTINGS.label,
    language: 'es-AR',
  };
}

/**
 * @param {HTMLElement|{querySelector: function(string): {value?: string}|null}} container
 * @returns {{}}
 */
export function getAISettingsPayload(container) {
  return {};
}

/**
 * @param {{percent?: number}|null|undefined} progress
 * @returns {number}
 */
export function getUpdaterProgressPercent(progress) {
  const percent = Number(progress?.percent);
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function getReadableUpdaterError(error) {
  return 'No se pudo completar la actualizacion. Revisa tu conexion e intenta nuevamente.';
}

/**
 * @param {unknown} status
 * @returns {string}
 */
function getUpdaterState(status) {
  return String(status?.state || 'idle');
}

/**
 * @param {unknown} status
 * @returns {string}
 */
function getUpdaterCurrentVersion(status) {
  return String(status?.currentVersion || 'No disponible');
}

/**
 * @param {unknown} status
 * @returns {string}
 */
function getUpdaterAvailableVersion(status) {
  return String(status?.updateInfo?.version || '');
}

/**
 * @param {HTMLElement|null} element
 * @param {string} text
 */
function setText(element, text) {
  if (element) element.textContent = text;
}

/**
 * @param {HTMLElement} container
 * @param {object} status
 */
function renderUpdaterStatus(container, status = {}) {
  const state = getUpdaterState(status);
  const currentVersion = /** @type {HTMLElement|null} */ (container.querySelector('[data-updater-current-version]'));
  const statusText = /** @type {HTMLElement|null} */ (container.querySelector('[data-updater-status]'));
  const checkButton = /** @type {HTMLButtonElement|null} */ (container.querySelector('[data-updater-check]'));
  const downloadButton = /** @type {HTMLButtonElement|null} */ (container.querySelector('[data-updater-download]'));
  const installButton = /** @type {HTMLButtonElement|null} */ (container.querySelector('[data-updater-install]'));
  const progress = /** @type {HTMLElement|null} */ (container.querySelector('[data-updater-progress]'));
  const progressFill = /** @type {HTMLElement|null} */ (container.querySelector('[data-updater-progress-fill]'));
  const progressLabel = /** @type {HTMLElement|null} */ (container.querySelector('[data-updater-progress-label]'));
  const availableVersion = getUpdaterAvailableVersion(status);
  const progressPercent = getUpdaterProgressPercent(status.progress);
  const isBusy = state === 'checking' || state === 'downloading';

  setText(currentVersion, getUpdaterCurrentVersion(status));
  if (checkButton) checkButton.disabled = isBusy;
  if (downloadButton) {
    downloadButton.hidden = state !== 'available';
    downloadButton.disabled = isBusy;
  }
  if (installButton) {
    installButton.hidden = state !== 'downloaded';
    installButton.disabled = false;
  }
  if (progress) progress.hidden = !['downloading', 'downloaded'].includes(state);
  if (progressFill) progressFill.style.transform = `scaleX(${state === 'downloaded' ? 1 : progressPercent / 100})`;
  setText(progressLabel, `${state === 'downloaded' ? 100 : progressPercent}%`);

  if (!status.enabled && state !== 'error') {
    setText(statusText, 'Actualizaciones desactivadas en desarrollo.');
    if (statusText) statusText.dataset.tone = 'neutral';
    return;
  }

  const messages = {
    idle: 'Sin verificar.',
    checking: 'Buscando actualizacion...',
    available: availableVersion ? `Nueva version disponible: ${availableVersion}` : 'Nueva version disponible',
    'not-available': 'Estas usando la ultima version',
    downloading: `Descargando actualizacion... ${progressPercent}%`,
    downloaded: 'Actualizacion lista para instalar.',
    disabled: 'Actualizaciones desactivadas en desarrollo.',
    error: getReadableUpdaterError(status.error),
  };

  setText(statusText, messages[state] || messages.idle);
  if (statusText) {
    statusText.dataset.tone = state === 'error' ? 'error' : state === 'downloaded' ? 'ok' : 'neutral';
  }
}

/**
 * @param {HTMLElement} container
 * @param {HTMLElement|null} feedback
 * @returns {Promise<function>}
 */
async function setupUpdaterSettings(container, feedback) {
  if (!window.api?.updater) {
    renderUpdaterStatus(container, { state: 'disabled', enabled: false });
    return () => {};
  }

  const checkButton = /** @type {HTMLButtonElement|null} */ (container.querySelector('[data-updater-check]'));
  const downloadButton = /** @type {HTMLButtonElement|null} */ (container.querySelector('[data-updater-download]'));
  const installButton = /** @type {HTMLButtonElement|null} */ (container.querySelector('[data-updater-install]'));
  const applyStatus = (status) => renderUpdaterStatus(container, status || {});
  const applyError = (error) => renderUpdaterStatus(container, {
    state: 'error',
    enabled: true,
    currentVersion: 'No disponible',
    error: getReadableUpdaterError(error),
  });

  try {
    applyStatus(await window.api.updater.getStatus());
  } catch (error) {
    applyError(error);
  }

  const removeUpdaterListener = window.api.updater.onEvent((event) => {
    const nextStatus = {
      ...(event?.status || {}),
      error: event?.message || event?.status?.error || '',
    };
    applyStatus(nextStatus);
    if (event?.type === 'update:available') {
      window.dispatchEvent(new CustomEvent('bigu:updater-available', { detail: nextStatus }));
    }
  });

  checkButton?.addEventListener('click', async () => {
    try {
      applyStatus({ ...(await window.api.updater.getStatus()), state: 'checking' });
      applyStatus(await window.api.updater.check());
    } catch (error) {
      applyError(error);
    }
  });

  downloadButton?.addEventListener('click', async () => {
    try {
      applyStatus({ ...(await window.api.updater.getStatus()), state: 'downloading' });
      applyStatus(await window.api.updater.download());
    } catch (error) {
      applyError(error);
    }
  });

  installButton?.addEventListener('click', async () => {
    const idleLabel = installButton.textContent || 'Reiniciar e instalar';
    installButton.disabled = true;
    installButton.textContent = 'Reiniciando...';
    try {
      await window.api.updater.install();
    } catch (error) {
      installButton.disabled = false;
      installButton.textContent = idleLabel;
      applyError(error);
      if (feedback) feedback.textContent = getReadableUpdaterError(error);
    }
  });

  return typeof removeUpdaterListener === 'function' ? removeUpdaterListener : () => {};
}

/**
 * @param {number} rms
 * @returns {number}
 */
export function getDecibelsFromRms(rms) {
  const value = Number(rms);
  if (!Number.isFinite(value) || value <= 0) return -100;
  return Math.max(-100, Math.min(0, Math.round(20 * Math.log10(value))));
}

/**
 * @param {number} db
 * @returns {'green'|'yellow'|'red'}
 */
export function getMicrophoneLevelTone(db) {
  if (db >= -10) return 'red';
  if (db >= -24) return 'yellow';
  return 'green';
}

/**
 * @param {{deviceId?: string}|null|undefined} microphone
 * @returns {MediaStreamConstraints}
 */
function getMicrophoneMediaConstraints(microphone) {
  const deviceId = String(microphone?.deviceId || '');
  return {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  };
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getMicrophoneErrorMessage(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Permiso de microfono denegado.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No se detecto un microfono disponible.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'El microfono esta ocupado por otra aplicacion.';
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') return 'El microfono seleccionado no esta disponible.';
  return 'No se pudo iniciar el microfono.';
}

/**
 * @param {MediaStream|null} stream
 */
function stopMediaStream(stream) {
  stream?.getTracks?.().forEach(track => track.stop());
}

/**
 * @param {HTMLSelectElement} select
 * @param {Array<MediaDeviceInfo>} devices
 * @param {object} microphone
 */
function renderMicrophoneDeviceOptions(select, devices, microphone = {}) {
  const savedDeviceId = String(microphone.deviceId || '');
  const hasSavedDevice = savedDeviceId && devices.some(device => device.deviceId === savedDeviceId);
  const selectedDeviceId = hasSavedDevice ? savedDeviceId : '';
  const options = [
    { deviceId: '', label: DEFAULT_MICROPHONE_SETTINGS.label },
    ...devices.map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Microfono ${index + 1}`,
    })),
  ];

  select.innerHTML = options.map(option => `
    <option value="${escapeHtml(option.deviceId)}" data-device-label="${escapeHtml(option.label)}">${escapeHtml(option.label)}</option>
  `).join('');
  select.value = selectedDeviceId;
}

/**
 * @param {HTMLElement} container
 * @param {object} settings
 * @param {HTMLElement|null} feedback
 * @returns {function}
 */
function setupMicrophoneSettings(container, settings, feedback) {
  const select = /** @type {HTMLSelectElement|null} */ (container.querySelector('[data-microphone-select]'));
  const status = /** @type {HTMLElement|null} */ (container.querySelector('[data-microphone-status]'));
  const level = /** @type {HTMLElement|null} */ (container.querySelector('[data-microphone-level]'));
  const dbText = /** @type {HTMLElement|null} */ (container.querySelector('[data-microphone-db]'));
  const testButton = /** @type {HTMLButtonElement|null} */ (container.querySelector('[data-microphone-test]'));
  const testHint = /** @type {HTMLElement|null} */ (container.querySelector('[data-microphone-test-hint]'));

  let stream = null;
  let audioContext = null;
  let source = null;
  /** @type {AnalyserNode|null} */
  let analyser = null;
  let animationFrame = 0;
  let isTesting = false;

  const setStatus = (message, tone = 'neutral') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };

  const setMeter = (db = -100) => {
    if (!level || !dbText) return;
    const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
    const tone = getMicrophoneLevelTone(db);
    level.style.transform = `scaleX(${normalized})`;
    level.dataset.tone = tone;
    dbText.textContent = `${db} dB`;
  };

  const stopMonitor = () => {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    try {
      source?.disconnect?.();
      analyser?.disconnect?.();
    } catch {
      // Already disconnected.
    }
    stopMediaStream(stream);
    stream = null;
    source = null;
    analyser = null;
    if (audioContext?.state !== 'closed') {
      audioContext?.close?.();
    }
    audioContext = null;
    setMeter(-100);
  };

  const updateTestState = () => {
    if (!testButton || !testHint) return;
    testButton.textContent = isTesting ? 'Detener prueba' : 'Probar microfono';
    testButton.setAttribute('aria-pressed', isTesting ? 'true' : 'false');
    testHint.hidden = !isTesting;
  };

  const updateMeter = () => {
    if (!analyser) return;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((total, sample) => total + (sample * sample), 0) / samples.length);
    setMeter(getDecibelsFromRms(rms));
    animationFrame = window.requestAnimationFrame(updateMeter);
  };

  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices || !select) {
      setStatus('La configuracion de microfono no esta disponible en este entorno.', 'error');
      if (testButton) testButton.disabled = true;
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    renderMicrophoneDeviceOptions(select, audioInputs, settings.microphone || DEFAULT_MICROPHONE_SETTINGS);
    if (audioInputs.length === 0) {
      setStatus('No se detecto un microfono disponible.', 'error');
      if (testButton) testButton.disabled = true;
    }
    return audioInputs;
  };

  const startMonitor = async (allowFallback = true) => {
    stopMonitor();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('La configuracion de microfono no esta disponible en este entorno.', 'error');
      if (testButton) testButton.disabled = true;
      return;
    }

    const microphone = getMicrophoneSettingsPayload(container);
    try {
      stream = await navigator.mediaDevices.getUserMedia(getMicrophoneMediaConstraints(microphone));
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) throw new Error('AudioContext no disponible.');
      audioContext = new AudioContextConstructor();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      if (isTesting) source.connect(audioContext.destination);
      setStatus(`Entrada activa: ${microphone.label || DEFAULT_MICROPHONE_SETTINGS.label}`, 'ok');
      updateMeter();
    } catch (error) {
      if (allowFallback && microphone.deviceId && select) {
        select.value = '';
        settings.microphone = getMicrophoneSettingsPayload(container);
        setStatus('Microfono predeterminado', 'neutral');
        await startMonitor(false);
        return;
      }
      setStatus(getMicrophoneErrorMessage(error), 'error');
      stopMonitor();
    }
  };

  refreshDevices()
    .then(() => startMonitor())
    .then(refreshDevices)
    .catch(error => setStatus(getMicrophoneErrorMessage(error), 'error'));

  select?.addEventListener('change', async () => {
    settings.microphone = getMicrophoneSettingsPayload(container);
    await window.api.settings.set({ microphone: settings.microphone });
    if (feedback) feedback.textContent = 'Microfono guardado.';
    await startMonitor();
  });

  testButton?.addEventListener('click', async () => {
    isTesting = !isTesting;
    updateTestState();
    await startMonitor();
  });

  navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
  updateTestState();

  return () => {
    navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
    stopMonitor();
  };
}

/**
 * @param {HTMLElement} container
 * @param {{subsection?: string}} params
 */
export async function renderSettings(container, params = {}) {
  const isHotkeysSubsection = params.subsection === 'hotkeys';
  setSidebarExpanded(true);
  updateTopbarContext('Configuracion');
  setTopbarActions([
    { id: isHotkeysSubsection ? 'settings' : 'home', label: isHotkeysSubsection ? 'Ajustes' : 'Inicio' },
  ], (id) => navigate(id));

  const settings = await window.api.settings.get();
  const hotkeysMarkup = buildHotkeySettingsMarkup(settings);

  container.innerHTML = `
    <section class="settings-view view-enter">
      <div class="construction-panel settings-panel">
        <span class="construction-eyebrow">Ajustes</span>
        <h1 class="construction-title">${isHotkeysSubsection ? 'Atajos de tagging' : 'Preferencias de tagging'}</h1>
        <p class="construction-text">${isHotkeysSubsection ? 'Personaliza las teclas y los nombres que se muestran en todo el analisis.' : 'Opciones operativas para el flujo de analisis durante el partido.'}</p>
        <form class="settings-form" id="settings-form">
          <div class="settings-save-bar">
            <button class="btn btn-primary" type="submit">Guardar ajustes</button>
            <p class="settings-feedback" id="settings-feedback" role="status"></p>
          </div>
          ${isHotkeysSubsection ? '<button class="settings-subsection-back" type="button" data-settings-back>← Volver a ajustes</button>' : ''}
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
          <fieldset class="settings-microphone-section">
            <legend class="form-label">Audio / Microfono</legend>
            <div class="settings-microphone-card">
              <label class="settings-microphone-select-row">
                <span>
                  <strong>Microfono</strong>
                  <small>Se usa para dictar notas en el popup de tagging.</small>
                </span>
                <select class="form-select settings-microphone-select" data-microphone-select aria-label="Seleccionar microfono">
                  <option value="">Microfono predeterminado</option>
                </select>
              </label>
              <div class="settings-microphone-meter" aria-label="Volumen del microfono">
                <div class="settings-microphone-meter-track">
                  <span class="settings-microphone-meter-fill" data-microphone-level data-tone="green"></span>
                </div>
                <span class="settings-microphone-db tabular-nums" data-microphone-db>-100 dB</span>
              </div>
              <div class="settings-microphone-actions">
                <button class="settings-microphone-test" type="button" data-microphone-test aria-pressed="false">Probar microfono</button>
                <span class="settings-microphone-test-hint" data-microphone-test-hint hidden>Usa auriculares para evitar acople.</span>
              </div>
              <p class="settings-microphone-status" data-microphone-status role="status">Microfono predeterminado</p>
            </div>
          </fieldset>
          <fieldset class="settings-ai-section">
            <legend class="form-label">Configuracion IA</legend>
            <div class="settings-ai-card">
              <div class="settings-ai-row" data-ai-backend-status>
                <span>
                  <strong>Backend IA seguro</strong>
                  <small>Conexion administrada por BiguAnalytics Cloud Run.</small>
                </span>
                <p class="settings-ai-status" data-ai-status role="status" data-tone="neutral">No disponible</p>
              </div>
              <div class="settings-ai-actions">
                <button class="settings-ai-test" type="button" data-ai-test-connection>Probar conexion</button>
              </div>
            </div>
          </fieldset>
          <fieldset class="settings-updater-section">
            <legend class="form-label">Actualizaciones</legend>
            <div class="settings-updater-card">
              <div class="settings-updater-row">
                <span>
                  <strong>Version actual</strong>
                  <small data-updater-current-version>No disponible</small>
                </span>
                <p class="settings-updater-status" data-updater-status role="status" data-tone="neutral">Sin verificar.</p>
              </div>
              <div class="settings-updater-progress" data-updater-progress hidden aria-label="Progreso de descarga">
                <div class="settings-updater-progress-track">
                  <span class="settings-updater-progress-fill" data-updater-progress-fill></span>
                </div>
                <span class="settings-updater-progress-label tabular-nums" data-updater-progress-label>0%</span>
              </div>
              <div class="settings-updater-actions">
                <button class="settings-updater-button" type="button" data-updater-check>Buscar actualizacion</button>
                <button class="settings-updater-button" type="button" data-updater-download hidden>Descargar</button>
                <button class="settings-updater-button settings-updater-install" type="button" data-updater-install hidden>Reiniciar e instalar</button>
              </div>
            </div>
          </fieldset>
          <fieldset class="settings-onboarding-section">
            <legend class="form-label">Primer uso</legend>
            <div class="settings-onboarding-card">
              <span>
                <strong>Walkthrough interno</strong>
                <small>Reinicia el tutorial guiado para este usuario y dispositivo.</small>
              </span>
              <button class="settings-onboarding-restart" type="button" data-walkthrough-restart>Ver tutorial de nuevo</button>
            </div>
          </fieldset>
          <fieldset class="settings-onboarding-section">
            <legend class="form-label">Backup local</legend>
            <div class="settings-onboarding-card">
              <span>
                <strong>Exportar backup local</strong>
                <small>Incluye partidos locales y ajustes no sensibles. No exporta sesiones, tokens ni secretos.</small>
              </span>
              <button class="settings-onboarding-restart" type="button" data-local-backup-export>Exportar backup local</button>
            </div>
          </fieldset>
          <label class="settings-toggle">
            <input type="checkbox" id="stats-only-mode" />
            <span>
              <strong>Modo solo estadisticas</strong>
              <small>Oculta el reproductor y permite cargar eventos con timestamp manual u omitido.</small>
            </span>
          </label>
          <label class="settings-toggle">
            <input type="checkbox" id="tagging-auto-close-enabled" />
            <span>
              <strong>Auto-cierre de popup</strong>
              <small>Cierra el popup automáticamente después del tiempo indicado.</small>
            </span>
          </label>
          <label class="form-group" data-auto-close-settings>
            <span class="form-label">Auto-cierre de popup (segundos)</span>
            <input class="form-input" type="number" id="tagging-auto-close" min="1" step="0.5" />
          </label>
          <label class="settings-toggle">
            <input type="checkbox" id="tagging-pause-video-on-popup" />
            <span>
              <strong>Pausar video al abrir popup</strong>
              <small>Detiene la reproducción para completar el detalle del evento.</small>
            </span>
          </label>
          ${isHotkeysSubsection ? hotkeysMarkup : `
            <button class="settings-subsection-link" type="button" data-settings-open-hotkeys>
              <span>
                <strong>Atajos de tagging</strong>
                <small>Cambia teclas y nombres visibles en tagging, dashboard, temporada y PDF.</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          `}
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
          <fieldset class="settings-alert-thresholds settings-clip-export-section">
            <legend class="form-label">Exportación de clips</legend>
            <div class="settings-alert-list">
              <label class="settings-alert-row">
                <span>
                  <strong>Segundos antes del evento</strong>
                  <small>Pre-roll aplicado a cada clip exportado.</small>
                </span>
                <input class="form-input" type="number" id="clip-pre-roll" min="0" max="60" step="1" aria-label="Segundos antes del evento" />
              </label>
              <label class="settings-alert-row">
                <span>
                  <strong>Segundos después del evento</strong>
                  <small>Post-roll aplicado a cada clip exportado.</small>
                </span>
                <input class="form-input" type="number" id="clip-post-roll" min="1" max="60" step="1" aria-label="Segundos después del evento" />
              </label>
              <label class="settings-alert-row">
                <span>
                  <strong>Salida predeterminada</strong>
                  <small>Unico MP4 genera un video completo con separadores.</small>
                </span>
                <select class="form-input" id="clip-output-mode" aria-label="Salida predeterminada de clips">
                  <option value="combined" selected>&#218;nico MP4</option>
                  <option value="separate">Clips separados</option>
                </select>
              </label>
              <label class="settings-alert-row">
                <span>
                  <strong>Calidad de corte</strong>
                  <small>Recomendado evita frames negros al inicio; rapido copia streams.</small>
                </span>
                <select class="form-input" id="clip-export-quality" aria-label="Calidad de corte de clips">
                  <option value="reencode">Recomendado</option>
                  <option value="copy">Rapido</option>
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset class="settings-onboarding-section">
            <legend class="form-label">Plantillas PDF</legend>
            <div class="settings-onboarding-card">
              <span>
                <strong>Plantillas PDF</strong>
                <small>Administra layouts locales del informe sin guardar datos del partido.</small>
              </span>
              <div class="settings-onboarding-actions">
                <button class="settings-onboarding-restart" type="button" data-pdf-templates-open>Administrar plantillas</button>
                <button class="settings-onboarding-restart" type="button" data-pdf-template-walkthrough-restart>Ver tutorial de plantillas</button>
              </div>
            </div>
          </fieldset>
        </form>
      </div>
    </section>
  `;

  const settingsForm = /** @type {HTMLFormElement|null} */ (container.querySelector('#settings-form'));
  if (isHotkeysSubsection && settingsForm) {
    Array.from(settingsForm.children).forEach((child) => {
      if (child.matches('.settings-save-bar, .settings-subsection-back, [data-settings-hotkeys]')) return;
      child.remove();
    });
  }
  wireSettingsChoiceCards(container);

  const statsOnly = /** @type {HTMLInputElement|null} */ (container.querySelector('#stats-only-mode'));
  const autoCloseEnabled = /** @type {HTMLInputElement|null} */ (container.querySelector('#tagging-auto-close-enabled'));
  const autoCloseInput = /** @type {HTMLInputElement|null} */ (container.querySelector('#tagging-auto-close'));
  const autoClose = autoCloseInput;
  const pauseVideoOnPopup = /** @type {HTMLInputElement|null} */ (container.querySelector('#tagging-pause-video-on-popup'));
  const clipPreRoll = /** @type {HTMLInputElement|null} */ (container.querySelector('#clip-pre-roll'));
  const clipPostRoll = /** @type {HTMLInputElement|null} */ (container.querySelector('#clip-post-roll'));
  const clipOutputMode = /** @type {HTMLSelectElement|null} */ (container.querySelector('#clip-output-mode'));
  const clipExportQuality = /** @type {HTMLSelectElement|null} */ (container.querySelector('#clip-export-quality'));
  const aiStatus = /** @type {HTMLElement|null} */ (container.querySelector('[data-ai-status]'));
  const feedback = container.querySelector('#settings-feedback');
  const themeInput = /** @type {HTMLInputElement|null} */ (container.querySelector(`input[name="theme"][value="${normalizeTheme(settings.theme)}"]`));
  if (themeInput) themeInput.checked = true;
  if (statsOnly) statsOnly.checked = Boolean(settings.statsOnlyMode);
  if (autoCloseEnabled) autoCloseEnabled.checked = settings.tagging?.autoCloseEnabled === true;
  if (autoCloseInput) autoCloseInput.value = String(getAutoCloseSecondsValue(settings.tagging?.autoCloseMs));
  if (pauseVideoOnPopup) pauseVideoOnPopup.checked = settings.tagging?.pauseVideoOnPopup === true;
  if (clipPreRoll) clipPreRoll.value = String(settings.clipPreRollSeconds ?? DEFAULT_CLIP_PRE_ROLL_SECONDS);
  if (clipPostRoll) clipPostRoll.value = String(settings.clipPostRollSeconds ?? DEFAULT_CLIP_POST_ROLL_SECONDS);
  if (clipOutputMode) clipOutputMode.value = settings.clipOutputModeDefault === 'separate' ? 'separate' : DEFAULT_CLIP_OUTPUT_MODE;
  if (clipExportQuality) clipExportQuality.value = settings.clipExportQuality === 'copy' ? 'copy' : DEFAULT_CLIP_EXPORT_QUALITY;
  DEFAULT_HOTKEY_FIELDS.forEach((field) => {
    const input = /** @type {HTMLInputElement|null} */ (container.querySelector(`[data-default-hotkey="${field.key}"]`));
    if (input) input.value = settings.tagging?.hotkeys?.[field.key] || field.original;
    const labelInput = /** @type {HTMLInputElement|null} */ (container.querySelector(`[data-default-hotkey-label="${field.key}"]`));
    if (labelInput) labelInput.value = settings.tagging?.hotkeyLabels?.[field.key] || DEFAULT_EVENT_LABELS[field.key] || field.label;
  });
  const customHotkeyList = /** @type {HTMLElement|null} */ (container.querySelector('#custom-hotkeys-list'));
  if (customHotkeyList) customHotkeyList.innerHTML = buildCustomHotkeyRows(settings.tagging?.customHotkeys || []);
  ALERT_THRESHOLD_FIELDS.forEach((field) => {
    const input = /** @type {HTMLInputElement|null} */ (container.querySelector(`[data-alert-threshold="${field.key}"]`));
    if (input) input.value = String(settings.alerts?.[field.key] ?? field.defaultValue);
  });
  const syncAutoCloseInput = () => {
    if (!autoCloseEnabled || !autoCloseInput) return;
    autoCloseInput.disabled = !autoCloseEnabled.checked;
    container.querySelector('[data-auto-close-settings]')?.toggleAttribute('hidden', !autoCloseEnabled.checked);
  };
  autoCloseEnabled?.addEventListener('change', syncAutoCloseInput);
  syncAutoCloseInput();

  container.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener('change', () => {
      applyAppTheme(input.value);
    });
  });
  container.querySelector('[data-settings-open-hotkeys]')?.addEventListener('click', () => {
    navigate('settings', { subsection: 'hotkeys' });
  });
  container.querySelector('[data-settings-back]')?.addEventListener('click', () => {
    navigate('settings');
  });

  const cleanupMicrophoneSettings = isHotkeysSubsection ? () => {} : setupMicrophoneSettings(container, settings, feedback);
  const cleanupUpdaterSettings = isHotkeysSubsection ? () => {} : await setupUpdaterSettings(container, feedback);

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

  container.querySelector('[data-ai-test-connection]')?.addEventListener('click', async () => {
    if (!window.biguAIConfig?.testConnection) return;
    if (aiStatus) {
      aiStatus.textContent = 'Verificando...';
      aiStatus.dataset.tone = 'neutral';
    }
    try {
      const result = await window.biguAIConfig.testConnection();
      if (aiStatus) {
        aiStatus.textContent = result?.ok
          ? 'Conectado'
          : result?.message || 'Backend IA no disponible. Revisá tu conexión e intentá nuevamente.';
        aiStatus.dataset.tone = result?.ok ? 'ok' : 'error';
      }
    } catch {
      if (aiStatus) {
        aiStatus.textContent = 'Backend IA no disponible. Revisá tu conexión e intentá nuevamente.';
        aiStatus.dataset.tone = 'error';
      }
    }
  });

  container.querySelector('[data-walkthrough-restart]')?.addEventListener('click', async (event) => {
    const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
    const idleLabel = button.textContent || 'Ver tutorial de nuevo';
    button.disabled = true;
    button.textContent = 'Preparando...';
    try {
      const currentSettings = await window.api.settings.get();
      const updatedSettings = await window.api.settings.set(buildWalkthroughResetSettings(currentSettings, getAccessState()));
      window.dispatchEvent(new CustomEvent('bigu:walkthrough-restart', {
        detail: { settings: updatedSettings },
      }));
      if (feedback) feedback.textContent = 'Tutorial reiniciado.';
      navigate('home');
    } catch {
      if (feedback) feedback.textContent = 'No se pudo reiniciar el tutorial.';
      button.disabled = false;
      button.textContent = idleLabel;
    }
  });

  container.querySelector('[data-local-backup-export]')?.addEventListener('click', async (event) => {
    const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
    const idleLabel = button.textContent || 'Exportar backup local';
    button.disabled = true;
    button.textContent = 'Exportando...';
    try {
      const result = await window.api.backup.exportLocal();
      if (!result?.canceled && feedback) {
        feedback.textContent = `Backup exportado: ${result.fileName || 'archivo ZIP'}.`;
      }
    } catch {
      if (feedback) feedback.textContent = 'No se pudo exportar el backup local.';
    } finally {
      button.disabled = false;
      button.textContent = idleLabel;
    }
  });

  container.querySelector('[data-pdf-templates-open]')?.addEventListener('click', () => {
    navigate('pdfTemplates');
  });

  container.querySelector('[data-pdf-template-walkthrough-restart]')?.addEventListener('click', async (event) => {
    const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
    const idleLabel = button.textContent || 'Ver tutorial de plantillas';
    button.disabled = true;
    button.textContent = 'Preparando...';
    try {
      const currentSettings = await window.api.settings.get();
      await window.api.settings.set(buildPdfTemplateEditorWalkthroughResetSettings(currentSettings));
      if (feedback) feedback.textContent = 'Tutorial de plantillas PDF reiniciado.';
      navigate('pdfTemplates');
    } catch {
      if (feedback) feedback.textContent = 'No se pudo reiniciar el tutorial de plantillas PDF.';
      button.disabled = false;
      button.textContent = idleLabel;
    }
  });

  container.querySelectorAll('[data-default-hotkey]').forEach((input) => {
    input.addEventListener('input', () => {
      const field = DEFAULT_HOTKEY_FIELDS.find(item => item.key === input.dataset.defaultHotkey);
      input.value = normalizeHotkeyInput(input.value) || field?.original || '';
    });
  });

  container.querySelector('[data-custom-hotkey-add]')?.addEventListener('click', () => {
    customHotkeyList?.insertAdjacentHTML('beforeend', buildCustomHotkeyRows([{ id: '', hotkey: '', label: '', resultOptions: [] }]));
  });

  container.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = /** @type {HTMLButtonElement|null} */ (target?.closest('[data-hotkey-record]') || null);
    if (!button || !container.contains(button)) return;
    const row = button.closest('[data-hotkey-row], [data-custom-hotkey-row]');
    const input = /** @type {HTMLInputElement|null} */ (row?.querySelector('[data-default-hotkey], [data-custom-hotkey-key]'));
    if (input) beginHotkeyRecording(input, button);
  });

  container.querySelector('[data-hotkey-reset]')?.addEventListener('click', () => {
    finishHotkeyRecording();
    resetHotkeyDefaults(container, customHotkeyList);
    if (feedback) feedback.textContent = 'Atajos restablecidos. Guarda ajustes para aplicar.';
  });

  customHotkeyList?.addEventListener('input', (event) => {
    const target = /** @type {HTMLInputElement|null} */ (event.target);
    if (target?.matches('[data-custom-hotkey-key]')) {
      target.value = normalizeHotkeyInput(target.value);
    }
  });

  customHotkeyList?.addEventListener('click', (event) => {
    const button = /** @type {HTMLElement|null} */ (event.target);
    if (!button?.matches('[data-custom-hotkey-remove]')) return;
    const row = button.closest('[data-custom-hotkey-row]');
    row?.remove();
    if (customHotkeyList.querySelectorAll('[data-custom-hotkey-row]').length === 0) {
      customHotkeyList.innerHTML = buildCustomHotkeyRows([{ id: '', hotkey: '', label: '', resultOptions: [] }]);
    }
  });

  settingsForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const selectedTheme = getSelectedThemeValue(container);
    const update = isHotkeysSubsection
      ? { tagging: getHotkeySettingsPayload(container, settings) }
      : {
          theme: selectedTheme,
          statsOnlyMode: statsOnly.checked,
          microphone: getMicrophoneSettingsPayload(container),
          ...getClipExportSettingsPayload(container),
          alerts: getAlertThresholdPayload(container),
          tagging: {
            autoCloseEnabled: autoCloseEnabled.checked,
            autoCloseMs: getAutoCloseMsFromSeconds(autoClose.value),
            pauseVideoOnPopup: pauseVideoOnPopup.checked,
            ...getHotkeySettingsPayload(container, settings),
          },
        };
    await window.api.settings.set(update);
    if (!isHotkeysSubsection) applyAppTheme(selectedTheme);
    if (feedback) feedback.textContent = 'Ajustes guardados.';
  });

  return () => {
    finishHotkeyRecording();
    cleanupMicrophoneSettings();
    cleanupUpdaterSettings();
  };
}
