// @ts-check
import { EVENT_DEFINITIONS } from '../tagging/tagger.js';

/**
 * @param {string} value
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
 * @param {object} step
 * @param {object} context
 * @returns {Array<{label: string, value: string}>}
 */
function getStepOptions(step, context) {
  if (step.dynamic === 'roster') {
    const roster = Array.isArray(context.roster) ? context.roster : [];
    const options = roster.length > 0 ? roster : [context.homeTeam || 'Bigua'];
    return options.map(player => ({ label: player, value: player }));
  }

  if (step.field === 'team') {
    return [
      { label: context.homeTeam || 'Bigua', value: 'home' },
      { label: context.awayTeam || 'Rival', value: 'away' },
    ];
  }

  return step.options || [];
}

const MICROPHONE_ICON = `
  <svg data-mic-icon viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path d="M12 15a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    <path d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
`;

const POPUP_FOCUS_SELECTOR = [
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * @param {Element} control
 * @returns {boolean}
 */
function isFocusablePopupControl(control) {
  if (!control || control.getAttribute?.('aria-hidden') === 'true') return false;
  if (control.hasAttribute?.('hidden')) return false;
  if ('disabled' in control && control.disabled) return false;
  if ('offsetParent' in control && control.offsetParent === null) return false;
  return typeof control.focus === 'function';
}

/**
 * @param {Element} root
 * @returns {HTMLElement[]}
 */
function getFocusablePopupControls(root) {
  return Array.from(root?.querySelectorAll?.(POPUP_FOCUS_SELECTOR) || [])
    .filter(isFocusablePopupControl);
}

/**
 * @param {Element} root
 * @returns {boolean}
 */
export function focusFirstPopupControl(root) {
  const preferred = root?.querySelector?.('.tag-popup-option:not([disabled]), [data-sequence-result]:not([disabled]), [data-popup-complete]:not([disabled])');
  const first = isFocusablePopupControl(preferred) ? preferred : getFocusablePopupControls(root)[0];
  if (!first) return false;
  first.focus();
  return true;
}

/**
 * @param {Element} root
 * @param {{key?: string, shiftKey?: boolean, preventDefault?: function}} event
 * @param {Element|null} [activeElement]
 * @returns {boolean}
 */
export function trapFocusInPopup(root, event, activeElement = document.activeElement) {
  if (event.key !== 'Tab') return false;
  const controls = getFocusablePopupControls(root);
  if (controls.length === 0) return false;
  const first = controls[0];
  const last = controls[controls.length - 1];
  const active = activeElement || document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault?.();
    last.focus();
    return true;
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault?.();
    first.focus();
    return true;
  }

  if (!controls.includes(/** @type {HTMLElement} */ (active))) {
    event.preventDefault?.();
    first.focus();
    return true;
  }

  return false;
}

/**
 * @param {object} speech
 * @returns {{status: string, errorMessage: string, listening: boolean, disabled: boolean, title: string, className: string}}
 */
function getSpeechUiState(speech = {}) {
  const status = ['listening', 'error', 'disabled'].includes(speech.status) ? speech.status : 'idle';
  const listening = status === 'listening';
  const disabled = status === 'disabled';
  const className = [
    'tag-popup-mic',
    listening ? 'is-listening' : '',
    status === 'error' ? 'is-error' : '',
    disabled ? 'is-disabled' : '',
  ].filter(Boolean).join(' ');

  return {
    status,
    errorMessage: speech.errorMessage || '',
    listening,
    disabled,
    title: listening ? 'Escuchando...' : 'Dictar nota (Ctrl+M)',
    className,
  };
}

/**
 * @returns {Array<{label: string, value: string, key: string}>}
 */
export function getZones() {
  const displayOrder = [1, 4, 7, 10, 13, 2, 5, 8, 11, 14, 3, 6, 9, 12, 15];
  return displayOrder.map((zoneNumber) => ({
    label: String(zoneNumber),
    value: `Z${zoneNumber}`,
    key: zoneNumber <= 9 ? String(zoneNumber) : '',
  }));
}

/**
 * Renders the active tag popup.
 * @param {HTMLElement} host
 * @param {object} state
 * @param {object} context
 * @param {object} handlers
 * @param {object} [uiState]
 */
