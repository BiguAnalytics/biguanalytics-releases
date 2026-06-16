// @ts-check
const { AI_MATCH_ANALYSIS_MODEL } = require('./aiConstants');
const { buildAIContext } = require('./aiContextBuilder');
const { createAIProvider } = require('./aiProvider');
const { validateAIRequestMatchId } = require('./aiReports');

const MATCH_ONLY_MESSAGE = 'Solo podemos responder preguntas sobre nuestro partido y sus metricas.';

/**
 * @param {unknown} question
 * @returns {string}
 */
function validateAIChatQuestion(question) {
  if (typeof question !== 'string') throw new Error('Pregunta IA invalida.');
  const trimmed = question.trim();
  if (!trimmed) throw new Error('La pregunta IA no puede estar vacia.');
  if (trimmed.length > 1000) throw new Error('La pregunta IA no puede superar 1000 caracteres.');
  return trimmed;
}

/**
 * @param {unknown} scope
 * @returns {'auto'|'match'|'season'}
 */
function validateAIChatScope(scope) {
  if (scope === undefined || scope === null || scope === '') return 'auto';
  if (scope === 'auto' || scope === 'match' || scope === 'season') return scope;
  throw new Error('Scope IA invalido.');
}

/**
 * @param {string} question
 * @returns {boolean}
 */
function questionNeedsSeason(question) {
  return /temporada|compar|anteriores|ultimos|ultimas|promedio|tendencia|rival|partidos guardados/i.test(question);
}

/**
 * @param {{matchId?: string, question: string, scope?: 'auto'|'match'|'season'}} input
 * @returns {'match'|'season'|'match+season'}
 */
function resolveAIChatScope(input) {
  if (input.scope === 'season') return 'season';
  if (input.scope === 'match') return input.matchId ? 'match' : 'season';
  if (!input.matchId) return 'season';
  return questionNeedsSeason(input.question) ? 'match+season' : 'match';
}

/**
 * @param {{now?: function(): string}} [options]
 */
function createAIChat(options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const provider = options.provider || createAIProvider();
  const buildContext = options.buildContext || buildAIContext;

  return {
    /**
     * @param {{matchId?: string}} [input]
     * @returns {Promise<{available: boolean, reason: string, hasApiKey: false}>}
     */
    async getStatus(input = {}) {
      const matchId = input.matchId === undefined || input.matchId === null || input.matchId === ''
        ? undefined
        : validateAIRequestMatchId(input.matchId);
      if (!matchId) {
        return {
          available: false,
          hasApiKey: false,
          reason: MATCH_ONLY_MESSAGE,
        };
      }
      return {
        available: true,
        hasApiKey: false,
        reason: 'Tenemos chat contextual disponible.',
      };
    },

    /**
     * @param {{matchId?: string, question: string, scope?: 'auto'|'match'|'season'}} input
     * @returns {Promise<object>}
     */
    async ask(input) {
      const question = validateAIChatQuestion(input?.question);
      const scope = validateAIChatScope(input?.scope);
      const matchId = input?.matchId === undefined || input?.matchId === null || input?.matchId === ''
        ? undefined
        : validateAIRequestMatchId(input.matchId);
      const scopeUsed = resolveAIChatScope({ matchId, question, scope });
      if (!matchId) {
        return {
          answer: MATCH_ONLY_MESSAGE,
          scopeUsed,
          usedMetrics: [],
          evidence: [],
          missingData: [],
          suggestedFollowUps: [],
          cached: false,
          model: provider.model || AI_MATCH_ANALYSIS_MODEL,
          generatedAt: now(),
          confidence: 0,
          usage: { inputTokens: null, outputTokens: null, totalTokens: null },
        };
      }
      const context = await buildContext(matchId);
      const response = await provider.chatMatch(context, question);
      const usedMetrics = Array.isArray(response?.result?.usedMetrics) ? response.result.usedMetrics : [];
      return {
        answer: response?.result?.answer || 'No tenemos datos suficientes para responder con precision sobre nuestro partido.',
        scopeUsed,
        usedMetrics,
        evidence: usedMetrics,
        missingData: [],
        suggestedFollowUps: [],
        cached: false,
        model: response?.model || provider.model || AI_MATCH_ANALYSIS_MODEL,
        generatedAt: now(),
        confidence: Number(response?.result?.confidence) || 0,
        usage: response?.usage || { inputTokens: null, outputTokens: null, totalTokens: null },
      };
    },
  };
}

const defaultChat = createAIChat();

module.exports = {
  MATCH_ONLY_MESSAGE,
  createAIChat,
  getAIChatStatus: (input) => defaultChat.getStatus(input),
  askAIChat: (input) => defaultChat.ask(input),
  resolveAIChatScope,
  validateAIChatQuestion,
  validateAIChatScope,
};
