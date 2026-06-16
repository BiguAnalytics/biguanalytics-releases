// @ts-check

const PROMPT_VERSION = 'match-analysis-v2';
const DEFAULT_USAGE = {
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
};

const itemSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    detail: { type: 'string' },
    metricRef: { type: ['string', 'null'] },
  },
  required: ['title', 'detail', 'metricRef'],
};

const MATCH_ANALYSIS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    keyFindings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          severity: { type: 'string', enum: ['positive', 'warning', 'negative', 'neutral'] },
          metricRef: { type: ['string', 'null'] },
        },
        required: ['title', 'detail', 'severity', 'metricRef'],
      },
    },
    strengths: { type: 'array', items: itemSchema },
    weaknesses: { type: 'array', items: itemSchema },
    trainingRecommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'detail', 'priority'],
      },
    },
    dataQualityWarnings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['title', 'detail'],
      },
    },
    confidence: { type: 'number' },
  },
  required: [
    'summary',
    'keyFindings',
    'strengths',
    'weaknesses',
    'trainingRecommendations',
    'dataQualityWarnings',
    'confidence',
  ],
};

const CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    usedMetrics: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  },
  required: ['answer', 'usedMetrics', 'confidence'],
};

/**
 * @param {unknown} value
 * @returns {string}
 */
function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {unknown} value
 * @returns {Array<string>}
 */
