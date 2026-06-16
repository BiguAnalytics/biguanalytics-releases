// @ts-check

/**
 * @param {string|null|undefined} token
 * @returns {string}
 */
function maskToken(token) {
  const value = String(token || '').trim();
  if (!value) return 'none';
  return `***${value.slice(-4)}`;
}

/**
 * @param {{
 *   endpoint: string,
 *   token?: string,
 *   userId?: string,
 *   profileStatus?: string|null,
 *   aiEnabled?: boolean|null,
 *   inputChars?: number,
 *   ok: boolean,
 *   status?: number,
 *   error?: string,
 *   usage?: {inputTokens?: number|null, outputTokens?: number|null, totalTokens?: number|null},
 *   now?: string,
 * }} data
 * @returns {object}
 */
function formatLogEntry(data) {
  return {
    at: data.now || new Date().toISOString(),
    endpoint: data.endpoint,
    userId: data.userId ? String(data.userId) : undefined,
    profileStatus: data.profileStatus ? String(data.profileStatus) : undefined,
    aiEnabled: typeof data.aiEnabled === 'boolean' ? data.aiEnabled : undefined,
    token: data.token ? maskToken(data.token) : undefined,
    inputChars: Number.isFinite(Number(data.inputChars)) ? Number(data.inputChars) : 0,
    ok: Boolean(data.ok),
    status: data.status || (data.ok ? 200 : 500),
    error: data.error,
    usage: data.usage ? {
      inputTokens: data.usage.inputTokens ?? null,
      outputTokens: data.usage.outputTokens ?? null,
      totalTokens: data.usage.totalTokens ?? null,
    } : undefined,
  };
}

function createLogger() {
  return {
    info(entry) {
      console.info(JSON.stringify(entry));
    },
    error(entry) {
      console.error(JSON.stringify(entry));
    },
  };
}

module.exports = {
  createLogger,
  formatLogEntry,
  maskToken,
};
