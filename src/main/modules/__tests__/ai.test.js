import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAICache } from '../ai/aiCache.js';
import { AI_MATCH_ANALYSIS_MODEL } from '../ai/aiConstants.js';
import {
  buildAIContextFromData,
  calculateAIContextHash,
  stableStringify,
} from '../ai/aiContextBuilder.js';
import { createAIReports, validateAIRequestMatchId } from '../ai/aiReports.js';
import { extractJsonObject, normalizeMatchAnalysisResult } from '../ai/aiSchemas.js';

const settings = {
  alerts: {
    ruckWinPctMin: 50,
    penaltiesMax: 15,
    lineoutWinPctMin: 40,
    scrumWinPctMin: 50,
    breakLinesConcededMax: 5,
  },
};

function buildMatch(overrides = {}) {
  return {
    id: 'match-1',
    homeTeam: 'Bigua',
    awayTeam: 'Cardos',
    date: '2026-05-27',
    competition: 'Runtime Debug',
    venue: 'home',
    video: { path: 'C:/private/video.mp4', youtubeUrl: 'https://youtube.com/watch?v=private' },
    homeScore: 12,
    awayScore: 7,
    updatedAt: '2026-05-27T10:00:00.000Z',
    events: [
      { id: 'e1', type: 'points', team: 'home', result: 'try', timestamp: 120, zone: 'Z9', player: 'Nicolas Perez', note: 'Buen apoyo interno' },
      { id: 'e2', type: 'ruck', team: 'away', result: 'perdido', timestamp: 180, zone: 'Z9', player: 'Juan Lopez', note: 'Limpieza tardia' },
      { id: 'e3', type: 'penal', team: 'home', result: 'defensa', subtype: 'offside', timestamp: 240, zone: 'Z12' },
    ],
    sequences: [
      { id: 's1', start: 100, end: 150, phases: 4, result: 'try', zoneStart: 'Z8', zoneEnd: 'Z9' },
    ],
    possession: {
      intervals: [
        { team: 'home', start: 0, end: 140 },
        { team: 'away', start: 140, end: 260 },
      ],
    },
    coachNotes: 'Subir presion despues del primer pase.',
    roster: [{ name: 'Nombre Privado', position: '10' }],
    ...overrides,
  };
}

function result(overrides = {}) {
  return {
    summary: 'Bigua sostuvo el partido desde la presion y el territorio.',
    score_context: 'El score refleja un partido cerrado.',
    key_findings: [{ title: 'Presion alta', detail: 'Forzo errores cerca de mitad de cancha.', evidence: ['e1 try en Z9'] }],
    strengths: [],
    weaknesses: [],
    turning_points: [],
    training_recommendations: [],
    alerts_explained: [],
    confidence: 0.72,
    missing_data: [],
    ...overrides,
  };
}

function cacheEntry(sourceHash, overrides = {}) {
  return {
    version: 1,
    matchId: 'match-1',
    status: 'valid',
    sourceHash,
    promptVersion: 'match-analysis-v2',
    model: AI_MATCH_ANALYSIS_MODEL,
    generatedAt: '2026-05-28T12:00:00.000Z',
    generatedBy: 'ai-backend-proxy',
    result: result(),
    usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    ...overrides,
  };
}

