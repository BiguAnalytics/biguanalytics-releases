const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const { test } = require('playwright/test');
const { _electron } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '../..');
const EVIDENCE_ROOT = path.join(__dirname, 'evidence');

function slug(value) {
  return String(value || 'step')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 90) || 'step';
}

function safeError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error || 'Unknown error');
}

function isoNow() {
  return new Date().toISOString();
}

function relativeEvidence(runDir, filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll('\\', '/');
}

function makeReport(runDir) {
  return {
    title: 'Tester A — exploración live del flujo core',
    startedAt: isoNow(),
    finishedAt: null,
    branch: 'test/exploratory-qa',
    app: 'Electron real: src/main/main.js',
    automation: 'Playwright _electron',
    isolatedUserData: true,
    runEvidenceDir: relativeEvidence(REPO_ROOT, runDir),
    actions: [],
    findings: [],
    renderer: {
      console: [],
      pageErrors: [],
      crashes: [],
      unhandledExceptions: [],
    },
    main: {
      stdout: [],
      stderr: [],
      suspiciousLines: [],
      processErrors: [],
    },
    evidence: [],
    jsonReadback: null,
    fatalError: null,
  };
}

function addFinding(report, finding) {
  report.findings.push({
    severity: finding.severity || 'medium',
    title: finding.title || 'Hallazgo sin título',
    status: finding.status || 'observed',
    steps: finding.steps || [],
    evidence: finding.evidence || [],
    details: finding.details || '',
  });
}

async function capture(page, runDir, report, label) {
  const file = path.join(
    runDir,
    `${String(report.evidence.length + 1).padStart(3, '0')}-${slug(label)}.png`,
  );
  try {
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    report.evidence.push(relativeEvidence(REPO_ROOT, file));
    return relativeEvidence(REPO_ROOT, file);
  } catch (error) {
    report.evidence.push({ label, error: safeError(error) });
    return null;
  }
}

async function waitForRoute(page, route, timeout = 10000) {
  await page.waitForFunction(
    expected => document.body.dataset.route === expected,
    route,
    { timeout },
  );
}

async function waitForVisible(page, selector, timeout = 10000) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout });
}

async function completeTagPopup(page) {
  await page.locator('.tag-popup [data-option-value]').first().click();
  const zoneDetails = page.locator('.tag-popup .tag-popup-zone');
  if ((await zoneDetails.getAttribute('open')) === null) await zoneDetails.locator('summary').click();
  await zoneDetails.locator('[data-zone-value="opp_half"]').click();
  await page.locator('.tag-popup [data-option-value]').first().click();
}

async function runAction(page, runDir, report, name, operation, options = {}) {
  const startedAt = isoNow();
  const start = Date.now();
  const before = page.isClosed() ? null : await capture(page, runDir, report, `${name}-before`);
  let error = null;
  let responded = true;

  try {
    await operation();
  } catch (caught) {
    error = safeError(caught);
    responded = false;
  }

  if (!page.isClosed()) {
    try {
      await page.waitForTimeout(options.settleMs ?? 250);
    } catch (caught) {
      error = error || safeError(caught);
      responded = false;
    }
  }

  const after = page.isClosed() ? null : await capture(page, runDir, report, `${name}-after`);
  const elapsedMs = Date.now() - start;
  const action = {
    name,
    startedAt,
    elapsedMs,
    responded,
    before,
    after,
    error,
    notes: options.notes || '',
  };
  report.actions.push(action);

  if (error && options.required !== false) {
    throw new Error(`${name} no respondió: ${error}`);
  }
  if (elapsedMs > (options.freezeThresholdMs || 5000)) {
    addFinding(report, {
      severity: 'medium',
      title: `Posible congelamiento o respuesta lenta: ${name}`,
      status: 'observed',
      steps: [`Ejecutar la acción live “${name}”.`],
      evidence: [before, after].filter(Boolean),
      details: `La acción demoró ${elapsedMs} ms.`,
    });
  }
  return action;
}

