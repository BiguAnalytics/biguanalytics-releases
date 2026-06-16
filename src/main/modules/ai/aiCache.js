// @ts-check
const fs = require('fs/promises');
const path = require('path');
const { getDataPath, validateMatchId } = require('../storage');
const { AI_MATCH_ANALYSIS_MODEL } = require('./aiConstants');
const { PROMPT_VERSION } = require('./aiSchemas');

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isNotFound(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'ENOENT');
}

/**
 * @param {string} basePath
 * @param {string} targetPath
 * @returns {boolean}
 */
function isPathInside(basePath, targetPath) {
  const relative = path.relative(basePath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * @param {string} value
 * @returns {string}
 */
function safeFilePart(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 80) || 'analysis';
}

/**
 * @param {object} analysis
 * @param {string} currentHash
 * @param {string} promptVersion
 * @param {string} model
 * @returns {'valid'|'stale'}
 */
function getAnalysisFreshness(analysis, currentHash, promptVersion, model) {
  const isFresh = analysis.version === 1
    && analysis.status === 'valid'
    && analysis.sourceHash === currentHash
    && analysis.promptVersion === promptVersion
    && analysis.model === model;
  return isFresh ? 'valid' : 'stale';
}

/**
 * @param {{dataPath?: string, promptVersion?: string, model?: string}} [options]
 */
function createAICache(options = {}) {
  const dataPath = path.resolve(options.dataPath || getDataPath());
  const promptVersion = options.promptVersion || PROMPT_VERSION;
  const model = options.model || AI_MATCH_ANALYSIS_MODEL;

  /**
   * @param {string} matchId
   * @returns {string}
   */
  function getMatchDir(matchId) {
    const safeMatchId = validateMatchId(matchId);
    const matchDir = path.resolve(dataPath, safeMatchId);
    if (!isPathInside(dataPath, matchDir)) throw new Error('matchId inválido.');
    return matchDir;
  }

  /**
   * @param {string} matchId
   * @returns {string}
   */
  function getAnalysisPath(matchId) {
    return path.resolve(getMatchDir(matchId), 'ai-analysis.json');
  }

  /**
   * @param {string} matchId
   * @returns {Promise<object>}
   */
  async function readAnalysis(matchId) {
    const content = await fs.readFile(getAnalysisPath(matchId), 'utf8');
    return JSON.parse(content);
  }

  /**
   * @param {string} matchId
   * @param {string} currentHash
   * @returns {Promise<object>}
   */
  async function getStatus(matchId, currentHash) {
    let analysis;
    try {
      analysis = await readAnalysis(matchId);
    } catch (error) {
      if (isNotFound(error)) {
        return {
          status: 'missing',
          hasAnalysis: false,
          currentHash,
        };
      }
      return {
        status: 'error',
        hasAnalysis: false,
        currentHash,
        error: 'Archivo de análisis IA inválido.',
      };
    }

    const status = getAnalysisFreshness(analysis, currentHash, promptVersion, model);
    return {
      status,
      hasAnalysis: true,
      generatedAt: analysis.generatedAt,
      model: analysis.model,
      sourceHash: analysis.sourceHash,
      currentHash,
      analysis,
    };
  }

  /**
   * @param {string} matchId
   * @param {object} entry
   * @param {{preserveHistory?: boolean}} [options]
   * @returns {Promise<object>}
   */
  async function saveAnalysis(matchId, entry, options = {}) {
    const matchDir = getMatchDir(matchId);
    const analysisPath = getAnalysisPath(matchId);
    await fs.mkdir(matchDir, { recursive: true });

    if (options.preserveHistory) {
      try {
        const current = await fs.readFile(analysisPath, 'utf8');
        const historyDir = path.join(matchDir, 'ai-analysis-history');
        await fs.mkdir(historyDir, { recursive: true });
        const suffix = `${safeFilePart(entry.generatedAt)}-${safeFilePart(entry.sourceHash).slice(0, 18)}`;
        await fs.writeFile(path.join(historyDir, `ai-analysis-${suffix}.json`), current, 'utf8');
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }

    const tmpPath = `${analysisPath}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(entry, null, 2), 'utf8');
    await fs.rename(tmpPath, analysisPath);
    return entry;
  }

  return {
    getAnalysisPath,
    getStatus,
    readAnalysis,
    saveAnalysis,
  };
}

module.exports = {
  createAICache,
};
