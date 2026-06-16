import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as guard from '../access-guard.js';

const localGraceAccess = {
  state: 'offline_grace',
  reason: 'receipt_valid',
  allowed: true,
  user: { id: 'user-1', email: 'analyst@bigua.com' },
  profile: {
    id: 'user-1',
    email: 'analyst@bigua.com',
    club_id: 'club-1',
    profile_complete: true,
    display_name: 'Ana G.',
    app_role: 'analista',
  },
  club: { id: 'club-1', name: 'Bigua Rugby' },
  device: { id: 'device-1', status: 'offline_bound' },
  offlineGraceExpiresAt: '2026-06-03T12:00:00.000Z',
};

describe('startup access flow', () => {
  beforeEach(() => {
    vi.useRealTimers();
    guard.resetAccessStateForTests?.();
  });

  afterEach(() => {
    vi.useRealTimers();
    guard.resetAccessStateForTests?.();
  });

  it('enters with valid local grace without awaiting the online Supabase check', async () => {
    expect(typeof guard.resolveStartupAccess).toBe('function');
    const onlineCheck = vi.fn(() => new Promise(() => {}));
    const marks = [];

    const result = await guard.resolveStartupAccess({
      readLocalAccessState: vi.fn(async () => localGraceAccess),
      onlineCheck,
      mark: (label, detail) => marks.push({ label, detail }),
    });

    expect(onlineCheck).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      source: 'local_grace',
      shouldRunBackgroundVerification: true,
      access: {
        state: 'offline_grace',
        verificationStatus: 'local_verified',
      },
    });
    expect(guard.getAccessState()).toMatchObject({
      state: 'offline_grace',
      verificationStatus: 'local_verified',
    });
    expect(marks.map(mark => mark.label)).toContain('app:enter:local-grace');
    expect(marks.map(mark => mark.label)).toContain('license:enter-from-local-grace');
    expect(marks.map(mark => mark.label)).toContain('local-access:grace-valid');
  });

  it('keeps local grace when Supabase is slow and background verification times out', async () => {
    expect(typeof guard.runBackgroundAccessVerification).toBe('function');
    vi.useFakeTimers();
    const updates = [];
    const denied = vi.fn();

    await guard.resolveStartupAccess({
      readLocalAccessState: vi.fn(async () => localGraceAccess),
      onlineCheck: vi.fn(),
      mark: vi.fn(),
    });

    const pending = guard.runBackgroundAccessVerification({
      onlineCheck: vi.fn(() => new Promise(() => {})),
      onUpdate: (access) => updates.push(access),
      onDenied: denied,
      timeoutMs: guard.BACKGROUND_ACCESS_TIMEOUT_MS,
      mark: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(guard.BACKGROUND_ACCESS_TIMEOUT_MS);
    const result = await pending;

    expect(result).toMatchObject({
      state: 'offline_grace',
      verificationStatus: 'offline_mode',
      reason: 'license_check_timeout',
    });
    expect(updates.at(-1)).toMatchObject({ verificationStatus: 'offline_mode' });
    expect(denied).not.toHaveBeenCalled();
  });

  it('marks offline mode when background verification falls back to local grace', async () => {
    expect(typeof guard.runBackgroundAccessVerification).toBe('function');
    const updates = [];

    await guard.resolveStartupAccess({
      readLocalAccessState: vi.fn(async () => localGraceAccess),
      onlineCheck: vi.fn(),
      mark: vi.fn(),
    });

    const result = await guard.runBackgroundAccessVerification({
      onlineCheck: vi.fn(async () => ({
        ...localGraceAccess,
        reason: 'receipt_valid',
        verificationStatus: undefined,
      })),
      onUpdate: (access) => updates.push(access),
      mark: vi.fn(),
    });

    expect(result).toMatchObject({
      state: 'offline_grace',
      verificationStatus: 'offline_mode',
    });
    expect(updates.at(-1)).toMatchObject({ verificationStatus: 'offline_mode' });
  });

  it('does not enter from expired local grace when blocking verification times out', async () => {
    expect(typeof guard.resolveStartupAccess).toBe('function');
    vi.useFakeTimers();
    const marks = [];
    let settled = false;

    const pending = guard.resolveStartupAccess({
      readLocalAccessState: vi.fn(async () => ({
        state: 'renewal_required',
        reason: 'offline_grace_expired',
        offlineGraceExpiresAt: '2026-06-01T12:00:00.000Z',
      })),
      onlineCheck: vi.fn(() => new Promise(() => {})),
      mark: (label, detail) => marks.push({ label, detail }),
      blockingTimeoutMs: guard.BLOCKING_ACCESS_TIMEOUT_MS,
    }).then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(guard.BLOCKING_ACCESS_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result).toMatchObject({
      source: 'blocking_online',
      shouldRunBackgroundVerification: false,
      access: {
        state: 'connection_error',
        reason: 'license_check_timeout',
      },
    });
    expect(marks.map(mark => mark.label)).toContain('license-check:timeout');
    expect(guard.getAccessState()).toMatchObject({
      state: 'connection_error',
      reason: 'license_check_timeout',
    });
  });

  it('revokes local access when online background verification returns a hard denial', async () => {
    expect(typeof guard.runBackgroundAccessVerification).toBe('function');
    const revokeLocalAccess = vi.fn(async () => ({ state: 'suspended_license', reason: 'license_suspended' }));
    const denied = vi.fn();

    await guard.resolveStartupAccess({
      readLocalAccessState: vi.fn(async () => localGraceAccess),
      onlineCheck: vi.fn(),
      mark: vi.fn(),
    });

    const result = await guard.runBackgroundAccessVerification({
      onlineCheck: vi.fn(async () => ({
        state: 'suspended_license',
        reason: 'license_suspended',
      })),
      revokeLocalAccess,
      onDenied: denied,
      mark: vi.fn(),
    });

    expect(revokeLocalAccess).toHaveBeenCalledWith(expect.objectContaining({
      state: 'suspended_license',
      reason: 'license_suspended',
    }));
    expect(denied).toHaveBeenCalledWith(expect.objectContaining({
      state: 'suspended_license',
      reason: 'license_suspended',
    }));
    expect(result).toMatchObject({
      state: 'suspended_license',
      reason: 'license_suspended',
    });
  });
});
