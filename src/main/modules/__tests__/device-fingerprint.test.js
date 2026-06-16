import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildFingerprintSource,
  createDeviceIdentityStore,
  createDeviceFingerprint,
  hashFingerprintSource,
} from '../device-fingerprint.js';

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

describe('device fingerprint', () => {
  it('hashes legacy machine inputs without exposing the raw source', () => {
    const source = buildFingerprintSource({
      seed: 'local-seed',
      machineId: 'windows-machine-guid',
      hostname: 'ANALYSIS-PC',
      platform: 'win32',
      arch: 'x64',
    });
    const first = hashFingerprintSource(source);
    const second = hashFingerprintSource(source);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain('ANALYSIS-PC');
    expect(first).not.toContain('windows-machine-guid');
    expect(first).not.toContain('local-seed');
  });

  it('returns v2 hashes and safe device metadata without raw machine identifiers', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'bigu-device-fingerprint-'));
    const result = await createDeviceFingerprint({
      app: {
        getPath: () => userData,
        getVersion: () => '0.1.0',
      },
      os: {
        hostname: () => 'ANALYSIS-PC',
        arch: () => 'x64',
      },
      processInfo: { platform: 'win32' },
      machineIdProvider: () => 'windows-machine-guid',
      seedProvider: () => 'local-seed',
      installationIdProvider: () => '11111111-1111-4111-8111-111111111111',
    });

    expect(result).toMatchObject({
      fingerprintHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      fingerprintVersion: 2,
      installationIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      machineIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      legacyFingerprintHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      deviceName: 'ANALYSIS-PC',
      platform: 'win32-x64',
      appVersion: '0.1.0',
    });
    expect(JSON.stringify(result)).not.toContain('windows-machine-guid');
    expect(JSON.stringify(result)).not.toContain('local-seed');
    expect(JSON.stringify(result)).not.toContain('11111111-1111-4111-8111-111111111111');

    rmSync(userData, { recursive: true, force: true });
  });

  it('does not let network, wifi, ip, gateway or dns inputs change the v2 fingerprint', async () => {
    const baseDeps = {
      app: {
        getPath: () => process.cwd(),
        getVersion: () => '0.1.0',
      },
      processInfo: { platform: 'win32' },
      machineIdProvider: () => 'windows-machine-guid',
      seedProvider: () => 'local-seed',
      installationIdProvider: () => '11111111-1111-4111-8111-111111111111',
    };
    const first = await createDeviceFingerprint({
      ...baseDeps,
      os: {
        hostname: () => 'PCMaxi',
        arch: () => 'x64',
        networkInterfaces: () => {
          throw new Error('networkInterfaces must not be used for stable identity');
        },
        network: {
          ssid: 'Home WiFi',
          ip: '192.168.0.10',
          gateway: '192.168.0.1',
          dns: '1.1.1.1',
        },
      },
    });
    const second = await createDeviceFingerprint({
      ...baseDeps,
      os: {
        hostname: () => 'PCMaxi',
        arch: () => 'x64',
        networkInterfaces: () => {
          throw new Error('networkInterfaces must not be used for stable identity');
        },
        network: {
          ssid: 'Club WiFi',
          ip: '10.0.0.44',
          gateway: '10.0.0.1',
          dns: '8.8.8.8',
        },
      },
    });

    expect(second.fingerprintHash).toBe(first.fingerprintHash);
    expect(second.installationIdHash).toBe(first.installationIdHash);
    expect(second.machineIdHash).toBe(first.machineIdHash);
  });

  it('persists installation identity encrypted and caches approved device metadata separately', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'bigu-device-identity-'));
    const safeStorage = createSafeStorageStub();
    const store = createDeviceIdentityStore({
      app: { getPath: () => userData },
      safeStorage,
    });

    const firstInstallationId = await store.getOrCreateInstallationId();
    const secondInstallationId = await store.getOrCreateInstallationId();
    await store.cacheApprovedDevice({
      deviceId: 'device-1',
      fingerprintVersion: 2,
      lastKnownDeviceName: 'PCMaxi',
      lastVerifiedAt: '2026-06-10T12:00:00.000Z',
      offlineGraceExpiresAt: '2026-06-13T12:00:00.000Z',
    });

    expect(secondInstallationId).toBe(firstInstallationId);
    await expect(store.getCachedApprovedDevice()).resolves.toMatchObject({
      deviceId: 'device-1',
      fingerprintVersion: 2,
      lastKnownDeviceName: 'PCMaxi',
      lastVerifiedAt: '2026-06-10T12:00:00.000Z',
      offlineGraceExpiresAt: '2026-06-13T12:00:00.000Z',
    });
    expect(existsSync(store.filePath)).toBe(true);
    expect(readFileSync(store.filePath, 'utf8')).not.toContain(firstInstallationId);
    expect(readFileSync(store.filePath, 'utf8')).not.toContain('device-1');

    await store.clearCachedApprovedDevice({ deviceId: 'device-1' });
    await expect(store.getCachedApprovedDevice()).resolves.toMatchObject({ deviceId: '' });

    rmSync(userData, { recursive: true, force: true });
  });
});
