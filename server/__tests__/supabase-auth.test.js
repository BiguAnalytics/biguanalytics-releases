import { describe, expect, it, vi } from 'vitest';

import { createSupabaseAuthService } from '../supabaseAuth.js';

const userId = '00000000-0000-4000-8000-000000000001';

function createMockSupabaseClient({ profile, userError = null, profileError = null } = {}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: profile === undefined ? null : profile,
      error: profileError,
    })),
  };
  return {
    query,
    auth: {
      getUser: vi.fn(async () => ({
        data: userError ? {} : { user: { id: userId, email: 'analyst@bigua.test' } },
        error: userError,
      })),
    },
    from: vi.fn(() => query),
  };
}

function createService(client) {
  return createSupabaseAuthService({
    env: {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    },
    createClient: vi.fn(() => client),
  });
}

async function authenticateProfile(profile) {
  const client = createMockSupabaseClient({ profile });
  const service = createService(client);
  return {
    client,
    result: await service.authenticateToken('supabase-access-token'),
  };
}

describe('Supabase AI auth with profiles', () => {
  it('rejects missing or invalid Supabase access tokens with 401', async () => {
    const missingTokenService = createService(createMockSupabaseClient());
    await expect(missingTokenService.authenticateToken('')).resolves.toMatchObject({
      ok: false,
      status: 401,
      code: 'unauthorized',
    });

    const invalidClient = createMockSupabaseClient({ userError: { message: 'expired' } });
    await expect(createService(invalidClient).authenticateToken('expired-token')).resolves.toMatchObject({
      ok: false,
      status: 401,
      code: 'unauthorized',
    });
  });

  it.each([
    ['missing profile', null],
    ['pending profile', { id: userId, status: 'pending', ai_enabled: true, ai_daily_limit: 30, ai_revoked_at: null, role: 'analyst' }],
    ['rejected profile', { id: userId, status: 'rejected', ai_enabled: true, ai_daily_limit: 30, ai_revoked_at: null, role: 'analyst' }],
    ['suspended profile', { id: userId, status: 'suspended', ai_enabled: true, ai_daily_limit: 30, ai_revoked_at: null, role: 'analyst' }],
    ['AI disabled profile', { id: userId, status: 'approved', ai_enabled: false, ai_daily_limit: 30, ai_revoked_at: null, role: 'analyst' }],
    ['AI revoked profile', { id: userId, status: 'approved', ai_enabled: true, ai_daily_limit: 30, ai_revoked_at: '2026-06-08T00:00:00.000Z', role: 'analyst' }],
  ])('rejects %s with 403', async (name, profile) => {
    const { result } = await authenticateProfile(profile);

    expect(result).toMatchObject({
      ok: false,
      status: 403,
      code: 'ai_forbidden',
      message: 'IA no habilitada para este usuario.',
      userId,
    });
  });

  it('allows approved profiles with AI enabled and returns AI profile limits', async () => {
    const profile = {
      id: userId,
      status: 'approved',
      ai_enabled: true,
      ai_daily_limit: 17,
      ai_revoked_at: null,
      role: 'analyst',
    };

    const { client, result } = await authenticateProfile(profile);

    expect(result).toMatchObject({
      ok: true,
      userId,
      aiAccess: {
        status: 'approved',
        enabled: true,
        dailyLimit: 17,
        role: 'analyst',
        revokedAt: null,
      },
    });
    expect(client.from).toHaveBeenCalledWith('profiles');
    expect(client.from).not.toHaveBeenCalledWith('ai_access');
    expect(client.query.select).toHaveBeenCalledWith('id, status, ai_enabled, ai_daily_limit, ai_revoked_at, role');
    expect(client.query.eq).toHaveBeenCalledWith('id', userId);
  });
});
