// @ts-check
import { getSupabaseClient } from './supabase-client.js';
import { validatePasswordValue } from './password-validation.js';

/**
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * @param {Promise<object>|object|function(): Promise<object>} clientSource
 * @returns {Promise<object>}
 */
async function resolveClient(clientSource) {
  if (typeof clientSource === 'function') return clientSource();
  return clientSource;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getRawErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message || '');
  }
  return String(error || '');
}

/**
 * @param {unknown} error
 * @param {string} [fallback]
 * @returns {string}
 */
export function getAuthErrorMessage(error, fallback = 'No se pudo completar el ingreso.') {
  const message = getRawErrorMessage(error).trim();
  if (!message) return fallback;
  if (/new password.*different|different from old password/i.test(message)) {
    return 'La contraseña nueva debe ser distinta a la anterior.';
  }
  if (/error sending magic link|magic link/i.test(message)) {
    return 'No se pudo enviar el código. Revisá tu conexión o intentá nuevamente.';
  }
  if (/invalid login credentials/i.test(message)) {
    return 'Email o contraseña incorrectos.';
  }
  if (/email not confirmed|not confirmed/i.test(message)) {
    return 'El email todavía no está confirmado. Usá Primer acceso para recibir un código.';
  }
  if (/failed to fetch|fetch failed|network|load failed|econnrefused|enotfound|timeout/i.test(message)) {
    return 'No se pudo conectar con Supabase.';
  }
  if (/signups?\s+not\s+allowed.*otp|otp.*signups?\s+not\s+allowed/i.test(message)) {
    return 'El registro está deshabilitado en Supabase. Activá Email Signups desde el panel de Supabase.';
  }
  if (/password.*at least|password.*characters/i.test(message)) {
    return 'La contraseña debe tener al menos 8 caracteres.';
  }
  if (/jwt.*expired|session.*expired/i.test(message)) {
    return 'La sesion vencio. Cerrar sesion e ingresa otra vez.';
  }
  if (/(password_configured|password_configured_at|password_set_at).*(does not exist|schema cache)|column .*(password_configured|password_configured_at|password_set_at)|could not find .*(password_configured|password_configured_at|password_set_at)/i.test(message)) {
    return 'Falta aplicar la migracion de contraseñas en Supabase.';
  }
  if (/row-level security|violates row level security|violates row-level security/i.test(message)) {
    return 'No se pudo actualizar el perfil por permisos de Supabase.';
  }
  return message;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isMissingRpcError(error) {
  return /mark_own_password_configured|function.*does not exist|could not find/i.test(getRawErrorMessage(error));
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isSamePasswordError(error) {
  return /new password.*different|different from old password|same as old password|cannot be.*same|igual a la anterior/i.test(getRawErrorMessage(error));
}

/**
 * @param {object} client
 * @param {string} userId
 * @param {string} passwordConfiguredAt
 * @returns {Promise<object>}
 */
async function markPasswordConfiguredProfile(client, userId, passwordConfiguredAt) {
  if (typeof client.rpc === 'function') {
    const rpcResult = await client.rpc('mark_own_password_configured', {
      p_password_configured_at: passwordConfiguredAt,
    });
    if (!rpcResult.error && rpcResult.data) {
      return Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
    }
    if (rpcResult.error && !isMissingRpcError(rpcResult.error)) {
      throw new Error(getAuthErrorMessage(rpcResult.error, 'No se pudo guardar el estado de la contraseña.'));
    }
  }

  if (typeof client.from !== 'function') {
    return {
      id: userId,
      password_configured: true,
      password_configured_at: passwordConfiguredAt,
    };
  }

  const profileResult = await client
    .from('profiles')
    .update({
      password_configured: true,
      password_configured_at: passwordConfiguredAt,
    })
    .eq('id', userId)
    .select('*')
    .single();
  if (profileResult.error) {
    throw new Error(getAuthErrorMessage(profileResult.error, 'No se pudo guardar el estado de la contraseña.'));
  }
  return profileResult.data;
}

/**
 * @param {Promise<object>|object|function(): Promise<object>} [clientSource]
 */
export function createAuthService(clientSource = getSupabaseClient) {
  return {
    /**
     * @param {string} email
     */
    async sendOtp(email) {
      const client = await resolveClient(clientSource);
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) throw new Error('Ingresá un email autorizado.');
      const { error } = await client.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });
      if (error) throw new Error(getAuthErrorMessage(error, 'No se pudo enviar el codigo.'));
      return true;
    },

    /**
     * @param {string} email
     * @param {string} token
     */
    async verifyOtp(email, token) {
      const client = await resolveClient(clientSource);
      const normalizedEmail = normalizeEmail(email);
      const normalizedToken = String(token || '').trim();
      if (!normalizedEmail || !/^\d{8}$/.test(normalizedToken)) {
        throw new Error('Ingresá el codigo de 8 digitos.');
      }
      const { data, error } = await client.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: 'email',
      });
      if (error) throw new Error(getAuthErrorMessage(error, 'No se pudo verificar el codigo.'));
      return data;
    },

    /**
     * @param {string} email
     * @param {string} password
     */
    async signInWithPassword(email, password) {
      const client = await resolveClient(clientSource);
      const normalizedEmail = normalizeEmail(email);
      const normalizedPassword = String(password || '');
      if (!normalizedEmail || !normalizedPassword) {
        throw new Error('Ingresa email y contraseña.');
      }
      const { data, error } = await client.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      });
      if (error) throw new Error(getAuthErrorMessage(error, 'No se pudo iniciar sesion.'));
      return data;
    },

    /**
     * @param {string} [userId]
     */
    async markPasswordConfigured(userId) {
      const client = await resolveClient(clientSource);
      const sessionResult = await client.auth.getSession();
      if (sessionResult.error) {
        throw new Error(getAuthErrorMessage(sessionResult.error, 'No se pudo leer la sesion.'));
      }
      const sessionUserId = sessionResult.data?.session?.user?.id || '';
      const targetUserId = sessionUserId || String(userId || '');
      if (!targetUserId) throw new Error('No se pudo actualizar el perfil de contraseña.');

      return markPasswordConfiguredProfile(client, targetUserId, new Date().toISOString());
    },

    /**
     * @param {string} password
     */
    async setPassword(password) {
      const client = await resolveClient(clientSource);
      const normalizedPassword = String(password || '');
      const validation = validatePasswordValue(normalizedPassword);
      if (!validation.isValid) {
        throw new Error(validation.errors[0] || 'La contraseña no cumple los requisitos.');
      }

      const { data, error } = await client.auth.updateUser({ password: normalizedPassword });
      if (error && !isSamePasswordError(error)) {
        throw new Error(getAuthErrorMessage(error, 'No se pudo crear la contraseña.'));
      }

      const sessionResult = await client.auth.getSession();
      if (sessionResult.error) {
        throw new Error(getAuthErrorMessage(sessionResult.error, 'No se pudo leer la sesion.'));
      }
      const userId = data?.user?.id || sessionResult.data?.session?.user?.id;
      if (!userId) throw new Error('No se pudo actualizar el perfil de contraseña.');

      const passwordConfiguredAt = new Date().toISOString();
      return markPasswordConfiguredProfile(client, userId, passwordConfiguredAt);
    },

    /**
     * @param {object|null|undefined} profile
     * @returns {boolean}
     */
    hasPassword(profile) {
      return profile?.password_configured === true;
    },

    async getSession() {
      const client = await resolveClient(clientSource);
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error(getAuthErrorMessage(error, 'No se pudo leer la sesion.'));
      return data?.session || null;
    },

    async restoreSession() {
      return this.getSession();
    },

    async signOut() {
      const client = await resolveClient(clientSource);
      const { error } = await client.auth.signOut();
      if (error) throw new Error(getAuthErrorMessage(error, 'No se pudo cerrar sesion.'));
      await window.api?.auth?.logout?.();
      await window.api?.authSession?.clear?.();
      return true;
    },
  };
}

export const authService = createAuthService();
