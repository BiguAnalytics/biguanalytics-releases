import { describe, expect, it } from 'vitest';

import {
  calculateMatchStats,
  getMatchStats,
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
  it('rejects malicious match ids before calculating persisted stats', async () => {
    await expect(getMatchStats('../escape')).rejects.toThrow(/match id/i);
    await expect(getMatchStats('bad/id')).rejects.toThrow(/match id/i);
  });

  it('identifies Bigua by team name and falls back to home', () => {
    expect(identifyBiguaTeam({ homeTeam: 'Los Cardos', awayTeam: 'Bigua M16' })).toBe('away');
    expect(identifyBiguaTeam({ homeTeam: 'Local', awayTeam: 'Rival' })).toBe('home');
  });

  it('calculates score from point events plus explicit manual adjustments', () => {
    const stats = calculateMatchStats(buildFixtureMatch());
    const legacy = calculateMatchStats(buildFixtureMatch({
      homeScore: 14,
      awayScore: 12,
      events: [],
    }));
    const ignoredPersistedScore = calculateMatchStats(buildFixtureMatch({
      homeScore: 99,
      awayScore: 88,
    }));
    const adjustment = calculateMatchStats(buildFixtureMatch({
      scoreAdjustment: {
        homeDelta: 2,
        awayDelta: 1,
        updatedAt: '2026-05-24T00:00:00.000Z',
      },
    }));
    const legacyOverride = calculateMatchStats(buildFixtureMatch({
      scoreOverride: {
        enabled: true,
        homeScore: 21,
        awayScore: 17,
        updatedAt: '2026-05-24T00:00:00.000Z',
      },
    }));

    expect(stats.score.home.total).toBe(10);
    expect(stats.score.away.total).toBe(10);
    expect(stats.score.source).toBe('events');
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
    expect(ignoredPersistedScore.score.home.total).toBe(10);
    expect(ignoredPersistedScore.score.away.total).toBe(10);
    expect(legacy.score.home.total).toBe(14);
    expect(legacy.score.away.total).toBe(12);
    expect(legacy.score.source).toBe('legacy-manual');
    expect(adjustment.score.home.total).toBe(12);
    expect(adjustment.score.away.total).toBe(11);
    expect(adjustment.score.manualAdjustment).toEqual({ home: 2, away: 1 });
    expect(adjustment.score.source).toBe('events-manual');
    expect(legacyOverride.score.home.total).toBe(21);
    expect(legacyOverride.score.away.total).toBe(17);
    expect(legacyOverride.score.source).toBe('events-manual');
  });

  it('does not count unknown-team point events as home score', () => {
    const stats = calculateMatchStats(buildFixtureMatch({
      events: [
        { type: 'points', result: 'try', timestamp: 120 },
        { type: 'ruck', result: 'ganado', timestamp: 180, zone: 'Z1' },
        { type: 'penal', result: 'defensa', subtype: 'offside', timestamp: 240 },
      ],
    }));

    expect(stats.score.home.total).toBe(0);
    expect(stats.score.away.total).toBe(0);
    expect(stats.rucks.home.total).toBe(0);
    expect(stats.discipline.home.penalties.total).toBe(0);
    expect(stats.heatmap.available).toBe(false);
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
    expect(stats.heatmap.maxCount).toBe(9);
    expect(Object.keys(stats.heatmap.zones)).toEqual(['own_22', 'own_half', 'opp_half', 'opp_22']);
    expect(stats.heatmap.zones.opp_half).toEqual({ home: 6, away: 3, total: 9, intensity: 1, label: 'Campo rival' });
    expect(stats.heatmap.zones.opp_22).toEqual({ home: 5, away: 0, total: 5, intensity: 0.56, label: '22 rival' });
    expect(stats.alerts).toEqual(expect.arrayContaining([
      { metrica: '% Rucks ganados', valor: 33, umbral: 50, equipo: 'Bigua' },
      { metrica: 'Penales totales', valor: 2, umbral: 1, equipo: 'Bigua' },
      { metrica: '% Line Outs ganados', valor: 33, umbral: 40, equipo: 'Bigua' },
      { metrica: '% Scrums ganados', valor: 33, umbral: 50, equipo: 'Bigua' },
      { metrica: 'Break Lines concedidas', valor: 1, umbral: 0, equipo: 'Bigua' },
    ]));
  });

  it('applies dashboard filters by time band, team and zone before calculating metrics', () => {
    const timeFiltered = calculateMatchStats(buildFixtureMatch(), {}, { timeBand: '0-20' });
    const teamFiltered = calculateMatchStats(buildFixtureMatch(), {}, { team: 'bigua' });
    const zoneFiltered = calculateMatchStats(buildFixtureMatch(), {}, { zone: 'Z13' });

    expect(timeFiltered.match.eventCount).toBe(13);
    expect(timeFiltered.score.home.total).toBe(7);
    expect(timeFiltered.score.away.total).toBe(3);
    expect(timeFiltered.bip.bands[0].count).toBe(13);
    expect(timeFiltered.bip.bands.slice(1).every(band => band.count === 0)).toBe(true);

    expect(teamFiltered.match.eventCount).toBeGreaterThan(0);
    expect(teamFiltered.totals.away).toEqual({ turnovers: 0, penalties: 0, breakLines: 0, kicks: 0 });
    expect(teamFiltered.score.away.total).toBe(0);

    expect(zoneFiltered.match.eventCount).toBe(5);
    expect(zoneFiltered.match.filters.zone).toBe('opp_22');
    expect(Object.keys(zoneFiltered.heatmap.zones)).toEqual(['opp_22']);
    expect(zoneFiltered.breakLines.home.total).toBe(2);
  });

  it('keeps events with unknown legacy zones available without forcing them into the four-sector heatmap', () => {
    const stats = calculateMatchStats(buildFixtureMatch({
      events: [
        { type: 'ruck', team: 'home', result: 'ganado', timestamp: 120, zone: 'C3' },
        { type: 'ruck', team: 'away', result: 'ganado', timestamp: 180 },
      ],
    }), {}, { zone: 'C3' });

    expect(stats.match.eventCount).toBe(1);
    expect(stats.match.filters.zone).toBe('C3');
    expect(stats.heatmap.available).toBe(false);
  });

  it('aggregates configured custom hotkey events for the dashboard custom chart', () => {
    const stats = calculateMatchStats(buildFixtureMatch({
      events: [
        { type: 'custom:line-speed', team: 'home', result: 'buena', timestamp: 120, zone: 'Z4' },
        { type: 'custom:line-speed', team: 'away', result: 'mala', timestamp: 240, zone: 'Z5' },
        { type: 'custom:defensive-read', team: 'home', result: 'alto', timestamp: 360, zone: 'Z6' },
      ],
    }), {
      tagging: {
        customHotkeys: [
          { id: 'line-speed', hotkey: 'J', label: 'Salida rapida', resultOptions: ['buena', 'mala'] },
          { id: 'defensive-read', hotkey: 'Y', label: 'Lectura defensiva', resultOptions: ['alto', 'bajo'] },
        ],
      },
    });

    expect(stats.customEvents).toBeTruthy();
    expect(stats.customEvents.total).toBe(3);
    expect(stats.customEvents.definitions).toEqual([
      { id: 'line-speed', type: 'custom:line-speed', label: 'Salida rapida', hotkey: 'J', resultOptions: ['buena', 'mala'] },
      { id: 'defensive-read', type: 'custom:defensive-read', label: 'Lectura defensiva', hotkey: 'Y', resultOptions: ['alto', 'bajo'] },
    ]);
    expect(stats.customEvents.byType['custom:line-speed']).toEqual({
      id: 'line-speed',
      label: 'Salida rapida',
      hotkey: 'J',
      total: 2,
      home: 1,
      away: 1,
      results: { buena: 1, mala: 1 },
    });
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
