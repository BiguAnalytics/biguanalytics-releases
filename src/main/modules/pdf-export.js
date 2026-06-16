// @ts-check
const path = require('path');
const fs = require('fs/promises');
const { calculateMatchStats } = require('./analytics');
const { getMatchById } = require('./storage');
const { getSettings } = require('./settings');
const { getAnnotatedFramesForPdf } = require('./drawings');

/**
 * @param {string} value
 * @returns {string}
 */
function sanitizeFileName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'partido';
}

/**
 * @param {object} stats
 * @returns {string}
 */
function buildSuggestedFileName(stats) {
  const rival = sanitizeFileName(stats.teams.rivalName || 'Rival');
  const date = sanitizeFileName(stats.match.date || new Date().toISOString().slice(0, 10));
  return `Bigua-vs-${rival}-${date}.pdf`;
}

/**
 * @returns {string}
 */
function getDashboardPrintFilePath() {
  return path.join(__dirname, '../../renderer/dashboard-print.html');
}

/**
 * @returns {typeof import('electron').BrowserWindow}
 */
function loadBrowserWindow() {
  return require('electron').BrowserWindow;
}

/**
 * @param {typeof import('electron').BrowserWindow} BrowserWindowImpl
 * @returns {object}
 */
function createHiddenPdfWindow(BrowserWindowImpl) {
  return new BrowserWindowImpl({
    show: false,
    width: 1600,
    height: 1100,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#080E1A',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function formatPdfErrorDetail(error) {
  return error instanceof Error && error.message
    ? error.message.replace(/\s+/g, ' ').slice(0, 180)
    : 'error desconocido';
}

/**
 * @param {object} payload
 * @returns {string}
 */
function serializePayloadForScript(payload) {
  return JSON.stringify(payload)
    .replaceAll('<', '\\u003C')
    .replaceAll('>', '\\u003E')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

/**
 * @param {object} webContents
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function renderPrintPayload(webContents, payload) {
  const script = `
    (async () => {
      if (typeof window.renderDashboardPrint !== 'function') {
        throw new Error('Vista PDF no inicializada.');
      }
      window.__BIGU_PDF_READY__ = false;
      const result = await window.renderDashboardPrint(${serializePayloadForScript(payload)});
      if (window.__BIGU_PDF_READY__ !== true) {
        throw new Error('La vista PDF no confirmo render completo.');
      }
      return result || { ready: true };
    })();
  `;

  try {
    return await webContents.executeJavaScript(script, true);
  } catch (error) {
    throw new Error(`No se pudo renderizar la vista PDF: ${formatPdfErrorDetail(error)}`);
  }
}

const PDF_PRINT_OPTIONS = {
  landscape: true,
  pageSize: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  margins: {
    marginType: 'custom',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
};

/**
 * @param {object} payload
 * @param {{
 *   BrowserWindow?: typeof import('electron').BrowserWindow,
 *   printFile?: string,
 * }} [options]
 * @returns {Promise<Buffer>}
 */
async function renderDashboardPdfBuffer(payload, options = {}) {
  const BrowserWindowImpl = options.BrowserWindow || loadBrowserWindow();
  const printFile = options.printFile || getDashboardPrintFilePath();
  const pdfWindow = createHiddenPdfWindow(BrowserWindowImpl);

  try {
    try {
      await pdfWindow.loadFile(printFile);
    } catch (error) {
      throw new Error(`No se pudo cargar la vista PDF local: ${formatPdfErrorDetail(error)}`);
    }

    await renderPrintPayload(pdfWindow.webContents, payload);

    try {
      const pdfBuffer = await pdfWindow.webContents.printToPDF(PDF_PRINT_OPTIONS);
      const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
      if (buffer.length === 0) throw new Error('PDF vacio.');
      return buffer;
    } catch (error) {
      throw new Error(`No se pudo generar el PDF: ${formatPdfErrorDetail(error)}`);
    }
  } finally {
    if (typeof pdfWindow.isDestroyed !== 'function' || !pdfWindow.isDestroyed()) {
      pdfWindow.close();
    }
  }
}

/**
 * @param {string} filePath
 * @param {Buffer} pdfBuffer
 * @param {{mkdir: function(string, object): Promise<void>, writeFile: function(string, Buffer): Promise<void>}} [fsImpl]
 */
async function savePdfBuffer(filePath, pdfBuffer, fsImpl = fs) {
  try {
    await fsImpl.mkdir(path.dirname(filePath), { recursive: true });
    await fsImpl.writeFile(filePath, pdfBuffer);
  } catch (error) {
    throw new Error(`No se pudo guardar el PDF. Verifica permisos y que el archivo no este abierto: ${formatPdfErrorDetail(error)}`);
  }
}

/**
 * @param {object} dialog
 * @param {object|null} browserWindow
 * @param {object} stats
 * @returns {Promise<{canceled: boolean, filePath?: string}>}
 */
async function choosePdfPath(dialog, browserWindow, stats) {
  return dialog.showSaveDialog(browserWindow, {
    title: 'Exportar dashboard como PDF',
    defaultPath: buildSuggestedFileName(stats),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
}

/**
 * @param {string} matchId
 * @param {object} printPayload
 * @param {{
 *   dialog: object,
 *   browserWindow: object|null,
 *   BrowserWindow?: typeof import('electron').BrowserWindow,
 *   fsImpl?: object,
 *   data?: {match: object, settings: object, drawingFramePayload?: object|Array<object>},
 * }} options
 * @returns {Promise<{canceled: boolean, filePath?: string}>}
 */
async function exportDashboardPdf(matchId, printPayload = {}, options) {
  const data = options.data;
  const [match, settings] = data
    ? [data.match, data.settings || {}]
    : await Promise.all([
      getMatchById(matchId),
      getSettings(),
    ]);
  const drawingFramePayload = data
    ? data.drawingFramePayload || []
    : await getAnnotatedFramesForPdf(matchId);
  const drawingFrames = Array.isArray(drawingFramePayload)
    ? drawingFramePayload
    : drawingFramePayload.frames || [];
  const stats = calculateMatchStats(match, settings, printPayload.filters || settings.dashboard?.filters || {});
  const saveResult = await choosePdfPath(options.dialog, options.browserWindow, stats);
  if (saveResult.canceled || !saveResult.filePath) return { canceled: true };

  const pdfBuffer = await renderDashboardPdfBuffer({
    ...printPayload,
    stats,
    match: {
      ...match,
      coachNotes: match.coachNotes || '',
    },
    drawingFrames,
    drawingFrameWarning: drawingFramePayload.warning || '',
  }, options);
  await savePdfBuffer(saveResult.filePath, pdfBuffer, options.fsImpl || fs);

  return { canceled: false, filePath: saveResult.filePath };
}

module.exports = {
  buildSuggestedFileName,
  createHiddenPdfWindow,
  exportDashboardPdf,
  getDashboardPrintFilePath,
  renderDashboardPdfBuffer,
  savePdfBuffer,
};
