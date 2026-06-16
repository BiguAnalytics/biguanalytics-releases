import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ipcSource = readFileSync(resolve(process.cwd(), 'src/main/ipc.js'), 'utf8');
const preloadSource = readFileSync(resolve(process.cwd(), 'src/main/preload.js'), 'utf8');
const mainSource = readFileSync(resolve(process.cwd(), 'src/main/main.js'), 'utf8');
const dashboardSource = readFileSync(resolve(process.cwd(), 'src/renderer/views/dashboard.js'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
const serverPackageJsonPath = resolve(process.cwd(), 'server/package.json');
const prdSource = readFileSync(resolve(process.cwd(), 'PRD.md'), 'utf8');
const roadmapSource = readFileSync(resolve(process.cwd(), 'ROADMAP.md'), 'utf8');
const aiFeatureDoc = readFileSync(resolve(process.cwd(), 'docs/AI_FEATURE.md'), 'utf8');
const aiSecurityDoc = readFileSync(resolve(process.cwd(), 'docs/AI_SECURITY.md'), 'utf8');

function listClientFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = join(dir, name);
    if (fullPath.includes('__tests__') || fullPath.includes(`${join('renderer', 'vendor')}`)) return [];
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return listClientFiles(fullPath);
    return /\.(js|html|css)$/.test(name) ? [fullPath] : [];
  });
}

describe('AI IPC and preload security', () => {
  it('keeps Electron isolation enabled while adding AI channels', () => {
    expect(mainSource).toContain('contextIsolation: true');
    expect(mainSource).toContain('nodeIntegration: false');
    expect(ipcSource).toContain('ai:getMatchAnalysisStatus');
    expect(ipcSource).toContain('ai:getMatchAnalysis');
    expect(ipcSource).toContain('ai:generateMatchAnalysis');
    expect(ipcSource).toContain('ai:regenerateMatchAnalysis');
    expect(ipcSource).toContain('ai:analyzeMatch');
    expect(ipcSource).toContain('ai:generateSummary');
    expect(ipcSource).toContain('ai:detectPatterns');
    expect(ipcSource).toContain('ai:testConnection');
    expect(ipcSource).toContain('ai:chatStatus');
    expect(ipcSource).toContain('ai:chatAsk');
    expect(ipcSource).toContain('validateAIRequestMatchId');
    expect(ipcSource).toContain('validateAIChatRequest');
  });

  it('routes report generation through the same Supabase-authenticated backend client used by connection tests', () => {
    expect(ipcSource).toContain('function getAIBackendClient()');
    expect(ipcSource).toContain("lazyRequire('./modules/ai/aiBackendClient')");
    expect(ipcSource).toContain('getStoredSupabaseAccessToken(getAuthSessionStore())');
    expect(ipcSource).toContain('function getAIReports()');
    expect(ipcSource).toContain('provider: getAIBackendClient()');
    expect(ipcSource).toContain("services.getAIBackendClient().verifyToken()");
    expect(ipcSource).toContain('return services.getAIReports().regenerateMatchAnalysis(matchId, { confirm: true })');
    expect(ipcSource).not.toContain('return regenerateMatchAnalysis(matchId, { confirm: true })');
    expect(ipcSource).not.toContain('return generateMatchAnalysis(matchId)');
  });

  it('exposes only specific biguAI methods and never exposes secrets to the renderer', () => {
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('biguAI'");
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('biguAIChat'");
    expect(preloadSource).toContain('getMatchAnalysisStatus');
    expect(preloadSource).toContain('getMatchAnalysis');
    expect(preloadSource).toContain('generateMatchAnalysis');
    expect(preloadSource).toContain('regenerateMatchAnalysis');
    expect(preloadSource).toContain('analyzeMatch');
    expect(preloadSource).toContain('generateSummary');
    expect(preloadSource).toContain('detectPatterns');
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('biguAIConfig'");
    expect(preloadSource).toContain('ask:');
    expect(preloadSource).toContain('status:');
    expect(ipcSource).toContain('getPublicAIConfig');
    expect(ipcSource).toContain("ipcMain.handle('ai:getConfig', async () => lazyRequire('./modules/ai/aiConfig').getPublicAIConfig())");
    expect(ipcSource).not.toContain("ipcMain.handle('ai:getConfig', async () => getAIConfig())");
    expect(preloadSource).not.toContain('GEMINI_API_KEY');
    expect(preloadSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(preloadSource).not.toContain('process.env');
    expect(preloadSource).not.toMatch(/ipcRenderer\s*:/);
    expect(dashboardSource).not.toContain('GEMINI_API_KEY');
    expect(dashboardSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(dashboardSource).not.toContain('process.env');
  });

  it('keeps Gemini provider secrets and direct API calls out of packaged Electron source', () => {
    const clientSource = listClientFiles(resolve(process.cwd(), 'src'))
      .map(file => readFileSync(file, 'utf8'))
      .join('\n');

    expect(clientSource).not.toContain('GEMINI_API_KEY');
    expect(clientSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(clientSource).not.toContain('generativelanguage.googleapis.com');
    expect(clientSource).not.toContain('x-goog-api-key');
    expect(clientSource).not.toContain('@google/genai');
    expect(clientSource).not.toContain('.env.local');
  });

  it('keeps backend-only AI provider packages out of the Electron package manifest', () => {
    const serverPackageJson = JSON.parse(readFileSync(serverPackageJsonPath, 'utf8'));
    const electronDependencies = packageJson.dependencies || {};
    const buildFiles = packageJson.build?.files || [];

    expect(electronDependencies).not.toHaveProperty('@google/genai');
    expect(electronDependencies).not.toHaveProperty('express');
    expect(serverPackageJson.dependencies).toHaveProperty('@google/genai');
    expect(serverPackageJson.dependencies).toHaveProperty('express');
    expect(buildFiles).toContain('!server/**');
    expect(buildFiles).toContain('!backend/**');
    expect(buildFiles).toContain('!docs/**');
    expect(buildFiles).toContain('!.env*');
  });

  it('provides a build/client secret scanning script for AI distribution checks', () => {
    const scriptSource = readFileSync(resolve(process.cwd(), 'scripts/check-ai-client-secrets.js'), 'utf8');

    expect(packageJson.scripts['check:ai-secrets']).toBe('node scripts/check-ai-client-secrets.js');
    expect(packageJson.scripts['security:check']).toBe('node scripts/check-secrets.js && node scripts/check-ai-client-secrets.js');
    expect(scriptSource).toContain('GEMINI_API_KEY');
    expect(scriptSource).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(scriptSource).toContain('.env.local');
    expect(scriptSource).toContain('.env.production');
    expect(scriptSource).toContain('@google/genai');
    expect(scriptSource).toContain('generativelanguage.googleapis.com');
    expect(scriptSource).toContain('AIza');
  });

  it('documents Gemini backend as the active AI provider without legacy Claude or GPT promises', () => {
    const productDocs = [prdSource, roadmapSource, aiFeatureDoc, aiSecurityDoc].join('\n');

    expect(productDocs).toContain('Gemini 2.5 Flash-Lite');
    expect(productDocs).toContain('backend propio');
    expect(productDocs).toContain('GEMINI_API_KEY');
    expect(productDocs).not.toMatch(/Claude|GPT-4|Anthropic/i);
    expect(productDocs).not.toContain('USD 0 mensuales (todo local, sin suscripciones)');
  });
});
