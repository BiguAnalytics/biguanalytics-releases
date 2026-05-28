import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

import { createMatch, getMatchById } from '../storage.js';
import { addEvent, updateEvent, deleteEvent } from '../events.js';

const TEST_USER_DATA = path.join(process.cwd(), '.vitest-user-data');

async function resetTestData() {
  await fs.rm(TEST_USER_DATA, { recursive: true, force: true });
}

describe('events.js', () => {
  beforeEach(resetTestData);
  afterEach(resetTestData);

  describe('addEvent', () => {
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
        zone: 'C3',
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
          zone: 'C3',
        }),
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
      const second = await addEvent(match.id, { type: 'ruck' });

      await deleteEvent(match.id, first.id);
      const saved = await getMatchById(match.id);

      expect(saved.events).toEqual([expect.objectContaining({ id: second.id })]);
    });
  });
});
