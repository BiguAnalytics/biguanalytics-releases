import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getSupabaseClient, resetSupabaseClientForTests } from '../supabase-client.js';

const DEVICE_FINGERPRINT_HASH = 'a'.repeat(64);

function installWindow(createClient = vi.fn(() => ({ ok: true }))) {
  globalThis.window = {
    api: {
      authSession: {
        get: vi.fn(async () => null),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
      device: {
        getFingerprint: vi.fn(async () => ({
          fingerprintHash: DEVICE_FINGERPRINT_HASH,
        })),
      },
      licenseConfig: {
        get: vi.fn(async () => ({
          supabaseUrl: 'https://project.supabase.co',
          supabasePublishableKey: 'sb_publishable_test',
        })),
      },
    },
    supabase: {
      createClient,
    },
  };
  return createClient;
}

describe('Supabase client', () => {
  beforeEach(() => {
    resetSupabaseClientForTests();
  });

  afterEach(() => {
    resetSupabaseClientForTests();
    delete globalThis.window;
  });

  it('sends the local device fingerprint as a global Supabase request header', async () => {
    const createClient = installWindow();

    await getSupabaseClient();

    expect(globalThis.window.api.device.getFingerprint).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'sb_publishable_test',
      expect.objectContaining({
        global: {
          headers: {
            'x-bigu-device-fingerprint': DEVICE_FINGERPRINT_HASH,
          },
        },
      })
    );
  });
});
