// @ts-check

const GENERIC_TITLES = new Set(['hallazgo', 'sin titulo', 'area']);
const PRIORITIES = new Set(['high', 'medium', 'low']);

/**
 * @param {unknown} value
 * @returns {string}
 */
function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function confidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.55;
  return Math.max(0, Math.min(1, numeric));
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * @param {unknown} value
 * @returns {Array<string>}
 */
function asStringArray(value) {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

/**
 * @param {unknown} item
 * @returns {{title: string, detail: string, metricRef: string|null}}
 */
function normalizeAnalysisItem(item) {
  if (typeof item === 'string') {
    return { title: item.slice(0, 90), detail: item.slice(0, 500), metricRef: null };
  }
  const source = item && typeof item === 'object' ? item : {};
  const evidence = asStringArray(source.evidence);
  const title = asString(source.title || source.name || source.area);
  const detail = asString(source.detail || source.description || source.reason || source.objective || evidence.join(' '));
  const metricRef = asString(source.metricRef || source.metric || source.metric_ref || evidence[0] || '') || null;
  return { title: title.slice(0, 90), detail: detail.slice(0, 700), metricRef };
}

/**
 * @param {unknown} value
 * @returns {Array<{title: string, detail: string, metricRef: string|null}>}
 */
function normalizeAnalysisItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map(normalizeAnalysisItem)
    .filter(item => (item.title || item.detail) && !GENERIC_TITLES.has(normalizeText(item.title)) && item.detail);
}

/**
 * @param {unknown} value
 * @returns {Array<{title: string, detail: string, priority: 'high'|'medium'|'low'}>}
 */
function normalizeRecommendations(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map((item) => {
      if (typeof item === 'string') return { title: item.slice(0, 90), detail: item.slice(0, 700), priority: 'medium' };
      const source = item && typeof item === 'object' ? item : {};
      const drills = asStringArray(source.drills);
      const priority = PRIORITIES.has(asString(source.priority)) ? asString(source.priority) : 'medium';
      return {
        title: asString(source.title || source.area || source.objective).slice(0, 90),
        detail: asString(source.detail || source.reason || drills.join(' ')).slice(0, 700),
        priority: /** @type {'high'|'medium'|'low'} */ (priority),
      };
    })
    .filter(item => (item.title || item.detail) && item.detail);
}

/**
 * @param {unknown} value
 * @returns {Array<{title: string, detail: string}>}
 */
function normalizeWarnings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map((item) => {
      if (typeof item === 'string') return { title: 'Limitacion de datos', detail: item.slice(0, 500) };
      const source = item && typeof item === 'object' ? item : {};
      return {
        title: asString(source.title || 'Limitacion de datos').slice(0, 90),
        detail: asString(source.detail || source.description || source.interpretation).slice(0, 500),
      };
    })
    .filter(item => item.title || item.detail);
}

/**
 * @param {object} context
 * @returns {Array<{title: string, detail: string}>}
 */
function buildDataQualityWarnings(context) {
  const warnings = normalizeWarnings(context.dataQualityWarnings);
  asStringArray(context.missingDataHints).forEach((detail) => {
    warnings.push({ title: 'Datos incompletos', detail });
  });
  const events = Array.isArray(context.events) ? context.events : [];
  if (events.length < 3) {
    warnings.push({
      title: 'Muestra reducida',
      detail: 'Hay pocos eventos taggeados; el analisis prioriza marcador y metricas disponibles.',
    });
  }
  return dedupeWarnings(warnings);
}

/**
 * @param {Array<{title: string, detail: string}>} warnings
 * @returns {Array<{title: string, detail: string}>}
 */
