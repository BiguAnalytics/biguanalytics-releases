import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

import { createMatch, getAllMatches, getMatchById, updateMatch, deleteMatch } from '../storage.js';

const TEST_USER_DATA = path.join(process.cwd(), '.vitest-user-data');

async function resetTestData() {
  await fs.rm(TEST_USER_DATA, { recursive: true, force: true });
}

describe('storage.js', () => {
  beforeEach(resetTestData);
  afterEach(resetTestData);

  describe('createMatch', () => {
    it('should generate a UUID and create a match directory with match.json', async () => {
      const matchData = { homeTeam: 'Bigua', awayTeam: 'Rival', date: '2026-05-20' };
      const match = await createMatch(matchData);
      const matchFile = path.join(TEST_USER_DATA, 'data', match.id, 'match.json');
      const saved = JSON.parse(await fs.readFile(matchFile, 'utf-8'));

      expect(match.id).toBeDefined();
      expect(match.homeTeam).toBe('Bigua');
      expect(match.status).toBe('created');
      expect(saved.id).toBe(match.id);
    });

    it('should store optional video source and initialize phase 2 collections', async () => {
      const match = await createMatch({
        homeTeam: 'Bigua',
        awayTeam: 'Rival',
        video: {
          type: 'youtube',
          url: 'https://www.youtube.com/watch?v=abc123',
          embedUrl: 'https://www.youtube.com/embed/abc123?enablejsapi=1&playsinline=1&controls=0&rel=0',
          videoId: 'abc123',
        },
        roster: ['Jorge', 'Tomas'],
      });

      expect(match.video).toEqual(expect.objectContaining({ type: 'youtube', videoId: 'abc123' }));
      expect(match.roster).toEqual(['Jorge', 'Tomas']);
      expect(match.sequences).toEqual([]);
      expect(match.possession).toEqual([]);
    });
  });

  describe('getAllMatches', () => {
    it('should return empty array if data directory does not exist', async () => {
      const matches = await getAllMatches();
      expect(matches).toEqual([]);
    });

    it('should return array of match summaries', async () => {
      await createMatch({ homeTeam: 'A', awayTeam: 'Rival A' });
      await createMatch({ homeTeam: 'B', awayTeam: 'Rival B' });

      const matches = await getAllMatches();

      expect(matches).toHaveLength(2);
      expect(matches.map(match => match.homeTeam).sort()).toEqual(['A', 'B']);
      expect(matches[0].events).toBeUndefined();
    });
  });

  describe('getMatchById', () => {
    it('should return full match object if exists', async () => {
      const mockMatch = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

      const match = await getMatchById(mockMatch.id);

      expect(match.id).toBe(mockMatch.id);
      expect(match.events).toEqual([]);
    });

    it('should throw error if match does not exist', async () => {
      await expect(getMatchById('not-found')).rejects.toThrow();
    });
  });

  describe('updateMatch', () => {
    it('should merge partial data and save', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

      const updated = await updateMatch(match.id, { homeScore: 5, status: 'tagging' });
      const saved = await getMatchById(match.id);

      expect(updated.homeScore).toBe(5);
      expect(saved.status).toBe('tagging');
    });
  });

  describe('deleteMatch', () => {
    it('should delete the match directory entirely', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

      await deleteMatch(match.id);

      await expect(getMatchById(match.id)).rejects.toThrow();
    });
  });
});
