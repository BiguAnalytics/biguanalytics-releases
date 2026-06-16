import { describe, expect, it } from 'vitest';

import { validateAuthSessionKey } from '../auth-session-keys.js';

describe('auth session storage key validation', () => {
  it('allows the Supabase auth storage key and its known auxiliary keys only', () => {
    expect(validateAuthSessionKey('bigu-license-auth')).toBe('bigu-license-auth');
    expect(validateAuthSessionKey('bigu-license-auth-code-verifier')).toBe('bigu-license-auth-code-verifier');
    expect(validateAuthSessionKey('bigu-license-auth-user')).toBe('bigu-license-auth-user');
  });

  it('rejects keys outside the license auth namespace', () => {
    expect(() => validateAuthSessionKey('bigu-license')).toThrow('Clave de sesion invalida.');
    expect(() => validateAuthSessionKey('bigu-license-auth-refresh')).toThrow('Clave de sesion invalida.');
    expect(() => validateAuthSessionKey('other-auth')).toThrow('Clave de sesion invalida.');
  });
});