function dedupeWarnings(warnings) {
  const seen = new Set();
  return warnings.filter((warning) => {
    const key = normalizeText(`${warning.title}|${warning.detail}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {object} context
 * @param {string} metric
 * @returns {object|null}
 */
function findAlert(context, metric) {
  const normalizedMetric = normalizeText(metric);
  return (Array.isArray(context.alerts) ? context.alerts : []).find(alert => normalizeText(alert?.metrica).includes(normalizedMetric)) || null;
}

/**
 * @param {object} context
 * @returns {{ruckWinPctMin: number, penaltiesMax: number, lineoutWinPctMin: number, scrumWinPctMin: number, breakLinesConcededMax: number}}
 */
function getThresholds(context) {
  return {
    ruckWinPctMin: Number(context.thresholds?.ruckWinPctMin) || 50,
    penaltiesMax: Number(context.thresholds?.penaltiesMax) || 15,
    lineoutWinPctMin: Number(context.thresholds?.lineoutWinPctMin) || 40,
    scrumWinPctMin: Number(context.thresholds?.scrumWinPctMin) || 50,
    breakLinesConcededMax: Number(context.thresholds?.breakLinesConcededMax) || 5,
  };
}

/**
 * @param {object} context
 * @param {string} path
 * @returns {number|null}
 */
function metric(context, path) {
  const value = path.split('.').reduce((current, key) => current?.[key], context.stats || {});
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * @param {object} context
 * @returns {Array<{title: string, detail: string, metricRef: string|null}>}
 */
function buildStrengths(context) {
  const score = context.scoreContext || {};
  const side = score.biguaSide === 'rival' ? 'away' : 'home';
  const thresholds = getThresholds(context);
  const strengths = [];
  const ruckPct = metric(context, `rucks.${side}.wonPct`);
  const lineoutPct = metric(context, `setPieces.lineouts.${side}.wonPct`);
  const scrumPct = metric(context, `setPieces.scrums.${side}.wonPct`);
  const penalties = metric(context, `discipline.${side}.penalties.total`);
  const breakLines = metric(context, `breakLines.${side}.total`);

  if (ruckPct !== null && ruckPct >= thresholds.ruckWinPctMin) {
    strengths.push({
      title: 'Efectividad positiva en rucks',
      detail: `Bigua sostuvo ${ruckPct}% de rucks ganados, por encima del umbral de ${thresholds.ruckWinPctMin}%.`,
      metricRef: `rucks.${side}.wonPct`,
    });
  }
  if (lineoutPct !== null && lineoutPct >= thresholds.lineoutWinPctMin) {
    strengths.push({
      title: 'Line outs confiables',
      detail: `La obtencion en line out llego a ${lineoutPct}%, una base util para sostener posesion y territorio.`,
      metricRef: `setPieces.lineouts.${side}.wonPct`,
    });
  }
  if (scrumPct !== null && scrumPct >= thresholds.scrumWinPctMin) {
    strengths.push({
      title: 'Scrum estable',
      detail: `El scrum registro ${scrumPct}% de obtencion, sin activar alerta del umbral configurado.`,
      metricRef: `setPieces.scrums.${side}.wonPct`,
    });
  }
  if (penalties !== null && penalties <= thresholds.penaltiesMax) {
    strengths.push({
      title: 'Disciplina controlada',
      detail: `Bigua cometio ${penalties} penales, dentro del maximo configurado de ${thresholds.penaltiesMax}.`,
      metricRef: `discipline.${side}.penalties.total`,
    });
  }
  if (breakLines !== null && breakLines > 0) {
    strengths.push({
      title: 'Capacidad de quebrar la linea',
      detail: `Bigua genero ${breakLines} break lines, indicador positivo de avance ofensivo.`,
      metricRef: `breakLines.${side}.total`,
    });
  }
  if (strengths.length === 0) {
    strengths.push({
      title: score.resultForBigua === 'win' ? 'Gestion del resultado' : 'Base de revision disponible',
      detail: score.resultForBigua === 'win'
        ? `Bigua cerro el marcador a favor (${score.scoreLabel || 'score validado'}).`
        : 'El registro disponible permite identificar prioridades concretas para el proximo bloque de trabajo.',
      metricRef: 'scoreContext',
    });
  }
  return strengths.slice(0, 4);
}

/**
 * @param {object} context
 * @returns {Array<{title: string, detail: string, metricRef: string|null}>}
 */
function buildWeaknesses(context) {
  const score = context.scoreContext || {};
  const side = score.biguaSide === 'rival' ? 'away' : 'home';
  const thresholds = getThresholds(context);
  const weaknesses = [];
  const ruckAlert = findAlert(context, 'rucks');
  const penaltiesAlert = findAlert(context, 'penales');
  const lineoutAlert = findAlert(context, 'line outs');
  const scrumAlert = findAlert(context, 'scrums');
  const breakLinesAlert = findAlert(context, 'break lines concedidas');

  if (ruckAlert) weaknesses.push({
    title: 'Efectividad baja en rucks',
    detail: `Bigua quedo en ${ruckAlert.valor}% de rucks ganados contra un umbral de ${ruckAlert.umbral}%.`,
    metricRef: `rucks.${side}.wonPct`,
  });
  if (penaltiesAlert) weaknesses.push({
    title: 'Alta cantidad de penales',
    detail: `Bigua registro ${penaltiesAlert.valor} penales, por encima del umbral de ${penaltiesAlert.umbral}.`,
    metricRef: `discipline.${side}.penalties.total`,
  });
  if (lineoutAlert) weaknesses.push({
    title: 'Baja obtencion en line out',
    detail: `El line out quedo en ${lineoutAlert.valor}% contra un umbral de ${lineoutAlert.umbral}%.`,
    metricRef: `setPieces.lineouts.${side}.wonPct`,
  });
  if (scrumAlert) weaknesses.push({
    title: 'Scrum por debajo del umbral',
    detail: `El scrum quedo en ${scrumAlert.valor}% de obtencion contra un umbral de ${scrumAlert.umbral}%.`,
    metricRef: `setPieces.scrums.${side}.wonPct`,
  });
  if (breakLinesAlert) weaknesses.push({
    title: 'Break lines concedidas',
    detail: `El rival genero ${breakLinesAlert.valor} break lines, por encima del maximo de ${breakLinesAlert.umbral}.`,
    metricRef: `breakLines.${side === 'home' ? 'away' : 'home'}.total`,
  });
  if (weaknesses.length === 0) {
    weaknesses.push({
      title: 'Aspectos a monitorear',
      detail: 'No se activaron alertas criticas con los umbrales actuales; conviene revisar video y contexto cualitativo antes de cerrar conclusiones.',
      metricRef: 'alerts',
    });
  }
  return weaknesses.slice(0, 5);
}

/**
 * @param {Array<{title: string, detail: string, metricRef: string|null}>} weaknesses
 * @returns {Array<{title: string, detail: string, priority: 'high'|'medium'|'low'}>}
 */
function buildRecommendations(weaknesses) {
  const recommendations = weaknesses.map((weakness) => {
    const title = normalizeText(weakness.title);
    if (title.includes('ruck')) {
      return {
        title: 'Mejorar limpieza y conservacion',
        detail: 'Trabajar limpieza y conservacion en punto de contacto con foco en segundo apoyo, altura corporal y velocidad de llegada.',
        priority: 'high',
      };
    }
    if (title.includes('penal')) {
      return {
        title: 'Reducir penales evitables',
        detail: 'Entrenar disciplina defensiva y toma de decisiones en breakdown, especialmente entrada por gate y liberacion del tackleador.',
        priority: 'high',
      };
    }
    if (title.includes('line')) {
      return {
        title: 'Reforzar line out',
        detail: 'Reforzar timing de salto, lanzamiento y comunicacion para estabilizar obtencion propia.',
        priority: 'medium',
      };
    }
    if (title.includes('scrum')) {
      return {
        title: 'Estabilizar scrum',
        detail: 'Revisar postura, entrada y coordinacion de empuje para recuperar calidad de obtencion.',
        priority: 'medium',
      };
    }
    if (title.includes('break')) {
      return {
        title: 'Cerrar canales defensivos',
        detail: 'Entrenar spacing defensivo, subida coordinada y comunicacion de interno/externo para reducir quiebres rivales.',
        priority: 'medium',
      };
    }
    return {
      title: 'Validar foco con video',
      detail: 'Usar revision de clips para separar problemas sistemicos de situaciones aisladas antes del siguiente microciclo.',
      priority: 'low',
    };
  });

  return recommendations.length > 0 ? recommendations.slice(0, 5) : [{
    title: 'Validar foco con video',
    detail: 'Usar revision de clips para confirmar prioridades tecnicas antes del siguiente entrenamiento.',
    priority: 'low',
  }];
}

/**
 * @param {object} context
 * @returns {object}
 */
function buildDeterministicAnalysisFallback(context = {}) {
  const score = context.scoreContext || {};
  const resultText = score.resultForBigua === 'win'
    ? 'gano'
    : score.resultForBigua === 'loss'
      ? 'perdio'
      : 'empato';
  const strengths = buildStrengths(context);
  const weaknesses = buildWeaknesses(context);
  const trainingRecommendations = buildRecommendations(weaknesses);
  const dataQualityWarnings = buildDataQualityWarnings(context);
  const scoreLabel = score.scoreLabel || `${score.biguaTeamName || 'Bigua'} ${score.biguaScore ?? 0} - ${score.opponentScore ?? 0}`;
  const keyFindings = [
    {
      title: 'Resultado validado',
      detail: `Bigua ${resultText} el partido ${scoreLabel}. Este marcador fue calculado de forma deterministica y no por la IA.`,
      severity: score.resultForBigua === 'win' ? 'positive' : score.resultForBigua === 'loss' ? 'negative' : 'neutral',
      metricRef: 'scoreContext',
    },
    {
      title: strengths[0].title,
      detail: strengths[0].detail,
      severity: 'positive',
      metricRef: strengths[0].metricRef,
    },
    {
      title: weaknesses[0].title,
      detail: weaknesses[0].detail,
      severity: weaknesses[0].metricRef === 'alerts' ? 'neutral' : 'warning',
      metricRef: weaknesses[0].metricRef,
    },
  ];

  return {
    summary: `Bigua ${resultText} el partido ${scoreLabel}. El analisis se basa en marcador deterministico, metricas calculadas y alertas configuradas.`,
    scoreContext: score,
    keyFindings,
    strengths,
    weaknesses,
    trainingRecommendations,
    dataQualityWarnings,
    confidence: dataQualityWarnings.length > 0 ? 0.58 : 0.72,
  };
}

/**
 * @param {object} result
 * @returns {string}
 */
function collectAnalysisText(result) {
  return [
    result.summary,
    ...(result.keyFindings || []).flatMap(item => [item.title, item.detail]),
    ...(result.strengths || []).flatMap(item => [item.title, item.detail]),
    ...(result.weaknesses || []).flatMap(item => [item.title, item.detail]),
    ...(result.trainingRecommendations || []).flatMap(item => [item.title, item.detail]),
  ].map(asString).join(' ');
}

/**
 * @param {object} result
 * @param {object} scoreContext
 * @returns {boolean}
 */
function contradictsScoreContext(result, scoreContext = {}) {
  const text = normalizeText(collectAnalysisText(result));
  if (!text) return false;
  if (scoreContext.resultForBigua === 'win') {
    return /bigua perdio|derrota de bigua|perdio el partido/.test(text);
  }
  if (scoreContext.resultForBigua === 'loss') {
    return /bigua gano|victoria de bigua|gano el partido/.test(text);
  }
  return false;
}

/**
 * @param {unknown} raw
 * @param {object} context
 * @param {{fallbackOnContradiction?: boolean}} [options]
 * @returns {{result: object, hasContradiction: boolean, usedFallback: boolean}}
 */
function finalizeAnalysisResult(raw, context = {}, options = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const fallback = buildDeterministicAnalysisFallback(context);
  const result = {
    summary: asString(source.summary).slice(0, 1200),
    scoreContext: context.scoreContext,
    keyFindings: normalizeKeyFindings(source.keyFindings || source.key_findings),
    strengths: normalizeAnalysisItems(source.strengths),
    weaknesses: normalizeAnalysisItems(source.weaknesses),
    trainingRecommendations: normalizeRecommendations(source.trainingRecommendations || source.training_recommendations || source.tactical_suggestions),
    dataQualityWarnings: dedupeWarnings([
      ...normalizeWarnings(source.dataQualityWarnings || source.data_quality_warnings),
      ...buildDataQualityWarnings(context),
    ]),
    confidence: confidence(source.confidence),
  };
  const hasContradiction = contradictsScoreContext(result, context.scoreContext);
  if (hasContradiction && options.fallbackOnContradiction) {
    return { result: fallback, hasContradiction, usedFallback: true };
  }

  if (!result.summary) result.summary = fallback.summary;
  if (result.keyFindings.length < 3) {
    result.keyFindings = mergeItems(result.keyFindings, fallback.keyFindings, 3);
  }
  if (result.strengths.length < 1) result.strengths = fallback.strengths;
  if (result.weaknesses.length < 1) result.weaknesses = fallback.weaknesses;
  if (result.trainingRecommendations.length < 1) result.trainingRecommendations = fallback.trainingRecommendations;
  if (contradictsScoreContext(result, context.scoreContext) && options.fallbackOnContradiction) {
    return { result: fallback, hasContradiction: true, usedFallback: true };
  }
  return { result, hasContradiction, usedFallback: false };
}

/**
 * @param {unknown} value
 * @returns {Array<{title: string, detail: string, severity: string, metricRef: string|null}>}
 */
function normalizeKeyFindings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map((item) => {
      const normalized = normalizeAnalysisItem(item);
      const source = item && typeof item === 'object' ? item : {};
      const severity = ['positive', 'warning', 'negative', 'neutral'].includes(asString(source.severity))
        ? asString(source.severity)
        : 'neutral';
      return { ...normalized, severity };
    })
    .filter(item => (item.title || item.detail) && !GENERIC_TITLES.has(normalizeText(item.title)) && item.detail);
}

/**
 * @param {Array<object>} primary
 * @param {Array<object>} fallback
 * @param {number} min
 * @returns {Array<object>}
 */
function mergeItems(primary, fallback, min) {
  const merged = [...primary];
  fallback.forEach((item) => {
    if (merged.length >= min) return;
    const exists = merged.some(entry => normalizeText(entry.title) === normalizeText(item.title));
    if (!exists) merged.push(item);
  });
  return merged;
}

module.exports = {
  buildDeterministicAnalysisFallback,
  contradictsScoreContext,
  finalizeAnalysisResult,
};
