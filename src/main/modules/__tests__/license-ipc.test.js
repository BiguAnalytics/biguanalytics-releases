import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const ipcSource = readFileSync(new URL('../../ipc.js', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../../preload.js', import.meta.url), 'utf8');
const authSessionKeysSource = readFileSync(new URL('../auth-session-keys.js', import.meta.url), 'utf8');

describe('license IPC surface', () => {
  it('exposes auth session methods without a generic key-value IPC surface', () => {
    expect(ipcSource).toContain("auth:getAccessStatus");
    expect(ipcSource).toContain("auth:activateOnline");
    expect(ipcSource).toContain("auth:refreshOnline");
    expect(ipcSource).toContain("auth:revokeLocalAccess");
    expect(ipcSource).toContain("auth:logout");
    expect(ipcSource).toContain("account:clearLocalData");
    expect(ipcSource).toContain("authSession:get");
    expect(ipcSource).toContain("authSession:set");
    expect(ipcSource).toContain("authSession:remove");
    expect(ipcSource).toContain("authSession:clear");
    expect(ipcSource).toContain("lazyRequire('./modules/auth-session-keys')");
    expect(ipcSource).toContain('validateAuthSessionKey(key)');
    expect(authSessionKeysSource).toContain("AUTH_SESSION_STORAGE_KEY = 'bigu-license-auth'");
    expect(authSessionKeysSource).toContain("'-code-verifier'");
    expect(authSessionKeysSource).toContain("'-user'");
    expect(ipcSource).not.toContain("licenseSession:get");
    expect(ipcSource).not.toContain("licenseSession:set");
    expect(ipcSource).not.toContain("licenseSession:remove");
    expect(ipcSource).not.toContain("licenseSession:clear");
    expect(ipcSource).toContain("licenseConfig:get");
    expect(ipcSource).toContain("device:getFingerprint");
    expect(ipcSource).toContain("device:getCachedApprovedDevice");
    expect(ipcSource).toContain("device:cacheApprovedDevice");
    expect(ipcSource).toContain("device:clearCachedApprovedDevice");

    expect(preloadSource).toContain('auth: {');
    expect(preloadSource).toContain('getAccessStatus');
    expect(preloadSource).toContain('activateOnline');
    expect(preloadSource).toContain('refreshOnline');
    expect(preloadSource).toContain('revokeLocalAccess');
    expect(preloadSource).toContain('logout');
    expect(preloadSource).toContain('clearLocalData');
    expect(preloadSource).toContain('authSession');
    expect(preloadSource).not.toContain('licenseSession');
    expect(preloadSource).not.toContain("ipcRenderer.invoke('files:open'");
    expect(preloadSource).toContain("ipcRenderer.invoke('exports:openPath'");
    expect(preloadSource).toContain('licenseConfig');
    expect(preloadSource).toContain('getFingerprint');
    expect(preloadSource).toContain('getCachedApprovedDevice');
    expect(preloadSource).toContain('cacheApprovedDevice');
    expect(preloadSource).toContain('clearCachedApprovedDevice');
    expect(preloadSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(preloadSource).not.toContain('service_role');
  });
});