describe('AI analysis context, cache and reports', () => {
  let dataPath;

  beforeEach(async () => {
    dataPath = await mkdtemp(join(tmpdir(), 'bigua-ai-'));
  });

  afterEach(async () => {
    await rm(dataPath, { recursive: true, force: true });
  });

  it('stable stringifies context and excludes private/non-sport fields from the source hash', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');

    const context = buildAIContextFromData(buildMatch(), settings);
    const serialized = stableStringify(context);

    expect(calculateAIContextHash(context)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(serialized).toContain('"player":"P01"');
    expect(serialized).not.toContain('Nicolas Perez');
    expect(serialized).not.toContain('Nombre Privado');
    expect(serialized).not.toContain('coachNotes');
    expect(serialized).not.toContain('Subir presion');
    expect(serialized).not.toContain('private/video.mp4');
    expect(serialized).not.toContain('youtube.com');
  });

  it('builds deterministic scoreContext for Bigua home, away, loss and draw results', () => {
    const homeWin = buildAIContextFromData(buildMatch({
      homeTeam: 'Bigua',
      awayTeam: 'Cardos',
      homeScore: 4,
      awayScore: 2,
      events: [{ id: 'e1', type: 'ruck', team: 'home', result: 'ganado', timestamp: 120 }],
    }), settings);
    const awayWin = buildAIContextFromData(buildMatch({
      homeTeam: 'Cardos',
      awayTeam: 'Bigua',
      homeScore: 2,
      awayScore: 4,
      events: [{ id: 'e1', type: 'ruck', team: 'away', result: 'ganado', timestamp: 120 }],
    }), settings);
    const loss = buildAIContextFromData(buildMatch({
      homeTeam: 'Bigua',
      awayTeam: 'Cardos',
      homeScore: 1,
      awayScore: 3,
      events: [{ id: 'e1', type: 'ruck', team: 'home', result: 'perdido', timestamp: 120 }],
    }), settings);
    const draw = buildAIContextFromData(buildMatch({
      homeTeam: 'Bigua',
      awayTeam: 'Cardos',
      homeScore: 2,
      awayScore: 2,
      events: [{ id: 'e1', type: 'ruck', team: 'home', result: 'ganado', timestamp: 120 }],
    }), settings);

    expect(homeWin.scoreContext).toMatchObject({
      localTeam: 'Bigua',
      rivalTeam: 'Cardos',
      biguaTeamName: 'Bigua',
      biguaSide: 'local',
      localScore: 4,
      rivalScore: 2,
      biguaScore: 4,
      opponentScore: 2,
      winnerTeam: 'Bigua',
      resultForBigua: 'win',
      scoreLabel: 'Bigua 4 - 2 Cardos',
    });
    expect(awayWin.scoreContext).toMatchObject({
      localTeam: 'Cardos',
      rivalTeam: 'Bigua',
      biguaTeamName: 'Bigua',
      biguaSide: 'rival',
      biguaScore: 4,
      opponentScore: 2,
      winnerTeam: 'Bigua',
      resultForBigua: 'win',
      scoreLabel: 'Bigua 4 - 2 Cardos',
    });
    expect(loss.scoreContext).toMatchObject({
      winnerTeam: 'Cardos',
      resultForBigua: 'loss',
      scoreLabel: 'Bigua 1 - 3 Cardos',
    });
    expect(draw.scoreContext).toMatchObject({
      winnerTeam: 'Empate',
      resultForBigua: 'draw',
      scoreLabel: 'Bigua 2 - 2 Cardos',
    });
  });

  it('uses the canonical persisted scoreContext when match score is normalized', () => {
    const context = buildAIContextFromData(buildMatch({
      homeTeam: 'Bigua',
      awayTeam: 'Cardos',
      homeScore: 0,
      awayScore: 0,
      score: {
        local: 14,
        rival: 12,
        bigua: 14,
        opponent: 12,
        winnerTeam: 'Bigua',
        resultForBigua: 'win',
        updatedAt: '2026-05-24T00:10:00.000Z',
      },
      events: [{ id: 'e1', type: 'ruck', team: 'home', result: 'ganado', timestamp: 120 }],
    }), settings);

    expect(context.scoreContext).toMatchObject({
      localScore: 14,
      rivalScore: 12,
      biguaScore: 14,
      opponentScore: 12,
      winnerTeam: 'Bigua',
      resultForBigua: 'win',
      updatedAt: '2026-05-24T00:10:00.000Z',
    });
    expect(context.match.score).toEqual({ home: 14, away: 12 });
  });

  it('changes the source hash for sporting data changes but not private notes or previous AI analysis metadata', () => {
    const baseHash = calculateAIContextHash(buildAIContextFromData(buildMatch(), settings));
    const eventHash = calculateAIContextHash(buildAIContextFromData(buildMatch({
      events: [
        ...buildMatch().events.slice(0, 1),
        { ...buildMatch().events[1], result: 'ganado' },
        buildMatch().events[2],
      ],
    }), settings));
    const metadataHash = calculateAIContextHash(buildAIContextFromData(buildMatch({ competition: 'Final Regional' }), settings));
    const notesHash = calculateAIContextHash(buildAIContextFromData(buildMatch({ coachNotes: 'Cambiar foco de entrenamiento.' }), settings));
    const previousAIHash = calculateAIContextHash(buildAIContextFromData(buildMatch({
      generatedAt: '2030-01-01T00:00:00.000Z',
      aiAnalysis: cacheEntry(baseHash),
    }), settings));

    expect(eventHash).not.toBe(baseHash);
    expect(metadataHash).not.toBe(baseHash);
    expect(notesHash).toBe(baseHash);
    expect(previousAIHash).toBe(baseHash);
  });

  it('reports cache status as missing, valid, stale and error', async () => {
    const cache = createAICache({ dataPath });
    const hash = 'sha256:a'.padEnd(71, 'a');

    await expect(cache.getStatus('match-1', hash)).resolves.toMatchObject({ status: 'missing', hasAnalysis: false });

    await cache.saveAnalysis('match-1', cacheEntry(hash));
    await expect(cache.getStatus('match-1', hash)).resolves.toMatchObject({ status: 'valid', hasAnalysis: true, sourceHash: hash });
    await expect(cache.getStatus('match-1', 'sha256:b'.padEnd(71, 'b'))).resolves.toMatchObject({ status: 'stale', hasAnalysis: true });

    await mkdir(join(dataPath, 'match-2'), { recursive: true });
    await writeFile(join(dataPath, 'match-2', 'ai-analysis.json'), '{bad json', 'utf8');
    await expect(cache.getStatus('match-2', hash)).resolves.toMatchObject({ status: 'error', hasAnalysis: false });
  });

  it('generates a fresh analysis every time the generate action is requested', async () => {
    const cache = createAICache({ dataPath });
    let match = buildMatch();
    let sequence = 0;
    const buildContext = vi.fn(async () => buildAIContextFromData(match, settings));
    const provider = {
      generateMatchAnalysis: vi.fn(async () => ({
        result: result({ summary: `Analisis ${++sequence}` }),
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      })),
    };
    const reports = createAIReports({
      cache,
      provider,
      buildContext,
      now: () => '2026-05-28T12:00:00.000Z',
    });

    await expect(reports.generateMatchAnalysis('match-1')).resolves.toMatchObject({ status: 'valid', hasAnalysis: true });
    expect(provider.generateMatchAnalysis).toHaveBeenCalledTimes(1);

    await expect(reports.generateMatchAnalysis('match-1')).resolves.toMatchObject({
      status: 'valid',
      hasAnalysis: true,
      result: expect.objectContaining({ summary: 'Analisis 2' }),
    });
    expect(provider.generateMatchAnalysis).toHaveBeenCalledTimes(2);

    match = buildMatch({ coachNotes: 'Nueva nota tecnica.' });
    await expect(reports.generateMatchAnalysis('match-1')).resolves.toMatchObject({
      status: 'valid',
      hasAnalysis: true,
      result: expect.objectContaining({ summary: 'Analisis 3' }),
    });
    expect(provider.generateMatchAnalysis).toHaveBeenCalledTimes(3);

    match = buildMatch({ competition: 'Final Regional' });
    await expect(reports.generateMatchAnalysis('match-1')).resolves.toMatchObject({
      status: 'valid',
      hasAnalysis: true,
      result: expect.objectContaining({ summary: 'Analisis 4' }),
    });
    expect(provider.generateMatchAnalysis).toHaveBeenCalledTimes(4);
    expect(existsSync(join(dataPath, 'match-1', 'ai-analysis-history'))).toBe(true);
  });

  it('regenerates only with explicit confirmation and preserves history', async () => {
    const cache = createAICache({ dataPath });
    const context = buildAIContextFromData(buildMatch(), settings);
    const provider = {
      generateMatchAnalysis: vi.fn(async () => ({ result: result({ summary: 'Nuevo analisis' }), usage: {} })),
    };
    const reports = createAIReports({
      cache,
      provider,
      buildContext: async () => context,
      now: () => '2026-05-28T12:00:00.000Z',
    });

    await reports.generateMatchAnalysis('match-1');
    await expect(reports.regenerateMatchAnalysis('match-1', { confirm: false })).rejects.toThrow(/confirm/i);
    await expect(reports.regenerateMatchAnalysis('match-1', { confirm: true })).resolves.toMatchObject({ status: 'valid' });

    expect(provider.generateMatchAnalysis).toHaveBeenCalledTimes(2);
    expect(existsSync(join(dataPath, 'match-1', 'ai-analysis-history'))).toBe(true);
  });

  it('normalizes incomplete model JSON without breaking the UI contract', () => {
    const parsed = extractJsonObject('```json\n{"summary":"Resumen corto","confidence":1.4}\n```');
    const normalized = normalizeMatchAnalysisResult(parsed);

    expect(normalized.summary).toBe('Resumen corto');
    expect(normalized.confidence).toBe(1);
    expect(normalized.keyFindings).toEqual([]);
    expect(normalized.trainingRecommendations).toEqual([]);
    expect(normalized.dataQualityWarnings).toContainEqual(expect.objectContaining({
      title: 'Respuesta IA incompleta',
      detail: expect.stringContaining('keyFindings'),
    }));
  });

  it('rejects invalid match IDs before reaching filesystem paths', () => {
    expect(validateAIRequestMatchId('match-1')).toBe('match-1');
    expect(() => validateAIRequestMatchId('')).toThrow(/matchId/i);
    expect(() => validateAIRequestMatchId('../match-1')).toThrow(/matchId/i);
    expect(() => validateAIRequestMatchId('match\\1')).toThrow(/matchId/i);
    expect(() => validateAIRequestMatchId('x'.repeat(121))).toThrow(/matchId/i);
  });
});
