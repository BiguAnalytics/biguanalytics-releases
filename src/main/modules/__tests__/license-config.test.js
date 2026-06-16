import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import {
  getPublicSupabaseConfig,
  getSupabaseConfigFromEnv,
  getSupabaseConfigFromSources,
  normalizeSupabaseUrl,
  parseEnvContent,
} from '../env.js';

const require = createRequire(import.meta.url);
const { getAuthConfig } = require('../../auth/config');

const packageJson = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'));
const indexHtml = readFileSync(new URL('../../../renderer/index.html', import.meta.url), 'utf8');

describe('license environment config', () => {
  it('normalizes Supabase REST URLs to the project base URL', () => {
    expect(normalizeSupabaseUrl('https://eenqsorivrtkeqauehkc.supabase.co/rest/v1/'))
      .toBe('https://eenqsorivrtkeqauehkc.supabase.co');
    expect(normalizeSupabaseUrl('https://eenqsorivrtkeqauehkc.supabase.co/'))
      .toBe('https://eenqsorivrtkeqauehkc.supabase.co');
  });

  it('reads only publishable Supabase env keys and never a service role key', () => {
    const parsed = parseEnvContent([
      'supabase_url=https://example.supabase.co/rest/v1/',
      'supabase_publishable_key=sb_publishable_test',
      'SUPABASE_SERVICE_ROLE_KEY=secret',
    ].join('\n'));

    expect(getSupabaseConfigFromEnv(parsed)).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_test',
    });
  });

  it('declares the public Supabase client dependency and CSP connect-src', () => {
    expect(packageJson.dependencies).toHaveProperty('@supabase/supabase-js');
    expect(indexHtml).toContain('https://*.supabase.co');
  });

  it('uses packaged public Supabase config in production without service role keys', () => {
    const config = getSupabaseConfigFromSources({
      env: {},
      publicConfig: getPublicSupabaseConfig(),
    });
    const serialized = JSON.stringify(config);

    expect(config.supabaseUrl).toBe('https://eenqsorivrtkeqauehkc.supabase.co');
    expect(config.supabasePublishableKey).toMatch(/^sb_publishable_/);
    expect(serialized).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(serialized).not.toMatch(/service[_-]?role/i);
  });

  it('ignores development license mock env in packaged runtime', () => {
    const config = getAuthConfig({
      env: {
        BIGU_LICENSE_DEV_MOCK: 'true',
      },
      processInfo: {
        defaultApp: false,
        argv: ['BiguAnalytics.exe'],
      },
    });

    expect(config.licenseDevMock).toBe(false);
  });
});
