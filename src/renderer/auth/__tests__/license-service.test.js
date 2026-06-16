import { describe, expect, it, vi } from 'vitest';

import { readFileSync } from 'node:fs';

import { createLicenseService, getDisplayUserFromProfile, normalizePersonalInfo, resolveLicenseState } from '../license-service.js';

const licenseServiceSource = readFileSync(new URL('../license-service.js', import.meta.url), 'utf8');

const user = { id: 'user-1', email: 'analyst@bigua.com' };
const session = { user };
const approvedProfile = {
  id: user.id,
  email: user.email,
  status: 'approved',
  ai_enabled: false,
  ai_daily_limit: 30,
  club_id: 'club-1',
  display_name: 'Ana G.',
  first_name: 'Ana',
  last_name: 'Garcia',
  age: 31,
  app_role: 'analista',
  is_player: false,
  position: null,
};
const activeClub = {
  id: 'club-1',
  name: 'Bigua Rugby',
  slug: 'bigua',
  license_status: 'active',
  expires_at: '2026-12-31T23:59:59.000Z',
};
const approvedDevice = { id: 'device-1', status: 'approved' };
const now = () => new Date('2026-05-29T12:00:00.000Z');

function stateFor(overrides = {}) {
  return resolveLicenseState({
    session,
    user,
    profile: approvedProfile,
    club: activeClub,
    device: approvedDevice,
    now,
    ...overrides,
  });
}

describe('license service state resolver', () => {
  it('allows approved users with active license and approved device', () => {
    expect(stateFor().state).toBe('active');
  });

  it('blocks suspended or rejected users even when the device is approved', () => {
    expect(stateFor({ profile: { ...approvedProfile, status: 'suspended' } })).toMatchObject({
      state: 'blocked_user',
      reason: 'profile_suspended',
    });
    expect(stateFor({ profile: { ...approvedProfile, status: 'rejected' } })).toMatchObject({
      state: 'blocked_user',
      reason: 'profile_rejected',
    });
  });

  it('blocks expired licenses by status or expiration date', () => {
    expect(stateFor({ club: { ...activeClub, license_status: 'expired' } }).state).toBe('expired_license');
    expect(stateFor({ club: { ...activeClub, expires_at: '2026-05-29T11:59:59.000Z' } }).state).toBe('expired_license');
  });

  it('blocks suspended licenses', () => {
    expect(stateFor({ club: { ...activeClub, license_status: 'suspended' } }).state).toBe('suspended_license');
  });

  it('keeps a missing device behind device approval instead of personal information', () => {
    expect(stateFor({ device: null })).toMatchObject({
      state: 'pending_device',
      reason: 'device_missing',
    });
  });

  it('requires personal profile completion before device approval or Home access', () => {
    expect(stateFor({ profile: { ...approvedProfile, first_name: null }, device: approvedDevice })).toMatchObject({
      state: 'personal_info_required',
      reason: 'profile_incomplete',
    });
    expect(stateFor({ profile: { ...approvedProfile, first_name: null }, device: null })).toMatchObject({
      state: 'personal_info_required',
      reason: 'profile_incomplete',
    });
  });

  it('requires position for player profiles and ignores position for non-player roles', () => {
    expect(stateFor({ profile: { ...approvedProfile, app_role: 'jugador', is_player: true, position: '' } })).toMatchObject({
      state: 'personal_info_required',
      reason: 'profile_incomplete',
    });
    expect(stateFor({ profile: { ...approvedProfile, app_role: 'staff', is_player: false, position: null } })).toMatchObject({
      state: 'active',
      reason: 'allowed',
    });
  });

  it('does not block app access when AI is disabled for the approved user', () => {
    expect(stateFor({ profile: { ...approvedProfile, ai_enabled: false } })).toMatchObject({
      state: 'active',
      reason: 'allowed',
    });
  });

  it('marks pending devices as pending approval', () => {
    expect(stateFor({ device: { id: 'device-2', status: 'pending' } }).state).toBe('pending_device');
  });

  it('blocks rejected or revoked devices', () => {
    expect(stateFor({ device: { id: 'device-3', status: 'rejected' } })).toMatchObject({
      state: 'blocked_device',
      reason: 'device_rejected',
    });
    expect(stateFor({ device: { id: 'device-4', status: 'revoked' } })).toMatchObject({
      state: 'blocked_device',
      reason: 'device_revoked',
    });
    expect(stateFor({ device: { id: 'device-5', status: 'approved', revoked_at: '2026-05-29T11:00:00.000Z' } })).toMatchObject({
      state: 'blocked_device',
      reason: 'device_revoked',
    });
  });

  it('returns connection_error for network or Supabase errors', () => {
    expect(resolveLicenseState({ error: new TypeError('fetch failed'), now })).toMatchObject({
      state: 'connection_error',
      reason: 'connection_error',
      detail: 'fetch failed',
    });
  });

  it('distinguishes missing Supabase auth schema from network errors', () => {
    expect(resolveLicenseState({
      error: { message: "Could not find the 'password_configured' column of 'profiles' in the schema cache" },
      now,
    })).toMatchObject({
      state: 'connection_error',
      reason: 'missing_password_schema',
    });
    expect(resolveLicenseState({
      error: { message: "Could not find the 'first_name' column of 'profiles' in the schema cache" },
      now,
    })).toMatchObject({
      state: 'connection_error',
      reason: 'missing_personal_info_schema',
    });
    expect(resolveLicenseState({
      error: { message: "Could not find the 'age' column of 'profiles' in the schema cache" },
      now,
    })).toMatchObject({
      state: 'connection_error',
      reason: 'missing_personal_info_schema',
    });
  });

  it('does not let local settings sync failures block license access', () => {
    expect(licenseServiceSource).toContain('async function syncLocalUserSettings');
    expect(licenseServiceSource).toContain('settings_sync_failed');
  });

  it('delegates offline grace decisions to the main-process auth API', () => {
    expect(licenseServiceSource).toContain('getMainProcessAccessStatus');
    expect(licenseServiceSource).toContain('activateMainProcessAccess');
    expect(licenseServiceSource).toContain('offline_grace');
    expect(licenseServiceSource).not.toContain('offline_cached_access');
  });

  it('does not await non-critical license check logging before resolving access', () => {
    expect(licenseServiceSource).toContain('recordLicenseCheck(client, access, fingerprint);');
    expect(licenseServiceSource).not.toContain('await recordLicenseCheck(client, access, fingerprint);');
    expect(licenseServiceSource).not.toContain('await recordLicenseCheck(client, preDeviceAccess, null);');
  });
});

