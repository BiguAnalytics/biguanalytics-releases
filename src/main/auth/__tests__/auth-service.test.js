import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAuthAccessService } from '../auth-service.js';

const start = new Date('2026-05-31T12:00:00.000Z');

function createTempUserData() {
  return mkdtempSync(join(tmpdir(), 'bigu-offline-grace-'));
}

function createSafeStorageStub() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`sealed:${Buffer.from(String(value), 'utf8').toString('base64')}`, 'utf8'),
    decryptString: (buffer) => {
      const raw = buffer.toString('utf8');
      if (!raw.startsWith('sealed:')) throw new Error('decrypt failed');
      return Buffer.from(raw.slice('sealed:'.length), 'base64').toString('utf8');
    },
  };
}

function createService({
  userData = createTempUserData(),
  now = () => start,
  verifyOnline,
  offlineGraceHours = 72,
} = {}) {
  const service = createAuthAccessService({
    app: { getPath: () => userData },
    safeStorage: createSafeStorageStub(),
    now,
    config: {
      offlineGraceHours,
      minOfflineGraceHours: 24,
      maxOfflineGraceHours: 72,
      clockRollbackToleranceMinutes: 5,
      licenseEndpoint: '',
      licensePublicKey: '',
      licenseDevMock: true,
    },
    licenseClient: verifyOnline ? { verifyOnline } : undefined,
  });
  return { service, userData };
}

const activePayload = {
  user: { id: 'user-1', email: 'analyst@bigua.com' },
  profile: {
    id: 'user-1',
    email: 'analyst@bigua.com',
    club_id: 'club-1',
    status: 'approved',
    display_name: 'Ana G.',
    first_name: 'Ana',
    last_name: 'Garcia',
    age: 31,
    app_role: 'analista',
    is_player: false,
    position: null,
  },
  club: { id: 'club-1', name: 'Bigua Rugby', slug: 'bigua', license_status: 'active' },
  device: { id: 'device-1', status: 'approved' },
};

function receiptPath(userData) {
  return join(userData, 'auth', 'offline-receipt.bin');
}

function snapshotPath(userData) {
  return join(userData, 'auth', 'local-access-snapshot.bin');
}

function devicePath(userData) {
  return join(userData, 'auth', 'device-id.bin');
}

