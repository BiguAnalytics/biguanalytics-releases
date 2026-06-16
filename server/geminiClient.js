// @ts-check
const { extractJsonObject, normalizeAIResult } = require('./responseNormalizer');

const AI_MATCH_ANALYSIS_MODEL = 'gemini-2.5-flash-lite';

/**
 * @param {unknown} response
 * @returns {string}
 */
function extractResponseText(response) {
  if (typeof response?.text === 'string') return response.text;
  if (typeof response?.text === 'function') return String(response.text());
  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map(part => typeof part.text === 'string' ? part.text : '').join('\n');
  }
  return '';
}

/**
 * @param {unknown} usage
 * @returns {{inputTokens: number|null, outputTokens: number|null, totalTokens: number|null}}
 */
function normalizeUsage(usage) {
  return {
    inputTokens: Number.isFinite(Number(usage?.promptTokenCount)) ? Number(usage.promptTokenCount) : null,
    outputTokens: Number.isFinite(Number(usage?.candidatesTokenCount)) ? Number(usage.candidatesTokenCount) : null,
    totalTokens: Number.isFinite(Number(usage?.totalTokenCount)) ? Number(usage.totalTokenCount) : null,
  };
}

/**
 * @param {{apiKey?: string, model?: string, genAIClass?: unknown}} [options]
 */
function createGeminiClient(options = {}) {
  const model = options.model || AI_MATCH_ANALYSIS_MODEL;

  async function getGoogleGenAI() {
    if (options.genAIClass) return options.genAIClass;
    const module = await import('@google/genai');
    return module.GoogleGenAI;
  }

  return {
    model,

    /**
     * @param {{
     *   task: 'analyzeMatch'|'generateSummary'|'detectPatterns'|'chatMatch',
     *   systemInstruction: string,
     *   prompt: string,
     * }} request
     * @returns {Promise<{result: object, usage: object, model: string}>}
     */
    async generateJson(request) {
      const apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
      if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on the backend server.');

      const GoogleGenAI = await getGoogleGenAI();
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents: request.prompt,
        config: {
          systemInstruction: request.systemInstruction,
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      });
      const text = extractResponseText(response);
      const parsed = extractJsonObject(text);
      if (!parsed) throw new Error('Gemini returned invalid JSON.');

      return {
        result: normalizeAIResult(parsed, request.task),
        usage: normalizeUsage(response?.usageMetadata),
        model,
      };
    },
  };
}

module.exports = {
  AI_MATCH_ANALYSIS_MODEL,
  createGeminiClient,
  extractResponseText,
  normalizeUsage,
};
