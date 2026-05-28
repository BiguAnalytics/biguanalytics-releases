import { describe, expect, it } from 'vitest';

import {
  calculateMatchStats,
  identifyBiguaTeam,
} from '../analytics.js';

function buildFixtureMatch(overrides = {}) {
  return {
    id: 'match-1',
    homeTeam: 'Bigua',
    awayTeam: 'Los Cardos',
    date: '2026-05-24',
    competition: 'Regional',
    homeScore: 0,
    awayScore: 0,
    video: { duration: 5100 },
    possession: {
      activeTeam: null,
      activeStart: null,
      activeEnd: null,
      intervals: [
        { team: 'home', start: 0, end: 60 },
        { team: 'away', start: 60, end: 180 },
        { team: 'home', start: 180, end: 240 },
      ],
    },
    events: [
      { type: 'points', team: 'home', result: 'try', timestamp: 120, zone: 'Z13' },
      { type: 'points', team: 'home', result: 'conversion', timestamp: 140 },
      { type: 'points', team: 'away', result: 'pk-goal', timestamp: 900 },
      { type: 'points', team: 'home', result: 'drop', timestamp: 4200 },
      { type: 'points', team: 'away', result: 'try-penal', timestamp: 4900, zone: 'Z2' },

      { type: 'scrum', team: 'home', result: 'ganado', timestamp: 300, zone: 'Z6' },
      { type: 'scrum', team: 'home', result: 'ganado-sucio', timestamp: 360, zone: 'Z7' },
      { type: 'scrum', team: 'home', result: 'perdido', timestamp: 420, zone: 'Z8' },
      { type: 'scrum', team: 'away', result: 'ganado', timestamp: 480, zone: 'Z9' },

      { type: 'lineout', team: 'home', result: 'ganado', subtype: 'bueno', timestamp: 600, zone: 'Z10' },
      { type: 'lineout', team: 'home', result: 'perdido', subtype: 'malo', timestamp: 660, zone: 'Z11' },
      { type: 'lineout', team: 'home', result: 'ganado-sucio', subtype: 'neutro', timestamp: 720, zone: 'Z12' },
      { type: 'lineout', team: 'away', result: 'ganado', subtype: 'bueno', timestamp: 780, zone: 'Z4' },

      { type: 'ruck', team: 'home', result: 'ganado', timestamp: 840, zone: 'Z1' },
      { type: 'ruck', team: 'home', result: 'ganado-sucio', timestamp: 1020, zone: 'Z2' },
      { type: 'ruck', team: 'home', result: 'perdido', timestamp: 1260, zone: 'Z3' },
      { type: 'ruck', team: 'away', result: 'ganado', timestamp: 1500, zone: 'Z5' },
      { type: 'ruck', team: 'away', result: 'perdido', timestamp: 1740, zone: 'Z6' },

      { type: 'kick', team: 'home', player: 'Nico', result: 'touch', timestamp: 1980 },
      { type: 'kick', team: 'home', player: 'Nico', result: 'recuperado', timestamp: 2100 },
      { type: 'kick', team: 'home', player: 'Nico', result: 'contestado', timestamp: 2220 },
      { type: 'kick', team: 'home', player: 'Tomi', result: 'perdido', timestamp: 2340 },
      { type: 'kick', team: 'away', player: 'Rival 10', result: 'perdido', timestamp: 2460 },

      { type: 'penal', team: 'home', result: 'ataque', subtype: 'ruck', timestamp: 2520, zone: 'Z14' },
      { type: 'penal', team: 'home', result: 'defensa', subtype: 'offside', timestamp: 2580, zone: 'Z15' },
      { type: 'penal', team: 'away', result: 'defensa', subtype: 'scrum', timestamp: 2640, zone: 'Z3' },
      { type: 'card', team: 'away', result: 'amarilla', timestamp: 2700 },
      { type: 'card', team: 'home', result: 'roja', timestamp: 2760 },

      { type: 'break-line', team: 'home', result: 'try', subtype: 'scrum', timestamp: 3000, zone: 'Z13' },
      { type: 'break-line', team: 'home', result: 'turnover', subtype: 'lineout', timestamp: 3300, zone: 'Z14' },
      { type: 'break-line', team: 'away', result: 'juego', subtype: 'kick', timestamp: 3900, zone: 'Z7' },
      { type: 'turnover', team: 'home', result: 'turnover', subtype: 'robo-ruck', timestamp: 4020, zone: 'Z8' },
      { type: 'maul', team: 'away', result: 'ganado-sucio', timestamp: 4080, zone: 'Z9' },
    ],
    sequences: [
      { id: 'seq-1', start: 0, end: 100, phases: 3, result: 'try', zoneStart: 'Z1' },
      { id: 'seq-2', start: 200, end: 400, phases: 7, result: 'turnover', zoneStart: 'Z2' },
      { id: 'seq-3', start: 500, end: 700, phases: 0, result: 'penal', zoneStart: 'Z1' },
    ],
    coachNotes: 'Plan de presion',
    ...overrides,
  };
}

