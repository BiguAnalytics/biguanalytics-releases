import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createSecureSessionStore } from '../secure-session-store.js';

function createTempUserData() {
  return mkdtempSync(join(tmpdir(), 'bigu-license-session-'));
}

function createSafeStorageStub() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (buffer) => buffer.toString('utf8').replace(/^encrypted:/, ''),
  };
}

describe('secure session store', () => {
  it('encrypts, decrypts and clears Supabase session values with safeStorage', async () => {
    const userData = createTempUserData();
    const store = createSecureSessionStore({
      app: { getPath: () => userData },
      safeStorage: createSafeStorageStub(),
      logger: { warn: () => {} },
    });

    await store.set('supabase.auth.token', '{"access_token":"abc123"}');

    expect(await store.get('supabase.auth.token')).toBe('{"access_token":"abc123"}');
    expect(readFileSync(join(userData, 'license-session.json'), 'utf8')).not.toContain('abc123');

    await store.remove('supabase.auth.token');
    expect(await store.get('supabase.auth.token')).toBeNull();

    await store.set('supabase.auth.token', 'next-token');
    await store.clear();
    expect(existsSync(join(userData, 'license-session.json'))).toBe(false);

    rmSync(userData, { recursive: true, force: true });
  });

  it('uses a documented fallback when encryption is unavailable', async () => {
    const userData = createTempUserData();
    const warnings = [];
    const store = createSecureSessionStore({
      app: { getPath: () => userData },
      safeStorage: { isEncryptionAvailable: () => false },
      logger: { warn: (message) => warnings.push(message) },
    });

    await store.set('supabase.auth.token', 'fallback-token');

    expect(await store.get('supabase.auth.token')).toBe('fallback-token');
    expect(warnings.join('\n')).toContain('safeStorage');
    expect(readFileSync(join(userData, 'license-session.json'), 'utf8')).not.toContain('fallback-token');

    rmSync(userData, { recursive: true, force: true });
  });

  it('distinguishes a corrupt session file from an absent session and preserves a backup', async () => {
    const userData = createTempUserData();
    const sessionPath = join(userData, 'license-session.json');
    writeFileSync(sessionPath, '{ broken session', 'utf8');
    const store = createSecureSessionStore({
      app: { getPath: () => userData },
      safeStorage: createSafeStorageStub(),
      logger: { warn: () => {} },
    });

    await expect(store.get('supabase.auth.token')).rejects.toMatchObject({
      recoverable: true,
      code: 'SESSION_FILE_CORRUPT',
      backupPath: expect.stringContaining('license-session.json.corrupt-'),
    });
    await expect(store.set('supabase.auth.token', 'replacement')).rejects.toMatchObject({
      recoverable: true,
      code: 'SESSION_FILE_CORRUPT',
    });
    expect(readFileSync(sessionPath, 'utf8')).toBe('{ broken session');
    expect(readdirSync(userData).filter(file => file.startsWith('license-session.json.corrupt-'))).toHaveLength(1);

    rmSync(userData, { recursive: true, force: true });
  });
});
