import http from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createAIBackendApp } from '../app.js';
import { getAIBackendListenConfig } from '../listen-config.js';

async function withPublicServer(app, testFn) {
  const server = http.createServer(app);
  await new Promise(resolveListen => server.listen(0, '0.0.0.0', resolveListen));
  const { port } = server.address();
  try {
    await testFn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

function listElectronClientFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = join(dir, name);
    if (fullPath.includes('__tests__') || fullPath.includes(`${join('renderer', 'vendor')}`)) return [];
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return listElectronClientFiles(fullPath);
    return /\.(js|html|css)$/.test(name) ? [fullPath] : [];
  });
}

describe('AI backend production deployment smoke test', () => {
  it('defines a Cloud Run compatible Dockerfile for the AI backend', () => {
    const dockerfilePath = resolve(process.cwd(), 'Dockerfile');
    const rootPackagePath = resolve(process.cwd(), 'package.json');
    const serverPackagePath = resolve(process.cwd(), 'server/package.json');

    expect(existsSync(dockerfilePath)).toBe(true);
    expect(existsSync(rootPackagePath)).toBe(true);
    expect(existsSync(serverPackagePath)).toBe(true);
    const dockerfile = readFileSync(dockerfilePath, 'utf8');
    const rootPackageJson = JSON.parse(readFileSync(rootPackagePath, 'utf8'));
    const serverPackageJson = JSON.parse(readFileSync(serverPackagePath, 'utf8'));
    expect(dockerfile).toContain('FROM node:');
    expect(dockerfile).toContain('ENV NODE_ENV=production');
    expect(dockerfile).toContain('WORKDIR /app/server');
    expect(dockerfile).toContain('COPY server/package*.json ./');
    expect(dockerfile).toContain('RUN npm ci --omit=dev');
    expect(dockerfile).toContain('EXPOSE 8080');
    expect(dockerfile).toContain('CMD ["npm", "run", "server"]');
    expect(dockerfile).not.toContain('electron .');
    expect(rootPackageJson.scripts['server:install']).toBe('npm --prefix server ci --omit=dev');
    expect(rootPackageJson.scripts.pretest).toBeUndefined();
    expect(rootPackageJson.scripts['deps:install']).toContain('npm run server:install');
    expect(rootPackageJson.scripts.preserver).toBe('npm run server:install');
    expect(rootPackageJson.dependencies).not.toHaveProperty('@google/genai');
    expect(rootPackageJson.dependencies).not.toHaveProperty('express');
    expect(serverPackageJson.dependencies).toHaveProperty('@google/genai');
    expect(serverPackageJson.dependencies).toHaveProperty('express');
  });

  it('excludes local data, builds and secrets from Docker context', () => {
    const dockerignorePath = resolve(process.cwd(), '.dockerignore');

    expect(existsSync(dockerignorePath)).toBe(true);
    const ignored = readFileSync(dockerignorePath, 'utf8');
    [
      'node_modules',
      'dist',
      '.env',
      '.env.local',
      '.env.production',
      'data',
      'logs',
    ].forEach((entry) => {
      expect(ignored).toContain(entry);
    });
  });

  it('defines a Google Cloud Buildpacks web process for the AI backend', () => {
    const procfilePath = resolve(process.cwd(), 'Procfile');

    expect(existsSync(procfilePath)).toBe(true);
    expect(readFileSync(procfilePath, 'utf8').trim()).toBe('web: npm --prefix server run server');
  });

  it('supports public host config while keeping auth enforced and health non-sensitive', async () => {
    const env = {
      AI_BACKEND_HOST: '0.0.0.0',
      AI_BACKEND_EXPOSE_NETWORK: 'true',
      PORT: '10000',
      GEMINI_API_KEY: 'test-provider-key',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      AI_DAILY_REQUEST_LIMIT: '10',
      AI_MAX_INPUT_CHARS: '2000',
    };
    const config = getAIBackendListenConfig(env);
    const generateJson = vi.fn(async () => ({
      result: {
        summary: 'Resumen seguro.',
        key_points: ['Rucks estables.'],
        pdf_report_phrases: [],
        confidence: 0.8,
        missing_data: [],
      },
      usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
      model: 'gemini-2.5-flash-lite',
    }));

    expect(config).toEqual({ host: '0.0.0.0', port: 10000 });

    await withPublicServer(createAIBackendApp({
      env,
      authService: {
        mode: 'supabase',
        authenticateToken: vi.fn(async (token) => token === 'valid-supabase-access-token'
          ? {
            ok: true,
            userId: '00000000-0000-4000-8000-000000000001',
            aiAccess: { status: 'approved', enabled: true, dailyLimit: 30, role: 'analyst', revokedAt: null },
          }
          : { ok: false, status: 401, code: 'unauthorized', message: 'Token Supabase invalido.' }),
      },
      geminiClient: { generateJson },
      logger: { info: vi.fn(), error: vi.fn() },
    }), async (baseUrl) => {
      const health = await fetch(`${baseUrl}/health`);
      const healthBody = await health.json();
      expect(health.status).toBe(200);
      expect(healthBody).toEqual({ ok: true, service: 'biguanalytics-ai' });
      expect(JSON.stringify(healthBody)).not.toContain('test-provider-key');
      expect(JSON.stringify(healthBody)).not.toContain('prod-token');

      const missingToken = await fetch(`${baseUrl}/v1/ai/generate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchData: { events: [{ type: 'ruck', result: 'ganado' }] } }),
      });
      expect(missingToken.status).toBe(401);

      const validToken = await fetch(`${baseUrl}/v1/ai/generate-summary`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-supabase-access-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matchData: { events: [{ type: 'ruck', result: 'ganado' }] } }),
      });
      expect(validToken.status).toBe(200);
      await expect(validToken.json()).resolves.toMatchObject({
        result: { summary: 'Resumen seguro.' },
        model: 'gemini-2.5-flash-lite',
      });
    });
  });

  it('keeps .env.local references out of Electron client source', () => {
    const source = listElectronClientFiles(resolve(process.cwd(), 'src'))
      .map(file => readFileSync(file, 'utf8'))
      .join('\n');

    expect(source).not.toContain('.env.local');
  });

  it('documents the Google Cloud Run deployment workflow', () => {
    const docPath = resolve(process.cwd(), 'docs/CLOUD_RUN_DEPLOY.md');

    expect(existsSync(docPath)).toBe(true);
    const doc = readFileSync(docPath, 'utf8');
    [
      'run.googleapis.com',
      'cloudbuild.googleapis.com',
      'artifactregistry.googleapis.com',
      'secretmanager.googleapis.com',
      'gcloud secrets create gemini-api-key',
      'gcloud run deploy biguanalytics-ai',
      'AI_BACKEND_EXPOSE_NETWORK=true',
      'AI_BACKEND_HOST=0.0.0.0',
      'GEMINI_API_KEY=gemini-api-key:latest',
      'SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest',
      'curl',
      '/health',
      '/v1/ai/verify-auth',
      'Ajustes -> IA',
      'npm run server',
    ].forEach((text) => {
      expect(doc).toContain(text);
    });
  });

  it('includes a Supabase migration for profile-based AI permissions', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260608010000_profiles_ai_access.sql'),
      'utf8'
    );

    expect(migration).toContain('add column if not exists ai_enabled boolean not null default false');
    expect(migration).toContain('add column if not exists ai_daily_limit integer not null default 30');
    expect(migration).toContain('add column if not exists ai_revoked_at timestamptz null');
    expect(migration).toContain("status in ('pending', 'approved', 'rejected', 'suspended')");
    expect(migration).toContain('drop table public.ai_access');
    expect(migration).toContain('prevent_profile_privilege_update');
    expect(migration).toContain('new.ai_enabled is distinct from old.ai_enabled');
  });

  it('does not query legacy ai_access from production backend code', () => {
    const backendSource = [
      'server/app.js',
      'server/supabaseAuth.js',
      'server/logger.js',
    ].map(file => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n');

    expect(backendSource).toContain(".from('profiles')");
    expect(backendSource).not.toContain(".from('ai_access')");
  });
});
