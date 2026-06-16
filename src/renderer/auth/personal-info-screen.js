// @ts-check
import { renderBiguLogo, wireBiguLogoFallback } from '../brand-logo.js';
import { PLAYER_POSITION_OPTIONS, PROFILE_ROLE_OPTIONS } from './license-service.js';

/**
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function escapeAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'No se pudo guardar el perfil.';
}

/**
 * @param {Array<{value: string, label: string}>} options
 * @param {string} selectedValue
 * @param {string} placeholder
 * @returns {string}
 */
function renderOptions(options, selectedValue, placeholder) {
  return [
    `<option value="" ${selectedValue === '' ? 'selected' : ''}>${escapeAttribute(placeholder)}</option>`,
    ...options.map(option => (
      `<option value="${escapeAttribute(option.value)}" ${selectedValue === option.value ? 'selected' : ''}>${escapeAttribute(option.label)}</option>`
    )),
  ].join('');
}

/**
 * @param {HTMLElement} container
 * @param {{onSubmit?: function({firstName: string, lastName: string, age: number, role: string, position: string}): Promise<void>|void}} [options]
 */
export function renderPersonalInfoScreen(container, options = {}) {
  let loading = false;
  let error = '';
  const values = {
    firstName: '',
    lastName: '',
    age: '',
    role: '',
    position: '',
  };

  const render = () => {
    container.innerHTML = `
      <main class="access-shell" aria-labelledby="personal-info-title">
        <section class="access-card login-card">
          <div class="access-brand" aria-label="BiguAnalytics">
            ${renderBiguLogo({ className: 'access-brand-mark' })}
            <div class="access-brand-name">Bigu<span>Analytics</span></div>
          </div>
          <div class="access-copy">
            <h1 id="personal-info-title">Completá tu perfil</h1>
            <p>Estos datos ayudan a personalizar la experiencia dentro del club.</p>
          </div>
          <form class="access-form" data-personal-info-form>
            <div class="access-form-grid">
              <div>
                <label for="personal-first-name">Nombre</label>
                <input id="personal-first-name" name="firstName" type="text" autocomplete="given-name" value="${escapeAttribute(values.firstName)}" required>
              </div>
              <div>
                <label for="personal-last-name">Apellido</label>
                <input id="personal-last-name" name="lastName" type="text" autocomplete="family-name" value="${escapeAttribute(values.lastName)}" required>
              </div>
            </div>
            <div class="access-form-grid compact">
              <div>
                <label for="personal-age">Edad</label>
                <input id="personal-age" name="age" type="number" inputmode="numeric" min="12" max="100" value="${escapeAttribute(values.age)}" required>
              </div>
              <div>
                <label for="personal-role">Rol</label>
                <select id="personal-role" name="role" autocomplete="organization-title" required>
                  ${renderOptions(PROFILE_ROLE_OPTIONS, values.role, 'Elegir rol')}
                </select>
              </div>
            </div>
            <div class="access-form-row" data-position-row ${values.role === 'jugador' ? '' : 'hidden'}>
              <label for="personal-position">Posición</label>
              <select id="personal-position" name="position" autocomplete="off" ${values.role === 'jugador' ? 'required' : ''}>
                ${renderOptions(PLAYER_POSITION_OPTIONS, values.position, 'Elegir posición')}
              </select>
            </div>
            <button class="access-primary-btn" type="submit" ${loading ? 'disabled' : ''}>${loading ? 'Guardando...' : 'Guardar y continuar'}</button>
          </form>
          <div class="access-status" aria-live="polite">${error}</div>
        </section>
      </main>
    `;
    wireBiguLogoFallback(container);

    const form = container.querySelector('[data-personal-info-form]');
    const roleSelect = form?.querySelector('[name="role"]');
    const positionRow = form?.querySelector('[data-position-row]');
    const positionSelect = form?.querySelector('[name="position"]');
    const syncPositionVisibility = () => {
      const role = String(roleSelect?.value || '');
      const isPlayer = role === 'jugador';
      if (positionRow) positionRow.hidden = !isPlayer;
      if (positionSelect) {
        positionSelect.required = isPlayer;
        if (!isPlayer) positionSelect.value = '';
      }
    };
    roleSelect?.addEventListener('change', syncPositionVisibility);
    syncPositionVisibility();

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      values.firstName = String(data.get('firstName') || '').trim();
      values.lastName = String(data.get('lastName') || '').trim();
      values.age = String(data.get('age') || '').trim();
      values.role = String(data.get('role') || '').trim();
      values.position = String(data.get('position') || '').trim();
      loading = true;
      error = '';
      render();
      try {
        await options.onSubmit?.({
          firstName: values.firstName,
          lastName: values.lastName,
          age: Number(values.age),
          role: values.role,
          position: values.position,
        });
      } catch (caught) {
        loading = false;
        error = getErrorMessage(caught);
        render();
      }
    });
  };

  render();
}
