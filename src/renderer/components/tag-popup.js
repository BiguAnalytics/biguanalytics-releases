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
 */
export function renderTagPopup(host, state, context, handlers) {
  host.innerHTML = '';
  if (!state.activePopup) return;

  const popup = state.activePopup;
  const definition = EVENT_DEFINITIONS[popup.hotkey];
  const step = definition.steps[popup.stepIndex];
  const options = step ? getStepOptions(step, context) : [];
  const selectedZone = popup.zone;

  host.innerHTML = `
    <section class="tag-popup" role="dialog" aria-label="${escapeHtml(definition.label)}">
      <header class="tag-popup-header">
        <div>
          <p class="tag-popup-kicker">Evento</p>
          <h2>${escapeHtml(definition.label)} <span>${escapeHtml(popup.hotkey)}</span></h2>
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
          <button class="tag-popup-mic" type="button" data-popup-mic aria-label="Dictar nota">Mic</button>
        </div>
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
