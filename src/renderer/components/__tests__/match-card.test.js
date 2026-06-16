import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

import {
  getActionLabel,
  getResultBadge,
  getScore,
  getStatusBadge,
  getToneClass,
  isMatchDisputed,
} from '../match-card.js';

const matchCardSource = fs.readFileSync(new URL('../match-card.js', import.meta.url), 'utf8');
const matchCardCss = fs.readFileSync(new URL('../../../styles/components/match-card.css', import.meta.url), 'utf8');

describe('match card derived match state', () => {
  it('treats scored tagged matches as disputed even when status was not finalized', () => {
    const match = {
      id: 'match-1',
      status: 'tagging',
      homeScore: 3,
      awayScore: 1,
    };

    expect(isMatchDisputed(match)).toBe(true);
    expect(getScore(match)).toEqual({ home: 3, away: 1 });
    expect(getResultBadge(match)).toEqual({ className: 'victoria', label: 'Victoria' });
    expect(getStatusBadge(match)).toEqual({ className: 'taggeado', label: 'Taggeado' });
    expect(getToneClass(match)).toBe('win');
    expect(getActionLabel(match)).toBe('Ver análisis');
  });

  it('keeps truly empty created matches pending and without score', () => {
    const match = {
      id: 'match-2',
      status: 'created',
      homeScore: 0,
      awayScore: 0,
      eventCount: 0,
    };

    expect(isMatchDisputed(match)).toBe(false);
    expect(getScore(match)).toEqual({ home: '—', away: '—' });
    expect(getResultBadge(match)).toEqual({ className: 'sin-disputar', label: 'Sin disputar' });
    expect(getStatusBadge(match)).toEqual({ className: 'pendiente', label: 'Pendiente' });
    expect(getToneClass(match)).toBe('pending');
    expect(getActionLabel(match)).toBe('Iniciar tagging');
  });

  it('uses event counts from match summaries to show a tagged 0-0 as disputed', () => {
    const match = {
      id: 'match-3',
      status: 'tagging',
      homeScore: 0,
      awayScore: 0,
      eventCount: 8,
    };

    expect(isMatchDisputed(match)).toBe(true);
    expect(getScore(match)).toEqual({ home: 0, away: 0 });
    expect(getResultBadge(match)).toEqual({ className: 'empate', label: 'Empate' });
    expect(getToneClass(match)).toBe('draw');
  });

  it('uses canonical nested score before legacy score fields', () => {
    const match = {
      id: 'match-score',
      status: 'tagging',
      homeScore: 0,
      awayScore: 0,
      score: {
        local: 9,
        rival: 6,
        bigua: 9,
        opponent: 6,
        winnerTeam: 'Bigua',
        resultForBigua: 'win',
      },
    };

    expect(isMatchDisputed(match)).toBe(true);
    expect(getScore(match)).toEqual({ home: 9, away: 6 });
    expect(getResultBadge(match)).toEqual({ className: 'victoria', label: 'Victoria' });
    expect(getToneClass(match)).toBe('win');
  });

  it('builds existing match cards without interpolating match data through innerHTML', () => {
    const createMatchCardSource = matchCardSource.slice(
      matchCardSource.indexOf('export function createMatchCard'),
      matchCardSource.indexOf('export function createNewMatchCard')
    );

    expect(createMatchCardSource).not.toContain('card.innerHTML');
    expect(createMatchCardSource).not.toContain('${match.homeTeam}');
    expect(createMatchCardSource).not.toContain('${match.awayTeam}');
    expect(createMatchCardSource).not.toContain('${match.competition');
    expect(createMatchCardSource).toContain('textContent');
  });

  it('spaces club names and score digits clearly in the match card summary', () => {
    expect(matchCardCss).toMatch(/\.match-card-title\s*{[^}]*display:\s*flex;[^}]*column-gap:\s*var\(--space-2\);/s);
    expect(matchCardCss).toMatch(/\.match-card-result-score\s*{[^}]*gap:\s*var\(--space-3\);/s);
  });
});
