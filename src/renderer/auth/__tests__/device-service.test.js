import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDeviceService } from '../device-service.js';

const profile = { id: 'user-1' };
const club = { id: 'club-1' };
const APPROVED_DEVICE_ID = '00000000-0000-4000-8000-000000000001';
const PENDING_DEVICE_ID = '00000000-0000-4000-8000-000000000002';

function fingerprint(overrides = {}) {
  return {
    fingerprintHash: 'b'.repeat(64),
    fingerprintVersion: 2,
    installationIdHash: 'c'.repeat(64),
    machineIdHash: 'd'.repeat(64),
    legacyFingerprintHash: 'a'.repeat(64),
    deviceName: 'PCMaxi',
    platform: 'win32-x64',
    appVersion: '1.0.0',
    ...overrides,
  };
}

function matchesFilters(row, filters) {
  return filters.every((filter) => {
    if (filter.op === 'eq') return row[filter.key] === filter.value;
    if (filter.op === 'neq') return row[filter.key] !== filter.value;
    return true;
  });
}

function createClientMock(initialDevices = []) {
  const devices = initialDevices.map(device => ({ ...device }));
  const inserts = { devices: [] };
  const rpcCalls = [];

  function createBuilder(table) {
    const filters = [];
    let orderKey = '';
    let ascending = false;
    let rowLimit = null;

    const builder = {
      select() {
        return builder;
      },
      eq(key, value) {
        filters.push({ op: 'eq', key, value });
        return builder;
      },
      neq(key, value) {
        filters.push({ op: 'neq', key, value });
        return builder;
      },
      order(key, options = {}) {
        orderKey = key;
        ascending = options.ascending === true;
        return builder;
      },
      limit(value) {
        rowLimit = Number(value);
        return builder;
      },
      insert(payload) {
        inserts[table].push(payload);
        const inserted = {
          ...payload,
          id: payload.id || PENDING_DEVICE_ID,
          created_at: '2026-06-10T12:00:00.000Z',
        };
        devices.push(inserted);
        return {
          select: () => ({
            single: async () => ({ data: inserted, error: null }),
          }),
        };
      },
      async maybeSingle() {
        let rows = table === 'devices'
          ? devices.filter(row => matchesFilters(row, filters))
          : [];
        if (orderKey) {
          rows = [...rows].sort((a, b) => {
            const left = String(a[orderKey] || '');
            const right = String(b[orderKey] || '');
            return ascending ? left.localeCompare(right) : right.localeCompare(left);
          });
        }
        if (rowLimit !== null) rows = rows.slice(0, rowLimit);
        return { data: rows[0] || null, error: null };
      },
      async single() {
        const result = await builder.maybeSingle();
        if (!result.data) return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
        return result;
      },
    };
    return builder;
  }

  return {
    devices,
    inserts,
    rpcCalls,
    client: {
      from: table => createBuilder(table),
      rpc: vi.fn(async (name, args) => {
        rpcCalls.push({ name, args });
        const target = devices.find(device => device.id === args.p_device_id);
        if (!target) return { data: null, error: { message: 'device_not_found' } };

        if (name === 'migrate_own_device_identity_v2') {
          devices
            .filter(device => (
              device.id !== target.id
              && device.club_id === target.club_id
              && device.user_id === target.user_id
              && device.fingerprint_hash === args.p_fingerprint_hash
              && device.status === 'pending'
            ))
            .forEach((device) => {
              device.status = 'rejected';
              device.revoked_at = device.revoked_at || '2026-06-10T12:00:00.000Z';
            });
        }

        Object.assign(target, {
          fingerprint_hash: args.p_fingerprint_hash,
          device_fingerprint: args.p_fingerprint_hash,
          fingerprint_version: 2,
          installation_id_hash: args.p_installation_id_hash,
          machine_id_hash: args.p_machine_id_hash,
          device_name: args.p_device_name,
          display_name: args.p_device_name,
          platform: args.p_platform,
          app_version: args.p_app_version,
          last_seen_at: '2026-06-10T12:00:00.000Z',
        });
        return { data: { ...target }, error: null };
      }),
    },
  };
}

function installDeviceApi(activeFingerprint, cache = {}) {
  const cached = {
    deviceId: cache.deviceId || '',
    fingerprintVersion: cache.fingerprintVersion || 0,
  };
  globalThis.window = {
    api: {
      device: {
        getFingerprint: vi.fn(async () => activeFingerprint),
        getCachedApprovedDevice: vi.fn(async () => ({ ...cached })),
        cacheApprovedDevice: vi.fn(async (payload) => {
          Object.assign(cached, payload);
          return { ...cached };
        }),
        clearCachedApprovedDevice: vi.fn(async (payload = {}) => {
          if (!payload.deviceId || payload.deviceId === cached.deviceId) {
            cached.deviceId = '';
          }
          return { ...cached };
        }),
      },
    },
  };
  return globalThis.window.api.device;
}

