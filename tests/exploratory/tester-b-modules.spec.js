/*
 * Tester B - exploracion live de modulos Electron.
 *
 * Ejecucion sin modificar package.json/package-lock.json:
 *   npx --yes playwright --version
 *   $env:NODE_PATH = "$env:TEMP\\bigu-playwright-runtime\\node_modules"
 *   node tests/exploratory/tester-b-modules.spec.js
 *
 * El runtime de Playwright se instala temporalmente fuera del repositorio si
 * no existe en node_modules. El test usa Playwright _electron y el ejecutable
 * Electron empaquetado cuando esta disponible para poder recorrer la UI real.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_ELECTRON_ENTRY = path.join(REPOSITORY_ROOT, 'src', 'main', 'main.js');
const PACKAGED_ELECTRON = path.join(REPOSITORY_ROOT, 'dist', 'win-unpacked', 'BiguAnalytics.exe');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_PATH = path.join(__dirname, 'tester-b-modules-report.md');
const EVIDENCE_ROOT = path.join(__dirname, 'evidence', `tester-b-modules-${RUN_ID}`);
const SCREENSHOT_DIR = path.join(EVIDENCE_ROOT, 'screenshots');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    const candidates = [
      process.env.PLAYWRIGHT_MODULE_PATH,
      path.join(os.tmpdir(), 'bigu-playwright-runtime', 'node_modules', 'playwright'),
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        return createRequire(path.join(candidate, 'package.json'))('playwright');
      } catch {
        // Keep trying the explicit temporary locations.
      }
    }
    throw new Error(`Playwright no disponible. Ejecuta npx --yes playwright --version e instala un runtime temporal: ${error.message}`);
  }
}

const { _electron: electron } = loadPlaywright();

const actions = [];
const findings = [];
const rendererLog = [];
const mainLog = [];
const jsonReadings = [];
const screenshotPaths = [];
const moduleVisits = new Set();
let screenshotIndex = 0;

function textOf(error) {
  if (error instanceof Error) return error.stack || error.message;
  return String(error || 'Error desconocido');
}

function compact(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function slug(value) {
  return String(value || 'evidence')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 100) || 'evidence';
}

function addFinding({ severity, module, title, detail, reproduction, evidence = [] }) {
  findings.push({
    severity,
    module,
    title,
    detail: compact(detail, 900),
    reproduction: reproduction || 'Ver los pasos y capturas asociados a la accion.',
    evidence: [...evidence],
  });
}

function attachProcessLogging(app, label) {
  const child = app.process?.();
  child?.stderr?.on('data', (chunk) => {
    mainLog.push({ label, stream: 'stderr', text: String(chunk) });
  });
  child?.stdout?.on('data', (chunk) => {
    mainLog.push({ label, stream: 'stdout', text: String(chunk) });
  });
  child?.on('error', (error) => {
    mainLog.push({ label, stream: 'process-error', text: textOf(error) });
  });
  child?.on('exit', (code, signal) => {
    mainLog.push({ label, stream: 'process-exit', text: `code=${code} signal=${signal || ''}` });
  });
}

function attachPageLogging(page, label) {
  page.on('console', (message) => {
    const entry = {
      label,
      type: message.type(),
      text: compact(message.text(), 1000),
      location: message.location?.() || {},
    };
    rendererLog.push(entry);
  });
  page.on('pageerror', (error) => {
    rendererLog.push({ label, type: 'pageerror', text: textOf(error) });
  });
  page.on('requestfailed', (request) => {
    rendererLog.push({
      label,
      type: 'requestfailed',
      text: `${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'request failed'}`,
    });
  });
}

async function installRendererExceptionCapture(page) {
  await page.addInitScript(() => {
    window.__testerBUnhandled = window.__testerBUnhandled || [];
    window.addEventListener('error', (event) => {
      window.__testerBUnhandled.push({
        type: 'error',
        message: String(event.error?.stack || event.message || 'window error'),
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__testerBUnhandled.push({
        type: 'unhandledrejection',
        message: String(event.reason?.stack || event.reason?.message || event.reason || 'unhandled rejection'),
      });
    });
  });
}

async function captureUnhandled(page, label) {
  try {
    const entries = await page.evaluate(() => window.__testerBUnhandled || []);
    entries.forEach((entry) => rendererLog.push({
      label,
      type: entry.type,
      text: entry.message || 'unhandled rejection',
    }));
  } catch (error) {
    rendererLog.push({ label, type: 'capture-error', text: textOf(error) });
  }
}

async function screenshot(page, label) {
  const fileName = `${String(++screenshotIndex).padStart(3, '0')}-${slug(label)}.png`;
  const absolutePath = path.join(SCREENSHOT_DIR, fileName);
  try {
    await page.screenshot({ path: absolutePath, fullPage: true });
    screenshotPaths.push(absolutePath);
    return path.relative(__dirname, absolutePath).replaceAll('\\', '/');
  } catch (error) {
    mainLog.push({ label: 'screenshot', stream: 'error', text: `${label}: ${textOf(error)}` });
    return null;
  }
}

async function waitForShell(page, timeout = 7000) {
  await page.locator('[data-nav="home"]').waitFor({ state: 'visible', timeout });
}

async function waitForVisible(page, selector, timeout = 5000) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout });
}

async function waitForHash(page, route, timeout = 5000) {
  await page.waitForFunction((expectedRoute) => location.hash.replace(/^#/, '').startsWith(expectedRoute), route, { timeout });
}

async function recordSourceBootProbe() {
  if (!fs.existsSync(SOURCE_ELECTRON_ENTRY)) return;

  let app;
  let page;
  const context = 'source-electron';
  try {
    app = await electron.launch({
      executablePath: require('electron'),
      args: ['.', '--dev'],
      cwd: REPOSITORY_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        BIGU_LICENSE_DEV_MOCK: 'true',
      },
      timeout: 30000,
    });
    attachProcessLogging(app, context);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    page = app.windows().find((candidate) => candidate.url().startsWith('file:')) || await app.firstWindow();
    attachPageLogging(page, context);
    await installRendererExceptionCapture(page);
    await screenshot(page, 'source-boot-before');
    await page.waitForTimeout(4500);
    await captureUnhandled(page, context);
    const body = await page.locator('body').innerText().catch(() => '');
    await screenshot(page, 'source-boot-after');
    const sourcePageErrors = rendererLog.filter((entry) => entry.label === context && entry.type === 'pageerror');
    const uuidError = sourcePageErrors.find((entry) => /Failed to resolve module specifier ["']uuid/i.test(entry.text));
    if (uuidError || !body.includes('Inicio')) {
      addFinding({
        severity: 'bloqueante',
        module: 'arranque / todos los módulos',
        title: 'El renderer fuente no monta la aplicación',
        detail: uuidError?.text || `El body no contiene el shell de la aplicación. Body observado: ${compact(body, 400)}`,
        reproduction: 'Ejecutar la app fuente con Electron, esperar la carga inicial y observar el primer pageerror del renderer. El body queda vacío y no aparecen los items de navegación.',
        evidence: [
          path.relative(__dirname, path.join(SCREENSHOT_DIR, `${String(screenshotIndex - 1).padStart(3, '0')}-source-boot-before.png`)).replaceAll('\\', '/'),
          path.relative(__dirname, path.join(SCREENSHOT_DIR, `${String(screenshotIndex).padStart(3, '0')}-source-boot-after.png`)).replaceAll('\\', '/'),
        ],
      });
    }
  } catch (error) {
    addFinding({
      severity: 'alta',
      module: 'arranque / todos los módulos',
      title: 'No se pudo iniciar Electron fuente para la exploración',
      detail: textOf(error),
      reproduction: 'Ejecutar el bloque de arranque fuente del test.',
    });
  } finally {
    await app?.close().catch(() => {});
  }
}

async function launchSourceModulesApp() {
  const context = 'source-electron-modules';
  const isolatedUserData = path.join(os.tmpdir(), `bigu-tester-b-user-data-${RUN_ID}`);
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [REPOSITORY_ROOT, '--dev'],
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      BIGU_LICENSE_DEV_MOCK: 'true',
    },
    timeout: 30000,
  });
  attachProcessLogging(app, context);
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const page = app.windows().find((candidate) => candidate.url().startsWith('file:')) || await app.firstWindow();
  attachPageLogging(page, context);
  page.setDefaultTimeout(5000);
  await installRendererExceptionCapture(page);
  await app.evaluate(({ app: electronApp }, userData) => electronApp.setPath('userData', userData), isolatedUserData);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await captureUnhandled(page, context);
  return { app, page, context, isolatedUserData, runtimeContext: 'source' };
}

async function launchPackagedApp() {
  if (process.env.BIGU_USE_SOURCE_MODULES === 'true') return launchSourceModulesApp();
  if (!fs.existsSync(PACKAGED_ELECTRON)) return launchSourceModulesApp();

  const context = 'packaged-electron';
  const isolatedUserData = path.join(os.tmpdir(), `bigu-tester-b-user-data-${RUN_ID}`);
  let app;
  try {
    app = await electron.launch({
      executablePath: PACKAGED_ELECTRON,
      args: ['--dev', `--user-data-dir=${isolatedUserData}`],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        BIGU_LICENSE_DEV_MOCK: 'true',
      },
      timeout: 30000,
    });
  } catch (error) {
    mainLog.push({ label: context, stream: 'launch-error', text: textOf(error) });
    return launchSourceModulesApp();
  }
  attachProcessLogging(app, context);
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const page = app.windows().find((candidate) => candidate.url().startsWith('file:')) || await app.firstWindow();
  attachPageLogging(page, context);
  page.setDefaultTimeout(5000);
  await installRendererExceptionCapture(page);
  await app.evaluate(({ app: electronApp }, userData) => electronApp.setPath('userData', userData), isolatedUserData);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await captureUnhandled(page, context);
  return { app, page, context, isolatedUserData, runtimeContext: 'packaged' };
}

async function performAction(context, moduleName, label, operation, options = {}) {
  const { page } = context;
  moduleVisits.add(moduleName);
  const record = {
    module: moduleName,
    label,
    startedAt: new Date().toISOString(),
    firstAttemptResponded: true,
    retried: false,
    ok: true,
    evidenceBefore: null,
    evidenceAfter: null,
  };
  record.evidenceBefore = await screenshot(page, `${moduleName}-${label}-before`);
  const started = Date.now();
  let firstError = null;

  const runOnce = async () => {
    await operation();
    if (options.expectSelector) await waitForVisible(page, options.expectSelector, options.timeout || 5000);
  };

  try {
    await runOnce();
  } catch (error) {
    firstError = error;
    record.firstAttemptResponded = false;
    record.retried = true;
    addFinding({
      severity: 'media',
      module: moduleName,
      title: `La acción no respondió al primer intento: ${label}`,
      detail: textOf(error),
      reproduction: `Ejecutar ${label} en ${moduleName}; el test registra el primer intento fallido y luego reintenta la misma acción.`,
    });
    try {
      await runOnce();
    } catch (retryError) {
      record.ok = false;
      record.retryError = textOf(retryError);
      addFinding({
        severity: options.required === false ? 'media' : 'alta',
        module: moduleName,
        title: `La acción sigue fallando después del reintento: ${label}`,
        detail: `${textOf(firstError)} | Reintento: ${textOf(retryError)}`,
        reproduction: `Ejecutar ${label} dos veces desde el estado indicado en la captura anterior.`,
      });
    }
  }

  await page.waitForTimeout(options.settleMs || 350);
  await captureUnhandled(page, `${context.context}:${moduleName}:${label}`);
  record.durationMs = Date.now() - started;
  record.evidenceAfter = await screenshot(page, `${moduleName}-${label}-after`);
  actions.push(record);
  return record;
}

async function getMatches(page) {
  return page.evaluate(() => window.api?.matches?.getAll?.() || []);
}

async function verifyLocalMatchJson(context, matchId, label) {
  const filePath = path.join(context.isolatedUserData, 'data', matchId, 'match.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const reading = {
      label,
      matchId,
      filePath,
      exists: true,
      bytes: Buffer.byteLength(raw, 'utf8'),
      eventCount: Array.isArray(parsed.events) ? parsed.events.length : null,
      keys: Object.keys(parsed),
    };
    jsonReadings.push(reading);
    return parsed;
  } catch (error) {
    const reading = { label, matchId, filePath, exists: false, error: textOf(error) };
    jsonReadings.push(reading);
    addFinding({
      severity: 'alta',
      module: 'guardado/lectura JSON local',
      title: `No se pudo leer data/${matchId}/match.json`,
      detail: textOf(error),
      reproduction: `Crear o actualizar el partido ${matchId} desde la UI y leer el archivo local inmediatamente después.`,
    });
    return null;
  }
}

async function closeNativeExportDialog(page) {
  await page.waitForTimeout(850);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(250);
}

async function createMatch(context, index) {
  const { page } = context;
  const before = (await getMatches(page)).length;
  await performAction(context, 'inicio / partidos', `crear partido ${index} abrir formulario`, async () => {
    await page.locator('[data-home-new-match]').click();
    await waitForVisible(page, '#new-match-form');
  }, { required: true, expectSelector: '#new-match-form' });
  await performAction(context, 'inicio / partidos', `crear partido ${index} guardar`, async () => {
    await page.locator('#away-team').fill(`Rival Exploratorio ${index}`);
    await page.locator('#competition').fill('QA Exploratoria');
    await page.locator('#create-match-btn').click();
    await page.locator('#new-match-form').waitFor({ state: 'hidden', timeout: 6500 });
    await page.waitForFunction((minimum) => window.api.matches.getAll().then((matches) => matches.length >= minimum), before + 1, { timeout: 6500 });
  }, { required: true, settleMs: 700 });
  const matches = await getMatches(page);
  const created = matches.find((match) => match.awayTeam === `Rival Exploratorio ${index}`) || matches[matches.length - 1];
  if (!created?.id) {
    addFinding({
      severity: 'alta',
      module: 'inicio / partidos',
      title: `El partido ${index} no aparece después de guardarlo`,
      detail: JSON.stringify(matches),
      reproduction: 'Inicio > Nuevo partido > completar rival/competencia > Crear Partido.',
    });
    return null;
  }
  await verifyLocalMatchJson(context, created.id, `despues-de-crear-${index}`);
  return created;
}

async function editMatch(context, match, index) {
  const { page } = context;
  await performAction(context, 'inicio / partidos', `editar partido ${index} abrir`, async () => {
    await page.locator(`[data-match-card="true"]`).first().locator('[aria-label="Editar partido"]').click();
    await waitForVisible(page, '#new-match-form');
  }, { required: true, expectSelector: '#new-match-form' });
  await performAction(context, 'inicio / partidos', `editar partido ${index} guardar`, async () => {
    await page.locator('#away-team').fill(`Rival Editado ${index}`);
    await page.locator('#competition').fill(`QA Editada ${index}`);
    await page.locator('#save-match-btn').click();
    await page.locator('#new-match-form').waitFor({ state: 'hidden', timeout: 6500 });
    await page.getByText(`Rival Editado ${index}`, { exact: true }).first().waitFor({ state: 'visible', timeout: 6500 });
  }, { required: true, settleMs: 700 });
  await verifyLocalMatchJson(context, match.id, `despues-de-editar-${index}`);
}

async function exportMatch(context, index) {
  const { page } = context;
  await performAction(context, 'inicio / partidos', `exportar partido ${index}`, async () => {
    await page.locator(`[data-match-card="true"]`).first().locator('[aria-label="Exportar partido"]').click();
    await closeNativeExportDialog(page);
  }, { required: false, settleMs: 300 });
}

async function tagEvent(context, match, hotkey, index) {
  const { page } = context;
  await performAction(context, 'tagging', `tagging ${hotkey.toUpperCase()} abrir popup ${index}`, async () => {
    await page.keyboard.press(hotkey);
    await waitForVisible(page, '.tag-popup');
  }, { required: true, expectSelector: '.tag-popup' });
  await performAction(context, 'tagging', `tagging ${hotkey.toUpperCase()} completar ${index}`, async () => {
    await page.locator('.tag-popup [data-option-value]').first().click();
    const zoneDetails = page.locator('.tag-popup .tag-popup-zone');
    if ((await zoneDetails.getAttribute('open')) === null) await zoneDetails.locator('summary').click();
    await zoneDetails.locator('[data-zone-value="opp_half"]').click();
    await page.locator('.tag-popup [data-option-value]').first().click();
    await page.waitForFunction((matchId) => window.api.matches.getById(matchId).then((value) => Array.isArray(value?.events) && value.events.length >= 1), match.id, { timeout: 6500 });
  }, { required: true, settleMs: 700 });
  await verifyLocalMatchJson(context, match.id, `despues-de-tagging-${hotkey}-${index}`);
}

async function editTaggedEvent(context, match) {
  const { page } = context;
  const eventBlock = page.locator('[data-event-id], [data-untimed-event-id]').first();
  await performAction(context, 'tagging', 'editar evento abrir inspector', async () => {
    await eventBlock.click();
    await waitForVisible(page, '[data-event-edit]');
  }, { required: true, expectSelector: '[data-event-edit]' });
  await performAction(context, 'tagging', 'editar evento guardar nota', async () => {
    await page.locator('[data-event-edit]').click();
    await page.locator('[data-event-note-edit]').fill('Nota editada por Tester B');
    await page.locator('[data-event-save]').click();
    await page.waitForFunction((matchId) => window.api.matches.getById(matchId).then((value) => value?.events?.some((event) => event.note === 'Nota editada por Tester B')), match.id, { timeout: 6500 });
  }, { required: true, settleMs: 700 });
  await verifyLocalMatchJson(context, match.id, 'despues-de-editar-evento');
}

async function exploreDashboard(context, match) {
  const { page } = context;
  await performAction(context, 'dashboard', 'abrir dashboard', async () => {
    await page.locator('[data-action="dashboard"]').click();
    await waitForHash(page, 'dashboard');
    await waitForVisible(page, '[data-dashboard-view]');
  }, { required: true, expectSelector: '[data-dashboard-view]' });

  for (let index = 1; index <= 2; index += 1) {
    await performAction(context, 'dashboard', `cambiar filtro temporal ${index}`, async () => {
      const select = page.locator('[data-filter-time]');
      const options = await select.locator('option').count();
      await select.selectOption({ index: options > 1 ? (index % options) : 0 });
      await page.waitForTimeout(500);
    }, { required: false });
  }

  for (let index = 1; index <= 2; index += 1) {
    await performAction(context, 'dashboard', `personalizar dashboard ${index}`, async () => {
      await page.locator('[data-customizer-toggle]').click();
      await page.locator('.dashboard-customizer').waitFor({ state: index % 2 === 1 ? 'visible' : 'hidden' });
    }, { required: false });
  }

  if (await page.locator('[data-notes-open]').count()) {
    await performAction(context, 'dashboard', 'abrir y guardar notas', async () => {
      await page.locator('[data-notes-open]').click();
      await waitForVisible(page, '[data-coach-notes-editor]');
      await page.locator('[data-coach-notes-editor]').fill('Conclusiones de exploracion Tester B');
      await page.locator('[data-notes-close]').click();
      await page.waitForTimeout(900);
    }, { required: false });
  }

  for (let index = 1; index <= 2; index += 1) {
    await performAction(context, 'dashboard', `exportar PDF de dashboard ${index}`, async () => {
      const exportButton = page.locator('[data-action="export"]');
      if (!(await exportButton.count())) throw new Error('No existe el boton Exportar PDF.');
      await exportButton.click();
      await closeNativeExportDialog(page);
    }, { required: false });
  }
  await verifyLocalMatchJson(context, match.id, 'despues-de-dashboard');
}

async function exploreSeason(context) {
  const { page } = context;
  await performAction(context, 'temporada', 'abrir temporada', async () => {
    await page.locator('[data-nav="season"]').click();
    await waitForHash(page, 'season');
    await waitForVisible(page, '.season-view');
  }, { required: true, expectSelector: '.season-view' });
  for (let index = 1; index <= 2; index += 1) {
    await performAction(context, 'temporada', `ordenar tabla ${index}`, async () => {
      await page.locator('[data-season-sort="date"]').click();
      await page.waitForTimeout(400);
    }, { required: false });
  }
  if (await page.locator('[data-season-competition]').count()) {
    await performAction(context, 'temporada', 'filtrar por competencia', async () => {
      const select = page.locator('[data-season-competition]');
      const options = await select.locator('option').count();
      await select.selectOption({ index: options > 1 ? 1 : 0 });
      await page.waitForTimeout(500);
    }, { required: false });
  }
  for (let index = 1; index <= 2; index += 1) {
    await performAction(context, 'temporada', `volver a inicio ${index}`, async () => {
      await page.locator('[data-action="home"]').click();
      await waitForHash(page, 'home');
      await waitForVisible(page, '[data-home-instance="true"]');
    }, { required: true, expectSelector: '[data-home-instance="true"]' });
    if (index === 1) {
      await page.locator('[data-nav="season"]').click();
      await waitForVisible(page, '.season-view');
    }
  }
}

async function exploreSettings(context) {
  const { page } = context;
  await performAction(context, 'configuracion', 'abrir configuracion', async () => {
    await page.locator('[data-nav="settings"]').click();
    await waitForHash(page, 'settings');
    await waitForVisible(page, '#settings-form');
  }, { required: true, expectSelector: '#settings-form' });

  for (const theme of ['light', 'dark', 'light']) {
    await performAction(context, 'configuracion', `cambiar tema ${theme}`, async () => {
      await page.locator(`#theme-${theme}`).check();
      await page.locator('#settings-form button[type="submit"]').click();
      await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme, { timeout: 4500 });
    }, { required: true });
  }

  for (let index = 1; index <= 2; index += 1) {
    await performAction(context, 'configuracion', `abrir atajos ${index}`, async () => {
      await page.locator('[data-settings-open-hotkeys]').click();
      await waitForHash(page, 'settings');
      await waitForVisible(page, '[data-settings-hotkeys]');
    }, { required: false, expectSelector: '[data-settings-hotkeys]' });
    await performAction(context, 'configuracion', `volver desde atajos ${index}`, async () => {
      await page.locator('[data-settings-back]').click();
      await waitForVisible(page, '#settings-form');
    }, { required: false, expectSelector: '#settings-form' });
  }
}

async function createPdfTemplate(context, index) {
  const { page } = context;
  const templateName = `Tester B PDF ${index}`;
  await performAction(context, 'editor PDF', `crear plantilla ${index}`, async () => {
    await page.locator('[data-template-create]').click();
    await waitForVisible(page, '[data-template-name-input]');
    await page.locator('[data-template-name-input]').fill(templateName);
    await page.locator('[data-template-name-submit]').click();
    await waitForVisible(page, '[data-pdf-template-editor]');
  }, { required: true, expectSelector: '[data-pdf-template-editor]' });

  await performAction(context, 'editor PDF', `editar plantilla ${index}`, async () => {
    if (await page.locator('[data-property-title]').count()) {
      await page.locator('[data-property-title]').fill(`Título Tester B ${index}`);
    }
    if (await page.locator('[data-page-add]').count()) await page.locator('[data-page-add]').click();
    await page.locator('[data-editor-save]').click();
    await page.waitForTimeout(750);
  }, { required: true, expectSelector: '[data-editor-save]' });

  await performAction(context, 'editor PDF', `volver del editor PDF ${index}`, async () => {
    await page.locator('[data-editor-back]').click();
    await waitForVisible(page, '[data-pdf-template-manager]');
  }, { required: true, expectSelector: '[data-pdf-template-manager]' });

  for (let exportIndex = 1; exportIndex <= 2; exportIndex += 1) {
    await performAction(context, 'editor PDF', `exportar plantilla ${index} intento ${exportIndex}`, async () => {
      const card = page.locator('[data-template-id]').filter({ hasText: templateName }).first();
      await card.locator('[data-template-export]').click();
      await closeNativeExportDialog(page);
    }, { required: false });
  }
}

async function explorePdfEditor(context) {
  const { page } = context;
  await performAction(context, 'editor PDF', 'abrir administrador PDF', async () => {
    await page.locator('[data-nav="settings"]').click();
    await waitForVisible(page, '#settings-form');
    await page.locator('[data-pdf-templates-open]').click();
    await waitForHash(page, 'pdfTemplates');
    await waitForVisible(page, '[data-pdf-template-manager]');
  }, { required: true, expectSelector: '[data-pdf-template-manager]' });
  await createPdfTemplate(context, 1);
  await createPdfTemplate(context, 2);
  for (let index = 1; index <= 2; index += 1) {
    await performAction(context, 'editor PDF', `volver al inicio desde PDF ${index}`, async () => {
      await page.locator('[data-action="home"]').click();
      await waitForHash(page, 'home');
      await waitForVisible(page, '[data-home-instance="true"]');
    }, { required: true, expectSelector: '[data-home-instance="true"]' });
    if (index === 1) {
      await page.locator('[data-nav="settings"]').click();
      await waitForVisible(page, '#settings-form');
      await page.locator('[data-pdf-templates-open]').click();
      await waitForVisible(page, '[data-pdf-template-manager]');
    }
  }
}

async function createTacticalBoard(context, index) {
  const { page } = context;
  const name = `Jugada Tester B ${index}`;
  await performAction(context, 'tablero tactico', `crear secuencia ${index}`, async () => {
    await page.locator('[data-sequence-new]').click();
    await waitForVisible(page, '[data-sequence-name-input]');
    await page.locator('[data-sequence-name-input]').fill(name);
    await page.locator('[data-sequence-name-submit]').click();
    await waitForVisible(page, '[data-view-mode="detail"]');
  }, { required: true, expectSelector: '[data-view-mode="detail"]' });
  for (let frameIndex = 1; frameIndex <= 2; frameIndex += 1) {
    await performAction(context, 'tablero tactico', `crear cuadro ${index}.${frameIndex}`, async () => {
      const addButton = page.locator('[data-cuadro-add]').first();
      await addButton.click();
      await waitForVisible(page, '[data-cuadro-duration]');
      await page.locator('[data-cuadro-duration]').fill(String(2 + frameIndex));
      await page.locator('[data-cuadro-duration]').dispatchEvent('change');
      await page.waitForTimeout(550);
    }, { required: true, expectSelector: '[data-cuadro-duration]' });
  }
  for (let exportIndex = 1; exportIndex <= 2; exportIndex += 1) {
    await performAction(context, 'tablero tactico', `exportar PNG ${index} intento ${exportIndex}`, async () => {
      await page.locator('[data-board-export]').click();
      await closeNativeExportDialog(page);
    }, { required: false });
  }
  await performAction(context, 'tablero tactico', `volver a lista ${index}`, async () => {
    await page.locator('[data-sequence-back]').click();
    await waitForVisible(page, '[data-view-mode="list"]');
  }, { required: true, expectSelector: '[data-view-mode="list"]' });
  for (let renameIndex = 1; renameIndex <= 2; renameIndex += 1) {
    await performAction(context, 'tablero tactico', `renombrar secuencia ${index}.${renameIndex}`, async () => {
      await page.locator('[data-sequence-menu]').first().click();
      await waitForVisible(page, '[data-sequence-rename]');
      await page.locator('[data-sequence-rename]').click();
      await waitForVisible(page, '[data-sequence-name-input]');
      await page.locator('[data-sequence-name-input]').fill(`${name} Editada ${renameIndex}`);
      await page.locator('[data-sequence-name-submit]').click();
      await page.getByText(`${name} Editada ${renameIndex}`, { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    }, { required: true });
  }
}

async function exploreTacticalBoard(context) {
  const { page } = context;
  await performAction(context, 'tablero tactico', 'abrir tablero tactico', async () => {
    await page.locator('[data-nav="tactical"]').click();
    await waitForHash(page, 'tactical');
    await waitForVisible(page, '[data-view-mode="list"]');
  }, { required: true, expectSelector: '[data-view-mode="list"]' });
  await createTacticalBoard(context, 1);
  await createTacticalBoard(context, 2);
  for (let index = 1; index <= 2; index += 1) {
    await performAction(context, 'tablero tactico', `volver al inicio desde tablero ${index}`, async () => {
      await page.locator('[data-action="home"]').click();
      await waitForHash(page, 'home');
      await waitForVisible(page, '[data-home-instance="true"]');
    }, { required: true, expectSelector: '[data-home-instance="true"]' });
    if (index === 1) {
      await page.locator('[data-nav="tactical"]').click();
      await waitForVisible(page, '[data-view-mode="list"]');
    }
  }
}

async function explorePackagedModules(context) {
  const { page } = context;
  try {
    await waitForShell(page, 7000);
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => '');
    await screenshot(page, 'packaged-auth-or-shell-blocked');
    addFinding({
      severity: 'bloqueante',
      module: 'autenticación / todos los módulos',
      title: 'La app empaquetada no llegó al shell autenticado',
      detail: `${textOf(error)} Body: ${compact(body, 800)}`,
      reproduction: 'Iniciar el ejecutable empaquetado con un userData temporal, recargar y esperar el shell. El flujo queda en la pantalla de autenticación.',
      evidence: [path.relative(__dirname, path.join(SCREENSHOT_DIR, `${String(screenshotIndex).padStart(3, '0')}-packaged-auth-or-shell-blocked.png`)).replaceAll('\\', '/')],
    });
    return;
  }

  await screenshot(page, 'packaged-shell-ready');
  const matchOne = await createMatch(context, 1);
  const matchTwo = await createMatch(context, 2);
  if (!matchOne) return;
  await editMatch(context, matchOne, 1);
  await editMatch(context, matchOne, 2);
  await exportMatch(context, 1);
  await exportMatch(context, 2);

  await performAction(context, 'tagging', 'abrir tagging del partido principal', async () => {
    await page.locator('[data-match-card="true"]').first().locator('.match-card-action').click();
    await waitForHash(page, 'tagging');
    await waitForVisible(page, '.tagging-view');
  }, { required: true, expectSelector: '.tagging-view' });
  await tagEvent(context, matchOne, 'r', 1);
  await tagEvent(context, matchOne, 's', 2);
  await editTaggedEvent(context, matchOne);
  await exploreDashboard(context, matchOne);
  await exploreSeason(context);
  await exploreSettings(context);
  await explorePdfEditor(context);
  await exploreTacticalBoard(context);

  await performAction(context, 'inicio / partidos', 'volver al inicio final', async () => {
    await page.locator('[data-nav="home"]').click();
    await waitForHash(page, 'home');
    await waitForVisible(page, '[data-home-instance="true"]');
  }, { required: true, expectSelector: '[data-home-instance="true"]' });
  const finalMatches = await getMatches(page);
  if (matchTwo && !finalMatches.some((match) => match.id === matchTwo.id)) {
    addFinding({
      severity: 'alta',
      module: 'guardado/lectura JSON local',
      title: 'Un partido creado dejó de aparecer al volver a Inicio',
      detail: `matchId=${matchTwo.id}; partidos finales=${finalMatches.length}`,
      reproduction: 'Crear dos partidos, recorrer los módulos y volver a Inicio. Comparar la lista final con los partidos creados.',
    });
  }
  await verifyLocalMatchJson(context, matchOne.id, 'lectura-final-match-one');
  if (matchTwo) await verifyLocalMatchJson(context, matchTwo.id, 'lectura-final-match-two');
}

function uniqueLogEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.type}|${compact(entry.text, 800)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function reportRelative(filePath) {
  return path.relative(__dirname, filePath).replaceAll('\\', '/');
}

async function closeAppWithTimeout(app, timeoutMs = 5000) {
  if (!app) return;
  await Promise.race([
    app.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function buildReport(extra = {}) {
  const rendererProblems = uniqueLogEntries(rendererLog.filter((entry) => ['error', 'warning', 'pageerror', 'unhandledrejection', 'requestfailed', 'capture-error'].includes(entry.type)));
  const mainProblems = uniqueLogEntries(mainLog.filter((entry) => /error|stderr|exit/i.test(entry.stream || '') || /error|exception|fatal/i.test(entry.text || '')));
  const allModules = ['dashboard', 'temporada', 'configuracion', 'tablero tactico', 'editor PDF', 'tema claro/oscuro', 'tagging', 'guardado/lectura JSON local'];
  const completedModules = new Set(actions.filter((action) => action.ok).map((action) => action.module));
  const moduleLines = allModules.map((moduleName) => {
    if (!moduleVisits.has(moduleName) && moduleName !== 'tema claro/oscuro') {
      return `- ${moduleName}: no alcanzable en la ejecución live (ver bloqueo de arranque/autenticación).`;
    }
    if (moduleName === 'tema claro/oscuro') {
      const themeActions = actions.filter((action) => /cambiar tema/.test(action.label));
      return `- ${moduleName}: ${themeActions.length && themeActions.every((action) => action.ok) ? 'no se encontró bug reproducible.' : 'hubo una acción fallida; revisar hallazgos.'}`;
    }
    return `- ${moduleName}: ${completedModules.has(moduleName) ? 'no se encontró bug reproducible en las acciones ejecutadas.' : 'hubo una acción fallida; revisar hallazgos.'}`;
  }).join('\n');

  const findingLines = findings.length
    ? findings.map((finding, index) => {
      const evidence = finding.evidence.length ? finding.evidence.map((item) => `  - ${item}`).join('\n') : '  - Capturas de la acción asociada en `evidence/`.';
      return [
        `### ${index + 1}. [${finding.severity}] ${finding.title}`,
        `- Módulo: ${finding.module}`,
        `- Hallazgo: ${finding.detail}`,
        `- Pasos de reproducción: ${finding.reproduction}`,
        '- Evidencia:',
        evidence,
      ].join('\n');
    }).join('\n\n')
    : 'No se encontraron bugs reproducibles en las acciones ejecutadas.';

  const rendererLines = rendererProblems.length
    ? rendererProblems.map((entry) => `- ${entry.label} / ${entry.type}: ${compact(entry.text, 900)}`).join('\n')
    : '- No se registraron errores, warnings ni excepciones del renderer.';
  const mainLines = mainProblems.length
    ? mainProblems.map((entry) => `- ${entry.label} / ${entry.stream}: ${compact(entry.text, 900)}`).join('\n')
    : '- No se registraron errores del proceso main.';

  return `# Tester B — reporte exploratorio live de módulos

- Fecha: ${new Date().toISOString()}
- Rama observada: test/exploratory-qa
- Runtime: Electron real con Playwright \`_electron\`
- Ejecutable empaquetado usado para recorrer módulos: ${extra.runtimeContext === 'source' ? 'no ejecutable en este entorno; se recorrió Electron fuente' : (fs.existsSync(PACKAGED_ELECTRON) ? reportRelative(PACKAGED_ELECTRON) : 'no disponible')}
- UserData de datos funcionales: ${extra.isolatedUserData || 'no creado'}
- Evidencia: ${reportRelative(EVIDENCE_ROOT)}
- Nota de autenticación: se usó el modo local/dev existente y la sesión local disponible para el shell; los datos de partidos, plantillas y tableros se escribieron en un userData temporal.

## Cobertura y estado

${moduleLines}

Acciones instrumentadas: ${actions.length}. Capturas: ${screenshotPaths.length}. Lecturas de JSON local: ${jsonReadings.length}.

## Hallazgos

${findingLines}

## Errores y warnings observados

### Renderer

${rendererLines}

### Main

${mainLines}

## Acciones ejecutadas

| Módulo | Acción | Resultado | Primer intento | Reintento | Evidencia |
|---|---|---|---|---|---|
${actions.map((action) => `| ${action.module} | ${action.label} | ${action.ok ? 'OK' : 'FALLÓ'} | ${action.firstAttemptResponded ? 'respondió' : 'no respondió'} | ${action.retried ? 'sí' : 'no'} | ${action.evidenceBefore || ''} / ${action.evidenceAfter || ''} |`).join('\n')}

## Guardado/lectura JSON local

${jsonReadings.map((reading) => `- ${reading.label}: ${reading.exists ? `OK, ${reading.bytes} bytes, events=${reading.eventCount}` : `FALLÓ: ${reading.error}`} — \`${reading.filePath}\``).join('\n') || '- No se pudo completar una lectura.'}

## Evidencia de ejecución

- Manifest: \`${reportRelative(path.join(EVIDENCE_ROOT, 'run-manifest.json'))}\`
- Logs renderer/main: \`${reportRelative(path.join(EVIDENCE_ROOT, 'renderer-main-logs.json'))}\`
- Lecturas JSON: \`${reportRelative(path.join(EVIDENCE_ROOT, 'local-json-readings.json'))}\`
`;
}

async function main() {
  let packagedContext = null;
  await recordSourceBootProbe();
  try {
    packagedContext = await launchPackagedApp();
    if (packagedContext) await explorePackagedModules(packagedContext);
    else addFinding({
      severity: 'alta',
      module: 'ejecución Electron',
      title: 'No existe un ejecutable empaquetado para la exploración secundaria',
      detail: PACKAGED_ELECTRON,
      reproduction: 'Construir o disponer del ejecutable Electron empaquetado en dist/win-unpacked y repetir el test.',
    });
  } catch (error) {
    addFinding({
      severity: 'alta',
      module: 'ejecución Electron',
      title: 'La exploración live se interrumpió por un error del runner',
      detail: textOf(error),
      reproduction: 'Ejecutar nuevamente el test con Playwright disponible y el ejecutable Electron accesible.',
    });
  } finally {
    if (packagedContext?.page) await captureUnhandled(packagedContext.page, 'packaged-final');
    await closeAppWithTimeout(packagedContext?.app);
  }

  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'run-manifest.json'), JSON.stringify({
    runId: RUN_ID,
    reportPath: REPORT_PATH,
    evidenceRoot: EVIDENCE_ROOT,
    screenshotCount: screenshotPaths.length,
    screenshots: screenshotPaths,
    actionCount: actions.length,
    findings: findings.length,
    packagedElectron: fs.existsSync(PACKAGED_ELECTRON),
    runtimeContext: packagedContext?.runtimeContext || null,
    isolatedUserData: packagedContext?.isolatedUserData || null,
  }, null, 2));
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'renderer-main-logs.json'), JSON.stringify({ renderer: rendererLog, main: mainLog }, null, 2));
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'local-json-readings.json'), JSON.stringify(jsonReadings, null, 2));
  fs.writeFileSync(REPORT_PATH, buildReport({
    isolatedUserData: packagedContext?.isolatedUserData,
    runtimeContext: packagedContext?.runtimeContext,
  }));

  const requiredEvidenceExists = fs.existsSync(REPORT_PATH)
    && fs.existsSync(path.join(EVIDENCE_ROOT, 'run-manifest.json'))
    && screenshotPaths.every((filePath) => fs.existsSync(filePath));
  if (!requiredEvidenceExists) process.exitCode = 1;
  process.stdout.write(`${REPORT_PATH}\n${EVIDENCE_ROOT}\n`);
}

main().catch((error) => {
  addFinding({
    severity: 'alta',
    module: 'runner',
    title: 'El test no pudo generar su cierre normal',
    detail: textOf(error),
    reproduction: 'Ejecutar el archivo de test con Node y Playwright disponible.',
  });
  fs.writeFileSync(REPORT_PATH, buildReport());
  process.exitCode = 1;
});
