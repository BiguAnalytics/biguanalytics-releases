// @ts-check
import { renderBiguLogo, wireBiguLogoFallback } from '../brand-logo.js';

/**
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * @param {HTMLElement} container
 * @param {{email?: string, onUseEmailCode?: function(): Promise<void>|void, onSignOut?: function(): Promise<void>|void}} [options]
 */
export function renderVerifyDeviceEmailScreen(container, options = {}) {
  container.innerHTML = `
    <main class="access-shell" aria-labelledby="verify-device-title">
      <section class="access-card access-blocked-card">
        <div class="access-brand" aria-label="BiguAnalytics">
          ${renderBiguLogo({ className: 'access-brand-mark' })}
          <div class="access-brand-name">Bigu<span>Analytics</span></div>
        </div>
        <div class="access-copy">
          <h1 id="verify-device-title">Dispositivo nuevo</h1>
          <p>Dispositivo nuevo: verifica tu email para continuar. La contraseña no habilita computadoras nuevas.</p>
        </div>
        <div class="access-context">
          ${options.email ? `<span>Email: ${escapeHtml(options.email)}</span>` : ''}
        </div>
        <div class="access-actions">
          <button class="access-primary-btn" type="button" data-use-email-code>Codigo por email</button>
          <button class="access-ghost-btn" type="button" data-device-signout>Cerrar sesion</button>
        </div>
      </section>
    </main>
  `;
  wireBiguLogoFallback(container);

  container.querySelector('[data-use-email-code]')?.addEventListener('click', () => options.onUseEmailCode?.());
  container.querySelector('[data-device-signout]')?.addEventListener('click', () => options.onSignOut?.());
}
