import { describe, expect, it, vi } from 'vitest';

import { AUTH_SESSION_STORAGE_KEY } from '../auth-session-keys.js';
import {
  SESSION_EXPIRED_MESSAGE,
  findAccessToken,
  getStoredSupabaseAccessToken,
  isSupabaseSessionExpired,
} from '../ai/aiAuthSession.js';

const now = () => new Date('2026-06-08T12:00:00.000Z');

describe('AI Supabase auth session token extraction', () => {
  it('finds Supabase access tokens in persisted session shapes', () => {
    expect(findAccessToken(JSON.stringify({
      currentSession: { access_token: ' current-session-token ' },
    }))).toBe('current-session-token');
    expect(findAccessToken({
      data: {
        session: { access_token: 'nested-session-token' },
      },
    })).toBe('nested-session-token');
    expect(findAccessToken([
      null,
      { session: { access_token: 'array-session-token' } },
    ])).toBe('array-session-token');
  });

  it('reads the access token from the Supabase auth session storage key', async () => {
    const store = {
      get: vi.fn(async key => key === AUTH_SESSION_STORAGE_KEY
        ? JSON.stringify({ currentSession: { access_token: 'supabase-access-token' } })
        : null),
    };

    await expect(getStoredSupabaseAccessToken(store)).resolves.toBe('supabase-access-token');
    expect(store.get).toHaveBeenCalledWith(AUTH_SESSION_STORAGE_KEY);
  });

  it('detects expired Supabase sessions before calling Cloud Run', () => {
    expect(isSupabaseSessionExpired({ expires_at: 1780920060 }, { now })).toBe(false);
    expect(isSupabaseSessionExpired({ expires_at: 1780919999 }, { now })).toBe(true);
  });

  it('refreshes an expired Supabase session and persists the new access token', async () => {
    const store = {
      get: vi.fn(async () => JSON.stringify({
        currentSession: {
          access_token: 'old-access-token',
          refresh_token: 'refresh-token',
          expires_at: 1780919999,
          user: { id: 'user-1' },
        },
      })),
      set: vi.fn(async () => true),
    };
    const refreshSession = vi.fn(async token => ({
      access_token: token === 'refresh-token' ? 'new-access-token' : '',
      refresh_token: 'new-refresh-token',
      expires_at: 1780923600,
      user: { id: 'user-1' },
    }));

    await expect(getStoredSupabaseAccessToken(store, { now, refreshSession })).resolves.toBe('new-access-token');
    expect(refreshSession).toHaveBeenCalledWith('refresh-token');
    expect(store.set).toHaveBeenCalledWith(
      AUTH_SESSION_STORAGE_KEY,
      expect.stringContaining('new-access-token')
    );
  });

  it('throws a clear session-expired message when no session can be refreshed', async () => {
    const store = {
      get: vi.fn(async () => JSON.stringify({
        currentSession: {
          access_token: 'old-access-token',
          refresh_token: 'refresh-token',
          expires_at: 1780919999,
        },
      })),
      set: vi.fn(),
    };

    await expect(getStoredSupabaseAccessToken(store, {
      now,
      refreshSession: vi.fn(async () => null),
    })).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  });
});