function attachRendererDiagnostics(page, report) {
  page.on('console', message => {
    const entry = {
      at: isoNow(),
      type: message.type(),
      text: message.text(),
      location: message.location(),
    };
    report.renderer.console.push(entry);
  });
  page.on('pageerror', error => {
    const entry = { at: isoNow(), error: safeError(error) };
    report.renderer.pageErrors.push(entry);
    report.renderer.unhandledExceptions.push(entry);
  });
  page.on('crash', () => {
    report.renderer.crashes.push({ at: isoNow(), error: 'Renderer page crashed.' });
  });
}

function attachMainDiagnostics(electronApp, report) {
  const child = electronApp.process();
  const collect = (stream, channel) => {
    if (!stream) return;
    stream.on('data', chunk => {
      const text = String(chunk);
      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      report.main[channel].push(...lines.map(line => ({ at: isoNow(), text: line })));
      lines.forEach(line => {
        if (/\b(warn(?:ing)?|error|uncaught|unhandled|exception|fatal|crash)\b/i.test(line)) {
          report.main.suspiciousLines.push({ at: isoNow(), channel, text: line });
        }
      });
    });
  };
  collect(child?.stdout, 'stdout');
  collect(child?.stderr, 'stderr');
  child?.on('error', error => {
    report.main.processErrors.push({ at: isoNow(), error: safeError(error) });
  });
}

