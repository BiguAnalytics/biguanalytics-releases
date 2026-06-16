import { describe, expect, it } from 'vitest';

import { getAIBackendListenConfig } from '../listen-config.js';

describe('AI backend listen configuration', () => {
  it('binds to loopback on the default AI backend port', () => {
    expect(getAIBackendListenConfig({})).toEqual({
      host: '127.0.0.1',
      port: 8787,
    });
  });

  it('rejects network exposure unless it is explicitly enabled', () => {
    expect(() => getAIBackendListenConfig({ HOST: '0.0.0.0' }))
      .toThrow('AI backend network exposure requires AI_BACKEND_EXPOSE_NETWORK=true.');

    expect(getAIBackendListenConfig({
      HOST: '0.0.0.0',
      AI_BACKEND_EXPOSE_NETWORK: 'true',
      PORT: '8788',
      GEMINI_API_KEY: 'test-provider-key',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })).toEqual({
      host: '0.0.0.0',
      port: 8788,
    });
  });

  it('requires provider key and client tokens before public network startup', () => {
    const publicEnv = {
      AI_BACKEND_HOST: '0.0.0.0',
      AI_BACKEND_EXPOSE_NETWORK: 'true',
      PORT: '8788',
    };

    expect(() => getAIBackendListenConfig(publicEnv))
      .toThrow('GEMINI_API_KEY');
    expect(() => getAIBackendListenConfig({
      ...publicEnv,
      GEMINI_API_KEY: 'test-provider-key',
    })).toThrow('ALLOWED_CLIENT_TOKENS');
  });

  it('requires provider key and Supabase auth secrets whenever NODE_ENV is production', () => {
    expect(() => getAIBackendListenConfig({
      NODE_ENV: 'production',
      AI_BACKEND_EXPOSE_NETWORK: 'true',
      PORT: '8080',
    })).toThrow('GEMINI_API_KEY');

    expect(() => getAIBackendListenConfig({
      NODE_ENV: 'production',
      AI_BACKEND_EXPOSE_NETWORK: 'true',
      PORT: '8080',
      GEMINI_API_KEY: 'test-provider-key',
    })).toThrow('SUPABASE_URL');

    expect(() => getAIBackendListenConfig({
      NODE_ENV: 'production',
      AI_BACKEND_EXPOSE_NETWORK: 'true',
      PORT: '8080',
      GEMINI_API_KEY: 'test-provider-key',
      SUPABASE_URL: 'https://project.supabase.co',
    })).toThrow('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('defaults production to 0.0.0.0 and the Cloud Run PORT when exposure is enabled', () => {
    expect(getAIBackendListenConfig({
      NODE_ENV: 'production',
      AI_BACKEND_EXPOSE_NETWORK: 'true',
      PORT: '8080',
      GEMINI_API_KEY: 'test-provider-key',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })).toEqual({
      host: '0.0.0.0',
      port: 8080,
    });
  });

  it('allows public production startup only with required server secrets', () => {
    expect(getAIBackendListenConfig({
      AI_BACKEND_HOST: '0.0.0.0',
      AI_BACKEND_EXPOSE_NETWORK: 'true',
      PORT: '10000',
      GEMINI_API_KEY: 'test-provider-key',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })).toEqual({
      host: '0.0.0.0',
      port: 10000,
    });
  });

  it('rejects invalid ports before opening a socket', () => {
    expect(() => getAIBackendListenConfig({ PORT: '0' })).toThrow('Puerto IA invalido.');
    expect(() => getAIBackendListenConfig({ PORT: '70000' })).toThrow('Puerto IA invalido.');
    expect(() => getAIBackendListenConfig({ PORT: 'abc' })).toThrow('Puerto IA invalido.');
  });
});
