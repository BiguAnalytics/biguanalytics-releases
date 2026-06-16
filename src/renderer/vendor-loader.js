// @ts-check
import { timeStartup } from './startup-timing.js';

const SCRIPT_PROMISES = new Map();

/**
 * @param {string} src
 * @param {string} globalName
 * @returns {Promise<unknown>}
 */
function loadScript(src, globalName) {
  if (globalThis.window?.[globalName]) return Promise.resolve(globalThis.window[globalName]);
  if (SCRIPT_PROMISES.has(src)) return SCRIPT_PROMISES.get(src);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(globalThis.window?.[globalName]);
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}.`));
    document.head.appendChild(script);
  });

  SCRIPT_PROMISES.set(src, promise);
  return promise;
}

export function ensureChartJs() {
  return timeStartup('charts:init', () => loadScript('vendor/chart.umd.js', 'Chart'));
}

export function ensureSupabaseJs() {
  return timeStartup('supabase:client-script', () => loadScript('../../node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'supabase'));
}
