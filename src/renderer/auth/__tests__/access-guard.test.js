import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const guardSource = readFileSync(new URL('../access-guard.js', import.meta.url), 'utf8');
const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');

describe('access guard wiring', () => {
  it('mounts router/sidebar/topbar before remote license access completes', () => {
    expect(appSource).toContain("renderAccessGate");
    expect(appSource).toContain('resolveStartupAccess');
    expect(appSource).toContain('startBackgroundAccessRefresh');
    expect(appSource).toContain('runBackgroundAccessVerification');
    expect(appSource).toContain('refreshAccessAfterReconnect');
    expect(appSource).toContain("window.addEventListener('online', refreshAccessAfterReconnect)");
    expect(appSource).toContain('updateShellForAccess(nextAccess)');
    expect(appSource).not.toContain('const access = await renderAccessGate(app');
    expect(appSource.indexOf('resolveStartupAccess')).toBeLessThan(appSource.indexOf('mountAppShell(app, startupAccess.access'));
    expect(appSource).toContain('createSidebar(');
    expect(appSource).toContain('initRouter()');
    expect(appSource.indexOf('mountAppShell(app, startupAccess.access')).toBeLessThan(appSource.indexOf('startBackgroundAccessRefresh(app'));
  });

  it('keeps shell/router and online listeners idempotent across access refreshes', () => {
    expect(appSource).toContain('let shellMounted = false');
    expect(appSource).toContain("markStartup('shell:mounted'");
    expect(appSource).toContain('updateShellForAccess(nextAccess)');
    expect(appSource).toContain('onUpdate: async (nextAccess) => updateShellForAccess(nextAccess)');
    expect(routerSource).toContain('let routerInitialized = false');
    expect(routerSource).toContain('if (routerInitialized) {');
    expect(routerSource).toContain("markStartup('route:current'");
  });

  it('protects every application route behind active license state', () => {
    ['home', 'tagging', 'dashboard', 'clips', 'settings', 'season', 'tactical'].forEach((route) => {
      expect(guardSource).toContain(route);
    });
    expect(guardSource).toContain('isAllowedAccessState');
    expect(guardSource).toContain("state === 'active'");
    expect(guardSource).toContain("state === 'offline_grace'");
    expect(guardSource).toContain('ACCESS_STATES.INVALID_LICENSE');
    expect(guardSource).toContain('ACCESS_STATES.RENEWAL_REQUIRED');
    expect(routerSource).toContain('canAccessRoute');
  });

  it('makes retry and sign out visibly recover from blocked states', () => {
    expect(guardSource).toContain('renderCheckingLicense');
    expect(guardSource).toContain('ACCESS_CHECK_TIMEOUT_MS');
    expect(guardSource).toContain('license_check_timeout');
    expect(guardSource).toContain('checkingTimeoutId');
    expect(guardSource).toContain('onTimeout');
    expect(guardSource).toContain('onRetry: async');
    expect(guardSource).toContain('showChecking');
    expect(guardSource).toContain('onSignOut: async');
    expect(guardSource).toContain('renderLoginScreen(app');
  });

  it('routes incomplete profiles to the profile gate before pending device approval', () => {
    expect(guardSource).toContain('ACCESS_STATES.PENDING_DEVICE');
    expect(guardSource).toContain('ACCESS_STATES.PERSONAL_INFO_REQUIRED');
    expect(guardSource).toContain('licenseService.updatePersonalInfo');
    expect(guardSource).not.toContain("authMethod === 'otp' && isMissingDevice");
    expect(guardSource).not.toContain('new_device_requires_personal_info');
  });
});
