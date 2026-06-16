// @ts-check
const { DEFAULT_USAGE, normalizeMatchAnalysisResult, normalizeUsage } = require('./aiSchemas');
const { AI_MATCH_ANALYSIS_MODEL } = require('./aiConstants');
const { getAIConfig, normalizeAIBackendUrl } = require('./aiConfig');
const { SESSION_EXPIRED_MESSAGE } = require('./aiAuthSession');

const DEFAULT_TIMEOUT_MS = 45000;
const AI_BACKEND_UNAVAILABLE_MESSAGE = 'Backend IA no disponible. Revisá tu conexión e intentá nuevamente.';
const SAFE_BACKEND_MESSAGES = new Set([
  SESSION_EXPIRED_MESSAGE,
  'Usuario no aprobado o IA deshabilitada.',
  'IA no habilitada para este usuario.',
  'El partido tiene demasiados datos para analizar. Reducilo o ajusta el limite del backend.',
  'Limite de uso de IA alcanzado. Intenta nuevamente mas tarde.',
  'El backend de IA no pudo completar la solicitud.',
  'Solicitud IA invalida.',
  'No se pudo completar la solicitud de IA.',
  AI_BACKEND_UNAVAILABLE_MESSAGE,
  'El runtime no tiene fetch disponible para llamar al backend IA.',
]);

/**
 * @param {number} status
 * @returns {string}
 */
function getSafeBackendErrorMessage(status) {
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 403) return 'IA no habilitada para este usuario.';
  if (status === 413) return 'El partido tiene demasiados datos para analizar. Reducilo o ajusta el limite del backend.';
  if (status === 429) return 'Limite de uso de IA alcanzado. Intenta nuevamente mas tarde.';
  if (status >= 500) return AI_BACKEND_UNAVAILABLE_MESSAGE;
  if (status === 400) return 'Solicitud IA invalida.';
  return 'No se pudo completar la solicitud de IA.';
}

/**
 * @param {unknown} value
 * @returns {object}
 */
function normalizeClientUsage(value) {
  return normalizeUsage(value || DEFAULT_USAGE);
}

/**
 * @param {unknown} value
 * @returns {{answer: string, usedMetrics: Array<string>, confidence: number}}
 */
function normalizeClientChatResult(value) {
  const source = value && typeof value === 'object' ? value : {};
  const confidence = Number(source.confidence);
  return {
    answer: String(source.answer || '').trim(),
    usedMetrics: Array.isArray(source.usedMetrics)
      ? source.usedMetrics.map(item => String(item || '').trim()).filter(Boolean).slice(0, 8)
      : [],
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
  };
}

/**
 * @param {string} backendUrl
 * @param {string} path
 * @returns {string}
 */
function buildAIBackendEndpointUrl(backendUrl, path) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
  return `${backendUrl}${normalizedPath}`;
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   getConfig?: function(): Promise<{backendUrl: string, clientToken?: string}>,
 *   getAuthToken?: function(): Promise<string>,
 *   logger?: {info?: function(string): void},
 *   debug?: boolean,
 *   env?: NodeJS.ProcessEnv|Record<string, string|undefined>,
 *   isPackaged?: boolean,
 *   timeoutMs?: number,
 * }} [options]
 */
