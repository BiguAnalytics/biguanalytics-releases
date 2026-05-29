import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

import { createMatch, updateMatch } from '../storage.js';
import { getSeasonStats } from '../analytics.js';

const TEST_USER_DATA = path.join(process.cwd(), '.vitest-user-data');

async function resetTestData() {
  await fs.rm(TEST_USER_DATA, { recursive: true, force: true });
}

describe('season analytics', () => {
  beforeEach(resetTestData);
  afterEach(resetTestData);

  it('returns current-year match metrics, competitions, averages and thresholds', async () => {
    const match = await createMatch({
      homeTeam: 'Bigua',
      awayTeam: 'Mar del Plata',
      date: '2026-04-12',
      competition: 'Regional',
    });
    await updateMatch(match.id, {
      homeScore: 19,
      awayScore: 12,
      events: [
        { id: 'e1', type: 'ruck', team: 'home', result: 'ganado', timestamp: 1 },
        { id: 'e2', type: 'ruck', team: 'home', result: 'perdido', timestamp: 2 },
        { id: 'e3', type: 'lineout', team: 'home', result: 'ganado', timestamp: 3 },
        { id: 'e4', type: 'penal', team: 'home', result: 'defensa', subtype: 'ruck', timestamp: 4 },
        { id: 'e5', type: 'break-line', team: 'away', result: 'juego', timestamp: 5 },
      ],
    });

    const season = await getSeasonStats(2026);

    expect(season.year).toBe(2026);
    expect(season.competitions).toEqual(['Regional']);
    expect(season.matches).toEqual([
      expect.objectContaining({
        id: match.id,
        rival: 'Mar del Plata',
        score: '19 - 12',
        competition: 'Regional',
        ruckWinPct: 50,
        penalties: 1,
        lineoutWinPct: 100,
        breakLinesConceded: 1,
      }),
    ]);
    expect(season.averages).toEqual(expect.objectContaining({
      ruckWinPct: 50,
      penalties: 1,
      lineoutWinPct: 100,
      breakLinesConceded: 1,
    }));
    expect(season.thresholds).toEqual(expect.objectContaining({
      ruckWinPctMin: 50,
      penaltiesMax: 15,
      lineoutWinPctMin: 40,
      breakLinesConcededMax: 5,
    }));
  });
});
