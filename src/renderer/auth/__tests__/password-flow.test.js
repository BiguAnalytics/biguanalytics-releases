import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as guard from '../access-guard.js';

const completeProfile = {
  id: 'user-1',
  email: 'analyst@bigua.com',
  status: 'approved',
  first_name: 'Ana',
  last_name: 'Garcia',
  age: 31,
  app_role: 'analista',
  is_player: false,
  position: null,
  password_configured: false,
};
const accessBase = {
  state: 'active',
  user: { id: 'user-1', email: 'analyst@bigua.com' },
  profile: completeProfile,
  club: { id: 'club-1', name: 'Bigua Rugby' },
  device: { id: 'device-1', status: 'approved' },
};

describe('password setup access flow', () => {
  it('requires password setup after OTP before Home when profile is complete and password_configured is false', () => {
    expect(guard.shouldShowPasswordSetup(accessBase, 'otp')).toBe(true);
  });

  it('allows recovery flow to require password setup when profile is complete and password_configured is false', () => {
    expect(guard.shouldShowPasswordSetup(accessBase, 'recovery')).toBe(true);
  });

  it('never requires password setup after a successful password login', () => {
    expect(guard.shouldShowPasswordSetup(accessBase, 'password')).toBe(false);
  });

  it('requires password setup before showing pending device approval', () => {
    expect(guard.shouldShowPasswordSetup({
      ...accessBase,
      state: 'pending_device',
      device: { id: 'device-1', status: 'pending' },
    }, 'otp')).toBe(true);
  });

  it('does not require password setup before personal profile completion', () => {
    expect(guard.shouldShowPasswordSetup({
      ...accessBase,
      state: 'personal_info_required',
      profile: { ...completeProfile, first_name: null, password_configured: false },
    }, 'otp')).toBe(false);
  });

  it('does not require password setup after password_configured is true', () => {
    expect(guard.shouldShowPasswordSetup({
      ...accessBase,
      profile: {
        ...completeProfile,
        password_configured: true,
        password_configured_at: '2026-06-10T12:00:00.000Z',
      },
    }, 'otp')).toBe(false);
  });

  it('syncs password_configured after a successful password login without showing password setup', async () => {
    expect(typeof guard.syncPasswordConfiguredAfterPasswordLogin).toBe('function');
    const authService = {
      hasPassword: (profile) => profile?.password_configured === true,
      markPasswordConfigured: async (userId) => ({
        id: userId,
        password_configured: true,
        password_configured_at: '2026-06-10T12:00:00.000Z',
      }),
    };

    const next = await guard.syncPasswordConfiguredAfterPasswordLogin(accessBase, 'password', authService);

    expect(next).toMatchObject({
      profile: {
        id: 'user-1',
        password_configured: true,
        password_configured_at: '2026-06-10T12:00:00.000Z',
      },
    });
    expect(guard.shouldShowPasswordSetup(next, 'password')).toBe(false);
  });

  it('keeps the access state usable if password_configured sync fails after password login', async () => {
    expect(typeof guard.syncPasswordConfiguredAfterPasswordLogin).toBe('function');
    const authService = {
      hasPassword: () => false,
      markPasswordConfigured: async () => {
        throw new Error('rls denied');
      },
    };

    const next = await guard.syncPasswordConfiguredAfterPasswordLogin(accessBase, 'password', authService);

    expect(next).toBe(accessBase);
    expect(guard.shouldShowPasswordSetup(next, 'password')).toBe(false);
  });
});

describe('password auth source safety', () => {
  const authSources = [
    '../auth-service.js',
    '../login-screen.js',
    '../create-password-screen.js',
    '../access-guard.js',
  ].map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');

  it('does not log password values from the auth flow', () => {
    expect(authSources).not.toMatch(/console\.(?:log|debug|info|warn|error)\s*\([^)]*password/i);
    expect(authSources).not.toMatch(/password[\s\S]{0,120}console\.(?:log|debug|info|warn|error)/i);
  });

  it('does not persist password values in local storage or Electron stores', () => {
    expect(authSources).not.toMatch(/localStorage[\s\S]{0,120}password/i);
    expect(authSources).not.toMatch(/electron-store[\s\S]{0,120}password/i);
    expect(authSources).not.toMatch(/secure-session-store[\s\S]{0,120}password/i);
    expect(authSources).not.toMatch(/AppData[\s\S]{0,120}password/i);
  });
});
