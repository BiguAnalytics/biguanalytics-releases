// @ts-check

const BLOCKED_COPY = {
  activation_required: {
    title: 'Activacion requerida',
    body: 'Necesitas conectarte a internet para activar BiguAnalytics por primera vez.',
  },
  renewal_required: {
    title: 'Conecta internet para renovar acceso',
    body: 'El acceso offline vencio o necesita una nueva verificacion online.',
  },
  invalid_license: {
    title: 'Licencia revocada o invalida',
    body: 'La licencia no esta habilitada para abrir BiguAnalytics.',
  },
  network_error: {
    title: 'No se pudo verificar la licencia',
    body: 'Conecta internet para renovar acceso.',
  },
  pending_device: {
    title: 'Dispositivo pendiente de aprobación',
    body: 'Tu usuario fue creado correctamente. Un administrador debe aprobar este dispositivo para entrar a BiguAnalytics.',
  },
  blocked_user: {
    title: 'Usuario no autorizado',
    body: 'Tu usuario no tiene acceso a BiguAnalytics.',
  },
  expired_license: {
    title: 'Licencia vencida',
    body: 'La licencia del club vencio. Contacta a BiguAnalytics para reactivarla.',
  },
  suspended_license: {
    title: 'Licencia suspendida',
    body: 'La licencia del club esta suspendida. El acceso queda bloqueado hasta su regularizacion.',
  },
  blocked_device: {
    title: 'Dispositivo no autorizado',
    body: 'Este dispositivo no está autorizado para usar BiguAnalytics.',
  },
  connection_error: {
    title: 'No se pudo verificar la licencia',
    body: 'Necesitas conexion para validar la licencia en esta version.',
  },
};

const CONNECTION_REASON_COPY = {
  missing_supabase_config: 'Falta configurar SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en el entorno de la app. Reinicia despues de guardarlo.',
  missing_license_schema: 'Supabase esta conectado, pero faltan las tablas de licenciamiento. Ejecuta la migracion 20260529000000_license_access.sql y reintenta.',
  missing_personal_info_schema: 'Supabase esta conectado, pero faltan las columnas de datos personales. Ejecuta la migracion 20260530000000_personal_device_info.sql y reintenta.',
  missing_password_schema: 'Supabase esta conectado, pero falta la migracion de contraseñas. Ejecuta 20260610010000_password_configured_flags.sql y reintenta.',
};

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
 * @param {object|null|undefined} device
 * @returns {string}
 */
function getDeviceLabel(device) {
  return String(
    device?.device_name
    || device?.display_name
    || device?.deviceName
    || device?.id
    || device?.fingerprint_hash
    || device?.device_fingerprint
    || ''
  ).trim();
}

/**
 * @param {HTMLElement} container
 * @param {{accessState?: object, onRetry?: function(): Promise<void>|void, onSignOut?: function(): Promise<void>|void}} [options]
 */
export function renderAccessBlockedScreen(container, options = {}) {
  const state = options.accessState?.state || 'connection_error';
  const copy = BLOCKED_COPY[state] || BLOCKED_COPY.connection_error;
  const body = options.accessState?.message
    ? String(options.accessState.message)
    : state === 'connection_error' && CONNECTION_REASON_COPY[options.accessState?.reason]
    ? CONNECTION_REASON_COPY[options.accessState.reason]
    : copy.body;
  const detail = state === 'connection_error' && options.accessState?.detail
    ? String(options.accessState.detail)
    : '';
  const email = options.accessState?.user?.email || '';
  const clubName = options.accessState?.club?.name || '';
  const deviceLabel = getDeviceLabel(options.accessState?.device);
  const showRetry = !['blocked_user', 'blocked_device'].includes(state);

  container.innerHTML = `
    <main class="access-shell" aria-labelledby="access-blocked-title">
      <section class="access-card access-blocked-card">
        <div class="access-logo" aria-label="BiguAnalytics">
          <span>Bigu</span><strong>Analytics</strong>
        </div>
        <div class="access-copy">
          <h1 id="access-blocked-title">${copy.title}</h1>
          <p>${escapeHtml(body)}</p>
          ${detail ? `<small class="access-detail">Detalle: ${escapeHtml(detail)}</small>` : ''}
        </div>
        <div class="access-context">
          ${clubName ? `<span>Club: ${escapeHtml(clubName)}</span>` : ''}
          ${email ? `<span>Usuario: ${escapeHtml(email)}</span>` : ''}
          ${deviceLabel ? `<span>Dispositivo: ${escapeHtml(deviceLabel)}</span>` : ''}
        </div>
        <div class="access-actions">
          ${showRetry ? '<button class="access-primary-btn" type="button" data-access-retry>Reintentar</button>' : ''}
          <button class="access-ghost-btn" type="button" data-access-signout>Cerrar sesion</button>
        </div>
      </section>
    </main>
  `;

  container.querySelector('[data-access-retry]')?.addEventListener('click', () => options.onRetry?.());
  container.querySelector('[data-access-signout]')?.addEventListener('click', () => options.onSignOut?.());
}