export function renderTagPopup(host, state, context, handlers, uiState = {}) {
  host.innerHTML = '';
  if (!state.activePopup) return;

  const popup = state.activePopup;
  const definition = (state.eventDefinitions || EVENT_DEFINITIONS)[popup.hotkey];
  if (!definition) return;
  const step = definition.steps[popup.stepIndex];
  const options = step ? getStepOptions(step, context) : [];
  const selectedZone = popup.zone;
  const speech = getSpeechUiState(uiState.speech || {});

  host.innerHTML = `
    <section class="tag-popup" role="dialog" aria-modal="true" aria-labelledby="tag-popup-title">
      <header class="tag-popup-header">
        <div>
          <p class="tag-popup-kicker">Evento</p>
          <h2 id="tag-popup-title">${escapeHtml(definition.label)} <span>${escapeHtml(popup.hotkey)}</span></h2>
        </div>
        <button class="tag-popup-close" type="button" aria-label="Cerrar popup" data-popup-close>×</button>
      </header>
      ${step ? `
        <div class="tag-popup-step">
          <span>Paso ${popup.stepIndex + 1} de ${definition.steps.length}</span>
          <strong>${escapeHtml(step.field === 'team' ? 'Equipo' : step.field === 'player' ? 'Pateador' : 'Resultado')}</strong>
        </div>
        <div class="tag-popup-options">
          ${options.map((option, index) => `
            <button class="tag-popup-option" type="button" style="--popup-option-index:${index}" data-option-value="${escapeHtml(option.value)}">
              <kbd>${index + 1}</kbd>
              <span>${escapeHtml(option.label)}</span>
            </button>
          `).join('')}
        </div>
      ` : `
        <div class="tag-popup-note-only">Escribí una nota y confirmá con Enter.</div>
      `}
      <label class="tag-popup-note">
        <span>Nota</span>
        <div class="tag-popup-note-row">
          <textarea rows="2" data-popup-note placeholder="Detalle opcional">${escapeHtml(popup.note || '')}</textarea>
          <button
            class="${speech.className}"
            type="button"
            data-popup-mic
            aria-label="${escapeHtml(speech.title)}"
            aria-pressed="${speech.listening ? 'true' : 'false'}"
            title="${escapeHtml(speech.title)}"
            ${speech.disabled ? 'disabled aria-disabled="true"' : ''}
          >
            ${MICROPHONE_ICON}
          </button>
        </div>
        ${speech.errorMessage ? `<small class="tag-popup-speech-error" role="status">${escapeHtml(speech.errorMessage)}</small>` : ''}
      </label>
      <details class="tag-popup-zone" ${selectedZone ? 'open' : ''}>
        <summary>Zona del campo ${selectedZone ? `<span>${escapeHtml(selectedZone)}</span>` : ''}</summary>
        <div class="tag-popup-field-grid" role="group" aria-label="Zonas del campo">
          ${getZones().map(zone => `
            <button
              class="tag-popup-zone-cell${selectedZone === zone.value ? ' active' : ''}"
              type="button"
              data-zone-value="${zone.value}"
              data-zone-key="${zone.key}"
            >${zone.label}</button>
          `).join('')}
        </div>
      </details>
      <footer class="tag-popup-footer">
        <span>Esc cancela</span>
        <button class="btn btn-primary btn-sm" type="button" data-popup-complete>Guardar</button>
      </footer>
    </section>
  `;

  host.querySelector('[data-popup-close]')?.addEventListener('click', handlers.onClose);
  host.querySelector('[data-popup-complete]')?.addEventListener('click', handlers.onComplete);
  host.querySelector('[data-popup-mic]')?.addEventListener('click', handlers.onMic);
  host.querySelector('[data-popup-note]')?.addEventListener('input', (event) => {
    handlers.onNote(event.target.value);
  });
  host.querySelectorAll('[data-option-value]').forEach((button) => {
    button.addEventListener('click', () => handlers.onOption(button.dataset.optionValue));
  });
  host.querySelectorAll('[data-zone-value]').forEach((button) => {
    button.addEventListener('click', () => handlers.onZone(button.dataset.zoneValue));
  });
}

/**
 * @param {HTMLElement} host
 * @param {string} numberKey
 * @returns {string|null}
 */
export function getPopupOptionByNumber(host, numberKey) {
  const index = Number(numberKey) - 1;
  if (!Number.isInteger(index) || index < 0) return null;
  const options = host.querySelectorAll('[data-option-value]');
  return options[index]?.dataset.optionValue || null;
}

/**
 * @param {HTMLElement} host
 * @param {string} numberKey
 * @returns {string|null}
 */
export function getPopupZoneByNumber(host, numberKey) {
  const openZone = host.querySelector('.tag-popup-zone[open]');
  if (!openZone) return null;
  const zone = openZone.querySelector(`[data-zone-key="${numberKey}"]`);
  return zone?.dataset.zoneValue || null;
}
