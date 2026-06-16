// @ts-check

/**
 * @param {unknown} value
 * @returns {Array<object>}
 */
function normalizeEvidenceItems(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => {
    if (typeof item === 'string') return { title: item.slice(0, 90), detail: item.slice(0, 280), evidence: [] };
    return {
      title: String(item?.title || item?.name || 'Hallazgo').slice(0, 90),
      detail: String(item?.detail || item?.description || '').slice(0, 500),
      evidence: Array.isArray(item?.evidence) ? item.evidence.map(entry => String(entry).slice(0, 180)).slice(0, 5) : [],
    };
  });
}

/**
 * @param {unknown} value
 * @returns {Array<object>}
 */
function normalizeAnalysisItems(value) {
  return normalizeEvidenceItems(value)
    .map(item => ({
      title: item.title,
      detail: item.detail,
      metricRef: item.metricRef || item.evidence?.[0] || null,
    }))
    .filter(item => item.title || item.detail || item.metricRef);
}

/**
 * @param {unknown} value
 * @returns {Array<object>}
 */
function normalizeKeyFindings(value) {
  const severities = new Set(['positive', 'warning', 'negative', 'neutral']);
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => {
    const normalized = normalizeAnalysisItems([item])[0] || { title: '', detail: '', metricRef: null };
    const severity = severities.has(String(item?.severity || '')) ? String(item.severity) : 'neutral';
    return { ...normalized, severity };
  }).filter(item => item.title || item.detail || item.metricRef);
}

/**
 * @param {unknown} value
 * @returns {Array<object>}
 */
function normalizeRecommendations(value) {
  const priorities = new Set(['high', 'medium', 'low']);
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => {
    const source = item && typeof item === 'object' ? item : {};
    if (typeof item === 'string') return { title: item.slice(0, 90), detail: item.slice(0, 500), priority: 'medium' };
    const priority = priorities.has(String(source.priority || '')) ? String(source.priority) : 'medium';
    return {
      title: String(source.title || source.area || source.objective || '').trim().slice(0, 90),
      detail: String(source.detail || source.reason || '').trim().slice(0, 500),
      priority,
    };
  }).filter(item => item.title || item.detail);
}

/**
 * @param {unknown} value
 * @returns {Array<object>}
 */
function normalizeWarnings(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => {
    if (typeof item === 'string') return { title: 'Limitacion de datos', detail: item.slice(0, 500) };
    return {
      title: String(item?.title || 'Limitacion de datos').trim().slice(0, 90),
      detail: String(item?.detail || item?.description || '').trim().slice(0, 500),
    };
  }).filter(item => item.title || item.detail);
}

/**
 * @param {unknown} value
 * @returns {Array<string>}
 */
function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item || '').trim()).filter(Boolean).slice(0, 8);
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
}

/**
 * @param {string} text
 * @returns {object|null}
 */
function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * @param {unknown} value
 * @param {'analyzeMatch'|'generateSummary'|'detectPatterns'|'chatMatch'} task
 * @returns {object}
 */
function normalizeAIResult(value, task) {
  const parsed = typeof value === 'string' ? extractJsonObject(value) : value;
  const input = parsed && typeof parsed === 'object' ? parsed : {};
  const missing = normalizeStringList(input.missing_data || input.missingData);
  const confidence = normalizeConfidence(input.confidence);

  if (task === 'chatMatch') {
    return {
      answer: String(input.answer || '').trim().slice(0, 1400),
      usedMetrics: normalizeStringList(input.usedMetrics || input.used_metrics),
      confidence,
    };
  }

  if (task === 'generateSummary') {
    return {
      summary: String(input.summary || '').slice(0, 1200),
      key_points: normalizeStringList(input.key_points || input.keyPoints),
      pdf_report_phrases: normalizeStringList(input.pdf_report_phrases || input.pdfReportPhrases),
      confidence,
      missing_data: missing,
    };
  }

  if (task === 'detectPatterns') {
    return {
      patterns: normalizeEvidenceItems(input.patterns),
      tactical_suggestions: normalizeStringList(input.tactical_suggestions || input.tacticalSuggestions),
      confidence,
      missing_data: missing,
    };
  }

  return {
    summary: String(input.summary || input.summary_general || '').slice(0, 1200),
    keyFindings: normalizeKeyFindings(input.keyFindings || input.key_findings),
    strengths: normalizeAnalysisItems(input.strengths),
    weaknesses: normalizeAnalysisItems(input.weaknesses),
    trainingRecommendations: normalizeRecommendations(input.trainingRecommendations || input.training_recommendations || input.tactical_suggestions),
    dataQualityWarnings: normalizeWarnings(input.dataQualityWarnings || input.data_quality_warnings),
    confidence,
    missingData: missing,
  };
}

module.exports = {
  extractJsonObject,
  normalizeAIResult,
};