async function writeReport(runDir, report) {
  report.finishedAt = isoNow();
  const reportJson = path.join(runDir, 'report.json');
  const reportMarkdown = path.join(runDir, 'report.md');
  await fsp.writeFile(reportJson, JSON.stringify(report, null, 2), 'utf8');

  const findings = report.findings.length
    ? report.findings.map((finding, index) => [
      `### ${index + 1}. [${finding.severity}] ${finding.title}`,
      `Estado: ${finding.status}`,
      finding.details ? `Detalle: ${finding.details}` : '',
      finding.steps.length ? `Pasos de reproducción:\n${finding.steps.map(step => `1. ${step}`).join('\n')}` : '',
      finding.evidence.length ? `Evidencia:\n${finding.evidence.map(item => `- ${item}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n')).join('\n\n')
    : 'No se encontraron bugs observables durante el flujo ejecutado.';

  const actionTable = report.actions.length
    ? report.actions.map(action => `| ${action.name} | ${action.responded ? 'sí' : 'no'} | ${action.elapsedMs} ms | ${action.error || ''} |`).join('\n')
    : '| — | — | — | — |';

  const rendererErrors = report.renderer.pageErrors.length + report.renderer.crashes.length;
  const rendererWarnings = report.renderer.console.filter(item => item.type === 'warning').length;
  const mainSuspicious = report.main.suspiciousLines.length + report.main.processErrors.length;
  const jsonStatus = report.jsonReadback?.matchJsonExists
    ? `JSON local leído: sí (${report.jsonReadback.eventsCount} eventos)`
    : 'JSON local leído: no';

  const markdown = [
    '# Tester A — reporte de exploración live',
    '',
    `- Inicio: ${report.startedAt}`,
    `- Fin: ${report.finishedAt}`,
    `- Rama declarada: ${report.branch}`,
    `- App: ${report.app}`,
    `- Automatización: ${report.automation}`,
    `- Perfil de datos: aislado y temporal`,
    `- ${jsonStatus}`,
    `- Renderer: ${rendererErrors} pageerror/crash; ${rendererWarnings} warning(s) de consola`,
    `- Main: ${mainSuspicious} línea(s) sospechosa(s) o error(es) de proceso registrados`,
    '',
    '## Flujo ejecutado',
    '',
    'Crear partido → entrar a tagging → taggear eventos consecutivos con teclas rápidas → completar detalle de un evento → navegar paneles/rutas varias veces → iniciar un guardado y cerrar la ventana durante la operación → leer el `match.json` aislado.',
    '',
    '## Acciones y respuesta',
    '',
    '| Acción | Respondió | Duración | Error |',
    '|---|---:|---:|---|',
    actionTable,
    '',
    '## Hallazgos',
    '',
    findings,
    '',
    '## Diagnóstico renderer',
    '',
    '```json',
    JSON.stringify({ console: report.renderer.console, pageErrors: report.renderer.pageErrors, crashes: report.renderer.crashes }, null, 2),
    '```',
    '',
    '## Diagnóstico main',
    '',
    '```json',
    JSON.stringify(report.main, null, 2),
    '```',
    '',
    '## Evidencia',
    '',
    report.evidence.map(item => `- ${typeof item === 'string' ? item : JSON.stringify(item)}`).join('\n'),
    '',
    '## Criterio de cierre',
    '',
    report.fatalError ? `La exploración quedó incompleta por: ${report.fatalError}` : 'El flujo obligatorio se ejecutó hasta el cierre de la app y la lectura posterior del JSON aislado.',
    '',
  ].join('\n');
  await fsp.writeFile(reportMarkdown, markdown, 'utf8');
  await fsp.writeFile(path.join(EVIDENCE_ROOT, 'tester-a-core-report.md'), markdown, 'utf8');
  await fsp.writeFile(path.join(EVIDENCE_ROOT, 'tester-a-core-report.json'), JSON.stringify(report, null, 2), 'utf8');
}

test('Tester A: flujo core live con Electron, tagging y cierre durante guardado', async () => {
  test.setTimeout(180000);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(EVIDENCE_ROOT, `tester-a-core-${runId}`);
  await fsp.mkdir(runDir, { recursive: true });
  const report = makeReport(runDir);
  const isolatedUserDataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bigu-tester-a-'));
  let electronApp = null;
  let page = null;
  let matchId = null;

  try {
    const electronPath = require('electron');
    electronApp = await _electron.launch({
      executablePath: electronPath,
      args: [REPO_ROOT, '--dev', '--disable-gpu'],
      env: {
        ...process.env,
        BIGU_LICENSE_DEV_MOCK: 'true',
        ELECTRON_ENABLE_LOGGING: '1',
      },
    });
    attachMainDiagnostics(electronApp, report);
    await new Promise(resolve => setTimeout(resolve, 2200));
    page = electronApp.windows().find(candidate => candidate.url().startsWith('file:')) || await electronApp.firstWindow();
    attachRendererDiagnostics(page, report);
    await electronApp.evaluate(({ app }, userData) => app.setPath('userData', userData), isolatedUserDataDir);
    await page.waitForLoadState('domcontentloaded');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    await capture(page, runDir, report, 'app-launched');

    const appReady = await page.locator('[data-home-new-match]').count();
    if (!appReady) {
      const startupState = await page.evaluate(() => ({
        url: typeof globalThis.location?.href === 'string' ? globalThis.location.href : '',
        hasApi: Boolean(globalThis.api),
        bodyText: typeof globalThis.document?.body?.innerText === 'string' ? globalThis.document.body.innerText : '',
      })).catch(error => ({ evaluateError: safeError(error) }));
      const startupEvidence = report.evidence.slice(-1);
      const startupBlocked = report.renderer.pageErrors.length || report.renderer.crashes.length;
      if (startupBlocked) {
        addFinding(report, {
          severity: 'blocker',
          title: 'El renderer no inició la app: ventana Electron en blanco',
          status: 'observed',
          steps: [
            'Lanzar la app real con Electron y un user-data aislado.',
            'Esperar la carga inicial del renderer.',
            'Observar que no aparece el shell de Home y la ventana queda en blanco.',
          ],
          evidence: startupEvidence,
          details: `pageErrors=${report.renderer.pageErrors.map(item => item.error).join(' | ')}; estado=${JSON.stringify(startupState)}.`,
        });
        throw new Error(`La app no montó .app-layout; no es posible ejecutar el flujo core sin modificar implementación. Estado: ${JSON.stringify(startupState)}`);
      }
    }
    if (!appReady) {
      await runAction(page, runDir, report, 'habilitar acceso de desarrollo aislado', async () => {
        const access = await page.evaluate(async () => {
          const nextAccess = await window.api.auth.activateOnline({
            user: { id: 'tester-a-user', email: 'tester-a@bigu.invalid' },
            profile: {
              id: 'tester-a-user',
              email: 'tester-a@bigu.invalid',
              status: 'approved',
              first_name: 'Tester',
              last_name: 'A',
              age: 30,
              app_role: 'analista',
              is_player: false,
              position: '',
            },
            club: {
              id: 'tester-a-club',
              name: 'Bigua QA',
              slug: 'bigu-qa',
              license_status: 'active',
              expires_at: '2099-12-31T23:59:59.000Z',
            },
            device: { id: 'tester-a-device', status: 'approved' },
          });
          if (!nextAccess?.allowed) throw new Error(`No se pudo habilitar acceso aislado: ${JSON.stringify(nextAccess)}`);
          await window.api.settings.set({ firstLaunch: false });
          return nextAccess;
        });
        return access;
      }, { notes: 'Setup real por IPC de licencia dev; no se mockearon APIs de matches/events.' });
      await page.reload({ waitUntil: 'domcontentloaded' });
    }

    await waitForVisible(page, '[data-home-new-match]', 20000);
    await runAction(page, runDir, report, 'crear partido nuevo: abrir formulario', async () => {
      await page.locator('[data-home-new-match]').click();
      await waitForVisible(page, '#new-match-form');
    });

    await runAction(page, runDir, report, 'crear partido nuevo: completar datos', async () => {
      await page.locator('#home-team').fill('Bigua QA');
      await page.locator('#away-team').fill('Rival Exploratorio');
      await page.locator('#competition').fill('Exploratory QA');
      await page.locator('#venue').selectOption('home');
    });

    await runAction(page, runDir, report, 'crear partido nuevo: confirmar creación', async () => {
      await page.locator('#create-match-btn').click();
      await page.locator('#new-match-form').waitFor({ state: 'detached', timeout: 15000 });
      await page.waitForFunction(() => document.querySelectorAll('[data-match-card="true"]').length > 0, null, { timeout: 15000 });
    }, { settleMs: 500 });

    const matchesAfterCreate = await page.evaluate(() => window.api.matches.getAll());
    const createdMatch = matchesAfterCreate
      .slice()
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))[0];
    matchId = createdMatch?.id || null;
    if (!matchId) throw new Error('La UI confirmó creación, pero no se pudo leer el partido por IPC.');
    report.match = {
      id: matchId,
      homeTeam: createdMatch.homeTeam,
      awayTeam: createdMatch.awayTeam,
      status: createdMatch.status,
    };

    await runAction(page, runDir, report, 'entrar a tagging desde el partido creado', async () => {
      await page.locator(`#match-card-${matchId} .match-card-action`).click();
      await waitForRoute(page, 'tagging');
      await waitForVisible(page, '#tagging-side-panel', 15000);
    }, { settleMs: 500 });

    const hotkeysOverlay = page.locator('[data-hotkeys-dismiss]');
    if (await hotkeysOverlay.count()) {
      await runAction(page, runDir, report, 'cerrar overlay inicial de hotkeys', async () => {
        await hotkeysOverlay.click();
        await hotkeysOverlay.waitFor({ state: 'detached' });
      });
    }

    await page.locator('.tagging-view').focus();
    const rapidKeySequence = ['R', 'S', 'M'];
    const rapidBefore = await capture(page, runDir, report, 'tagging-eventos-rapidos-before');
    const rapidStart = Date.now();
    for (const [index, key] of rapidKeySequence.entries()) {
      await page.keyboard.press(key);
      await waitForVisible(page, '.tag-popup');
      await completeTagPopup(page);
      await page.waitForFunction(
        ({ expected, id }) => window.api.matches.getById(id).then(match => (match?.events || []).length >= expected),
        { expected: index + 1, id: matchId },
        { timeout: 15000 },
      );
    }
    const rapidAfter = await capture(page, runDir, report, 'tagging-eventos-rapidos-after');
    report.actions.push({
      name: 'taggear varios eventos consecutivos con teclas rápidamente',
      startedAt: new Date(rapidStart).toISOString(),
      elapsedMs: Date.now() - rapidStart,
      responded: true,
      before: rapidBefore,
      after: rapidAfter,
      error: null,
      notes: `Secuencia enviada sin pausas intencionales: ${rapidKeySequence.join(' ')}`,
    });

    await runAction(page, runDir, report, 'abrir detalle de evento libre', async () => {
      await page.keyboard.press('N');
      await waitForVisible(page, '[data-popup-note]');
    });

    const eventCountBeforeDetail = await page.locator('[data-event-id]').count();
    await runAction(page, runDir, report, 'completar detalle de un evento', async () => {
      await page.locator('[data-popup-note]').fill('Detalle QA escrito durante la exploración live.');
      await page.locator('[data-popup-complete]').click();
      await page.waitForFunction(
        expected => document.querySelectorAll('[data-event-id]').length > expected,
        eventCountBeforeDetail,
        { timeout: 15000 },
      );
    }, { settleMs: 500 });

    await runAction(page, runDir, report, 'navegar al inspector del evento', async () => {
      await page.locator('[data-event-id]').last().click();
      await waitForVisible(page, '[data-event-edit]');
      await page.locator('[data-event-edit]').click();
      await waitForVisible(page, '[data-event-note-edit]');
    });

    await runAction(page, runDir, report, 'guardar modificación de detalle en inspector', async () => {
      await page.locator('[data-event-note-edit]').fill('Detalle QA editado desde el inspector.');
      await page.locator('[data-event-save]').click();
      await page.waitForFunction(
        ({ id, note }) => window.api.matches.getById(id).then(match => (match?.events || []).some(event => event.note === note)),
        { id: matchId, note: 'Detalle QA editado desde el inspector.' },
        { timeout: 15000 },
      );
    }, { settleMs: 500 });

    await runAction(page, runDir, report, 'cerrar inspector y volver al panel de estado', async () => {
      await page.locator('[data-event-close]').click();
      await page.waitForFunction(() => document.querySelector('#tagging-side-panel')?.dataset.panelMode === 'status');
    });

    const routeActions = [
      ['navegar a dashboard', 'dashboard'],
      ['volver a inicio', 'home'],
      ['navegar a tagging sin match activo', 'tagging'],
      ['volver a dashboard', 'dashboard'],
      ['volver a tagging', 'tagging'],
    ];
    for (const [name, route] of routeActions) {
      await runAction(page, runDir, report, name, async () => {
        await page.locator(`.sidebar-item[data-nav="${route}"]`).click();
        await waitForRoute(page, route);
      }, { settleMs: 600 });
      if (route === 'tagging' && !(await page.locator('#tagging-side-panel').count())) {
        await runAction(page, runDir, report, 'seleccionar partido al volver a tagging', async () => {
          await page.locator(`[data-tagging-match-id="${matchId}"]`).click();
          await waitForVisible(page, '#tagging-side-panel', 15000);
        }, { settleMs: 500 });
      }
    }

    await page.locator('.tagging-view').focus();
    await runAction(page, runDir, report, 'preparar una nueva acción de guardado', async () => {
      await page.keyboard.press('N');
      await page.locator('[data-popup-note]').fill('Guardado iniciado antes de cerrar la aplicación.');
      await waitForVisible(page, '[data-popup-complete]');
    });

    const closeBefore = await capture(page, runDir, report, 'cerrar-durante-guardado-before');
    const closeStart = Date.now();
    let closeResult = 'not-observed';
    try {
      await page.locator('[data-popup-complete]').click();
      const saveStarted = await capture(page, runDir, report, 'cerrar-durante-guardado-save-started');
      const closePromise = page.waitForEvent('close', { timeout: 8000 }).then(() => 'page-closed').catch(() => 'page-still-open');
      await page.locator('#titlebar-close').click();
      closeResult = await closePromise;
      report.evidence.push(saveStarted);
    } catch (error) {
      report.main.processErrors.push({ at: isoNow(), error: `Cierre durante guardado: ${safeError(error)}` });
      closeResult = `error: ${safeError(error)}`;
    }
    report.actions.push({
      name: 'cerrar la app a mitad de una acción de guardado',
      startedAt: new Date(closeStart).toISOString(),
      elapsedMs: Date.now() - closeStart,
      responded: closeResult === 'page-closed',
      before: closeBefore,
      after: null,
      error: closeResult === 'page-closed' ? null : closeResult,
      notes: 'El snapshot posterior no se captura desde una ventana ya cerrada; se valida con lectura del match.json y cierre del proceso.',
    });
    if (closeResult !== 'page-closed') {
      addFinding(report, {
        severity: 'high',
        title: 'La ventana no cerró al iniciar un guardado',
        status: 'observed',
        steps: ['Abrir un evento libre.', 'Completar el detalle.', 'Hacer click en cerrar inmediatamente.'],
        evidence: [closeBefore].filter(Boolean),
        details: closeResult,
      });
    }

    await new Promise(resolve => setTimeout(resolve, 1800));
    const matchFile = path.join(isolatedUserDataDir, 'data', String(matchId), 'match.json');
    const matchJsonExists = fs.existsSync(matchFile);
    if (matchJsonExists) {
      const matchJson = JSON.parse(await fsp.readFile(matchFile, 'utf8'));
      const finalJsonEvidence = path.join(runDir, 'final-match.json');
      await fsp.writeFile(finalJsonEvidence, JSON.stringify(matchJson, null, 2), 'utf8');
      report.evidence.push(relativeEvidence(REPO_ROOT, finalJsonEvidence));
      report.jsonReadback = {
        matchJsonExists: true,
        path: relativeEvidence(REPO_ROOT, finalJsonEvidence),
        eventsCount: Array.isArray(matchJson.events) ? matchJson.events.length : 0,
        lastEventNote: matchJson.events?.at(-1)?.note || '',
        status: matchJson.status,
      };
      if (report.jsonReadback.eventsCount < 4) {
        addFinding(report, {
          severity: 'high',
          title: 'El match.json perdió eventos durante el flujo live',
          status: 'observed',
          steps: ['Crear un partido.', 'Taggear tres eventos consecutivos.', 'Completar un evento con detalle.', 'Cerrar durante el guardado.', 'Leer data/<matchId>/match.json.'],
          evidence: [relativeEvidence(REPO_ROOT, finalJsonEvidence)],
          details: `Se esperaban al menos 4 eventos y se leyeron ${report.jsonReadback.eventsCount}.`,
        });
      }
    } else {
      report.jsonReadback = { matchJsonExists: false, expectedPath: matchFile };
      addFinding(report, {
        severity: 'high',
        title: 'No se encontró match.json después de crear el partido',
        status: 'observed',
        steps: ['Crear un partido nuevo.', 'Cerrar la app.', 'Leer data/<matchId>/match.json en el user-data aislado.'],
        evidence: [],
        details: matchFile,
      });
    }

    if (report.renderer.pageErrors.length || report.renderer.crashes.length) {
      addFinding(report, {
        severity: 'medium',
        title: 'Se observaron errores o excepciones del renderer',
        status: 'observed',
        steps: ['Ejecutar el flujo completo del reporte.'],
        evidence: report.evidence.slice(-5),
        details: `pageerror=${report.renderer.pageErrors.length}; crash=${report.renderer.crashes.length}.`,
      });
    }
    if (report.main.processErrors.length) {
      addFinding(report, {
        severity: 'medium',
        title: 'Se observaron errores de proceso main',
        status: 'observed',
        steps: ['Lanzar Electron con el user-data aislado y ejecutar el flujo.'],
        evidence: report.evidence.slice(-5),
        details: report.main.processErrors.map(item => item.error).join(' | '),
      });
    }
  } catch (error) {
    report.fatalError = safeError(error);
    if (page && !page.isClosed()) await capture(page, runDir, report, 'fatal-error-state');
    throw error;
  } finally {
    if (electronApp) {
      try {
        await electronApp.close();
      } catch (error) {
        report.main.processErrors.push({ at: isoNow(), error: `electronApp.close: ${safeError(error)}` });
      }
    }
    try {
      await fsp.rm(isolatedUserDataDir, { recursive: true, force: true });
    } catch (error) {
      report.main.processErrors.push({ at: isoNow(), error: `cleanup user-data: ${safeError(error)}` });
    }
    await writeReport(runDir, report);
  }
});