describe('main auth offline grace service', () => {
  it('denies first activation without a local receipt', async () => {
    const { service, userData } = createService();

    await expect(service.getAccessStatus()).resolves.toMatchObject({
      state: 'activation_required',
      reason: 'missing_receipt',
      message: 'Necesitás conectarte a internet para activar BiguAnalytics por primera vez.',
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('stores a valid online activation receipt encrypted at rest', async () => {
    const { service, userData } = createService();

    await expect(service.activateOnline(activePayload)).resolves.toMatchObject({
      state: 'active',
      offlineGraceExpiresAt: '2026-06-03T12:00:00.000Z',
    });

    const encrypted = readFileSync(receiptPath(userData), 'utf8');
    expect(encrypted).not.toContain('analyst@bigua.com');
    expect(encrypted).not.toContain('club-1');
    expect(encrypted).not.toContain('Bigua Rugby');

    rmSync(userData, { recursive: true, force: true });
  });

  it('stores only sanitized non-secret local access snapshot metadata', async () => {
    const safeStorage = createSafeStorageStub();
    const { service, userData } = createService();

    await service.activateOnline({
      ...activePayload,
      user: {
        ...activePayload.user,
        access_token: 'eyJ.secret.jwt',
        refresh_token: 'refresh-secret',
      },
      profile: {
        ...activePayload.profile,
        first_name: 'Ana',
        last_name: 'Garcia',
        app_role: 'analista',
        gemini_api_key: 'AIza-secret',
      },
      club: {
        ...activePayload.club,
        license_status: 'active',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
      },
    });

    const snapshot = JSON.parse(safeStorage.decryptString(readFileSync(snapshotPath(userData))));
    expect(snapshot).toMatchObject({
      user_id: 'user-1',
      club_id: 'club-1',
      device_id: 'device-1',
      profile_status: 'approved',
      license_status: 'active',
      device_status: 'approved',
      profile_complete: true,
      profile_display_name: 'Ana G.',
      lastVerifiedAt: '2026-05-31T12:00:00.000Z',
      offlineGraceExpiresAt: '2026-06-03T12:00:00.000Z',
      lastKnownDisplayName: 'Ana G.',
      lastKnownRole: 'analista',
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service-role-secret|AIza|access_token|refresh_token|eyJ\.secret\.jwt/i);

    rmSync(userData, { recursive: true, force: true });
  });

  it('allows offline access inside the grace period', async () => {
    const userData = createTempUserData();
    let current = start;
    const { service } = createService({ userData, now: () => current });
    await service.activateOnline(activePayload);

    current = new Date('2026-06-01T00:00:00.000Z');

    await expect(service.getAccessStatus()).resolves.toMatchObject({
      state: 'offline_grace',
      reason: 'receipt_valid',
      hoursRemaining: 60,
      offlineGraceExpiresAt: '2026-06-03T12:00:00.000Z',
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('creates Supabase-derived local grace without requiring a separate license endpoint', async () => {
    const userData = createTempUserData();
    let current = start;
    const { service } = createService({
      userData,
      now: () => current,
      verifyOnline: async () => ({ status: 'network_error', reason: 'missing_license_endpoint' }),
    });

    await expect(service.activateOnline(activePayload)).resolves.toMatchObject({
      state: 'active',
      reason: 'supabase_local_grace',
      localSource: 'local_access_snapshot',
      lastVerifiedAt: '2026-05-31T12:00:00.000Z',
      offlineGraceExpiresAt: '2026-06-03T12:00:00.000Z',
    });
    expect(existsSync(receiptPath(userData))).toBe(false);

    current = new Date('2026-06-01T00:00:00.000Z');

    await expect(service.getAccessStatus()).resolves.toMatchObject({
      state: 'offline_grace',
      reason: 'snapshot_valid',
      allowed: true,
      localState: 'active',
      localSource: 'local_access_snapshot',
      lastVerifiedAt: '2026-05-31T12:00:00.000Z',
      offlineGraceExpiresAt: '2026-06-03T12:00:00.000Z',
      user: { id: 'user-1', email: 'analyst@bigua.com' },
      club: { id: 'club-1', name: 'Bigua Rugby' },
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('keeps Supabase-derived local grace when online renewal cannot reach Supabase', async () => {
    const userData = createTempUserData();
    let current = start;
    const { service } = createService({
      userData,
      now: () => current,
      verifyOnline: async () => ({ status: 'network_error', reason: 'missing_license_endpoint' }),
    });
    await service.activateOnline(activePayload);
    current = new Date('2026-06-01T00:00:00.000Z');

    await expect(service.refreshOnline(activePayload)).resolves.toMatchObject({
      state: 'offline_grace',
      reason: 'snapshot_valid',
      localSource: 'local_access_snapshot',
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('blocks Supabase-derived local access after grace expires', async () => {
    const userData = createTempUserData();
    let current = start;
    const { service } = createService({
      userData,
      now: () => current,
      verifyOnline: async () => ({ status: 'network_error', reason: 'missing_license_endpoint' }),
    });
    await service.activateOnline(activePayload);
    current = new Date('2026-06-04T13:00:00.000Z');

    await expect(service.getAccessStatus()).resolves.toMatchObject({
      state: 'renewal_required',
      reason: 'offline_grace_expired',
      blockReason: 'offline_grace_expired',
      localSource: 'local_access_snapshot',
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('does not mint local grace from rejected cached access data', async () => {
    const userData = createTempUserData();
    const { service } = createService({
      userData,
      verifyOnline: async () => ({ status: 'network_error', reason: 'missing_license_endpoint' }),
    });

    await expect(service.activateOnline({
      ...activePayload,
      profile: { ...activePayload.profile, status: 'rejected' },
    })).resolves.toMatchObject({
      state: 'blocked_user',
      reason: 'profile_rejected',
      blockReason: 'profile_rejected',
    });

    await expect(service.getAccessStatus()).resolves.toMatchObject({
      state: 'blocked_user',
      reason: 'profile_rejected',
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('does not mint local grace from incomplete profile data', async () => {
    const userData = createTempUserData();
    const { service } = createService({
      userData,
      verifyOnline: async () => ({ status: 'network_error', reason: 'missing_license_endpoint' }),
    });

    await expect(service.activateOnline({
      ...activePayload,
      profile: {
        ...activePayload.profile,
        first_name: '',
        display_name: '',
      },
    })).resolves.toMatchObject({
      state: 'personal_info_required',
      reason: 'profile_incomplete',
      allowed: false,
    });
    expect(existsSync(receiptPath(userData))).toBe(false);

    rmSync(userData, { recursive: true, force: true });
  });

  it('does not mint offline grace for a pending device', async () => {
    const userData = createTempUserData();
    const { service } = createService({
      userData,
      verifyOnline: async () => ({ status: 'network_error', reason: 'missing_license_endpoint' }),
    });

    await expect(service.activateOnline({
      ...activePayload,
      device: { ...activePayload.device, status: 'pending' },
    })).resolves.toMatchObject({
      state: 'pending_device',
      reason: 'device_pending',
      allowed: false,
    });
    expect(existsSync(receiptPath(userData))).toBe(false);

    rmSync(userData, { recursive: true, force: true });
  });

  it('clears offline grace when the approved device is revoked online', async () => {
    const userData = createTempUserData();
    const { service } = createService({
      userData,
      verifyOnline: async () => ({ status: 'network_error', reason: 'missing_license_endpoint' }),
    });
    await service.activateOnline(activePayload);

    await expect(service.activateOnline({
      ...activePayload,
      device: {
        ...activePayload.device,
        status: 'revoked',
        revoked_at: '2026-05-31T12:00:00.000Z',
      },
    })).resolves.toMatchObject({
      state: 'blocked_device',
      reason: 'device_revoked',
      blockReason: 'device_revoked',
    });
    expect(existsSync(receiptPath(userData))).toBe(false);
    await expect(service.getAccessStatus()).resolves.toMatchObject({
      state: 'blocked_device',
      reason: 'device_revoked',
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('denies offline access after the grace period expires', async () => {
    const userData = createTempUserData();
    let current = start;
    const { service } = createService({ userData, now: () => current });
    await service.activateOnline(activePayload);

    current = new Date('2026-06-04T12:01:00.000Z');

    await expect(service.getAccessStatus()).resolves.toMatchObject({
      state: 'renewal_required',
      reason: 'offline_grace_expired',
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('denies and clears a corrupt receipt', async () => {
    const userData = createTempUserData();
    mkdirSync(join(userData, 'auth'), { recursive: true });
    writeFileSync(receiptPath(userData), 'not encrypted', 'utf8');
    const { service } = createService({ userData });

    await expect(service.getAccessStatus()).resolves.toMatchObject({
      state: 'renewal_required',
      reason: 'receipt_corrupt',
    });
    expect(existsSync(receiptPath(userData))).toBe(false);

    rmSync(userData, { recursive: true, force: true });
  });

  it('denies a receipt with an invalid signed token', async () => {
    const userData = createTempUserData();
    const safeStorage = createSafeStorageStub();
    const { service } = createService({ userData });
    await service.activateOnline(activePayload);
    const receipt = JSON.parse(safeStorage.decryptString(readFileSync(receiptPath(userData))));
    receipt.signedToken = `${receipt.signedToken.slice(0, -8)}tampered`;
    writeFileSync(receiptPath(userData), safeStorage.encryptString(JSON.stringify(receipt)));

    await expect(service.getAccessStatus()).resolves.toMatchObject({
      state: 'renewal_required',
      reason: 'invalid_signature',
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('denies a receipt bound to a different local device id', async () => {
    const userData = createTempUserData();
    const { service } = createService({ userData });
    await service.activateOnline(activePayload);
    rmSync(devicePath(userData), { force: true });

    await expect(service.getAccessStatus()).resolves.toMatchObject({
      state: 'renewal_required',
      reason: 'device_mismatch',
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('denies offline access after a strong clock rollback', async () => {
    const userData = createTempUserData();
    let current = start;
    const { service } = createService({ userData, now: () => current });
    await service.activateOnline(activePayload);
    current = new Date('2026-05-31T14:00:00.000Z');
    await expect(service.getAccessStatus()).resolves.toMatchObject({ state: 'offline_grace' });

    current = new Date('2026-05-31T13:40:00.000Z');

    await expect(service.getAccessStatus()).resolves.toMatchObject({
      state: 'renewal_required',
      reason: 'clock_rollback_detected',
      clockRollbackDetected: true,
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('blocks and clears the receipt when the backend revokes the license', async () => {
    const userData = createTempUserData();
    const { service } = createService({ userData });
    await service.activateOnline(activePayload);
    const revoked = createService({
      userData,
      verifyOnline: async () => ({ status: 'revoked', reason: 'license_revoked' }),
    }).service;

    await expect(revoked.refreshOnline(activePayload)).resolves.toMatchObject({
      state: 'invalid_license',
      reason: 'license_revoked',
    });
    expect(existsSync(receiptPath(userData))).toBe(false);

    rmSync(userData, { recursive: true, force: true });
  });

  it('clears offline grace and caches hard denial when renderer revokes local access', async () => {
    const userData = createTempUserData();
    const { service } = createService({ userData });
    await service.activateOnline(activePayload);

    await expect(service.revokeLocalAccess({
      state: 'suspended_license',
      reason: 'license_suspended',
      user: activePayload.user,
      profile: activePayload.profile,
      club: { ...activePayload.club, license_status: 'suspended' },
      device: activePayload.device,
    })).resolves.toMatchObject({
      state: 'suspended_license',
      reason: 'license_suspended',
    });

    expect(existsSync(receiptPath(userData))).toBe(false);
    await expect(service.getAccessStatus()).resolves.toMatchObject({
      state: 'suspended_license',
      reason: 'license_suspended',
      allowed: false,
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('falls back to a valid receipt when the backend does not respond', async () => {
    const userData = createTempUserData();
    const { service } = createService({ userData });
    await service.activateOnline(activePayload);
    const offline = createService({
      userData,
      verifyOnline: async () => ({ status: 'network_error', reason: 'fetch_failed' }),
    }).service;

    await expect(offline.refreshOnline(activePayload)).resolves.toMatchObject({
      state: 'offline_grace',
      reason: 'receipt_valid',
    });

    rmSync(userData, { recursive: true, force: true });
  });

  it('denies when the backend does not respond and the receipt is expired', async () => {
    const userData = createTempUserData();
    let current = start;
    const { service } = createService({ userData, now: () => current });
    await service.activateOnline(activePayload);
    current = new Date('2026-06-04T13:00:00.000Z');
    const offline = createService({
      userData,
      now: () => current,
      verifyOnline: async () => ({ status: 'network_error', reason: 'fetch_failed' }),
    }).service;

    await expect(offline.refreshOnline(activePayload)).resolves.toMatchObject({
      state: 'renewal_required',
      reason: 'offline_grace_expired',
    });

    rmSync(userData, { recursive: true, force: true });
  });
});
