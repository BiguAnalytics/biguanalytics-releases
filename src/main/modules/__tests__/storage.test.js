import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

import {
  createMatch,
  clearLocalAccountData,
  deleteMatch,
  getAllMatches,
  getMatchById,
  resolveMatchPath,
  upsertMatchCache,
  updateMatch,
  validateMatchId,
} from '../storage.js';

const TEST_USER_DATA = path.join(process.cwd(), '.vitest-user-data');

async function resetTestData() {
  await fs.rm(TEST_USER_DATA, { recursive: true, force: true });
}

describe('storage.js', () => {
  beforeEach(resetTestData);
  afterEach(resetTestData);

  it('clears local account data and pending sync safely', async () => {
    await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
    await import('../storage.js').then(({ enqueuePendingSync }) => enqueuePendingSync({
      entity: 'matches',
      action: 'upsert',
      matchId: 'pending-match',
      payload: {},
    }));

    await clearLocalAccountData();

    expect(await getAllMatches()).toEqual([]);
    expect(await import('../storage.js').then(({ getPendingSync }) => getPendingSync())).toEqual([]);
    await expect(fs.access(path.join(TEST_USER_DATA, 'data'))).resolves.toBeUndefined();
  });

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

    it('initializes canonical score metadata for new matches', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
      const saved = await getMatchById(match.id);

      expect(saved.homeScore).toBe(0);
      expect(saved.awayScore).toBe(0);
      expect(saved.score).toEqual(expect.objectContaining({
        local: 0,
        rival: 0,
        bigua: 0,
        opponent: 0,
        winnerTeam: null,
        resultForBigua: 'unknown',
        updatedAt: expect.any(String),
      }));
      expect(saved.scoreContext).toEqual(expect.objectContaining({
        localScore: 0,
        rivalScore: 0,
        biguaScore: 0,
        opponentScore: 0,
        winnerTeam: null,
        resultForBigua: 'unknown',
      }));
    });

    it('rejects unsafe caller-provided match ids before creating directories', async () => {
      const outsidePath = path.join(TEST_USER_DATA, 'escape-check');

      await expect(createMatch({ id: '../escape-check', homeTeam: 'Bigua' })).rejects.toThrow(/match id/i);
      await expect(fs.stat(outsidePath)).rejects.toThrow();
    });
  });

  describe('match id path safety', () => {
    it('accepts only safe portable match ids', () => {
      expect(validateMatchId('match_2026-05-20')).toBe('match_2026-05-20');

      for (const value of ['', ' ', '../match', 'match/1', 'match\\1', 'match 1', 'C:\\temp\\match', '/tmp/match', '..']) {
        expect(() => validateMatchId(value)).toThrow(/match id/i);
      }
    });

    it('resolves match paths inside the data directory only', async () => {
      await createMatch({ id: 'safe-match_1', homeTeam: 'Bigua' });

      const matchFile = resolveMatchPath('safe-match_1', 'match.json');

      expect(matchFile).toBe(path.resolve(TEST_USER_DATA, 'data', 'safe-match_1', 'match.json'));
      expect(() => resolveMatchPath('../escape', 'match.json')).toThrow(/match id/i);
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

    it('returns corrupt match.json files as recoverable diagnostics instead of hiding them', async () => {
      const corruptDir = path.join(TEST_USER_DATA, 'data', 'corrupt-match');
      const corruptFile = path.join(corruptDir, 'match.json');
      await fs.mkdir(corruptDir, { recursive: true });
      await fs.writeFile(corruptFile, '{ invalid json', 'utf-8');

      const matches = await getAllMatches();

      expect(matches).toEqual([
        expect.objectContaining({
          id: 'corrupt-match',
          status: 'corrupt',
          corrupt: true,
          recoverable: true,
          filePath: corruptFile,
          error: expect.stringMatching(/json/i),
        }),
      ]);
      expect(await fs.readFile(corruptFile, 'utf-8')).toBe('{ invalid json');
    });

    it('returns a recoverable diagnostic for a match directory with missing match.json', async () => {
      const incompleteDir = path.join(TEST_USER_DATA, 'data', 'incomplete-match');
      await fs.mkdir(incompleteDir, { recursive: true });

      const matches = await getAllMatches();

      expect(matches).toEqual([
        expect.objectContaining({
          id: 'incomplete-match',
          status: 'error',
          recoverable: true,
          errorCode: 'MATCH_FILE_MISSING',
          filePath: path.join(incompleteDir, 'match.json'),
        }),
      ]);
    });

    it('returns a recoverable diagnostic for permission errors without overwriting the file', async () => {
      const deniedDir = path.join(TEST_USER_DATA, 'data', 'denied-match');
      const deniedFile = path.join(deniedDir, 'match.json');
      await fs.mkdir(deniedDir, { recursive: true });
      await fs.writeFile(deniedFile, '{"id":"denied-match"}', 'utf-8');
      const originalReadFile = fs.readFile.bind(fs);
      const readFileSpy = vi.spyOn(fs, 'readFile').mockImplementation(async (filePath, options) => {
        if (String(filePath) === deniedFile) {
          const error = new Error('permission denied');
          error.code = 'EACCES';
          throw error;
        }
        return originalReadFile(filePath, options);
      });

      try {
        const matches = await getAllMatches();

        expect(matches).toEqual([
          expect.objectContaining({
            id: 'denied-match',
            status: 'error',
            recoverable: true,
            errorCode: 'EACCES',
            filePath: deniedFile,
            error: expect.stringContaining('permission denied'),
          }),
        ]);
        expect(await originalReadFile(deniedFile, 'utf-8')).toBe('{"id":"denied-match"}');
      } finally {
        readFileSpy.mockRestore();
      }
    });

    it('returns a recoverable storage diagnostic when the data directory cannot be read', async () => {
      const dataPath = path.join(TEST_USER_DATA, 'data');
      await fs.mkdir(dataPath, { recursive: true });
      const originalReadDir = fs.readdir.bind(fs);
      const readDirSpy = vi.spyOn(fs, 'readdir').mockImplementation(async (filePath, options) => {
        if (String(filePath) === dataPath) {
          const error = new Error('data directory denied');
          error.code = 'EACCES';
          throw error;
        }
        return originalReadDir(filePath, options);
      });

      try {
        await expect(getAllMatches()).resolves.toEqual([
          expect.objectContaining({
            id: 'local-storage',
            status: 'error',
            recoverable: true,
            errorCode: 'EACCES',
            filePath: dataPath,
            error: expect.stringContaining('data directory denied'),
          }),
        ]);
      } finally {
        readDirSpy.mockRestore();
      }
    });

    it('does not expose tactical board storage as a match diagnostic', async () => {
      await fs.mkdir(path.join(TEST_USER_DATA, 'data', 'tactical-boards'), { recursive: true });

      await expect(getAllMatches()).resolves.toEqual([]);
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

    it('rejects unsafe ids without leaking the unsafe value in the error', async () => {
      await expect(getMatchById('../secret')).rejects.toThrow(/match id/i);
      await expect(getMatchById('../secret')).rejects.not.toThrow(/\.\.\/secret/);
    });

    it('normalizes old cached matches without score into a safe unknown score', async () => {
      await upsertMatchCache({
        id: 'legacy-no-score',
        homeTeam: 'Bigua',
        awayTeam: 'Rival',
        status: 'created',
      });

      const saved = await getMatchById('legacy-no-score');

      expect(saved.score).toEqual(expect.objectContaining({
        local: 0,
        rival: 0,
        bigua: 0,
        opponent: 0,
        winnerTeam: null,
        resultForBigua: 'unknown',
      }));
      expect(saved.scoreContext.resultForBigua).toBe('unknown');
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

    it('serializes read-modify-write mutations for the same match', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
      let releaseFirstMutation;
      let firstMutationStartedResolve;
      const firstMutationStarted = new Promise((resolve) => {
        firstMutationStartedResolve = resolve;
      });

      const firstUpdate = updateMatch(match.id, async (current) => {
        firstMutationStartedResolve();
        await new Promise((resolve) => {
          releaseFirstMutation = resolve;
        });
        return { status: current.status === 'created' ? 'tagging' : current.status };
      });

      await firstMutationStarted;
      const secondUpdate = updateMatch(match.id, { coachNotes: 'Nota concurrente' });
      releaseFirstMutation();

      await Promise.all([firstUpdate, secondUpdate]);

      await expect(getMatchById(match.id)).resolves.toEqual(expect.objectContaining({
        status: 'tagging',
        coachNotes: 'Nota concurrente',
      }));
    });

    it('keeps the previous match.json when an intermediate durable write fails', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
      const matchFile = resolveMatchPath(match.id, 'match.json');

      await updateMatch(match.id, { status: 'tagging' });
      const successfulContent = await fs.readFile(matchFile, 'utf-8');
      expect(() => JSON.parse(successfulContent)).not.toThrow();

      const originalWriteFile = fs.writeFile.bind(fs);
      const writeFileSpy = vi.spyOn(fs, 'writeFile').mockImplementation(async (filePath, data, options) => {
        if (String(filePath).includes(`${path.sep}match.json.`)) {
          throw new Error('simulated intermediate write failure');
        }
        return originalWriteFile(filePath, data, options);
      });

      try {
        await expect(updateMatch(match.id, { status: 'completed' })).rejects.toThrow('simulated intermediate write failure');
        await expect(fs.readFile(matchFile, 'utf-8')).resolves.toBe(successfulContent);
      } finally {
        writeFileSpy.mockRestore();
      }
    });
  });

  describe('deleteMatch', () => {
    it('should delete the match directory entirely', async () => {
      const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

      await deleteMatch(match.id);

      await expect(getMatchById(match.id)).rejects.toThrow();
    });

    it('does not delete outside the data directory for malicious ids', async () => {
      const outsidePath = path.join(TEST_USER_DATA, 'outside-keep.txt');
      await fs.mkdir(TEST_USER_DATA, { recursive: true });
      await fs.writeFile(outsidePath, 'keep', 'utf-8');

      await expect(deleteMatch('../outside-keep.txt')).rejects.toThrow(/match id/i);

      await expect(fs.readFile(outsidePath, 'utf-8')).resolves.toBe('keep');
    });
  });
});
