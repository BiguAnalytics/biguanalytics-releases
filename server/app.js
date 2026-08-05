// @ts-check
const crypto = require('crypto');
const express = require('express');
const { createGeminiClient } = require('./geminiClient');
const { createLogger, formatLogEntry } = require('./logger');
const { buildChatMatchPrompt, buildControlledPrompt } = require('./prompts');
const { hasEnoughMatchData, sanitizeMatchData } = require('./sanitizeMatchData');
const { buildScoreContext } = require('./scoreContext');
const { normalizeAIResult } = require('./responseNormalizer');
const { finalizeAnalysisResult } = require('./analysisFallback');
const { createSupabaseAuthService, hasSupabaseAuthConfig } = require('./supabaseAuth');

const DEFAULT_MAX_INPUT_CHARS = 60000;
const DEFAULT_DAILY_LIMIT = 200;
const DEFAULT_PER_MINUTE_LIMIT = 10;
const DEFAULT_MAX_RATE_LIMIT_BUCKETS = 10000;
const MAX_RATE_LIMIT_BUCKETS = 100000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string|undefined} value
 * @returns {Set<string>}
 */
function parseAllowedTokens(value) {
  return new Set(String(value || '')
    .split(',')
    .map(token => token.trim())
    .filter(Boolean)
    .map(hashToken));
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function parsePositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

/**
 * @param {string} token
 * @returns {string}
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * @param {{dailyLimit: number, perMinuteLimit: number, maxBuckets?: number, now?: function(): Date}} options
 */
function createRateLimiter(options) {
  const minuteHits = new Map();
  const dailyHits = new Map();
  const now = options.now || (() => new Date());
  const maxBuckets = Math.min(
    parsePositiveInt(options.maxBuckets, DEFAULT_MAX_RATE_LIMIT_BUCKETS),
    MAX_RATE_LIMIT_BUCKETS,
  );

  function getNowMs() {
    const current = now();
    const timestamp = current instanceof Date ? current.getTime() : Date.parse(String(current));
    return Number.isFinite(timestamp) ? timestamp : Date.now();
  }

  function pruneExpiredBuckets(buckets, currentMs) {
    for (const [key, bucket] of buckets) {
      if (bucket.expiresAt <= currentMs) buckets.delete(key);
    }
  }

  function enforceBucketLimit(buckets) {
    while (buckets.size > maxBuckets) {
      let oldestKey;
      let oldestSeenAt = Number.POSITIVE_INFINITY;
      for (const [key, bucket] of buckets) {
        if (bucket.lastSeenAt < oldestSeenAt) {
          oldestKey = key;
          oldestSeenAt = bucket.lastSeenAt;
        }
      }
      if (oldestKey === undefined) break;
      buckets.delete(oldestKey);
    }
  }

  function recordHit(buckets, key, expiresAt, currentMs) {
    const previous = buckets.get(key);
    const bucket = previous && previous.expiresAt > currentMs
      ? previous
      : { count: 0, expiresAt };
    bucket.count += 1;
    bucket.lastSeenAt = currentMs;
    bucket.expiresAt = expiresAt;
    buckets.set(key, bucket);
    enforceBucketLimit(buckets);
    return bucket.count;
  }

  return {
    /**
     * @param {string|{minuteKey: string, dailyKey: string}} key
     * @returns {{allowed: boolean, reason?: 'minute'|'daily'}}
     */
    check(key) {
      const minuteIdentity = typeof key === 'object' && key ? key.minuteKey : key;
      const dailyIdentity = typeof key === 'object' && key ? key.dailyKey : key;
      const perMinuteLimit = typeof key === 'object' && key?.perMinuteLimit > 0 ? key.perMinuteLimit : options.perMinuteLimit;
      const dailyLimit = typeof key === 'object' && key?.dailyLimit > 0 ? key.dailyLimit : options.dailyLimit;
      const currentMs = getNowMs();
      const current = new Date(currentMs);
      const minutePeriod = Math.floor(currentMs / MINUTE_MS);
      const dayStart = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
      const minuteKey = `${String(minuteIdentity)}:${minutePeriod}`;
      const dayKey = `${String(dailyIdentity)}:${current.toISOString().slice(0, 10)}`;
      pruneExpiredBuckets(minuteHits, currentMs);
      pruneExpiredBuckets(dailyHits, currentMs);
      const minuteCount = recordHit(minuteHits, minuteKey, (minutePeriod + 1) * MINUTE_MS, currentMs);
      const dayCount = recordHit(dailyHits, dayKey, dayStart + DAY_MS, currentMs);

      if (minuteCount > perMinuteLimit) return { allowed: false, reason: 'minute' };
      if (dayCount > dailyLimit) return { allowed: false, reason: 'daily' };
      return { allowed: true };
    },

    getBucketCounts() {
      const currentMs = getNowMs();
      pruneExpiredBuckets(minuteHits, currentMs);
      pruneExpiredBuckets(dailyHits, currentMs);
      return { minute: minuteHits.size, daily: dailyHits.size };
    },
  };
}

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @returns {void}
 */
function sendError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

/**
 * @param {import('express').Request} req
 * @returns {{profileStatus?: string, aiEnabled?: boolean}}
 */
function getAuthLogFields(req) {
  return {
    profileStatus: req.aiAccess?.status || undefined,
    aiEnabled: typeof req.aiAccess?.enabled === 'boolean' ? req.aiAccess.enabled : undefined,
  };
}

/**
 * @param {string} message
 */
function throwInvalidBody(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'invalid_body';
  throw error;
}

/**
 * @param {unknown} value
 * @returns {{includeCoachNotes?: boolean}}
 */
function validateAIRequestOptions(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throwInvalidBody('options debe ser un objeto JSON.');
  }
  const allowed = new Set(['includeCoachNotes']);
  const keys = Object.keys(value);
  if (keys.some(key => !allowed.has(key))) {
    throwInvalidBody('options contiene campos no permitidos.');
  }
  if (Object.prototype.hasOwnProperty.call(value, 'includeCoachNotes') && typeof value.includeCoachNotes !== 'boolean') {
    throwInvalidBody('includeCoachNotes debe ser boolean.');
  }
  return {
    includeCoachNotes: value.includeCoachNotes === true,
  };
}

