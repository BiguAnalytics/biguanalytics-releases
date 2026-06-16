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
 * Uses Electron's bundled Chromium instead of a Puppeteer-downloaded browser.
 * @returns {string}
 */
function getElectronChromiumExecutablePath() {
  return process.execPath;
}

/**
 * @param {string} message
 */
function emitPdfExportWarning(message) {
  if (typeof process?.emitWarning === 'function') {
    process.emitWarning(message, { code: 'BIGU_PDF_EXPORT' });
  }
}

function loadPuppeteerCore() {
  return require('puppeteer-core');
}

/**
 * @param {{
 *   puppeteerImpl?: object,
 *   executablePath?: string,
 *   warn?: function(string): void,
 * }} [options]
 * @returns {Promise<object>}
 */
async function launchPdfBrowser(options = {}) {
  const puppeteerImpl = options.puppeteerImpl || loadPuppeteerCore();
  const executablePath = options.executablePath || getElectronChromiumExecutablePath();
  const warn = options.warn || emitPdfExportWarning;
  const baseOptions = {
    headless: 'new',
    executablePath: executablePath,
  };

  try {
    return await puppeteerImpl.launch({
      ...baseOptions,
      args: [],
    });
  } catch (error) {
    // Windows packaged Electron can fail Chromium sandbox initialization in locked-down installs.
    warn(`PDF export falling back to --no-sandbox after Chromium sandbox launch failed: ${error?.message || 'unknown error'}`);
    return puppeteerImpl.launch({
      ...baseOptions,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
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
 * @param {{dialog: object, browserWindow: object|null}} options
 * @returns {Promise<{canceled: boolean, filePath?: string}>}
 */
async function exportDashboardPdf(matchId, printPayload = {}, options) {
  const [match, settings] = await Promise.all([
    getMatchById(matchId),
    getSettings(),
  ]);
  const drawingFramePayload = await getAnnotatedFramesForPdf(matchId);
  const drawingFrames = Array.isArray(drawingFramePayload)
    ? drawingFramePayload
    : drawingFramePayload.frames || [];
  const stats = calculateMatchStats(match, settings, printPayload.filters || settings.dashboard?.filters || {});
  const saveResult = await choosePdfPath(options.dialog, options.browserWindow, stats);
  if (saveResult.canceled || !saveResult.filePath) return { canceled: true };
  await fs.mkdir(path.dirname(saveResult.filePath), { recursive: true });

  const printFile = path.join(__dirname, '../../renderer/dashboard-print.html');
  const browser = await launchPdfBrowser();

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (/^https?:\/\//i.test(url)) {
        request.abort();
        return;
      }
      request.continue();
    });
    await page.goto(`file:///${printFile.replaceAll('\\', '/')}`, { waitUntil: 'networkidle0' });
    await page.evaluate(
      (payload) => window.renderDashboardPrint(payload),
      {
        ...printPayload,
        stats,
        match: {
          ...match,
          coachNotes: match.coachNotes || '',
        },
        drawingFrames,
        drawingFrameWarning: drawingFramePayload.warning || '',
      }
    );
    await page.pdf({
      path: saveResult.filePath,
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm',
      },
    });
  } finally {
    await browser.close();
  }

  return { canceled: false, filePath: saveResult.filePath };
}

module.exports = {
  buildSuggestedFileName,
  getElectronChromiumExecutablePath,
  loadPuppeteerCore,
  launchPdfBrowser,
  exportDashboardPdf,
};