describe('analytics.js', () => {
  it('identifies Bigua by team name and falls back to home', () => {
    expect(identifyBiguaTeam({ homeTeam: 'Los Cardos', awayTeam: 'Bigua M16' })).toBe('away');
    expect(identifyBiguaTeam({ homeTeam: 'Local', awayTeam: 'Rival' })).toBe('home');
  });

  it('calculates score from point events with manual score fallback only when point tags are absent', () => {
    const stats = calculateMatchStats(buildFixtureMatch());
    const fallback = calculateMatchStats(buildFixtureMatch({
      homeScore: 14,
      awayScore: 12,
      events: [],
    }));

    expect(stats.score.home.total).toBe(10);
    expect(stats.score.away.total).toBe(10);
    expect(stats.score.home.breakdown).toEqual({
      tries: 1,
      conversions: 1,
      pkGoals: 0,
      drops: 1,
      penaltyTries: 0,
    });
    expect(stats.score.away.breakdown).toEqual({
      tries: 0,
      conversions: 0,
      pkGoals: 1,
      drops: 0,
      penaltyTries: 1,
    });
    expect(fallback.score.home.total).toBe(14);
    expect(fallback.score.away.total).toBe(12);
    expect(fallback.score.source).toBe('manual');
  });

  it('uses real possession intervals first and estimates from events when intervals are missing', () => {
    const stats = calculateMatchStats(buildFixtureMatch());
    const estimated = calculateMatchStats(buildFixtureMatch({
      possession: { intervals: [] },
      events: [
        { type: 'ruck', team: 'home' },
        { type: 'penal', team: 'home' },
        { type: 'kick', team: 'away' },
      ],
    }));

    expect(stats.possession.source).toBe('intervals');
    expect(stats.possession.percentages).toEqual({ home: 50, away: 50 });
    expect(stats.possession.counts).toEqual({ home: 2, away: 1, total: 3 });
    expect(estimated.possession.source).toBe('events');
    expect(estimated.possession.percentages).toEqual({ home: 67, away: 33 });
  });

  it('calculates territory from zoned events and omits territory when no zones exist', () => {
    const stats = calculateMatchStats(buildFixtureMatch());
    const noZones = calculateMatchStats(buildFixtureMatch({
      events: [{ type: 'ruck', team: 'home', result: 'ganado' }],
    }));

    expect(stats.territory.available).toBe(true);
    expect(stats.territory.percentages).toEqual({ home: 65, away: 35 });
    expect(noZones.territory.available).toBe(false);
  });

  it('aggregates totals, set pieces, rucks, kicks, discipline and break lines per team', () => {
    const stats = calculateMatchStats(buildFixtureMatch());

    expect(stats.totals.home).toEqual({ turnovers: 1, penalties: 2, breakLines: 2, kicks: 4 });
    expect(stats.totals.away).toEqual({ turnovers: 0, penalties: 1, breakLines: 1, kicks: 1 });

    expect(stats.setPieces.scrums.home).toEqual(expect.objectContaining({
      total: 3,
      won: 1,
      lost: 1,
      dirty: 1,
      wonPct: 33,
      lostPct: 33,
      dirtyPct: 33,
    }));
    expect(stats.setPieces.lineouts.home.throwQuality).toEqual({ bueno: 1, neutro: 1, malo: 1 });

    expect(stats.rucks.home).toEqual(expect.objectContaining({
      total: 3,
      wonPct: 33,
      dirtyPct: 33,
      lostPct: 33,
      rucksPerPossession: 1.5,
    }));

    expect(stats.kicks.home.byPlayer).toEqual([
      { player: 'Nico', total: 3, favorable: 2, favorablePct: 67, results: { touch: 1, recuperado: 1, perdido: 0, contestado: 1 } },
      { player: 'Tomi', total: 1, favorable: 0, favorablePct: 0, results: { touch: 0, recuperado: 0, perdido: 1, contestado: 0 } },
    ]);
    expect(stats.kicks.home.favorablePct).toBe(50);

    expect(stats.discipline.home.penalties).toEqual(expect.objectContaining({
      total: 2,
      attack: 1,
      defense: 1,
      byType: { ruck: 1, scrum: 0, offside: 1, maul: 0, inconducta: 0, otro: 0 },
    }));
    expect(stats.discipline.away.cards).toEqual({ amarilla: 1, roja: 0 });

    expect(stats.breakLines.home).toEqual(expect.objectContaining({
      total: 2,
      killerInstinctPct: 50,
      byOrigin: { scrum: 1, lineout: 1 },
      byResult: expect.objectContaining({ try: 1, turnover: 1 }),
    }));
  });

  it('calculates BIP bands, sequence summaries, heatmap intensity and threshold alerts', () => {
    const stats = calculateMatchStats(buildFixtureMatch(), {
      alerts: {
        ruckWinPctMin: 50,
        penaltiesMax: 1,
        lineoutWinPctMin: 40,
        scrumWinPctMin: 50,
        breakLinesConcededMax: 0,
      },
    });

    expect(stats.bip.bands).toEqual([
      { label: '0-20', start: 0, end: 1200, count: 13 },
      { label: '20-40', start: 1200, end: 2400, count: 7 },
      { label: '40-60', start: 2400, end: 3600, count: 8 },
      { label: '60-80', start: 3600, end: 4800, count: 4 },
      { label: '+80', start: 4800, end: null, count: 1 },
    ]);
    expect(stats.sequences.averagePhases).toBe(3.33);
    expect(stats.sequences.byResult).toEqual({
      try: { count: 1, pct: 33 },
      turnover: { count: 1, pct: 33 },
      penal: { count: 1, pct: 33 },
    });
    expect(stats.sequences.longest.map(sequence => sequence.id)).toEqual(['seq-2', 'seq-1', 'seq-3']);
    expect(stats.heatmap.maxCount).toBe(2);
    expect(stats.heatmap.zones.Z13).toEqual({ home: 2, away: 0, total: 2, intensity: 1 });
    expect(stats.alerts).toEqual(expect.arrayContaining([
      { metrica: '% Rucks ganados', valor: 33, umbral: 50, equipo: 'Bigua' },
      { metrica: 'Penales totales', valor: 2, umbral: 1, equipo: 'Bigua' },
      { metrica: '% Line Outs ganados', valor: 33, umbral: 40, equipo: 'Bigua' },
      { metrica: '% Scrums ganados', valor: 33, umbral: 50, equipo: 'Bigua' },
      { metrica: 'Break Lines concedidas', valor: 1, umbral: 0, equipo: 'Bigua' },
    ]));
  });

  it('keeps the analytics pass under the dashboard budget for a 200-event match', () => {
    const match = buildFixtureMatch({
      events: Array.from({ length: 200 }, (_, index) => ({
        type: index % 2 === 0 ? 'ruck' : 'penal',
        team: index % 3 === 0 ? 'away' : 'home',
        result: index % 2 === 0 ? 'ganado' : 'defensa',
        subtype: index % 2 === 0 ? '' : 'ruck',
        timestamp: index * 12,
        zone: `Z${(index % 15) + 1}`,
      })),
    });

    const startedAt = performance.now();
    const stats = calculateMatchStats(match);
    const elapsed = performance.now() - startedAt;

    expect(stats.match.eventCount).toBe(200);
    expect(elapsed).toBeLessThan(200);
  });
});
