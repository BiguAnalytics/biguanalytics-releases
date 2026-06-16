import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  canonicalEnvKey,
  getCaseInsensitiveEnvValue,
  getPublicSupabaseConfig,
  getSupabaseConfigFromEnv,
  getSupabaseConfigFromSources,
  parseEnvContent,
} from '../env.js';

const envSource = readFileSync(resolve(process.cwd(), 'src/main/modules/env.js'), 'utf8');

describe('main environment loading helpers', () => {
  it('normalizes public app config casing from env content', () => {
    expect(canonicalEnvKey('supabase_url')).toBe('SUPABASE_URL');
    expect(parseEnvContent('supabase_url="https://example.supabase.co"\nOTHER=value')).toEqual({
      SUPABASE_URL: 'https://example.supabase.co',
      OTHER: 'value',
    });
  });

  it('reads environment keys case-insensitively without exposing the whole env', () => {
    expect(getCaseInsensitiveEnvValue({ supabase_url: 'https://example.supabase.co' }, 'SUPABASE_URL')).toBe('https://example.supabase.co');
    expect(getCaseInsensitiveEnvValue({ OTHER: 'x' }, 'SUPABASE_URL')).toBeUndefined();
  });

  it('accepts common public Supabase aliases used by packaged and frontend envs', () => {
    const parsed = parseEnvContent([
      'VITE_SUPABASE_URL=https://club.supabase.co/rest/v1/',
      'SUPABASE_ANON_KEY=sb_publishable_public',
    ].join('\n'));

    expect(parsed).toEqual({
      SUPABASE_URL: 'https://club.supabase.co/rest/v1/',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public',
    });
    expect(getSupabaseConfigFromEnv(parsed)).toEqual({
      supabaseUrl: 'https://club.supabase.co',
      supabasePublishableKey: 'sb_publishable_public',
    });
    expect(getCaseInsensitiveEnvValue({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_next',
    }, 'SUPABASE_PUBLISHABLE_KEY')).toBe('sb_publishable_next');
  });

  it('resolves production Supabase config from packaged public config without .env.local', () => {
    const config = getSupabaseConfigFromSources({
      env: {},
      publicConfig: getPublicSupabaseConfig(),
    });

    expect(config.supabaseUrl).toBe('https://eenqsorivrtkeqauehkc.supabase.co');
    expect(config.supabasePublishableKey).toBe('sb_publishable_5huxPoLeXxcuMUOCnB9Dpg_WB6NNVyR');
    expect(envSource).not.toContain('.env.local');
  });

  it('does not block startup by shelling out to the Windows registry for env values', () => {
    expect(envSource).not.toContain("require('child_process')");
    expect(envSource).not.toContain('execFileSync');
    expect(envSource).not.toContain("execFileSync('reg'");
    expect(envSource).not.toContain('loadWindowsRegistryEnvironment');
    expect(envSource).toContain('function loadMainEnvironment()');
    expect(envSource).toContain('loadEnvFiles();');
  });
});
