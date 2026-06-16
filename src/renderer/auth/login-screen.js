// @ts-check
import { authService as defaultAuthService } from './auth-service.js';
import { renderBiguLogo, wireBiguLogoFallback } from '../brand-logo.js';

const PASSWORD_LOGIN_FAILED_MESSAGE = 'Email o contraseña incorrectos. Si todavía no configuraste contraseña, usá Primer acceso.';
const PASSWORD_RECOVERY_HELP = 'Usá Primer acceso con código por email para volver a ingresar y crear una nueva contraseña.';
const PASSWORD_MODE_HELP = 'Ingresá con la contraseña que creaste después del primer acceso.';
const OTP_MODE_HELP = 'Te enviaremos un código por email. Luego podrás crear tu contraseña y tu dispositivo quedará pendiente de aprobación.';

/**
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'No se pudo completar el ingreso.';
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeAttribute(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function escapeHtml(value) {
  return escapeAttribute(String(value ?? ''));
}

/**
 * @param {HTMLElement} container
 * @param {{authService?: object, onAuthenticated?: function({method: string, email: string}): Promise<void>|void, initialMode?: string, initialEmail?: string}} [options]
 */
export function renderLoginScreen(container, options = {}) {
  const service = options.authService || defaultAuthService;
  let mode = options.initialMode === 'otp' ? 'otp' : 'password';
  let otpStep = 'email';
  let email = String(options.initialEmail || '').trim();
  let loading = false;
  let error = '';
  let help = '';

  const render = () => {
    container.innerHTML = `
      <main class="access-shell" aria-labelledby="login-title">
        <section class="access-card login-card">
          <div class="access-brand" aria-label="BiguAnalytics">
            ${renderBiguLogo({ className: 'access-brand-mark' })}
            <div class="access-brand-name">Bigu<span>Analytics</span></div>
          </div>
          <div class="access-copy">
            <h1 id="login-title">Ingreso autorizado</h1>
            <p>Ingresá con tu email para acceder a BiguAnalytics</p>
          </div>
          <div class="access-auth-options" role="tablist" aria-label="Metodo de ingreso">
            <button class="access-auth-option${mode === 'password' ? ' active' : ''}" type="button" data-login-mode="password" role="tab" aria-selected="${mode === 'password'}">
              <span>Iniciar sesion</span>
              <small>Email + clave</small>
            </button>
            <button class="access-auth-option${mode === 'otp' ? ' active' : ''}" type="button" data-login-mode="otp" role="tab" aria-selected="${mode === 'otp'}">
              <span>Primer acceso</span>
              <small>Codigo email</small>
            </button>
          </div>
          <p class="access-mode-copy">${mode === 'password' ? PASSWORD_MODE_HELP : OTP_MODE_HELP}</p>
          <form class="access-form" data-login-form>
            ${mode === 'password' ? `
              <label for="license-password-email">Email</label>
              <input id="license-password-email" name="email" type="email" inputmode="email" autocomplete="email" value="${escapeAttribute(email)}" required>
              <label for="license-password">Contraseña</label>
              <input id="license-password" name="password" type="password" autocomplete="current-password" required>
              <button class="access-primary-btn" type="submit" ${loading ? 'disabled' : ''}>${loading ? 'Verificando...' : 'Iniciar sesion'}</button>
              <button class="access-link-btn" type="button" data-forgot-password ${loading ? 'disabled' : ''}>Olvidé mi contraseña</button>
            ` : otpStep === 'email' ? `
              <label for="license-email">Email</label>
              <input id="license-email" name="email" type="email" inputmode="email" autocomplete="email" value="${escapeAttribute(email)}" required>
              <button class="access-primary-btn" type="submit" ${loading ? 'disabled' : ''}>${loading ? 'Enviando...' : 'Enviar codigo'}</button>
            ` : `
              <label for="license-otp">Codigo</label>
              <input id="license-otp" class="access-otp-input" name="token" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" size="8" pattern="[0-9]{8}" required>
              <button class="access-primary-btn" type="submit" ${loading ? 'disabled' : ''}>${loading ? 'Verificando...' : 'Entrar'}</button>
              <button class="access-ghost-btn" type="button" data-change-email ${loading ? 'disabled' : ''}>Cambiar email</button>
            `}
          </form>
          <div class="access-status" aria-live="polite">${escapeHtml(error)}</div>
          ${help ? `<div class="access-help" aria-live="polite">${escapeHtml(help)}</div>` : ''}
        </section>
      </main>
    `;
    wireBiguLogoFallback(container);

    container.querySelectorAll('[data-login-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        mode = button.dataset.loginMode || 'password';
        otpStep = 'email';
        error = '';
        help = '';
        render();
      });
    });

    const form = container.querySelector('[data-login-form]');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      loading = true;
      error = '';
      help = '';
      email = String(data.get('email') || email || '').trim();
      render();
      try {
        if (mode === 'password') {
          await service.signInWithPassword(email, String(data.get('password') || ''));
          await options.onAuthenticated?.({ method: 'password', email });
          return;
        }

        if (otpStep === 'email') {
          await service.sendOtp(email);
          otpStep = 'otp';
          loading = false;
          render();
          container.querySelector('#license-otp')?.focus();
          return;
        }

        await service.verifyOtp(email, String(data.get('token') || ''));
        await options.onAuthenticated?.({ method: 'otp', email });
      } catch (caught) {
        loading = false;
        error = mode === 'password' ? PASSWORD_LOGIN_FAILED_MESSAGE : getErrorMessage(caught);
        help = '';
        render();
      }
    });

    container.querySelector('[data-change-email]')?.addEventListener('click', () => {
      otpStep = 'email';
      error = '';
      help = '';
      render();
    });

    container.querySelector('[data-forgot-password]')?.addEventListener('click', () => {
      mode = 'otp';
      otpStep = 'email';
      error = '';
      help = PASSWORD_RECOVERY_HELP;
      render();
    });
  };

  render();
}
