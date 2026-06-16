import { describe, expect, it, vi } from 'vitest';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createAIBackendClient, normalizeAIBackendUrl } from '../ai/aiBackendClient.js';
import * as aiConstants from '../ai/aiConstants.js';
import publicConfig from '../../../config/public-env.js';
import { createAIConfigRepository, maskClientToken, mergeAIConfig } from '../ai/aiConfig.js';

const PRODUCTION_AI_BACKEND_URL = 'https://biguanalytics-ai-896390333343.us-central1.run.app';
const aiBackendClientSource = readFileSync(resolve(process.cwd(), 'src/main/modules/ai/aiBackendClient.js'), 'utf8');

function createMemoryStore(initialValue) {
  return {
    value: initialValue,
    get(key) {
      return key === 'aiConfig' ? this.value : undefined;
    },
    set(key, value) {
      if (key === 'aiConfig') this.value = value;
    },
  };
}

function createMockSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`sealed:${value}`, 'utf8'),
    decryptString: (value) => Buffer.from(value).toString('utf8').replace(/^sealed:/, ''),
  };
}

describe('AI backend client', () => {
  it('normalizes backend URLs without exposing client tokens', () => {
    expect(normalizeAIBackendUrl(' http://localhost:8787/// ')).toBe('http://localhost:8787');
    expect(normalizeAIBackendUrl('')).toBe('http://localhost:8787');
  });

  it('uses localhost only as the development default backend URL', () => {
    expect(aiConstants.getDefaultAIBackendUrl({ env: {}, isPackaged: false })).toBe('http://localhost:8787');
    expect(aiConstants.getDefaultAIBackendUrl({ env: { NODE_ENV: 'production' }, isPackaged: true })).toBe(PRODUCTION_AI_BACKEND_URL);
    expect(aiConstants.getDefaultAIBackendUrl({
      env: { AI_BACKEND_URL: 'https://ai.biguanalytics.example/' },
      isPackaged: true,
    })).toBe(PRODUCTION_AI_BACKEND_URL);
  });

  it('packages the production AI backend URL as public client config', () => {
    expect(publicConfig.PRODUCTION_AI_BACKEND_URL).toBe(PRODUCTION_AI_BACKEND_URL);
    expect(aiConstants.PRODUCTION_AI_BACKEND_URL).toBe(PRODUCTION_AI_BACKEND_URL);
  });

  it('defaults packaged Electron config to the production AI backend', () => {
    expect(mergeAIConfig({}, { env: { NODE_ENV: 'production' }, isPackaged: true })).toEqual({
      backendUrl: PRODUCTION_AI_BACKEND_URL,
      clientToken: '',
    });
  });

  it('uses the production backend URL for match analysis when packaged settings have no backend URL', async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url).toBe(`${PRODUCTION_AI_BACKEND_URL}/v1/ai/analyze-match`);
      expect(options.headers.Authorization).toBe('Bearer supabase-access-token');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: { summary: 'Resumen seguro.' },
          usage: { totalTokens: 10 },
          model: 'gemini-2.5-flash-lite',
        }),
      };
    });
    const client = createAIBackendClient({
      env: { NODE_ENV: 'production' },
      fetchImpl,
      getAuthToken: async () => 'supabase-access-token',
      getConfig: async () => ({ backendUrl: '', clientToken: '' }),
      isPackaged: true,
    });

    await expect(client.generateMatchAnalysis({ events: [{ type: 'ruck' }] })).resolves.toMatchObject({
      result: { summary: 'Resumen seguro.' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses the production backend URL for connection tests even with stale saved settings', async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url).toBe(`${PRODUCTION_AI_BACKEND_URL}/v1/ai/verify-auth`);
      expect(options.headers.Authorization).toBe('Bearer supabase-access-token');
      return {
        ok: true,
        status: 200,
        json: async () => ({ authenticated: true, ai_enabled: true }),
      };
    });
    const client = createAIBackendClient({
      env: { NODE_ENV: 'production' },
      fetchImpl,
      getAuthToken: async () => 'supabase-access-token',
      getConfig: async () => ({
        backendUrl: 'https://old-user-setting.example///',
        clientToken: 'legacy-client-token',
      }),
      isPackaged: true,
    });

    await expect(client.verifyToken()).resolves.toMatchObject({
      ok: true,
      status: 'connected',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not contain the legacy production error that asks users to configure a backend URL', () => {
    expect(aiBackendClientSource).not.toContain('Configura la URL del backend IA');
  });

  it('calls the configured backend with a Supabase bearer token', async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url).toBe('https://ai.biguanalytics.example/v1/ai/analyze-match');
      expect(options.headers.Authorization).toBe('Bearer supabase-access-token');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual({
        matchData: { events: [{ type: 'ruck' }] },
        options: {},
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: { summary: 'Resumen seguro.' },
          usage: { totalTokens: 10 },
          model: 'gemini-2.5-flash-lite',
        }),
      };
    });
    const client = createAIBackendClient({
      fetchImpl,
      getAuthToken: async () => 'supabase-access-token',
      getConfig: async () => ({
        backendUrl: 'https://ai.biguanalytics.example/',
        clientToken: 'legacy-client-token',
      }),
    });

    await expect(client.generateMatchAnalysis({ events: [{ type: 'ruck' }] })).resolves.toMatchObject({
      result: { summary: 'Resumen seguro.' },
      usage: { totalTokens: 10 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('prioritizes the current Supabase access token over the legacy client token', async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url).toBe('https://ai.biguanalytics.example/v1/ai/generate-summary');
      expect(options.headers.Authorization).toBe('Bearer supabase-access-token');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: { summary: 'Resumen seguro.' },
          usage: {},
          model: 'gemini-2.5-flash-lite',
        }),
      };
    });
    const client = createAIBackendClient({
      fetchImpl,
      getAuthToken: async () => 'supabase-access-token',
      getConfig: async () => ({
        backendUrl: 'https://ai.biguanalytics.example',
        clientToken: 'legacy-client-token',
      }),
    });

    await client.generateSummary({ events: [{ type: 'ruck' }] });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('posts match chat questions to the secure backend with the current Supabase token', async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url).toBe('https://ai.biguanalytics.example/v1/ai/chat-match');
      expect(options.headers.Authorization).toBe('Bearer supabase-access-token');
      expect(JSON.parse(options.body)).toEqual({
        matchData: { scoreContext: { resultForBigua: 'win' }, events: [{ type: 'ruck' }] },
        question: 'Que paso en los rucks?',
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            answer: 'Bigua sostuvo la posesion con rucks estables.',
            usedMetrics: ['rucks.home.wonPct'],
            confidence: 0.82,
          },
          usage: { totalTokens: 12 },
          model: 'gemini-2.5-flash-lite',
        }),
      };
    });
    const client = createAIBackendClient({
      fetchImpl,
      getAuthToken: async () => 'supabase-access-token',
      getConfig: async () => ({ backendUrl: 'https://ai.biguanalytics.example' }),
    });

    await expect(client.chatMatch({
      scoreContext: { resultForBigua: 'win' },
      events: [{ type: 'ruck' }],
    }, 'Que paso en los rucks?')).resolves.toMatchObject({
      result: {
        answer: 'Bigua sostuvo la posesion con rucks estables.',
        usedMetrics: ['rucks.home.wonPct'],
        confidence: 0.82,
      },
      usage: { totalTokens: 12 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('verifies backend auth through the Supabase verify-auth endpoint', async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url).toBe('https://ai.biguanalytics.example/v1/ai/verify-auth');
      expect(options.headers.Authorization).toBe('Bearer supabase-access-token');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          authenticated: true,
          user_id: 'user-1',
          status: 'approved',
          ai_enabled: true,
          ai_daily_limit: 30,
          role: 'analyst',
        }),
      };
    });
    const client = createAIBackendClient({
      fetchImpl,
      getAuthToken: async () => 'supabase-access-token',
      getConfig: async () => ({
        backendUrl: 'https://ai.biguanalytics.example',
        clientToken: '',
      }),
    });

    await expect(client.verifyToken()).resolves.toMatchObject({
      ok: true,
      status: 'connected',
      userId: 'user-1',
      profileStatus: 'approved',
      dailyLimit: 30,
      role: 'analyst',
    });
  });

  it('fails before network calls when neither Supabase session nor legacy dev token exists', async () => {
    const fetchImpl = vi.fn();
    const client = createAIBackendClient({
      fetchImpl,
      getAuthToken: async () => '',
      getConfig: async () => ({ backendUrl: 'https://ai.biguanalytics.example', clientToken: '' }),
    });

    await expect(client.generateSummary({ events: [{ type: 'ruck' }] })).rejects.toThrow('Tu sesión expiró. Volvé a iniciar sesión.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not use legacy manual client tokens for AI backend calls', async () => {
    const fetchImpl = vi.fn();
    const client = createAIBackendClient({
      fetchImpl,
      getAuthToken: async () => '',
      getConfig: async () => ({
        backendUrl: 'https://ai.biguanalytics.example',
        clientToken: 'legacy-client-token',
      }),
    });

    await expect(client.detectPatterns({ events: [{ type: 'ruck' }] })).rejects.toThrow('Tu sesión expiró. Volvé a iniciar sesión.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps backend errors to safe user-facing messages', async () => {
    const client = createAIBackendClient({
      fetchImpl: vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'unauthorized', message: 'full-token-secret' } }),
      })),
      getAuthToken: async () => 'supabase-access-token',
      getConfig: async () => ({
        backendUrl: 'https://ai.biguanalytics.example',
        clientToken: 'client-token-secret',
      }),
    });

    await expect(client.generateSummary({ events: [{ type: 'ruck' }] })).rejects.toThrow('Tu sesión expiró. Volvé a iniciar sesión.');
  });

  it('maps Supabase users without AI access to the product copy', async () => {
    const client = createAIBackendClient({
      fetchImpl: vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 'ai_forbidden', message: 'Usuario no aprobado o IA deshabilitada.' } }),
      })),
      getAuthToken: async () => 'supabase-access-token',
      getConfig: async () => ({
        backendUrl: 'https://ai.biguanalytics.example',
        clientToken: '',
      }),
    });

    await expect(client.generateSummary({ events: [{ type: 'ruck' }] })).rejects.toThrow('IA no habilitada para este usuario.');
    await expect(client.verifyToken()).resolves.toMatchObject({
      ok: false,
      status: 'ai-disabled',
      message: 'IA no habilitada para este usuario.',
    });
  });

  it('fails before making network calls when AI config is incomplete', async () => {
    const fetchImpl = vi.fn();
    const client = createAIBackendClient({
      fetchImpl,
      getConfig: async () => ({ backendUrl: 'https://ai.biguanalytics.example', clientToken: '' }),
    });

    await expect(client.detectPatterns({ events: [{ type: 'ruck' }] })).rejects.toThrow('Tu sesión expiró. Volvé a iniciar sesión.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('AI config repository', () => {
  it('stores only backend URL and revocable client token defaults', () => {
    expect(mergeAIConfig()).toEqual({
      backendUrl: 'http://localhost:8787',
      clientToken: '',
    });
    expect(mergeAIConfig({ backendUrl: ' https://ai.example.com/// ', clientToken: ' token-1 ' })).toEqual({
      backendUrl: 'https://ai.example.com',
      clientToken: 'token-1',
    });
  });

  it('encrypts client tokens at rest and returns only masked public config', async () => {
    const saved = [];
    const store = createMemoryStore();
    store.set = (key, value) => {
      saved.push({ key, value });
      store.value = value;
    };
    const repo = createAIConfigRepository(store, { safeStorage: createMockSafeStorage() });

    await expect(repo.set({ backendUrl: 'https://ai.example.com', clientToken: 'client-token-secret' })).resolves.toEqual({
      backendUrl: 'https://ai.example.com',
      clientToken: '********cret',
      hasClientToken: true,
      tokenStorage: { provider: 'electron.safeStorage', encrypted: true },
    });
    await expect(repo.get()).resolves.toEqual({
      backendUrl: 'https://ai.example.com',
      clientToken: 'client-token-secret',
    });
    expect(saved).toEqual([{
      key: 'aiConfig',
      value: {
        backendUrl: 'https://ai.example.com',
        clientTokenEncrypted: Buffer.from('sealed:client-token-secret', 'utf8').toString('base64'),
        tokenStorage: { provider: 'electron.safeStorage', version: 1 },
      },
    }]);
    expect(store.value.clientToken).toBeUndefined();
  });

  it('migrates a legacy plaintext client token and removes it from persisted config', async () => {
    const store = createMemoryStore({
      backendUrl: 'https://ai.example.com',
      clientToken: 'legacy-token-secret',
    });
    const repo = createAIConfigRepository(store, { safeStorage: createMockSafeStorage() });

    await expect(repo.get()).resolves.toEqual({
      backendUrl: 'https://ai.example.com',
      clientToken: 'legacy-token-secret',
    });

    expect(store.value).toEqual({
      backendUrl: 'https://ai.example.com',
      clientTokenEncrypted: Buffer.from('sealed:legacy-token-secret', 'utf8').toString('base64'),
      tokenStorage: { provider: 'electron.safeStorage', version: 1 },
    });
    expect(store.value.clientToken).toBeUndefined();
  });

  it('keeps tokens session-only with an internal warning when safeStorage is unavailable', async () => {
    const warn = vi.fn();
    const store = createMemoryStore();
    const repo = createAIConfigRepository(store, {
      safeStorage: createMockSafeStorage(false),
      warn,
    });

    await expect(repo.set({ backendUrl: 'https://ai.example.com', clientToken: 'session-token-secret' })).resolves.toMatchObject({
      backendUrl: 'https://ai.example.com',
      clientToken: '********cret',
      hasClientToken: true,
      tokenStorage: { provider: 'memory', encrypted: false },
    });
    await expect(repo.get()).resolves.toEqual({
      backendUrl: 'https://ai.example.com',
      clientToken: 'session-token-secret',
    });

    expect(store.value).toEqual({
      backendUrl: 'https://ai.example.com',
      clientTokenEncrypted: '',
      tokenStorage: { provider: 'memory', version: 1 },
    });
    expect(store.value.clientToken).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('safeStorage'));
  });

  it('preserves an existing token when the renderer submits its masked value', async () => {
    const store = createMemoryStore();
    const repo = createAIConfigRepository(store, { safeStorage: createMockSafeStorage() });
    await repo.set({ backendUrl: 'https://ai.example.com', clientToken: 'client-token-secret' });

    const masked = maskClientToken('client-token-secret');
    await repo.set({ backendUrl: 'https://next-ai.example.com', clientToken: masked });

    await expect(repo.get()).resolves.toEqual({
      backendUrl: 'https://next-ai.example.com',
      clientToken: 'client-token-secret',
    });
  });
});