function asStringArray(value) {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function asConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

/**
 * @param {unknown} item
 * @returns {{title: string, detail: string, evidence: Array<string>}}
 */
function normalizeEvidenceItem(item) {
  const source = item && typeof item === 'object' ? item : {};
  return {
    title: asString(source.title),
    detail: asString(source.detail),
    evidence: asStringArray(source.evidence),
  };
}

/**
 * @param {unknown} value
 * @returns {Array<{title: string, detail: string, evidence: Array<string>}>}
 */
function normalizeEvidenceList(value) {
  return Array.isArray(value)
    ? value.map(normalizeEvidenceItem).filter(item => item.title || item.detail || item.evidence.length > 0)
    : [];
}

/**
 * @param {unknown} value
 * @returns {Array<object>}
 */
function normalizeTurningPoints(value) {
  return Array.isArray(value)
    ? value.map((item) => {
      const source = item && typeof item === 'object' ? item : {};
      return {
        minute: source.minute === null ? null : asString(source.minute) || null,
        title: asString(source.title),
        detail: asString(source.detail),
        eventIds: asStringArray(source.eventIds),
      };
    }).filter(item => item.title || item.detail || item.eventIds.length > 0)
    : [];
}

/**
 * @param {unknown} value
 * @returns {Array<object>}
 */
function normalizeTrainingRecommendations(value) {
  const priorities = new Set(['high', 'medium', 'low']);
  return Array.isArray(value)
    ? value.map((item) => {
      const source = item && typeof item === 'object' ? item : {};
      const priority = priorities.has(asString(source.priority)) ? asString(source.priority) : 'medium';
      return {
        priority,
        area: asString(source.area),
        objective: asString(source.objective),
        drills: asStringArray(source.drills),
        reason: asString(source.reason),
        linkedWeaknesses: asStringArray(source.linkedWeaknesses),
      };
    }).filter(item => item.area || item.objective || item.reason || item.drills.length > 0)
    : [];
}

/**
 * @param {unknown} value
 * @returns {Array<object>}
 */
function normalizeAlerts(value) {
  return Array.isArray(value)
    ? value.map((item) => {
      const source = item && typeof item === 'object' ? item : {};
      const rawValue = typeof source.value === 'number' ? source.value : asString(source.value);
      return {
        metric: asString(source.metric),
        value: rawValue,
        interpretation: asString(source.interpretation),
      };
    }).filter(item => item.metric || item.interpretation)
    : [];
}

/**
 * @param {unknown} value
 * @returns {object|null}
 */
function extractJsonObject(value) {
  if (value && typeof value === 'object') return value;
  const text = asString(value);
  if (!text) return null;
  const candidates = [
    text,
    text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || '',
    text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {object}
 */
function normalizeMatchAnalysisResult(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const warnings = normalizeDataQualityWarnings(source.dataQualityWarnings);
  asStringArray(source.missing_data || source.missingData).forEach((detail) => {
    warnings.push({ title: 'Limitacion de datos', detail });
  });

  [
    ['summary', source.summary],
    ['keyFindings', source.keyFindings || source.key_findings],
    ['strengths', source.strengths],
    ['weaknesses', source.weaknesses],
    ['trainingRecommendations', source.trainingRecommendations || source.training_recommendations],
  ].forEach(([field, value]) => {
    const isMissing = Array.isArray(value) ? value.length === 0 : !asString(value);
    if (isMissing) {
      warnings.push({ title: 'Respuesta IA incompleta', detail: `Falta completar ${field}.` });
    }
  });

  return {
    summary: asString(source.summary),
    scoreContext: normalizeScoreContext(source.scoreContext),
    keyFindings: normalizeAnalysisItems(source.keyFindings || source.key_findings),
    strengths: normalizeAnalysisItems(source.strengths),
    weaknesses: normalizeAnalysisItems(source.weaknesses),
    trainingRecommendations: normalizeRecommendationItems(source.trainingRecommendations || source.training_recommendations),
    dataQualityWarnings: warnings,
    confidence: asConfidence(source.confidence),
  };
}

/**
 * @param {unknown} value
 * @returns {object|null}
 */
function normalizeScoreContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = asString(value.resultForBigua);
  const side = asString(value.biguaSide);
  return {
    localTeam: asString(value.localTeam),
    rivalTeam: asString(value.rivalTeam),
    biguaTeamName: asString(value.biguaTeamName),
    biguaSide: side === 'rival' ? 'rival' : 'local',
    localScore: Number.isFinite(Number(value.localScore)) ? Number(value.localScore) : 0,
    rivalScore: Number.isFinite(Number(value.rivalScore)) ? Number(value.rivalScore) : 0,
    biguaScore: Number.isFinite(Number(value.biguaScore)) ? Number(value.biguaScore) : 0,
    opponentScore: Number.isFinite(Number(value.opponentScore)) ? Number(value.opponentScore) : 0,
    winnerTeam: asString(value.winnerTeam),
    resultForBigua: result === 'loss' || result === 'draw' ? result : 'win',
    scoreLabel: asString(value.scoreLabel),
  };
}

/**
 * @param {unknown} item
 * @returns {{title: string, detail: string, metricRef: string|null}}
 */
function normalizeAnalysisItem(item) {
  const source = item && typeof item === 'object' ? item : {};
  const evidence = asStringArray(source.evidence);
  const title = asString(source.title || source.area || source.name);
  const detail = asString(source.detail || source.description || source.reason || source.objective || evidence.join(' '));
  const metricRef = asString(source.metricRef || source.metric || source.metric_ref || evidence[0] || '') || null;
  return { title, detail, metricRef };
}

/**
 * @param {unknown} value
 * @returns {Array<{title: string, detail: string, metricRef: string|null}>}
 */
function normalizeAnalysisItems(value) {
  return Array.isArray(value)
    ? value.map(normalizeAnalysisItem).filter(item => item.title || item.detail || item.metricRef)
    : [];
}

/**
 * @param {unknown} value
 * @returns {Array<{title: string, detail: string, priority: 'high'|'medium'|'low'}>}
 */
function normalizeRecommendationItems(value) {
  const priorities = new Set(['high', 'medium', 'low']);
  return Array.isArray(value)
    ? value.map((item) => {
      const source = item && typeof item === 'object' ? item : {};
      const drills = asStringArray(source.drills);
      const priority = priorities.has(asString(source.priority)) ? asString(source.priority) : 'medium';
      return {
        title: asString(source.title || source.area || source.objective),
        detail: asString(source.detail || source.reason || drills.join(' ')),
        priority: /** @type {'high'|'medium'|'low'} */ (priority),
      };
    }).filter(item => item.title || item.detail)
    : [];
}

/**
 * @param {unknown} value
 * @returns {Array<{title: string, detail: string}>}
 */
function normalizeDataQualityWarnings(value) {
  return Array.isArray(value)
    ? value.map((item) => {
      const source = item && typeof item === 'object' ? item : {};
      if (typeof item === 'string') return { title: 'Limitacion de datos', detail: asString(item) };
      return {
        title: asString(source.title || source.metric || 'Limitacion de datos'),
        detail: asString(source.detail || source.description || source.interpretation),
      };
    }).filter(item => item.title || item.detail)
    : [];
}

/**
 * @param {unknown} raw
 * @param {'match'|'season'|'match+season'} fallbackScope
 * @returns {{answer: string, scopeUsed: 'match'|'season'|'match+season', evidence: Array<string>, missingData: Array<string>, suggestedFollowUps: Array<string>}}
 */
function normalizeChatResult(raw, fallbackScope = 'season') {
  const source = raw && typeof raw === 'object' ? raw : {};
  const scopes = new Set(['match', 'season', 'match+season']);
  const scope = scopes.has(asString(source.scopeUsed)) ? asString(source.scopeUsed) : fallbackScope;
  const missingData = asStringArray(source.missingData);

  if (!asString(source.answer) && !missingData.includes('Respuesta IA incompleta: answer')) {
    missingData.push('Respuesta IA incompleta: answer');
  }

  return {
    answer: asString(source.answer),
    scopeUsed: /** @type {'match'|'season'|'match+season'} */ (scope),
    evidence: asStringArray(source.evidence),
    missingData,
    suggestedFollowUps: asStringArray(source.suggestedFollowUps),
  };
}

/**
 * @param {object|null|undefined} usageMetadata
 * @returns {{inputTokens: number|null, outputTokens: number|null, totalTokens: number|null}}
 */
function normalizeUsage(usageMetadata) {
  const usage = usageMetadata && typeof usageMetadata === 'object' ? usageMetadata : {};
  const inputTokens = Number(usage.promptTokenCount ?? usage.inputTokens);
  const outputTokens = Number(usage.candidatesTokenCount ?? usage.outputTokens);
  const totalTokens = Number(usage.totalTokenCount ?? usage.totalTokens);
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : null,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : null,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : null,
  };
}

module.exports = {
  CHAT_RESPONSE_SCHEMA,
  DEFAULT_USAGE,
  MATCH_ANALYSIS_RESPONSE_SCHEMA,
  PROMPT_VERSION,
  extractJsonObject,
  normalizeChatResult,
  normalizeMatchAnalysisResult,
  normalizeUsage,
};
