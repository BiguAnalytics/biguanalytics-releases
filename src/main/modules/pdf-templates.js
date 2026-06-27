// @ts-check
const fs = require('fs/promises');
const path = require('path');
const electron = require('electron');
const { v4: uuidv4 } = require('uuid');
const { getSettings, updateSettings } = require('./settings');

const app = electron.app || electron.default?.app || (process.env.VITEST ? { getPath: () => path.join(process.cwd(), '.vitest-user-data') } : undefined);

const SYSTEM_TEMPLATE_ID = 'system-default';
const TEMPLATE_VERSION = 1;
const GRID_COLUMNS = 12;
const GRID_ROWS = {
  landscape: 24,
  portrait: 32,
};
const BLOCK_TYPES = [
  'score',
  'match-header',
  'kpi-row',
  'possession-chart',
  'set-pieces-chart',
  'rucks-chart',
  'penalties-chart',
  'break-lines-chart',
  'kicks-chart',
  'bip-sequences-chart',
  'heatmap',
  'ai-summary',
  'ai-key-findings',
  'ai-strengths',
  'ai-weaknesses',
  'ai-training-recommendations',
  'coach-notes',
  'events-table',
  'section-title',
  'text-block',
];

const DEFAULT_PDF_TEMPLATE = Object.freeze({
  id: SYSTEM_TEMPLATE_ID,
  name: 'Default BiguAnalytics',
  version: TEMPLATE_VERSION,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  pageSize: 'A4',
  orientation: 'landscape',
  pages: [
    {
      id: 'page-cover',
      title: 'Resumen',
      blocks: [
        { id: 'match-header', type: 'match-header', x: 0, y: 0, w: 12, h: 12 },
        { id: 'score', type: 'score', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-general',
      title: 'Generales',
      blocks: [
        { id: 'kpis', type: 'kpi-row', x: 0, y: 0, w: 12, h: 8 },
        { id: 'possession', type: 'possession-chart', x: 0, y: 8, w: 12, h: 16 },
      ],
    },
    {
      id: 'page-discipline-rucks',
      title: 'Disciplina y rucks',
      blocks: [
        { id: 'penalties', type: 'penalties-chart', x: 0, y: 0, w: 12, h: 12 },
        { id: 'rucks', type: 'rucks-chart', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-set-pieces-kicks',
      title: 'Formaciones y salidas',
      blocks: [
        { id: 'set-pieces', type: 'set-pieces-chart', x: 0, y: 0, w: 12, h: 12 },
        { id: 'kicks', type: 'kicks-chart', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-break-lines',
      title: 'Quiebres y secuencias',
      blocks: [
        { id: 'break-lines', type: 'break-lines-chart', x: 0, y: 0, w: 12, h: 12 },
        { id: 'bip', type: 'bip-sequences-chart', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-field-events',
      title: 'Campo y eventos',
      blocks: [
        { id: 'heatmap', type: 'heatmap', x: 0, y: 0, w: 12, h: 12 },
        { id: 'events-table', type: 'events-table', x: 0, y: 12, w: 12, h: 12, settings: { maxRows: 12 } },
      ],
    },
    {
      id: 'page-notes-summary',
      title: 'Notas y resumen',
      blocks: [
        { id: 'coach-notes', type: 'coach-notes', x: 0, y: 0, w: 12, h: 12 },
        { id: 'ai-summary', type: 'ai-summary', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-ai',
      title: 'Analisis IA',
      blocks: [
        { id: 'ai-key-findings', type: 'ai-key-findings', x: 0, y: 0, w: 12, h: 12 },
        { id: 'ai-strengths', type: 'ai-strengths', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-ai-action',
      title: 'Correcciones',
      blocks: [
        { id: 'ai-weaknesses', type: 'ai-weaknesses', x: 0, y: 0, w: 12, h: 12 },
        { id: 'ai-training', type: 'ai-training-recommendations', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-action-plan',
      title: 'Plan de accion',
      blocks: [
        { id: 'section-title', type: 'section-title', x: 0, y: 0, w: 12, h: 12, settings: { text: 'Plan de accion' } },
        {
          id: 'report-focus',
          type: 'text-block',
          x: 0,
          y: 12,
          w: 12,
          h: 12,
          settings: {
            title: 'Foco del informe',
            text: 'Resumen operativo para revisar rendimiento, disciplina, territorio y oportunidades de entrenamiento.',
          },
        },
      ],
    },
  ],
});

const SENSITIVE_KEY_RE = /(api[-_]?key|apikey|authorization|bearer|cookie|gemini|password|refresh[-_]?token|service[-_]?role|session|secret|supabase|token)/i;

/**
 * @returns {string}
 */
function getDefaultTemplatesPath() {
  if (!app?.getPath) return path.join(process.cwd(), '.vitest-user-data', 'pdf-templates');
  return path.join(app.getPath('userData'), 'pdf-templates');
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeId(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 100) || uuidv4();
}

/**
 * @param {unknown} value
 * @param {string} fallback
 * @param {number} max
 * @returns {string}
 */
function normalizeText(value, fallback, max = 120) {
  const text = String(value || '').trim().slice(0, max);
  return text || fallback;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizeGridNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function sanitizeSettingsValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeSettingsValue);
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).reduce((next, [key, item]) => {
    if (SENSITIVE_KEY_RE.test(key)) return next;
    next[key] = sanitizeSettingsValue(item);
    return next;
  }, {});
}

/**
 * @param {object} block
 * @param {number} index
 * @returns {object}
 */
function normalizeBlock(block = {}, index = 0) {
  const type = BLOCK_TYPES.includes(String(block.type || '')) ? String(block.type) : String(block.type || '');
  return {
    id: sanitizeId(block.id || `block-${index + 1}`),
    type,
    x: normalizeGridNumber(block.x, 0),
    y: normalizeGridNumber(block.y, 0),
    w: normalizeGridNumber(block.w, 3),
    h: normalizeGridNumber(block.h, 3),
    ...(block.settings && typeof block.settings === 'object'
      ? { settings: sanitizeSettingsValue(block.settings) }
      : {}),
  };
}

/**
 * @param {object} page
 * @param {number} index
 * @returns {object}
 */
function normalizePage(page = {}, index = 0) {
  return {
    id: sanitizeId(page.id || `page-${index + 1}`),
    title: normalizeText(page.title, `Pagina ${index + 1}`, 80),
    blocks: Array.isArray(page.blocks) ? page.blocks.map(normalizeBlock) : [],
  };
}

/**
 * @param {object} template
 * @param {{base?: object, now?: string, id?: string}} [options]
 * @returns {object}
 */
function sanitizeTemplateForStorage(template = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const base = options.base || {};
  const orientation = template.orientation === 'portrait' ? 'portrait' : 'landscape';
  const pages = Array.isArray(template.pages) && template.pages.length > 0
    ? template.pages.map(normalizePage)
    : [{ id: 'page-1', title: 'Pagina 1', blocks: [] }];
  return {
    id: sanitizeId(options.id || template.id || base.id || uuidv4()),
    name: normalizeText(template.name || base.name, 'Nueva plantilla PDF', 80),
    version: TEMPLATE_VERSION,
    createdAt: template.createdAt || base.createdAt || now,
    updatedAt: now,
    pageSize: 'A4',
    orientation,
    pages,
  };
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function blocksOverlap(a, b) {
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;
}

/**
 * @param {object} template
 * @returns {{valid: boolean, errors: Array<object>, warnings: Array<object>}}
 */
function validateTemplateLayout(template = {}) {
  const errors = [];
  const warnings = [];
  const orientation = template.orientation === 'portrait' ? 'portrait' : 'landscape';
  const maxRows = GRID_ROWS[orientation];
  if (!Array.isArray(template.pages) || template.pages.length === 0) {
    errors.push({ code: 'template-without-pages', message: 'La plantilla no tiene páginas.' });
    return { valid: false, errors, warnings };
  }

  template.pages.forEach((page, pageIndex) => {
    const blocks = Array.isArray(page.blocks) ? page.blocks : [];
    blocks.forEach((block, blockIndex) => {
      const blockRef = { pageId: page.id, pageIndex, blockId: block.id, blockIndex };
      if (!BLOCK_TYPES.includes(String(block.type || ''))) {
        errors.push({ ...blockRef, code: 'unknown-block', message: 'Bloque desconocido.' });
      }
      if (
        !Number.isFinite(Number(block.x))
        || !Number.isFinite(Number(block.y))
        || !Number.isFinite(Number(block.w))
        || !Number.isFinite(Number(block.h))
        || block.x < 0
        || block.y < 0
        || block.w <= 0
        || block.h <= 0
        || block.x + block.w > GRID_COLUMNS
        || block.y + block.h > maxRows
      ) {
        errors.push({ ...blockRef, code: 'out-of-page', message: 'Bloque fuera de página.' });
      }
      blocks.slice(blockIndex + 1).forEach((nextBlock, nextIndex) => {
        if (blocksOverlap(block, nextBlock)) {
          errors.push({
            ...blockRef,
            blockId: nextBlock.id,
            comparedWithBlockId: block.id,
            comparedWithBlockIndex: blockIndex,
            blockIndex: blockIndex + nextIndex + 1,
            code: 'overlap',
            message: 'Bloque superpuesto.',
          });
        }
      });
    });
  });

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * @param {string} templatesPath
 * @returns {Promise<string>}
 */
async function ensureTemplatesPath(templatesPath) {
  await fs.mkdir(templatesPath, { recursive: true });
  return templatesPath;
}

/**
 * @param {string} templatesPath
 * @param {string} id
 * @returns {string}
 */
function getTemplateFilePath(templatesPath, id) {
  return path.join(templatesPath, `${sanitizeId(id)}.json`);
}

function createDefaultSettingsRepository() {
  return {
    get: getSettings,
    update: updateSettings,
  };
}

/**
 * @param {object} settingsRepository
 * @returns {Promise<string>}
 */
async function getStoredDefaultTemplateId(settingsRepository) {
  const settings = await settingsRepository.get();
  return sanitizeId(settings?.pdfTemplates?.defaultTemplateId || SYSTEM_TEMPLATE_ID);
}

/**
 * @param {object} settingsRepository
 * @param {string} templateId
 */
async function setStoredDefaultTemplateId(settingsRepository, templateId) {
  await settingsRepository.update({
    pdfTemplates: {
      defaultTemplateId: sanitizeId(templateId),
    },
  });
}

/**
 * @param {{templatesPath?: string, settingsRepository?: object, now?: function(): string, idFactory?: function(): string}} [options]
 * @returns {object}
 */
function createPdfTemplateRepository(options = {}) {
  const templatesPath = options.templatesPath || getDefaultTemplatesPath();
  const settingsRepository = options.settingsRepository || createDefaultSettingsRepository();
  const now = () => options.now?.() || new Date().toISOString();
  const idFactory = () => sanitizeId(options.idFactory?.() || uuidv4());

  async function readTemplateFile(id) {
    const parsed = JSON.parse(await fs.readFile(getTemplateFilePath(templatesPath, id), 'utf8'));
    return sanitizeTemplateForStorage(parsed, { base: parsed, now: parsed.updatedAt || now(), id: parsed.id });
  }

  async function writeTemplate(template) {
    await ensureTemplatesPath(templatesPath);
    await fs.writeFile(getTemplateFilePath(templatesPath, template.id), `${JSON.stringify(template, null, 2)}\n`, 'utf8');
    return template;
  }

  async function get(id = SYSTEM_TEMPLATE_ID) {
    const safeId = sanitizeId(id);
    if (safeId === SYSTEM_TEMPLATE_ID) return { ...DEFAULT_PDF_TEMPLATE, isSystem: true };
    return readTemplateFile(safeId);
  }

  async function list() {
    const defaultTemplateId = await getStoredDefaultTemplateId(settingsRepository);
    const systemTemplate = {
      ...DEFAULT_PDF_TEMPLATE,
      isSystem: true,
      isDefault: defaultTemplateId === SYSTEM_TEMPLATE_ID,
    };
    let files = [];
    try {
      files = await fs.readdir(templatesPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const templates = [];
    for (const file of files.filter(item => item.endsWith('.json'))) {
      try {
        const template = await readTemplateFile(path.basename(file, '.json'));
        const validation = validateTemplateLayout(template);
        templates.push({
          ...template,
          isSystem: false,
          isDefault: template.id === defaultTemplateId,
          invalid: !validation.valid,
          validationErrors: validation.errors,
        });
      } catch {
        templates.push({
          id: sanitizeId(path.basename(file, '.json')),
          name: 'Plantilla corrupta',
          version: TEMPLATE_VERSION,
          isSystem: false,
          isDefault: false,
          corrupt: true,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return [
      systemTemplate,
      ...templates.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()),
    ];
  }

  async function create(data = {}) {
    const template = sanitizeTemplateForStorage({
      orientation: 'landscape',
      pages: [{ id: 'page-1', title: 'Pagina 1', blocks: [] }],
      ...data,
    }, { now: now(), id: idFactory() });
    return writeTemplate(template);
  }

  async function update(id, data = {}) {
    const safeId = sanitizeId(id);
    if (safeId === SYSTEM_TEMPLATE_ID) throw new Error('La plantilla default del sistema no se puede editar.');
    const current = await get(safeId);
    const next = sanitizeTemplateForStorage({ ...current, ...data, id: safeId }, { base: current, now: now(), id: safeId });
    return writeTemplate(next);
  }

  async function duplicate(id, data = {}) {
    const source = id === SYSTEM_TEMPLATE_ID ? DEFAULT_PDF_TEMPLATE : await get(id);
    const template = sanitizeTemplateForStorage({
      ...source,
      ...data,
      name: data.name || `${source.name} copia`,
    }, { now: now(), id: idFactory() });
    return writeTemplate(template);
  }

  async function remove(id) {
    const safeId = sanitizeId(id);
    if (safeId === SYSTEM_TEMPLATE_ID) throw new Error('La plantilla default del sistema no se puede eliminar.');
    await fs.rm(getTemplateFilePath(templatesPath, safeId), { force: true });
    if (await getStoredDefaultTemplateId(settingsRepository) === safeId) {
      await setStoredDefaultTemplateId(settingsRepository, SYSTEM_TEMPLATE_ID);
    }
    return { deleted: true, id: safeId };
  }

  async function setDefault(id) {
    const safeId = sanitizeId(id);
    if (safeId !== SYSTEM_TEMPLATE_ID) {
      const template = await get(safeId);
      const validation = validateTemplateLayout(template);
      if (!validation.valid) throw new Error('No se puede marcar como default una plantilla con bloques inválidos.');
    }
    await setStoredDefaultTemplateId(settingsRepository, safeId);
    return get(safeId);
  }

  async function resolveForExport(id) {
    const requestedId = sanitizeId(id || await getStoredDefaultTemplateId(settingsRepository));
    try {
      const template = await get(requestedId);
      const report = validateTemplateLayout(template);
      if (!report.valid) throw new Error('Template layout invalid.');
      return template;
    } catch (error) {
      return {
        ...DEFAULT_PDF_TEMPLATE,
        isSystem: true,
        fallbackReason: `fallback: ${error instanceof Error ? error.message : 'template unavailable'}`,
      };
    }
  }

  async function resolveOutputPath(options) {
    if (options.outputPath) return { canceled: false, filePath: options.outputPath };
    if (!options.dialog?.showSaveDialog) throw new Error('No hay dialog de exportacion disponible.');
    const result = await options.dialog.showSaveDialog(options.browserWindow || null, {
      title: 'Exportar plantilla PDF',
      defaultPath: 'plantilla-pdf-biguanalytics.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    return { canceled: false, filePath: result.filePath };
  }

  async function resolveInputPath(options) {
    if (options.inputPath) return { canceled: false, filePath: options.inputPath };
    if (!options.dialog?.showOpenDialog) throw new Error('No hay dialog de importacion disponible.');
    const result = await options.dialog.showOpenDialog(options.browserWindow || null, {
      title: 'Importar plantilla PDF',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    const filePath = result.filePaths?.[0];
    if (result.canceled || !filePath) return { canceled: true };
    return { canceled: false, filePath };
  }

  async function exportTemplate(id, options = {}) {
    const template = await get(id);
    const output = await resolveOutputPath(options);
    if (output.canceled) return { canceled: true };
    await fs.mkdir(path.dirname(output.filePath), { recursive: true });
    await fs.writeFile(output.filePath, `${JSON.stringify(sanitizeTemplateForStorage(template, { now: template.updatedAt || now(), id: template.id }), null, 2)}\n`, 'utf8');
    return { canceled: false, filePath: output.filePath };
  }

  async function importTemplate(options = {}) {
    const input = await resolveInputPath(options);
    if (input.canceled) return { canceled: true };
    const parsed = JSON.parse(await fs.readFile(input.filePath, 'utf8'));
    const template = sanitizeTemplateForStorage(parsed, { now: now(), id: idFactory() });
    await writeTemplate(template);
    return template;
  }

  return {
    create,
    delete: remove,
    duplicate,
    exportTemplate,
    get,
    importTemplate,
    list,
    resolveForExport,
    setDefault,
    update,
  };
}

const defaultRepository = createPdfTemplateRepository();

module.exports = {
  BLOCK_TYPES,
  DEFAULT_PDF_TEMPLATE,
  GRID_COLUMNS,
  GRID_ROWS,
  SYSTEM_TEMPLATE_ID,
  TEMPLATE_VERSION,
  createPdfTemplateRepository,
  sanitizeTemplateForStorage,
  validateTemplateLayout,
  listPdfTemplates: (...args) => defaultRepository.list(...args),
  getPdfTemplate: (...args) => defaultRepository.get(...args),
  createPdfTemplate: (...args) => defaultRepository.create(...args),
  updatePdfTemplate: (...args) => defaultRepository.update(...args),
  deletePdfTemplate: (...args) => defaultRepository.delete(...args),
  duplicatePdfTemplate: (...args) => defaultRepository.duplicate(...args),
  setDefaultPdfTemplate: (...args) => defaultRepository.setDefault(...args),
  exportPdfTemplate: (...args) => defaultRepository.exportTemplate(...args),
  importPdfTemplate: (...args) => defaultRepository.importTemplate(...args),
  resolvePdfTemplateForExport: (...args) => defaultRepository.resolveForExport(...args),
};
