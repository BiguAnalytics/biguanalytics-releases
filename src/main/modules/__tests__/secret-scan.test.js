import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('general secret scan', () => {
  let root;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'bigua-secret-scan-'));
    await mkdir(join(root, 'src', 'renderer'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'package'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('detects common secrets in relevant files and redacts values in reports', async () => {
    const googleKey = ['AIzaSyA', '12345678901234567890123456789012345'].join('');
    const bearerToken = ['Bearer ', 'abcdefghijklmnopqrstuvwxyz1234567890'].join('');
    const openAIKey = ['sk-proj-', 'abcdefghijklmnopqrstuvwxyz1234567890'].join('');
    await writeFile(join(root, 'src', 'renderer', 'leak.js'), `const googleKey = "${googleKey}";\nconst auth = "${bearerToken}";\n`, 'utf8');
    await writeFile(join(root, '.env.local'), `OPENAI_API_KEY=${openAIKey}\n`, 'utf8');
    await writeFile(join(root, 'node_modules', 'package', 'ignored.js'), `const ignored = "${googleKey}";\n`, 'utf8');

    const { formatFindings, scanForSecrets } = await import('../../../../scripts/check-secrets.js');
    const findings = scanForSecrets({ roots: [root], cwd: root });
    const report = formatFindings(findings, { cwd: root });

    expect(findings.map(finding => finding.type)).toEqual(expect.arrayContaining([
      'Google API key',
      'Bearer token',
      'env file',
      'OpenAI API key',
    ]));
    expect(findings.some(finding => finding.file.includes('node_modules'))).toBe(false);
    expect(report).toContain('src/renderer/leak.js:1: Google API key');
    expect(report).toContain('[REDACTED]');
    expect(report).not.toContain(googleKey);
    expect(report).not.toContain(bearerToken);
    expect(report).not.toContain(openAIKey);
  });

  it('allows public Supabase client config and blocks service-role client leaks', async () => {
    const scriptPath = resolve(process.cwd(), 'scripts/check-ai-client-secrets.js');
    const runClientSecretScan = () => execFileSync(process.execPath, [scriptPath, root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const publicConfigPath = join(root, 'src', 'renderer', 'public-config.js');
    await writeFile(publicConfigPath, [
      "export const SUPABASE_URL = 'https://eenqsorivrtkeqauehkc.supabase.co';",
      "export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_5huxPoLeXxcuMUOCnB9Dpg_WB6NNVyR';",
    ].join('\n'), 'utf8');

    expect(runClientSecretScan).not.toThrow();

    await writeFile(join(root, 'src', 'renderer', 'leaked-service-role.js'), [
      "export const keyHint = 'server credential';",
      "export const leaked = 'sb_secret_abcdefghijklmnopqrstuvwxyz123456';",
    ].join('\n'), 'utf8');

    expect(runClientSecretScan).toThrow(/Supabase secret key/i);
  });
});
