import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

import {
  enqueuePendingSync,
  getMatchById,
  getPendingSync,
  markPendingSyncApplied,
  upsertMatchCache,
} from '../storage.js';

const TEST_USER_DATA = path.join(process.cwd(), '.vitest-user-data');

async function resetTestData() {
  await fs.rm(TEST_USER_DATA, { recursive: true, force: true });
}

describe('cloud sync local cache', () => {
  beforeEach(resetTestData);
  afterEach(resetTestData);

  it('upserts cloud matches into the existing match.json cache shape', async () => {
    await upsertMatchCache({
      id: 'match-cloud-1',
      homeTeam: 'Bigua',
      awayTeam: 'Rival',
      date: '2026-05-31',
      competition: 'Regional',
      venue: 'away',
      status: 'tagging',
      video: { type: 'youtube', url: 'https://youtu.be/abc123', videoId: 'abc123' },
      events: [{ id: 'evt-1', timestamp: 12.5, type: 'ruck', team: 'home' }],
      possession: { activeTeam: null, activeStart: null, activeEnd: null, intervals: [] },
      sequences: [],
      coachNotes: 'Nota compartida',
      cloud: { clubId: 'club-1', createdBy: 'user-1' },
    });

    const saved = await getMatchById('match-cloud-1');

    expect(saved).toMatchObject({
      id: 'match-cloud-1',
      homeTeam: 'Bigua',
      awayTeam: 'Rival',
      date: '2026-05-31',
      competition: 'Regional',
      venue: 'away',
      status: 'tagging',
      coachNotes: 'Nota compartida',
      cloud: { clubId: 'club-1', createdBy: 'user-1' },
    });
    expect(saved.events).toEqual([expect.objectContaining({ id: 'evt-1', timestamp: 12.5 })]);
    expect(saved.drawings).toEqual([]);
  });

  it('stores pending_sync operations outside match folders and removes applied ids', async () => {
    const first = await enqueuePendingSync({
      matchId: 'match-cloud-1',
      entity: 'match_events',
      action: 'upsert',
      dedupeKey: 'match_events:evt-1',
      payload: { id: 'evt-1' },
    });
    await enqueuePendingSync({
      matchId: 'match-cloud-1',
      entity: 'match_events',
      action: 'upsert',
      dedupeKey: 'match_events:evt-1',
      payload: { id: 'evt-1', note: 'latest' },
    });

    expect(await getPendingSync()).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        status: 'pending_sync',
        dedupeKey: 'match_events:evt-1',
        payload: { id: 'evt-1', note: 'latest' },
      }),
    ]);

    await markPendingSyncApplied([first.id]);
    expect(await getPendingSync()).toEqual([]);
  });

  it('drops pending child writes when a match deletion is queued', async () => {
    await enqueuePendingSync({
      matchId: 'match-cloud-1',
      entity: 'match_events',
      action: 'upsert',
      dedupeKey: 'match_events:evt-1',
      payload: { id: 'evt-1' },
    });
    await enqueuePendingSync({
      matchId: 'match-cloud-1',
      entity: 'matches',
      action: 'delete',
      dedupeKey: 'matches:match-cloud-1:delete',
      payload: { id: 'match-cloud-1' },
    });

    expect(await getPendingSync()).toEqual([
      expect.objectContaining({
        matchId: 'match-cloud-1',
        entity: 'matches',
        action: 'delete',
      }),
    ]);
  });

  it('preserves concurrent pending enqueue read-modify-writes', async () => {
    await Promise.all([
      enqueuePendingSync({
        matchId: 'match-cloud-1',
        entity: 'match_events',
        action: 'upsert',
        dedupeKey: 'match_events:evt-1',
        payload: { id: 'evt-1' },
      }),
      enqueuePendingSync({
        matchId: 'match-cloud-1',
        entity: 'match_events',
        action: 'upsert',
        dedupeKey: 'match_events:evt-2',
        payload: { id: 'evt-2' },
      }),
    ]);

    expect((await getPendingSync()).map(operation => operation.dedupeKey).sort()).toEqual([
      'match_events:evt-1',
      'match_events:evt-2',
    ]);
  });

  it('does not remove an enqueue that races with marking applied operations', async () => {
    const first = await enqueuePendingSync({
      matchId: 'match-cloud-1',
      entity: 'match_events',
      action: 'upsert',
      dedupeKey: 'match_events:evt-1',
      payload: { id: 'evt-1' },
    });

    await Promise.all([
      markPendingSyncApplied([first.id]),
      enqueuePendingSync({
        matchId: 'match-cloud-1',
        entity: 'match_events',
        action: 'upsert',
        dedupeKey: 'match_events:evt-2',
        payload: { id: 'evt-2' },
      }),
    ]);

    expect(await getPendingSync()).toEqual([
      expect.objectContaining({ dedupeKey: 'match_events:evt-2' }),
    ]);
  });

  it('removes duplicate pending entries with the same dedupe key during enqueue', async () => {
    const dataPath = path.join(TEST_USER_DATA, 'data');
    const pendingPath = path.join(dataPath, 'pending-sync.json');
    await fs.mkdir(dataPath, { recursive: true });
    await fs.writeFile(pendingPath, JSON.stringify([
      { id: 'duplicate-1', matchId: 'match-cloud-1', dedupeKey: 'matches:match-cloud-1', payload: { version: 1 } },
      { id: 'duplicate-2', matchId: 'match-cloud-1', dedupeKey: 'matches:match-cloud-1', payload: { version: 2 } },
    ]), 'utf-8');

    await enqueuePendingSync({
      matchId: 'match-cloud-1',
      entity: 'matches',
      action: 'upsert',
      dedupeKey: 'matches:match-cloud-1',
      payload: { version: 3 },
    });

    expect(await getPendingSync()).toEqual([
      expect.objectContaining({
        id: 'duplicate-1',
        dedupeKey: 'matches:match-cloud-1',
        payload: { version: 3 },
      }),
    ]);
  });

  it('keeps the previous pending queue when a durable write fails', async () => {
    const first = await enqueuePendingSync({
      matchId: 'match-cloud-1',
      entity: 'match_events',
      action: 'upsert',
      dedupeKey: 'match_events:evt-1',
      payload: { id: 'evt-1' },
    });
    const originalWriteFile = fs.writeFile.bind(fs);
    const writeFileSpy = vi.spyOn(fs, 'writeFile').mockImplementation(async (filePath, data, options) => {
      if (String(filePath).includes('pending-sync.json') && String(data).includes('evt-2')) {
        await originalWriteFile(filePath, '{ partial queue', options);
        throw new Error('simulated pending queue write failure');
      }
      return originalWriteFile(filePath, data, options);
    });

    try {
      await expect(enqueuePendingSync({
        matchId: 'match-cloud-1',
        entity: 'match_events',
        action: 'upsert',
        dedupeKey: 'match_events:evt-2',
        payload: { id: 'evt-2' },
      })).rejects.toThrow('simulated pending queue write failure');
      expect(await getPendingSync()).toEqual([
        expect.objectContaining({ id: first.id, dedupeKey: 'match_events:evt-1' }),
      ]);
    } finally {
      writeFileSpy.mockRestore();
    }
  });

  it('preserves corrupt pending-sync.json with a backup and reports a recoverable sync error', async () => {
    const dataPath = path.join(TEST_USER_DATA, 'data');
    const pendingPath = path.join(dataPath, 'pending-sync.json');
    await fs.mkdir(dataPath, { recursive: true });
    await fs.writeFile(pendingPath, '{ broken queue', 'utf-8');

    await expect(getPendingSync()).rejects.toMatchObject({
      recoverable: true,
      code: 'PENDING_SYNC_CORRUPT',
      backupPath: expect.stringContaining('pending-sync.json.corrupt-'),
    });
    expect(await fs.readFile(pendingPath, 'utf-8')).toBe('{ broken queue');
    const backups = (await fs.readdir(dataPath)).filter(file => file.startsWith('pending-sync.json.corrupt-'));
    expect(backups).toHaveLength(1);

    const recovered = await enqueuePendingSync({
      matchId: 'match-cloud-1',
      entity: 'matches',
      action: 'upsert',
      payload: { id: 'match-cloud-1' },
    });

    expect(recovered).toEqual(expect.objectContaining({
      status: 'pending_sync',
      recoveredFromCorruptQueue: true,
    }));
    expect(JSON.parse(await fs.readFile(pendingPath, 'utf-8'))).toEqual([
      expect.objectContaining({ id: recovered.id, matchId: 'match-cloud-1' }),
    ]);
  });

  it('does not treat a non-array pending queue as empty', async () => {
    const dataPath = path.join(TEST_USER_DATA, 'data');
    const pendingPath = path.join(dataPath, 'pending-sync.json');
    await fs.mkdir(dataPath, { recursive: true });
    await fs.writeFile(pendingPath, JSON.stringify({ pending: [] }), 'utf-8');

    await expect(getPendingSync()).rejects.toMatchObject({
      recoverable: true,
      code: 'PENDING_SYNC_CORRUPT',
      backupPath: expect.stringContaining('pending-sync.json.corrupt-'),
    });
    expect(await fs.readFile(pendingPath, 'utf-8')).toBe(JSON.stringify({ pending: [] }));
  });
});