describe('device service identity v2 lookup', () => {
  afterEach(() => {
    delete globalThis.window;
  });

  it('uses a cached approved legacy device and migrates it to fingerprint v2 without creating pending', async () => {
    const current = fingerprint();
    const api = installDeviceApi(current, { deviceId: APPROVED_DEVICE_ID, fingerprintVersion: 1 });
    const { client, inserts, rpcCalls } = createClientMock([{
      id: APPROVED_DEVICE_ID,
      club_id: club.id,
      user_id: profile.id,
      fingerprint_hash: current.legacyFingerprintHash,
      fingerprint_version: 1,
      device_name: current.deviceName,
      platform: current.platform,
      status: 'approved',
      revoked_at: null,
    }]);
    const service = createDeviceService(Promise.resolve(client));

    await expect(service.findDevice(profile, club)).resolves.toMatchObject({
      device: {
        id: APPROVED_DEVICE_ID,
        status: 'approved',
        fingerprint_hash: current.fingerprintHash,
        fingerprint_version: 2,
      },
      fingerprint: current,
    });

    expect(inserts.devices).toEqual([]);
    expect(rpcCalls.map(call => call.name)).toContain('migrate_own_device_identity_v2');
    expect(api.cacheApprovedDevice).toHaveBeenCalledWith(expect.objectContaining({
      deviceId: APPROVED_DEVICE_ID,
      fingerprintVersion: 2,
      lastKnownDeviceName: 'PCMaxi',
    }));
  });

  it('recovers an approved v2 device by machine hash when AppData installation id changed', async () => {
    const current = fingerprint({ fingerprintHash: 'e'.repeat(64), installationIdHash: 'f'.repeat(64) });
    installDeviceApi(current);
    const { client, rpcCalls } = createClientMock([{
      id: APPROVED_DEVICE_ID,
      club_id: club.id,
      user_id: profile.id,
      fingerprint_hash: '9'.repeat(64),
      fingerprint_version: 2,
      installation_id_hash: '8'.repeat(64),
      machine_id_hash: current.machineIdHash,
      device_name: current.deviceName,
      platform: current.platform,
      status: 'approved',
      revoked_at: null,
      last_seen_at: '2026-06-09T12:00:00.000Z',
    }]);
    const service = createDeviceService(Promise.resolve(client));

    await expect(service.findDevice(profile, club)).resolves.toMatchObject({
      device: {
        id: APPROVED_DEVICE_ID,
        fingerprint_hash: current.fingerprintHash,
        machine_id_hash: current.machineIdHash,
        installation_id_hash: current.installationIdHash,
      },
    });
    expect(rpcCalls.map(call => call.name)).toContain('migrate_own_device_identity_v2');
  });

  it('prefers an approved legacy duplicate over a pending v2 duplicate created by a prior hash change', async () => {
    const current = fingerprint();
    installDeviceApi(current);
    const { client, devices } = createClientMock([
      {
        id: PENDING_DEVICE_ID,
        club_id: club.id,
        user_id: profile.id,
        fingerprint_hash: current.fingerprintHash,
        fingerprint_version: 2,
        device_name: current.deviceName,
        platform: current.platform,
        status: 'pending',
      },
      {
        id: APPROVED_DEVICE_ID,
        club_id: club.id,
        user_id: profile.id,
        fingerprint_hash: current.legacyFingerprintHash,
        fingerprint_version: 1,
        device_name: current.deviceName,
        platform: current.platform,
        status: 'approved',
        revoked_at: null,
        last_seen_at: '2026-06-10T11:00:00.000Z',
      },
    ]);
    const service = createDeviceService(Promise.resolve(client));

    await expect(service.findDevice(profile, club)).resolves.toMatchObject({
      device: {
        id: APPROVED_DEVICE_ID,
        status: 'approved',
        fingerprint_hash: current.fingerprintHash,
      },
    });
    expect(devices.find(device => device.id === PENDING_DEVICE_ID)).toMatchObject({
      status: 'rejected',
      revoked_at: '2026-06-10T12:00:00.000Z',
    });
  });

  it('returns rejected or revoked devices instead of creating another pending device', async () => {
    const current = fingerprint();
    installDeviceApi(current);
    const { client, inserts } = createClientMock([{
      id: APPROVED_DEVICE_ID,
      club_id: club.id,
      user_id: profile.id,
      fingerprint_hash: current.fingerprintHash,
      fingerprint_version: 2,
      device_name: current.deviceName,
      platform: current.platform,
      status: 'revoked',
      revoked_at: '2026-06-10T12:00:00.000Z',
    }]);
    const service = createDeviceService(Promise.resolve(client));

    await expect(service.findDevice(profile, club)).resolves.toMatchObject({
      device: {
        id: APPROVED_DEVICE_ID,
        status: 'revoked',
      },
    });
    expect(inserts.devices).toEqual([]);
  });

  it('clears a missing cached device id and registers a new pending device with v2 metadata', async () => {
    const current = fingerprint();
    const api = installDeviceApi(current, { deviceId: APPROVED_DEVICE_ID, fingerprintVersion: 2 });
    const { client, inserts } = createClientMock([]);
    const service = createDeviceService(Promise.resolve(client));

    await expect(service.findDevice(profile, club)).resolves.toMatchObject({
      device: null,
      fingerprint: current,
    });
    expect(api.clearCachedApprovedDevice).toHaveBeenCalledWith({ deviceId: APPROVED_DEVICE_ID });

    await expect(service.registerPendingDevice(profile, club)).resolves.toMatchObject({
      device: {
        status: 'pending',
        fingerprint_hash: current.fingerprintHash,
        fingerprint_version: 2,
        installation_id_hash: current.installationIdHash,
        machine_id_hash: current.machineIdHash,
      },
    });
    expect(inserts.devices[0]).toMatchObject({
      status: 'pending',
      fingerprint_hash: current.fingerprintHash,
      device_fingerprint: current.fingerprintHash,
      fingerprint_version: 2,
      installation_id_hash: current.installationIdHash,
      machine_id_hash: current.machineIdHash,
      device_name: 'PCMaxi',
      platform: 'win32-x64',
    });
  });
});
