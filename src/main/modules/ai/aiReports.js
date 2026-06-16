// @ts-check
const { createAICache } = require('./aiCache');
const { buildAIContext, calculateAIContextHash } = require('./aiContextBuilder');
const { createAIProvider } = require('./aiProvider');
const { AI_GENERATED_BY, AI_MATCH_ANALYSIS_MODEL } = require('./aiConstants');
const { DEFAULT_USAGE, PROMPT_VERSION, normalizeMatchAnalysisResult, normalizeUsage } = require('./aiSchemas');
const { validateMatchId } = require('../storage');

/**
 * @param {unknown} matchId
 * @returns {string}
 */
function validateAIRequestMatchId(matchId) {
  try {
    return validateMatchId(matchId);
  } catch {
    throw new Error('matchId inválido.');
  }
}

/**
 * @param {object} cacheStatus
 * @returns {object}
 */
function toPublicStatus(cacheStatus) {
  return {
    status: cacheStatus.status,
    hasAnalysis: Boolean(cacheStatus.hasAnalysis),
    generatedAt: cacheStatus.generatedAt,
    model: cacheStatus.model,
    sourceHash: cacheStatus.sourceHash,
    currentHash: cacheStatus.currentHash,
    error: cacheStatus.error,
  };
}

/**
 * @param {object} analysis
 * @param {string} status
 * @param {string} currentHash
 * @param {string} [message]
 * @returns {object}
 */
function toPublicAnalysis(analysis, status, currentHash, message) {
  return {
    status,
    hasAnalysis: true,
    generatedAt: analysis.generatedAt,
    model: analysis.model,
    sourceHash: analysis.sourceHash,
    currentHash,
    analysis,
    result: analysis.result,
    usage: analysis.usage || DEFAULT_USAGE,
    message,
  };
}

/**
 * @param {string} matchId
 * @param {string} sourceHash
 * @param {{result: object, usage?: object}} providerResult
 * @param {string} generatedAt
 * @param {string} model
 * @param {object} [context]
 * @returns {object}
 */
function buildCacheEntry(matchId, sourceHash, providerResult, generatedAt, model, context = {}) {
  const result = normalizeMatchAnalysisResult(providerResult.result);
  if (!result.scoreContext && context.scoreContext) {
    result.scoreContext = context.scoreContext;
  }
  return {
    version: 1,
    matchId,
    status: 'valid',
    sourceHash,
    promptVersion: PROMPT_VERSION,
    model,
    generatedAt,
    generatedBy: AI_GENERATED_BY,
    result,
    usage: normalizeUsage(providerResult.usage),
  };
}

/**
 * @param {{
 *   cache?: ReturnType<typeof createAICache>,
 *   provider?: {model?: string, generateMatchAnalysis: function(object): Promise<object>},
 *   buildContext?: function(string): Promise<object>,
 *   now?: function(): string,
 * }} [options]
 */
function createAIReports(options = {}) {
  const cache = options.cache || createAICache();
  const provider = options.provider || createAIProvider();
  const buildContext = options.buildContext || buildAIContext;
  const now = options.now || (() => new Date().toISOString());
  const model = provider.model || AI_MATCH_ANALYSIS_MODEL;

  async function getContextAndStatus(matchId) {
    const validMatchId = validateAIRequestMatchId(matchId);
    const context = await buildContext(validMatchId);
    const currentHash = calculateAIContextHash(context);
    const status = await cache.getStatus(validMatchId, currentHash);
    return { matchId: validMatchId, context, currentHash, status };
  }

  return {
    async getMatchAnalysisStatus(matchId) {
      const { status } = await getContextAndStatus(matchId);
      return toPublicStatus(status);
    },

    async getMatchAnalysis(matchId) {
      const { status, currentHash } = await getContextAndStatus(matchId);
      if (status.hasAnalysis && status.analysis) {
        const message = status.status === 'stale'
          ? 'Los hitos, eventos, notas, metadatos o métricas cambiaron desde el último análisis.'
          : undefined;
        return toPublicAnalysis(status.analysis, status.status, currentHash, message);
      }
      return toPublicStatus(status);
    },

    async generateMatchAnalysis(matchId) {
      const { matchId: validMatchId, context, currentHash, status } = await getContextAndStatus(matchId);
      const providerResult = await provider.generateMatchAnalysis(context);
      const entry = buildCacheEntry(validMatchId, currentHash, providerResult, now(), model, context);
      const replaceExisting = status.hasAnalysis === true || status.status === 'error';
      await cache.saveAnalysis(validMatchId, entry, { preserveHistory: replaceExisting });
      return toPublicAnalysis(entry, 'valid', currentHash, replaceExisting ? 'Análisis regenerado.' : 'Análisis generado.');
    },

    async regenerateMatchAnalysis(matchId, options = {}) {
      if (options.confirm !== true) {
        throw new Error('regenerateMatchAnalysis requiere confirm: true.');
      }
      const validMatchId = validateAIRequestMatchId(matchId);
      const context = await buildContext(validMatchId);
      const currentHash = calculateAIContextHash(context);
      const providerResult = await provider.generateMatchAnalysis(context);
      const entry = buildCacheEntry(validMatchId, currentHash, providerResult, now(), model, context);
      await cache.saveAnalysis(validMatchId, entry, { preserveHistory: true });
      return toPublicAnalysis(entry, 'valid', currentHash, 'Análisis regenerado.');
    },
  };
}

const defaultReports = createAIReports();

module.exports = {
  createAIReports,
  validateAIRequestMatchId,
  getMatchAnalysisStatus: (matchId) => defaultReports.getMatchAnalysisStatus(matchId),
  getMatchAnalysis: (matchId) => defaultReports.getMatchAnalysis(matchId),
  generateMatchAnalysis: (matchId) => defaultReports.generateMatchAnalysis(matchId),
  regenerateMatchAnalysis: (matchId, options) => defaultReports.regenerateMatchAnalysis(matchId, options),
};
