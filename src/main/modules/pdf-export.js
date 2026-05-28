// @ts-check
const path = require('path');
const fs = require('fs/promises');
const puppeteer = require('puppeteer');
const { calculateMatchStats } = require('./analytics');
const { getMatchById } = require('./storage');
const { getSettings } = require('./settings');

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
  const stats = calculateMatchStats(match, settings);
  const saveResult = await choosePdfPath(options.dialog, options.browserWindow, stats);
  if (saveResult.canceled || !saveResult.filePath) return { canceled: true };
  await fs.mkdir(path.dirname(saveResult.filePath), { recursive: true });

  const printFile = path.join(__dirname, '../../renderer/dashboard-print.html');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
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
  exportDashboardPdf,
};
