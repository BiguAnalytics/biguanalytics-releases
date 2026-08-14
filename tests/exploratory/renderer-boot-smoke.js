const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const PACKAGED_EXECUTABLE = path.join(REPOSITORY_ROOT, 'dist', 'win-unpacked', 'BiguAnalytics.exe');
const packaged = process.env.BIGU_RENDERER_SMOKE_PACKAGED === 'true';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const evidenceRoot = path.join(__dirname, 'evidence', `renderer-boot-smoke-${runId}`);

async function run() {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'bigu-renderer-boot-'));
  const report = {
    runId,
    runtime: 'Electron real + Playwright _electron',
    packaged,
    executablePath: packaged ? PACKAGED_EXECUTABLE : require('electron'),
    sourceEntry: 'src/main/main.js',
    userDataPath,
    console: [],
    pageErrors: [],
    screenshots: [],
    bodyText: '',
  };
  let electronApp;

  try {
  await fs.mkdir(evidenceRoot, { recursive: true });
  electronApp = await _electron.launch({
    executablePath: packaged ? PACKAGED_EXECUTABLE : require('electron'),
    args: packaged
      ? ['--dev', `--user-data-dir=${userDataPath}`]
      : [REPOSITORY_ROOT, '--dev', `--user-data-dir=${userDataPath}`],
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      BIGU_LICENSE_DEV_MOCK: 'true',
      ELECTRON_ENABLE_LOGGING: '1',
    },
    timeout: 30000,
  });
  const page = electronApp.windows().find((candidate) => candidate.url().startsWith('file:'))
    || await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => window.innerWidth > 0 && window.innerHeight > 0, null, { timeout: 10000 });
  page.on('console', (message) => {
    report.console.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => {
    report.pageErrors.push(String(error?.stack || error?.message || error));
  });

  for (const label of ['before', 'after']) {
    const screenshotPath = path.join(evidenceRoot, `${label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    report.screenshots.push(path.relative(REPOSITORY_ROOT, screenshotPath).replaceAll('\\', '/'));
    if (label === 'before') await page.waitForTimeout(3500);
  }

  report.bodyText = await page.locator('body').innerText();
  const uuidErrors = report.pageErrors.filter((message) => /Failed to resolve module specifier ["']uuid/i.test(message));
  assert.equal(uuidErrors.length, 0, `renderer todavía no puede resolver uuid: ${uuidErrors.join(' | ')}`);
  assert.ok(report.bodyText.trim().length > 0, 'el renderer quedó sin contenido visible');
  } finally {
    await fs.writeFile(
      path.join(evidenceRoot, 'report.json'),
      JSON.stringify(report, null, 2),
      'utf8',
    );
    await electronApp?.close().catch(() => {});
    await fs.rm(userDataPath, { recursive: true, force: true });
  }

  process.stdout.write(`${path.relative(REPOSITORY_ROOT, evidenceRoot).replaceAll('\\', '/')}`);
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}`);
  process.exitCode = 1;
});
