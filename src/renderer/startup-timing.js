// @ts-check

/**
 * @param {string} label
 * @param {object} [detail]
 */
export function markStartup(label, detail = {}) {
  const payload = {
    rendererMs: Math.round((performance.now?.() || 0) * 10) / 10,
    ...detail,
  };
  globalThis.window?.api?.startup?.mark?.(label, payload).catch(() => {});
}

/**
 * @template T
 * @param {string} label
 * @param {function(): Promise<T>|T} operation
 * @returns {Promise<T>}
 */
export async function timeStartup(label, operation) {
  markStartup(`${label}:start`);
  try {
    const result = await operation();
    markStartup(`${label}:end`);
    return result;
  } catch (error) {
    markStartup(`${label}:error`, {
      error: error instanceof Error ? error.message.slice(0, 160) : String(error || 'unknown'),
    });
    throw error;
  }
}
