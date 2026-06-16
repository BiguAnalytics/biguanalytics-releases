// @ts-check
import { ensureSupabaseJs } from '../vendor-loader.js';
import { timeStartup } from '../startup-timing.js';

const AUTH_STORAGE_KEY = 'bigu-license-auth';
let supabaseClientPromise = null;

/**
 * @returns {{getItem: (key: string) => Promise<string|null>, setItem: (key: string, value: string) => Promise<void>, removeItem: (key: string) => Promise<void>}}
 */
function createIpcSessionStorage() {
  return {
    getItem: (key) => window.api.authSession.get(key),
    setItem: async (key, value) => {
      await window.api.authSession.set(key, value);
    },
    removeItem: async (key) => {
      await window.api.authSession.remove(key);
    },
  };
}

/**
 * @param {{supabaseUrl?: string, supabasePublishableKey?: string}} config
 */
function assertSupabaseConfig(config) {
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
    throw new Error('Falta configurar SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY.');
  }
}

/**
 * @returns {Promise<Record<string, string>>}
 */
async function getDeviceRequestHeaders() {
  try {
    const fingerprint = await window.api.device.getFingerprint();
    const fingerprintHash = String(fingerprint?.fingerprintHash || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(fingerprintHash)) return {};
    return {
      'x-bigu-device-fingerprint': fingerprintHash,
    };
  } catch {
    return {};
  }
}

export async function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = (async () => {
      const config = await timeStartup('supabase:config', () => window.api.licenseConfig.get());
      assertSupabaseConfig(config);
      const deviceHeaders = await timeStartup('supabase:device-headers', () => getDeviceRequestHeaders());
      await ensureSupabaseJs();
      const createClient = window.supabase?.createClient;
      if (typeof createClient !== 'function') {
        throw new Error('No se pudo cargar el cliente publico de Supabase.');
      }
      return createClient(config.supabaseUrl, config.supabasePublishableKey, {
        global: {
          headers: deviceHeaders,
        },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: AUTH_STORAGE_KEY,
          storage: createIpcSessionStorage(),
        },
      });
    })();
  }
  return supabaseClientPromise;
}

export function resetSupabaseClientForTests() {
  supabaseClientPromise = null;
}