/**
 * @param {object} body
 */
function validateAIRequestBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throwInvalidBody('El body debe ser un objeto JSON.');
  }
  const allowed = new Set(['matchData', 'options']);
  if (Object.keys(body).some(key => !allowed.has(key))) {
    throwInvalidBody('El body contiene campos no permitidos.');
  }
  if (!body.matchData || typeof body.matchData !== 'object' || Array.isArray(body.matchData)) {
    throwInvalidBody('matchData es obligatorio.');
  }
  return {
    matchData: body.matchData,
    options: validateAIRequestOptions(body.options),
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeQuestion(value) {
  if (typeof value !== 'string') throwInvalidBody('question es obligatorio.');
  const trimmed = value.trim();
  if (!trimmed) throwInvalidBody('question no puede estar vacio.');
  if (trimmed.length > 1000) throwInvalidBody('question no puede superar 1000 caracteres.');
  return trimmed;
}

/**
 * @param {object} body
 * @returns {{matchData: object, question: string}}
 */
function validateChatMatchBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throwInvalidBody('El body debe ser un objeto JSON.');
  }
  const allowed = new Set(['matchData', 'question']);
  if (Object.keys(body).some(key => !allowed.has(key))) {
    throwInvalidBody('El body contiene campos no permitidos.');
  }
  if (!body.matchData || typeof body.matchData !== 'object' || Array.isArray(body.matchData)) {
    throwInvalidBody('matchData es obligatorio.');
  }
  return {
    matchData: body.matchData,
    question: normalizeQuestion(body.question),
  };
}

/**
 * @param {string} question
 * @returns {string}
 */
