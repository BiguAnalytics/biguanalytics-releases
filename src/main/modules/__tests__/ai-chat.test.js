import { describe, expect, it, vi } from 'vitest';

import {
  createAIChat,
  resolveAIChatScope,
  validateAIChatQuestion,
  validateAIChatScope,
} from '../ai/aiChat.js';

describe('AI chatbot controlled match context', () => {
  it('validates chat questions before returning controlled fallback messages', () => {
    expect(validateAIChatQuestion(' Que entrenamos? ')).toBe('Que entrenamos?');
    expect(() => validateAIChatQuestion('')).toThrow(/pregunta/i);
    expect(() => validateAIChatQuestion('x'.repeat(1001))).toThrow(/1000/i);
  });

  it('validates supported scopes and resolves match versus season context', () => {
    expect(validateAIChatScope()).toBe('auto');
    expect(validateAIChatScope('match')).toBe('match');
    expect(validateAIChatScope('season')).toBe('season');
    expect(() => validateAIChatScope('freeform')).toThrow(/scope/i);

    expect(resolveAIChatScope({ matchId: 'm1', question: 'Que paso?', scope: 'auto' })).toBe('match');
    expect(resolveAIChatScope({ question: 'Como viene la temporada?', scope: 'auto' })).toBe('season');
    expect(resolveAIChatScope({ matchId: 'm1', question: 'Comparame con partidos anteriores', scope: 'auto' })).toBe('match+season');
  });

  it('only enables chat when there is a current match id', async () => {
    const provider = { chatMatch: vi.fn() };
    const chat = createAIChat({ provider, now: () => '2026-06-03T12:00:00.000Z' });

    await expect(chat.getStatus({})).resolves.toMatchObject({
      available: false,
      reason: 'Solo podemos responder preguntas sobre nuestro partido y sus metricas.',
    });

    await expect(chat.getStatus({ matchId: 'match-1' })).resolves.toMatchObject({
      available: true,
      hasApiKey: false,
      reason: 'Tenemos chat contextual disponible.',
    });
    expect(provider.chatMatch).not.toHaveBeenCalled();
  });

  it('sends contextual match chat through the secure backend provider', async () => {
    const provider = {
      model: 'gemini-2.5-flash-lite',
      chatMatch: vi.fn(async (context, question) => {
        expect(context).toMatchObject({ match: { id: 'match-1' }, scoreContext: { resultForBigua: 'win' } });
        expect(question).toBe('Que patron ves?');
        return {
          result: {
            answer: 'Bigua gano el contacto en rucks ofensivos.',
            usedMetrics: ['rucks.home.wonPct'],
            confidence: 0.78,
          },
          usage: { totalTokens: 14 },
          model: 'gemini-2.5-flash-lite',
        };
      }),
    };
    const chat = createAIChat({
      provider,
      buildContext: async () => ({ match: { id: 'match-1' }, scoreContext: { resultForBigua: 'win' } }),
      now: () => '2026-06-03T12:00:00.000Z',
    });

    await expect(chat.ask({ matchId: 'match-1', question: 'Que patron ves?' })).resolves.toMatchObject({
      answer: 'Bigua gano el contacto en rucks ofensivos.',
      scopeUsed: 'match',
      usedMetrics: ['rucks.home.wonPct'],
      confidence: 0.78,
      suggestedFollowUps: [],
      cached: false,
      generatedAt: '2026-06-03T12:00:00.000Z',
      usage: { totalTokens: 14 },
    });
    expect(provider.chatMatch).toHaveBeenCalledTimes(1);
  });
});
