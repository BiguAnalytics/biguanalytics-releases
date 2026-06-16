import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

import { createMatch, getMatchById, updateMatch } from '../storage.js';
import { addEvent, updateEvent, deleteEvent } from '../events.js';

const TEST_USER_DATA = path.join(process.cwd(), '.vitest-user-data');

async function resetTestData() {
  await fs.rm(TEST_USER_DATA, { recursive: true, force: true });
}

describe('events.js', () => {
  beforeEach(resetTestData);
  afterEach(resetTestData);

  describe('addEvent', () => {
    it('rejects malicious match ids before reading or writing events', async () => {
      await expect(addEvent('../escape', { type: 'note', note: 'x' })).rejects.toThrow(/match id/i);
      await expect(updateEvent('C:\\escape', 'event-1', { note: 'x' })).rejects.toThrow(/match id/i);
      await expect(deleteEvent('bad/id', 'event-1')).rejects.toThrow(/match id/i);
    });

    it('should generate UUID for event and append to match.events', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
      const eventData = { type: 'try', team: 'home' };

      const event = await addEvent(match.id, eventData);
      const saved = await getMatchById(match.id);

      expect(event.id).toBeDefined();
      expect(event.type).toBe('try');
      expect(event.createdAt).toBeDefined();
      expect(saved.events).toEqual([expect.objectContaining({ id: event.id })]);
    });

    it('should persist phase 2 tag metadata and move created matches into tagging status', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

      const event = await addEvent(match.id, {
        timestamp: 66.25,
        type: 'ruck',
        team: 'home',
        result: 'ganado-sucio',
        subtype: '',
        note: 'limpieza tardia',
        zone: 'own_half',
        zoneId: 'own_half',
        zoneLabel: 'Campo propio',
      });
      const saved = await getMatchById(match.id);

      expect(saved.status).toBe('tagging');
      expect(saved.events).toEqual([
        expect.objectContaining({
          id: event.id,
          timestamp: 66.25,
          type: 'ruck',
          team: 'home',
          result: 'ganado-sucio',
          subtype: '',
          note: 'limpieza tardia',
          zone: 'own_half',
          zoneId: 'own_half',
          zoneLabel: 'Campo propio',
        }),
      ]);
    });

    it('rejects invalid event schema before appending anything to the match', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

      await expect(addEvent(match.id, { type: 'unknown-event', timestamp: 12 })).rejects.toThrow(/tipo de evento/i);
      await expect(addEvent(match.id, { type: 'ruck', team: 'home', result: 'ganado', timestamp: -1 })).rejects.toThrow(/timestamp/i);
      await expect(addEvent(match.id, {
        type: 'ruck',
        team: 'home',
        result: 'inventado',
        timestamp: 12,
      })).rejects.toThrow(/resultado/i);
      await expect(addEvent(match.id, {
        type: 'note',
        note: 'x'.repeat(2001),
      })).rejects.toThrow(/nota/i);

      const saved = await getMatchById(match.id);
      expect(saved.events).toEqual([]);
    });

    it('rejects team-scored events without a valid team instead of defaulting to home', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

      await expect(addEvent(match.id, { type: 'points', result: 'try', timestamp: 12 })).rejects.toThrow(/equipo/i);

      const saved = await getMatchById(match.id);
      expect(saved.events).toEqual([]);
      expect(saved.homeScore).toBe(0);
      expect(saved.awayScore).toBe(0);
    });

    it('recalculates the score cache from point events in the same local write', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

      await addEvent(match.id, { type: 'points', team: 'home', result: 'try', timestamp: 12 });
      await addEvent(match.id, { type: 'points', team: 'away', result: 'pk-goal', timestamp: 30 });
      await addEvent(match.id, { type: 'ruck', team: 'away', result: 'ganado', timestamp: 45 });

      const saved = await getMatchById(match.id);
      expect(saved.homeScore).toBe(5);
      expect(saved.awayScore).toBe(3);
      expect(saved.score).toEqual(expect.objectContaining({
        local: 5,
        rival: 3,
        bigua: 5,
        opponent: 3,
        winnerTeam: 'Bigua',
        resultForBigua: 'win',
        updatedAt: expect.any(String),
      }));
      expect(saved.scoreContext).toEqual(expect.objectContaining({
        localScore: 5,
        rivalScore: 3,
        biguaScore: 5,
        opponentScore: 3,
        winnerTeam: 'Bigua',
        resultForBigua: 'win',
      }));
      expect(saved.scoreOverride).toBeNull();
    });

    it('keeps manual score adjustments additive when point events update the cache', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
      await updateMatch(match.id, {
        scoreAdjustment: {
          homeDelta: 2,
          awayDelta: 1,
          updatedAt: '2026-05-24T00:00:00.000Z',
        },
      });

      await addEvent(match.id, { type: 'points', team: 'home', result: 'try', timestamp: 12 });
      await addEvent(match.id, { type: 'points', team: 'away', result: 'pk-goal', timestamp: 30 });

      const saved = await getMatchById(match.id);
      expect(saved.homeScore).toBe(7);
      expect(saved.awayScore).toBe(4);
      expect(saved.scoreAdjustment).toEqual(expect.objectContaining({
        homeDelta: 2,
        awayDelta: 1,
      }));
      expect(saved.scoreOverride).toBeNull();
    });
  });

  describe('updateEvent', () => {
    it('recalculates score cache after point event edits', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
      const event = await addEvent(match.id, { type: 'points', team: 'home', result: 'try', timestamp: 12 });

      await updateEvent(match.id, event.id, { result: 'try-penal' });

      const saved = await getMatchById(match.id);
      expect(saved.homeScore).toBe(7);
      expect(saved.awayScore).toBe(0);
    });

    it('rejects invalid event updates without corrupting the stored event', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
      const event = await addEvent(match.id, { type: 'kick', team: 'home', result: 'touch', timestamp: 12 });

      await expect(updateEvent(match.id, event.id, { team: 'neutral' })).rejects.toThrow(/equipo/i);
      await expect(updateEvent(match.id, event.id, { timestamp: Number.POSITIVE_INFINITY })).rejects.toThrow(/timestamp/i);
      await expect(updateEvent(match.id, event.id, { result: 'try' })).rejects.toThrow(/resultado/i);

      const saved = await getMatchById(match.id);
      expect(saved.events).toEqual([
        expect.objectContaining({ id: event.id, type: 'kick', team: 'home', result: 'touch', timestamp: 12 }),
      ]);
    });
  });

  describe('updateEvent', () => {
    it('should merge data into existing event', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
      const event = await addEvent(match.id, { type: 'try', note: '' });

      await updateEvent(match.id, event.id, { note: 'Great play' });
      const saved = await getMatchById(match.id);

      expect(saved.events).toEqual([
        expect.objectContaining({ id: event.id, type: 'try', note: 'Great play' })
      ]);
    });

    it('should throw error if event not found', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

      await expect(updateEvent(match.id, 'evt-not-found', {})).rejects.toThrow('Event not found');
    });
  });

  describe('deleteEvent', () => {
    it('should remove event from match.events', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
      const first = await addEvent(match.id, { type: 'try' });
      const second = await addEvent(match.id, { type: 'ruck', team: 'home' });

      await deleteEvent(match.id, first.id);
      const saved = await getMatchById(match.id);

      expect(saved.events).toEqual([expect.objectContaining({ id: second.id })]);
    });

    it('recalculates score cache after deleting point events', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
      const tryEvent = await addEvent(match.id, { type: 'points', team: 'home', result: 'try', timestamp: 12 });
      await addEvent(match.id, { type: 'points', team: 'home', result: 'conversion', timestamp: 20 });

      await deleteEvent(match.id, tryEvent.id);

      const saved = await getMatchById(match.id);
      expect(saved.homeScore).toBe(2);
      expect(saved.awayScore).toBe(0);
      expect(saved.score).toEqual(expect.objectContaining({
        local: 2,
        rival: 0,
        bigua: 2,
        opponent: 0,
        winnerTeam: 'Bigua',
        resultForBigua: 'win',
        updatedAt: expect.any(String),
      }));
    });
  });
});