function normalizeScopeText(question) {
  return String(question || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * @param {string} question
 * @returns {boolean}
 */
function isDangerousChatQuestion(question) {
  return /api\s*key|apikey|secret|token|bearer|system prompt|prompt interno|instrucciones internas|service role|gemini_api_key|supabase_service_role_key|password|contrasena|contraseña/i.test(question);
}

/**
 * @param {string} question
 * @returns {boolean}
 */
function isMatchScopedQuestion(question) {
  const normalized = normalizeScopeText(question);
  return /(partido|match|metrica|metricas|score|marcador|bigua|rival|ruck|scrum|line|lineout|line out|maul|penal|disciplina|kick|territorio|posesion|try|tries|break|defensa|ataque|entren|fortaleza|debilidad|recomendacion|hallazgo|patron|tactica|tecnico|tecnica)/.test(normalized);
}

/**
 * @param {unknown} value
 * @returns {{answer: string, usedMetrics: Array<string>, confidence: number}}
 */
function normalizeChatMatchResult(value) {
  const source = value && typeof value === 'object' ? value : {};
  const confidence = Number(source.confidence);
  return {
    answer: String(source.answer || '').trim().slice(0, 1400) || 'No tenemos datos suficientes para responder con precision sobre nuestro partido.',
    usedMetrics: Array.isArray(source.usedMetrics)
      ? source.usedMetrics.map(item => String(item || '').trim()).filter(Boolean).slice(0, 8)
      : [],
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv|Record<string, string|undefined>,
 *   geminiClient?: {generateJson: function(object): Promise<object>},
 *   logger?: {info: function(object): void, error: function(object): void},
 *   authService?: {mode?: string, authenticateToken: function(string): Promise<object>},
 *   perMinuteLimit?: number,
 *   dailyLimit?: number,
 *   maxBuckets?: number,
 *   now?: function(): Date,
 * }} [options]
 */
function createAIBackendApp(options = {}) {
  const env = options.env || process.env;
  const allowedTokens = parseAllowedTokens(env.ALLOWED_CLIENT_TOKENS);
  const maxInputChars = parsePositiveInt(env.AI_MAX_INPUT_CHARS, DEFAULT_MAX_INPUT_CHARS);
  const dailyLimit = options.dailyLimit || parsePositiveInt(env.AI_DAILY_REQUEST_LIMIT, DEFAULT_DAILY_LIMIT);
  const perMinuteLimit = options.perMinuteLimit || DEFAULT_PER_MINUTE_LIMIT;
  const maxBuckets = options.maxBuckets || parsePositiveInt(env.AI_RATE_LIMIT_MAX_BUCKETS, DEFAULT_MAX_RATE_LIMIT_BUCKETS);
  const rateLimiter = createRateLimiter({ dailyLimit, perMinuteLimit, maxBuckets, now: options.now });
  const geminiClient = options.geminiClient || createGeminiClient();
  const logger = options.logger || createLogger();
  const authService = options.authService || (hasSupabaseAuthConfig(env) ? createSupabaseAuthService({ env }) : null);
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'biguanalytics-ai' });
  });

  async function authenticate(req, res, next) {
    const header = String(req.get('Authorization') || '');
    const match = header.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim() || '';

    if (authService) {
      try {
        const authResult = await authService.authenticateToken(token);
        if (!authResult.ok) {
          logger.info(formatLogEntry({
            endpoint: req.path,
            userId: authResult.userId,
            profileStatus: authResult.aiAccess?.status,
            aiEnabled: typeof authResult.aiAccess?.enabled === 'boolean' ? authResult.aiAccess.enabled : undefined,
            inputChars: 0,
            ok: false,
            status: authResult.status || 401,
            error: authResult.code || 'unauthorized',
          }));
          sendError(res, authResult.status || 401, authResult.code || 'unauthorized', authResult.message || 'No autorizado.');
          return;
        }
        req.authMode = 'supabase';
        req.userId = authResult.userId;
        req.aiAccess = authResult.aiAccess || {};
        req.aiDailyLimit = parsePositiveInt(authResult.aiAccess?.dailyLimit, dailyLimit);
        req.minuteRateLimitKey = `${authResult.userId}:${req.ip}`;
        req.dailyRateLimitKey = authResult.userId;
        next();
        return;
      } catch (error) {
        logger.error(formatLogEntry({
          endpoint: req.path,
          inputChars: 0,
          ok: false,
          status: 500,
          error: 'supabase_auth_error',
        }));
        sendError(res, 500, 'auth_error', 'No se pudo validar la sesion.');
        return;
      }
    }

    const tokenHash = token ? hashToken(token) : '';
    if (!token || !allowedTokens.has(tokenHash)) {
      logger.info(formatLogEntry({
        endpoint: req.path,
        token,
        inputChars: 0,
        ok: false,
        status: 401,
        error: 'unauthorized',
      }));
      sendError(res, 401, 'unauthorized', 'Token de cliente invalido.');
      return;
    }
    req.authMode = 'client_token';
    req.clientToken = token;
    req.clientTokenHash = tokenHash;
    req.minuteRateLimitKey = `${tokenHash}:${req.ip}`;
    req.dailyRateLimitKey = tokenHash;
    req.aiDailyLimit = dailyLimit;
    next();
  }

  app.get('/v1/ai/verify-token', authenticate, (req, res) => {
    res.json({ ok: true });
  });

  app.get('/v1/ai/verify-auth', authenticate, (req, res) => {
    res.json({
      authenticated: true,
      user_id: req.userId || null,
      status: req.authMode === 'supabase' ? req.aiAccess?.status || null : 'approved',
      ai_enabled: req.authMode === 'supabase' ? req.aiAccess?.enabled === true : true,
      ai_daily_limit: req.aiDailyLimit || dailyLimit,
      role: req.authMode === 'supabase' ? req.aiAccess?.role || null : null,
    });
  });

  function rateLimit(req, res, next) {
    const result = rateLimiter.check({
      minuteKey: req.minuteRateLimitKey || req.ip,
      dailyKey: req.dailyRateLimitKey || req.clientTokenHash || req.ip,
      dailyLimit: req.aiDailyLimit || dailyLimit,
    });
    if (!result.allowed) {
      logger.info(formatLogEntry({
        endpoint: req.path,
        token: req.clientToken,
        userId: req.userId,
        ...getAuthLogFields(req),
        inputChars: 0,
        ok: false,
        status: 429,
        error: result.reason || 'rate_limited',
      }));
      sendError(res, 429, 'rate_limited', result.reason === 'daily'
        ? 'Limite diario de IA alcanzado.'
        : 'Limite de IA por minuto alcanzado.');
      return;
    }
    next();
  }

  /**
   * @param {'analyzeMatch'|'generateSummary'|'detectPatterns'} task
   * @returns {import('express').RequestHandler}
   */
  function handleAI(task) {
    return async (req, res) => {
      const endpoint = req.path;
      let inputChars = 0;
      try {
        const { matchData, options: bodyOptions } = validateAIRequestBody(req.body);
        const sanitizedData = sanitizeMatchData(matchData, {
          includeCoachNotes: bodyOptions.includeCoachNotes === true,
        });
        if (task === 'analyzeMatch') {
          sanitizedData.scoreContext = buildScoreContext(sanitizedData);
        }
        inputChars = JSON.stringify(sanitizedData).length;
        if (inputChars > maxInputChars) {
          logger.info(formatLogEntry({
            endpoint,
            token: req.clientToken,
            userId: req.userId,
            ...getAuthLogFields(req),
            inputChars,
            ok: false,
            status: 413,
            error: 'payload_too_large',
          }));
          sendError(res, 413, 'payload_too_large', 'El input del partido supera el limite configurado.');
          return;
        }
        if (!hasEnoughMatchData(sanitizedData)) {
          logger.info(formatLogEntry({
            endpoint,
            token: req.clientToken,
            userId: req.userId,
            ...getAuthLogFields(req),
            inputChars,
            ok: false,
            status: 400,
            error: 'insufficient_match_data',
          }));
          sendError(res, 400, 'invalid_body', 'matchData no tiene datos deportivos suficientes.');
          return;
        }

        const { systemInstruction, prompt } = buildControlledPrompt(task, sanitizedData);
        let providerResult = await geminiClient.generateJson({
          task,
          systemInstruction,
          prompt,
          sanitizedData,
        });
        let result = normalizeAIResult(providerResult.result, task);
        if (task === 'analyzeMatch') {
          const firstPass = finalizeAnalysisResult(result, sanitizedData, { fallbackOnContradiction: false });
          if (firstPass.hasContradiction) {
            providerResult = await geminiClient.generateJson({
              task,
              systemInstruction,
              prompt: [
                prompt,
                '',
                'Correccion obligatoria: tu respuesta anterior contradijo scoreContext.',
                'Reescribi el JSON completo sin decir que Bigua perdio si resultForBigua es win ni que Bigua gano si resultForBigua es loss.',
              ].join('\n'),
              sanitizedData,
            });
            result = finalizeAnalysisResult(normalizeAIResult(providerResult.result, task), sanitizedData, {
              fallbackOnContradiction: true,
            }).result;
          } else {
            result = finalizeAnalysisResult(result, sanitizedData, { fallbackOnContradiction: true }).result;
          }
        }
        const payload = {
          result,
          usage: providerResult.usage || {},
          model: providerResult.model || geminiClient.model,
        };
        logger.info(formatLogEntry({
          endpoint,
          token: req.clientToken,
          userId: req.userId,
          ...getAuthLogFields(req),
          inputChars,
          ok: true,
          status: 200,
          usage: payload.usage,
        }));
        res.json(payload);
      } catch (error) {
        if (error?.statusCode === 400) {
          logger.info(formatLogEntry({
            endpoint,
            token: req.clientToken,
            userId: req.userId,
            ...getAuthLogFields(req),
            inputChars,
            ok: false,
            status: 400,
            error: error.code || 'invalid_body',
          }));
          sendError(res, 400, error.code || 'invalid_body', error.message || 'Solicitud invalida.');
          return;
        }
        const message = error instanceof Error ? error.message : 'Error de IA.';
        logger.error(formatLogEntry({
          endpoint,
          token: req.clientToken,
          userId: req.userId,
          ...getAuthLogFields(req),
          inputChars,
          ok: false,
          status: 502,
          error: message.slice(0, 120),
        }));
        sendError(res, 502, 'provider_error', 'No se pudo completar la solicitud de IA.');
      }
    };
  }

  async function handleChatMatch(req, res) {
    const endpoint = req.path;
    let inputChars = 0;
    try {
      const { matchData, question } = validateChatMatchBody(req.body);
      if (isDangerousChatQuestion(question)) {
        throwInvalidBody('La pregunta contiene contenido no permitido.');
      }

      const sanitizedData = sanitizeMatchData(matchData, { includeCoachNotes: false });
      sanitizedData.scoreContext = buildScoreContext(sanitizedData);
      inputChars = JSON.stringify(sanitizedData).length + question.length;

      if (inputChars > maxInputChars) {
        logger.info(formatLogEntry({
          endpoint,
          token: req.clientToken,
          userId: req.userId,
          ...getAuthLogFields(req),
          inputChars,
          ok: false,
          status: 413,
          error: 'payload_too_large',
        }));
        sendError(res, 413, 'payload_too_large', 'El input del partido supera el limite configurado.');
        return;
      }

      if (!hasEnoughMatchData(sanitizedData)) {
        logger.info(formatLogEntry({
          endpoint,
          token: req.clientToken,
          userId: req.userId,
          ...getAuthLogFields(req),
          inputChars,
          ok: false,
          status: 400,
          error: 'insufficient_match_data',
        }));
        sendError(res, 400, 'invalid_body', 'matchData no tiene datos deportivos suficientes.');
        return;
      }

      if (!isMatchScopedQuestion(question)) {
        const payload = {
          result: {
            answer: 'Solo podemos responder preguntas sobre nuestro partido y sus métricas.',
            usedMetrics: [],
            confidence: 0,
          },
          usage: {},
          model: geminiClient.model,
        };
        logger.info(formatLogEntry({
          endpoint,
          token: req.clientToken,
          userId: req.userId,
          ...getAuthLogFields(req),
          inputChars,
          ok: true,
          status: 200,
          usage: payload.usage,
        }));
        res.json(payload);
        return;
      }

      const { systemInstruction, prompt } = buildChatMatchPrompt(sanitizedData, question);
      const providerResult = await geminiClient.generateJson({
        task: 'chatMatch',
        systemInstruction,
        prompt,
        sanitizedData,
      });
      const payload = {
        result: normalizeChatMatchResult(normalizeAIResult(providerResult.result, 'chatMatch')),
        usage: providerResult.usage || {},
        model: providerResult.model || geminiClient.model,
      };
      logger.info(formatLogEntry({
        endpoint,
        token: req.clientToken,
        userId: req.userId,
        ...getAuthLogFields(req),
        inputChars,
        ok: true,
        status: 200,
        usage: payload.usage,
      }));
      res.json(payload);
    } catch (error) {
      if (error?.statusCode === 400) {
        logger.info(formatLogEntry({
          endpoint,
          token: req.clientToken,
          userId: req.userId,
          ...getAuthLogFields(req),
          inputChars,
          ok: false,
          status: 400,
          error: error.code || 'invalid_body',
        }));
        sendError(res, 400, error.code || 'invalid_body', error.message || 'Solicitud invalida.');
        return;
      }
      const message = error instanceof Error ? error.message : 'Error de IA.';
      logger.error(formatLogEntry({
        endpoint,
        token: req.clientToken,
        userId: req.userId,
        ...getAuthLogFields(req),
        inputChars,
        ok: false,
        status: 502,
        error: message.slice(0, 120),
      }));
      sendError(res, 502, 'provider_error', 'No se pudo completar la solicitud de IA.');
    }
  }

  app.post('/v1/ai/analyze-match', authenticate, rateLimit, handleAI('analyzeMatch'));
  app.post('/v1/ai/generate-summary', authenticate, rateLimit, handleAI('generateSummary'));
  app.post('/v1/ai/detect-patterns', authenticate, rateLimit, handleAI('detectPatterns'));
  app.post('/v1/ai/chat-match', authenticate, rateLimit, handleChatMatch);

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      sendError(res, 400, 'invalid_json', 'JSON invalido.');
      return;
    }
    if (error?.type === 'entity.too.large') {
      sendError(res, 413, 'payload_too_large', 'El body supera el limite permitido.');
      return;
    }
    sendError(res, 500, 'internal_error', 'Error interno del backend IA.');
  });

  return app;
}

module.exports = {
  createAIBackendApp,
  createRateLimiter,
  parseAllowedTokens,
};
