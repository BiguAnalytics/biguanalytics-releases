import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
});
