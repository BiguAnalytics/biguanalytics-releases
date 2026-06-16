// @ts-check
import { authService as defaultAuthService, getAuthErrorMessage } from './auth-service.js';
import { PASSWORD_REQUIREMENT_MESSAGES, validatePasswordForm } from './password-validation.js';
import { renderBiguLogo, wireBiguLogoFallback } from '../brand-logo.js';

export { validatePasswordForm } from './password-validation.js';

/**
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessage(error) {
  return getAuthErrorMessage(error, 'No se pudo crear la contraseña.');
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
 * @param {string} value
 * @returns {string}
 */
function escapeAttribute(value) {
  return escapeHtml(value);
}

/**
 * @param {ReturnType<typeof validatePasswordForm>} validation
 * @returns {string}
 */
function renderPasswordRequirements(validation) {
  return Object.entries(PASSWORD_REQUIREMENT_MESSAGES)
    .map(([key, message]) => {
      const passed = Boolean(validation.requirements[key]);
      return `<li class="${passed ? 'is-met' : 'is-missing'}">${passed ? 'Listo:' : 'Falta:'} ${escapeHtml(message)}</li>`;
    })
    .join('');
}

/**
 * @param {HTMLElement} container
 * @param {{authService?: object, onPasswordCreated?: function(): Promise<void>|void}} [options]
 */
export function renderCreatePasswordScreen(container, options = {}) {
  const service = options.authService || defaultAuthService;
  let loading = false;
  let error = '';
  let password = '';
  let confirmPassword = '';

  const render = () => {
    const validation = validatePasswordForm(password, confirmPassword);
    container.innerHTML = `
      <main class="access-shell" aria-labelledby="create-password-title">
        <section class="access-card login-card">
          <div class="access-brand" aria-label="BiguAnalytics">
            ${renderBiguLogo({ className: 'access-brand-mark' })}
            <div class="access-brand-name">Bigu<span>Analytics</span></div>
          </div>
          <div class="access-copy">
            <h1 id="create-password-title">Creá tu contraseña</h1>
            <p>La vas a usar para iniciar sesión más rápido la próxima vez.</p>
          </div>
          <form class="access-form" data-create-password-form>
            <label for="new-password">Contraseña</label>
            <input id="new-password" name="password" type="password" autocomplete="new-password" minlength="8" value="${escapeAttribute(password)}" aria-describedby="password-requirements password-error" required>
            <label for="new-password-confirm">Repetir contraseña</label>
            <input id="new-password-confirm" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" value="${escapeAttribute(confirmPassword)}" aria-describedby="password-requirements password-error" required>
            <ul id="password-requirements" class="access-password-requirements" data-password-requirements>
              ${renderPasswordRequirements(validation)}
            </ul>
            <button class="access-primary-btn" type="submit" ${loading || !validation.isValid ? 'disabled' : ''}>${loading ? 'Guardando...' : 'Guardar contraseña'}</button>
          </form>
          <div id="password-error" class="access-status" aria-live="polite">${escapeHtml(error)}</div>
        </section>
      </main>
    `;
    wireBiguLogoFallback(container);

    const form = container.querySelector('[data-create-password-form]');
    const passwordInput = form?.querySelector('[name="password"]');
    const confirmInput = form?.querySelector('[name="confirmPassword"]');
    const submitButton = form?.querySelector('button[type="submit"]');
    const requirements = form?.querySelector('[data-password-requirements]');
    const syncValidationState = () => {
      password = String(passwordInput?.value || '');
      confirmPassword = String(confirmInput?.value || '');
      const nextValidation = validatePasswordForm(password, confirmPassword);
      if (requirements) requirements.innerHTML = renderPasswordRequirements(nextValidation);
      if (submitButton) submitButton.disabled = loading || !nextValidation.isValid;
      if (error && nextValidation.isValid) {
        error = '';
        const status = container.querySelector('#password-error');
        if (status) status.textContent = '';
      }
    };
    passwordInput?.addEventListener('input', syncValidationState);
    confirmInput?.addEventListener('input', syncValidationState);

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      syncValidationState();
      const validation = validatePasswordForm(password, confirmPassword);
      if (!validation.isValid) {
        error = validation.errors[0] || 'La contraseña no cumple los requisitos.';
        render();
        return;
      }

      loading = true;
      error = '';
      render();
      try {
        await service.setPassword(password);
        await options.onPasswordCreated?.();
      } catch (caught) {
        loading = false;
        error = getErrorMessage(caught);
        render();
      }
    });
  };

  render();
}