function createClientMock({ sessionUser = user, profile = approvedProfile, club = activeClub } = {}) {
  const inserts = { profiles: [], devices: [], license_checks: [] };
  const updates = { profiles: [] };

  function createBuilder(table) {
    const filters = {};
    const builder = {
      select() {
        return builder;
      },
      eq(key, value) {
        filters[key] = value;
        return builder;
      },
      update(payload) {
        updates[table].push(payload);
        return builder;
      },
      insert(payload) {
        inserts[table].push(payload);
        const inserted = {
          ...payload,
          id: payload.id || `${table}-inserted`,
          created_at: '2026-05-29T12:00:00.000Z',
        };
        return {
          select: () => ({
            single: async () => ({ data: inserted, error: null }),
          }),
        };
      },
      async maybeSingle() {
        if (table === 'profiles') return { data: profile, error: null };
        if (table === 'clubs') return { data: club, error: null };
        if (table === 'devices') return { data: null, error: null };
        return { data: null, error: null };
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
    inserts,
    updates,
    client: {
      auth: {
        getSession: async () => ({
          data: { session: sessionUser ? { user: sessionUser } : null },
          error: null,
        }),
      },
      from: (table) => createBuilder(table),
    },
  };
}

describe('license service signup profile and device flow', () => {
  it('creates an approved default profile and asks for personal info before creating a pending device', async () => {
    const { client, inserts } = createClientMock({ profile: null });
    const registerPendingDevice = vi.fn(async (profile, club) => ({
      profile,
      fingerprint: { fingerprintHash: 'hash' },
      device: { id: 'device-1', status: 'pending', device_name: 'Windows PC', club_id: club.id, user_id: profile.id },
    }));
    const service = createLicenseService({
      clientSource: Promise.resolve(client),
      deviceService: {
        findDevice: vi.fn(async () => ({ device: null, fingerprint: { fingerprintHash: 'hash' } })),
        registerPendingDevice,
      },
      now,
    });

    await expect(service.checkAccess()).resolves.toMatchObject({
      state: 'personal_info_required',
      reason: 'profile_incomplete',
      profile: {
        id: user.id,
        status: 'approved',
        role: 'analyst',
        ai_enabled: false,
        ai_daily_limit: 30,
        ai_revoked_at: null,
        club_id: activeClub.id,
      },
      device: { status: 'approved' },
    });
    expect(inserts.profiles).toEqual([expect.objectContaining({
      id: user.id,
      email: user.email,
      status: 'approved',
      role: 'analyst',
      ai_enabled: false,
      ai_daily_limit: 30,
      ai_revoked_at: null,
      club_id: activeClub.id,
    })]);
    expect(registerPendingDevice).not.toHaveBeenCalled();
  });

  it('does not overwrite administrative profile fields when the profile already exists', async () => {
    const existingProfile = {
      ...approvedProfile,
      role: 'owner',
      ai_enabled: true,
      ai_daily_limit: 200,
      ai_revoked_at: '2026-05-01T12:00:00.000Z',
    };
    const { client, inserts, updates } = createClientMock({ profile: existingProfile });
    const service = createLicenseService({
      clientSource: Promise.resolve(client),
      deviceService: {
        findDevice: vi.fn(async () => ({ device: { id: 'device-1', status: 'pending' }, fingerprint: { fingerprintHash: 'hash' } })),
        registerPendingDevice: vi.fn(),
      },
      now,
    });

    await expect(service.checkAccess()).resolves.toMatchObject({
      state: 'pending_device',
      profile: {
        role: 'owner',
        ai_enabled: true,
        ai_daily_limit: 200,
        ai_revoked_at: '2026-05-01T12:00:00.000Z',
      },
    });
    expect(inserts.profiles).toEqual([]);
    expect(updates.profiles).toEqual([]);
  });

  it('does not activate local grace when the device is approved but the profile is incomplete', async () => {
    const { client } = createClientMock({
      profile: {
        id: user.id,
        email: user.email,
        status: 'approved',
        ai_enabled: false,
        club_id: activeClub.id,
      },
    });
    const activations = [];
    globalThis.window = {
      api: {
        auth: {
          activateOnline: async (payload) => {
            activations.push(payload);
            return { state: 'active', reason: 'supabase_local_grace' };
          },
        },
      },
    };
    const service = createLicenseService({
      clientSource: Promise.resolve(client),
      deviceService: {
        findDevice: vi.fn(async () => ({ device: { id: 'device-1', status: 'approved' }, fingerprint: { fingerprintHash: 'hash' } })),
        registerPendingDevice: vi.fn(),
      },
      now,
    });

    await expect(service.checkAccess()).resolves.toMatchObject({
      state: 'personal_info_required',
      reason: 'profile_incomplete',
    });
    expect(activations).toHaveLength(0);
    delete globalThis.window;
  });

  it('saves a complete profile before creating a pending device', async () => {
    const incompleteProfile = {
      ...approvedProfile,
      first_name: null,
      last_name: null,
      age: null,
      app_role: null,
      is_player: null,
      position: null,
      display_name: null,
    };
    const { client } = createClientMock({ profile: incompleteProfile });
    const updatePersonalProfile = vi.fn(async (profile, personalInfo) => ({
      profile: {
        ...profile,
        first_name: personalInfo.firstName,
        last_name: personalInfo.lastName,
        age: personalInfo.age,
        app_role: personalInfo.role,
        is_player: personalInfo.isPlayer,
        position: personalInfo.position || null,
        display_name: personalInfo.displayName,
      },
    }));
    const registerPendingDevice = vi.fn(async (profile, club) => ({
      profile,
      fingerprint: { fingerprintHash: 'hash' },
      device: { id: 'device-1', status: 'pending', club_id: club.id, user_id: profile.id },
    }));
    const service = createLicenseService({
      clientSource: Promise.resolve(client),
      deviceService: {
        findDevice: vi.fn(async () => ({ device: null, fingerprint: { fingerprintHash: 'hash' } })),
        updatePersonalProfile,
        registerPendingDevice,
      },
      now,
    });

    await expect(service.updatePersonalInfo({
      firstName: '  Maximo  ',
      lastName: '  Diaz  ',
      age: '28',
      role: 'jugador',
      position: 'apertura',
    })).resolves.toMatchObject({
      state: 'pending_device',
      profile: {
        first_name: 'Maximo',
        last_name: 'Diaz',
        age: 28,
        app_role: 'jugador',
        is_player: true,
        position: 'apertura',
        display_name: 'Maximo D.',
      },
      device: { status: 'pending' },
    });
    expect(updatePersonalProfile).toHaveBeenCalledWith(expect.objectContaining({ id: user.id }), expect.objectContaining({
      role: 'jugador',
      isPlayer: true,
      displayName: 'Maximo D.',
    }));
    expect(registerPendingDevice).toHaveBeenCalledTimes(1);
  });
});

describe('personal profile normalization', () => {
  it('normalizes role and display name without exposing administrative profile fields', () => {
    expect(normalizePersonalInfo({
      firstName: ' Maximo ',
      lastName: ' Diaz ',
      age: '28',
      role: 'jugador',
      position: 'apertura',
      ai_enabled: true,
      status: 'approved',
      role_admin: 'admin',
    })).toEqual({
      firstName: 'Maximo',
      lastName: 'Diaz',
      age: 28,
      role: 'jugador',
      isPlayer: true,
      position: 'apertura',
      displayName: 'Maximo D.',
    });
  });

  it('rejects missing player position, ignores non-player position and rejects html-like text', () => {
    expect(() => normalizePersonalInfo({
      firstName: 'Maximo',
      lastName: 'Diaz',
      age: 28,
      role: 'jugador',
      position: '',
    })).toThrow('Selecciona la posicion del jugador.');

    expect(normalizePersonalInfo({
      firstName: 'Ana',
      lastName: 'Garcia',
      age: 31,
      role: 'analista',
      position: 'apertura',
    })).toMatchObject({
      role: 'analista',
      isPlayer: false,
      position: '',
    });

    expect(() => normalizePersonalInfo({
      firstName: '<script>',
      lastName: 'Garcia',
      age: 31,
      role: 'analista',
    })).toThrow('No uses caracteres HTML en el perfil.');
  });

  it('uses display_name or first name instead of email for display users', () => {
    expect(getDisplayUserFromProfile({
      email: 'max@example.com',
      display_name: 'Maximo D.',
      first_name: 'Maximo',
      last_name: 'Diaz',
      app_role: 'analista',
    }).name).toBe('Maximo D.');
    expect(getDisplayUserFromProfile({ email: 'max@example.com' }).name).toBe('Usuario');
  });
});