function createAIBackendClient(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const getConfig = options.getConfig || getAIConfig;
  const getAuthToken = options.getAuthToken || (async () => '');
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const logger = options.logger || console;

  /**
   * @param {string} endpoint
   * @param {string} token
   */
  function logAIRequestDebug(endpoint, token) {
    const shouldLog = options.debug === true
      || (options.debug !== false && process.env.NODE_ENV === 'development')
      || process.env.BIGU_AI_AUTH_DEBUG === 'true';
    if (!shouldLog) return;
    logger.info?.(`[ai-backend] ${JSON.stringify({
      endpoint,
      hasAccessToken: Boolean(String(token || '').trim()),
      accessToken: token ? `***${String(token).slice(-4)}` : '',
    })}`);
  }

  async function getAuthorizationToken() {
    const accessToken = String(await getAuthToken() || '').trim();
    return accessToken;
  }

  /**
   * @param {string} path
   * @param {object} body
   * @returns {Promise<object>}
   */
  async function post(path, body) {
    const config = await getConfig();
    const backendUrl = normalizeAIBackendUrl(config.backendUrl, options);
    const authToken = await getAuthorizationToken();
    if (!backendUrl) throw new Error(AI_BACKEND_UNAVAILABLE_MESSAGE);
    if (!authToken) throw new Error(SESSION_EXPIRED_MESSAGE);
    if (typeof fetchImpl !== 'function') throw new Error('El runtime no tiene fetch disponible para llamar al backend IA.');
    logAIRequestDebug(path, authToken);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(buildAIBackendEndpointUrl(backendUrl, path), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(getSafeBackendErrorMessage(response.status));
      }

      return {
        result: data?.result || {},
        usage: normalizeClientUsage(data?.usage),
        model: data?.model || AI_MATCH_ANALYSIS_MODEL,
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('El backend de IA no respondio a tiempo.');
      }
      if (error instanceof Error && SAFE_BACKEND_MESSAGES.has(error.message)) throw error;
      throw new Error(AI_BACKEND_UNAVAILABLE_MESSAGE);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function verifyToken() {
    const config = await getConfig();
    const backendUrl = normalizeAIBackendUrl(config.backendUrl, options);
    if (!backendUrl) return { ok: false, status: 'backend-unavailable', message: AI_BACKEND_UNAVAILABLE_MESSAGE };
    let authToken = '';
    try {
      authToken = await getAuthorizationToken();
    } catch (error) {
      const message = error instanceof Error && SAFE_BACKEND_MESSAGES.has(error.message)
        ? error.message
        : SESSION_EXPIRED_MESSAGE;
      return { ok: false, status: 'invalid-token', message };
    }
    if (!authToken) return { ok: false, status: 'invalid-token', message: SESSION_EXPIRED_MESSAGE };
    logAIRequestDebug('/v1/ai/verify-auth', authToken);

    try {
      const response = await fetchImpl(buildAIBackendEndpointUrl(backendUrl, '/v1/ai/verify-auth'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (response.status === 401) return { ok: false, status: 'invalid-token', message: SESSION_EXPIRED_MESSAGE };
      if (response.status === 403) return { ok: false, status: 'ai-disabled', message: 'IA no habilitada para este usuario.' };
      if (!response.ok) return { ok: false, status: 'backend-unavailable', message: AI_BACKEND_UNAVAILABLE_MESSAGE };
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      return {
        ok: true,
        status: 'connected',
        message: 'Conectado',
        userId: data?.user_id || null,
        profileStatus: data?.status || null,
        aiEnabled: data?.ai_enabled === true,
        dailyLimit: data?.ai_daily_limit ?? data?.daily_limit ?? null,
        role: data?.role || null,
      };
    } catch {
      return { ok: false, status: 'backend-unavailable', message: AI_BACKEND_UNAVAILABLE_MESSAGE };
    }
  }

  return {
    model: AI_MATCH_ANALYSIS_MODEL,
    async analyzeMatch(matchData, requestOptions = {}) {
      const response = await post('/v1/ai/analyze-match', { matchData, options: requestOptions });
      return {
        ...response,
        result: normalizeMatchAnalysisResult(response.result),
      };
    },
    async generateMatchAnalysis(matchData, requestOptions = {}) {
      return this.analyzeMatch(matchData, requestOptions);
    },
    async generateSummary(matchData, requestOptions = {}) {
      return post('/v1/ai/generate-summary', { matchData, options: requestOptions });
    },
    async detectPatterns(matchData, requestOptions = {}) {
      return post('/v1/ai/detect-patterns', { matchData, options: requestOptions });
    },
    async chatMatch(matchData, question) {
      const response = await post('/v1/ai/chat-match', { matchData, question: String(question || '').trim() });
      return {
        ...response,
        result: normalizeClientChatResult(response.result),
      };
    },
    verifyToken,
  };
}

module.exports = {
  createAIBackendClient,
  getSafeBackendErrorMessage,
  normalizeAIBackendUrl,
};
