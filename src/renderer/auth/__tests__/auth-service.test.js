import { describe, expect, it } from 'vitest';

import { createAuthService, getAuthErrorMessage } from '../auth-service.js';

describe('auth service', () => {
  it('sends email OTP allowing Supabase to create new users', async () => {
    const calls = [];
    const service = createAuthService(Promise.resolve({
      auth: {
        signInWithOtp: async (payload) => {
          calls.push(payload);
          return { data: {}, error: null };
        },
      },
    }));

    await service.sendOtp(' ANALYST@BIGUA.COM ');

    expect(calls).toEqual([{
      email: 'analyst@bigua.com',
      options: { shouldCreateUser: true },
    }]);
  });

  it('translates disabled Supabase signup errors for OTP login', () => {
    expect(getAuthErrorMessage(
      { message: 'Signups not allowed for otp' },
      'No se pudo enviar el codigo.'
    )).toBe('El registro está deshabilitado en Supabase. Activá Email Signups desde el panel de Supabase.');
  });

  it('verifies an eight digit email OTP with verifyOtp type email', async () => {
    const calls = [];
    const service = createAuthService(Promise.resolve({
      auth: {
        verifyOtp: async (payload) => {
          calls.push(payload);
          return { data: { session: { access_token: 'token' } }, error: null };
        },
      },
    }));

    await service.verifyOtp('coach@bigua.com', '12345678');

    expect(calls).toEqual([{
      email: 'coach@bigua.com',
      token: '12345678',
      type: 'email',
    }]);
  });

  it('signs in with email and password without changing device checks', async () => {
    const calls = [];
    const service = createAuthService(Promise.resolve({
      auth: {
        signInWithPassword: async (payload) => {
          calls.push(payload);
          return { data: { session: { access_token: 'token' } }, error: null };
        },
      },
    }));

    await service.signInWithPassword(' ANALYST@BIGUA.COM ', 'correct-password');

    expect(calls).toEqual([{
      email: 'analyst@bigua.com',
      password: 'correct-password',
    }]);
  });

  it('sets a Supabase auth password and stores only password_configured metadata in profile', async () => {
    const updates = [];
    const profileUpdates = [];
    const service = createAuthService(Promise.resolve({
      auth: {
        updateUser: async (payload) => {
          updates.push(payload);
          return { data: { user: { id: 'user-1' } }, error: null };
        },
        getSession: async () => ({ data: { session: { user: { id: 'user-1' } } }, error: null }),
      },
      from: (table) => ({
        update: (payload) => {
          profileUpdates.push({ table, payload });
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'user-1', ...payload }, error: null }),
              }),
            }),
          };
        },
      }),
    }));

    await service.setPassword('Correct2026');

    expect(updates).toEqual([{ password: 'Correct2026' }]);
    expect(profileUpdates[0]).toMatchObject({
      table: 'profiles',
      payload: {
        password_configured: true,
        password_configured_at: expect.any(String),
      },
    });
    expect(profileUpdates[0].payload).not.toHaveProperty('password');
    expect(profileUpdates[0].payload).not.toHaveProperty('password_set_at');
  });

  it('marks password metadata directly without receiving a password value', async () => {
    const rpcCalls = [];
    const service = createAuthService(Promise.resolve({
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'user-1' } } }, error: null }),
      },
      rpc: async (name, payload) => {
        rpcCalls.push({ name, payload });
        return {
          data: { id: 'user-1', password_configured: true, password_configured_at: payload.p_password_configured_at },
          error: null,
        };
      },
    }));

    const profile = await service.markPasswordConfigured();

    expect(rpcCalls).toEqual([{
      name: 'mark_own_password_configured',
      payload: { p_password_configured_at: expect.any(String) },
    }]);
    expect(profile).toMatchObject({
      id: 'user-1',
      password_configured: true,
      password_configured_at: expect.any(String),
    });
    expect(JSON.stringify(rpcCalls)).not.toContain('Correct2026');
  });

  it('treats Supabase same-old-password errors as already configured and continues', async () => {
    const updates = [];
    const rpcCalls = [];
    const service = createAuthService(Promise.resolve({
      auth: {
        updateUser: async (payload) => {
          updates.push(payload);
          return {
            data: null,
            error: { message: 'New password must be different from old password' },
          };
        },
        getSession: async () => ({ data: { session: { user: { id: 'user-1' } } }, error: null }),
      },
      rpc: async (name, payload) => {
        rpcCalls.push({ name, payload });
        return {
          data: { id: 'user-1', password_configured: true, password_configured_at: payload.p_password_configured_at },
          error: null,
        };
      },
    }));

    const profile = await service.setPassword('Correct2026');

    expect(updates).toEqual([{ password: 'Correct2026' }]);
    expect(rpcCalls).toEqual([{
      name: 'mark_own_password_configured',
      payload: { p_password_configured_at: expect.any(String) },
    }]);
    expect(profile).toMatchObject({
      id: 'user-1',
      password_configured: true,
      password_configured_at: expect.any(String),
    });
  });

  it('translates Supabase password errors to Spanish', () => {
    expect(getAuthErrorMessage(
      { message: 'New password must be different from old password' },
      'No se pudo crear la contrasena.'
    )).toBe('La contraseña nueva debe ser distinta a la anterior.');
    expect(getAuthErrorMessage(
      { message: "Could not find the 'password_configured' column of 'profiles' in the schema cache" },
      'No se pudo crear la contrasena.'
    )).toBe('Falta aplicar la migracion de contraseñas en Supabase.');
    expect(getAuthErrorMessage(
      { message: 'Error sending magic link' },
      'No se pudo enviar el codigo.'
    )).toBe('No se pudo enviar el código. Revisá tu conexión o intentá nuevamente.');
  });

  it('knows whether a profile already has a password', () => {
    const service = createAuthService(Promise.resolve({ auth: {} }));

    expect(service.hasPassword({ password_configured: true })).toBe(true);
    expect(service.hasPassword({ password_configured: false })).toBe(false);
    expect(service.hasPassword({ password_configured_at: '2026-05-30T12:00:00.000Z' })).toBe(false);
  });
});
