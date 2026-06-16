import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

import {
  createMatch,
  deleteMatch,
  getAllMatches,
  getMatchById,
  resolveMatchPath,
  updateMatch,
} from '../storage.js';
import {
  exportLocalBackup,
  exportMatchArchive,
  importMatchArchive,
  readPortableArchive,
} from '../match-transfer.js';

const TEST_USER_DATA = path.join(process.cwd(), '.vitest-user-data');
const EXPORT_DIR = path.join(TEST_USER_DATA, 'exports');

async function resetTestData() {
  await fs.rm(TEST_USER_DATA, { recursive: true, force: true });
  await fs.mkdir(EXPORT_DIR, { recursive: true });
}

async function readArchiveJson(filePath, entryName) {
  const archive = await readPortableArchive(filePath);
  const entry = archive.entries.find(item => item.path === entryName);
  if (!entry) throw new Error(`Missing archive entry ${entryName}`);
  return JSON.parse(entry.data.toString('utf8'));
}

describe('match-transfer.js', () => {
  beforeEach(resetTestData);
  afterEach(resetTestData);

  it('exports a match archive with events, score and coach notes', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Old Boys', date: '2026-06-01' });
    await updateMatch(match.id, {
      events: [{ id: 'evt-1', type: 'points', team: 'home', result: 'try', timestamp: 12, note: 'Try corto' }],
      sequences: [{ id: 'seq-1', start: 10, end: 18, result: 'try' }],
      possession: { intervals: [{ team: 'home', start: 0, end: 15 }] },
      coachNotes: 'Presionar salida rival.',
      homeScore: 5,
      awayScore: 0,
      score: { local: 5, rival: 0, resultForBigua: 'win', updatedAt: '2026-06-01T10:00:00.000Z' },
    });

    const result = await exportMatchArchive(match.id, {
      outputPath: path.join(EXPORT_DIR, 'match.biguanalytics'),
      now: () => '2026-06-02T12:00:00.000Z',
      appVersion: '9.9.9-test',
    });
    const manifest = await readArchiveJson(result.filePath, 'manifest.json');
    const exportedMatch = await readArchiveJson(result.filePath, 'match/match.json');

    expect(result.filePath).toBe(path.join(EXPORT_DIR, 'match.biguanalytics'));
    expect(result.videoWarning).toBe('');
    expect(manifest).toEqual(expect.objectContaining({
      type: 'biguanalytics.match',
      schemaVersion: expect.any(Number),
      exportedAt: '2026-06-02T12:00:00.000Z',
      appVersion: '9.9.9-test',
      matchId: match.id,
    }));
    expect(exportedMatch).toEqual(expect.objectContaining({
      id: match.id,
      events: [expect.objectContaining({ id: 'evt-1', note: 'Try corto' })],
      sequences: [expect.objectContaining({ id: 'seq-1' })],
      possession: expect.objectContaining({ intervals: [expect.objectContaining({ team: 'home' })] }),
      coachNotes: 'Presionar salida rival.',
      score: expect.objectContaining({ local: 5, rival: 0 }),
    }));
  });

  it('does not export secrets, tokens or session data', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Carrasco Polo' });
    await updateMatch(match.id, {
      cloud: {
        clubId: 'club-1',
        accessToken: 'secret-access-token',
        refresh_token: 'secret-refresh-token',
        session: { bearer: 'secret-bearer-token' },
      },
      apiKey: 'secret-api-key',
    });

    const result = await exportMatchArchive(match.id, {
      outputPath: path.join(EXPORT_DIR, 'clean.biguanalytics'),
      now: () => '2026-06-02T12:00:00.000Z',
    });
    const archive = await readPortableArchive(result.filePath);
    const serialized = Buffer.concat(archive.entries.map(entry => entry.data)).toString('utf8');

    expect(serialized).toContain('club-1');
    expect(serialized).not.toContain('secret-access-token');
    expect(serialized).not.toContain('secret-refresh-token');
    expect(serialized).not.toContain('secret-bearer-token');
    expect(serialized).not.toContain('secret-api-key');
    expect(serialized).not.toMatch(/"accessToken"\s*:|"refresh_token"\s*:|"session"\s*:|"apiKey"\s*:/i);
  });

  it('imports a match archive and restores the match locally', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Old Christians', date: '2026-06-03' });
    await updateMatch(match.id, {
      events: [{ id: 'evt-restore', type: 'note', timestamp: 33, note: 'Cambio tactico' }],
      coachNotes: 'Cerrar canal interno.',
    });
    const result = await exportMatchArchive(match.id, {
      outputPath: path.join(EXPORT_DIR, 'restore.biguanalytics'),
    });

    await deleteMatch(match.id);
    const imported = await importMatchArchive(result.filePath, { duplicateStrategy: 'replace' });
    const restored = await getMatchById(match.id);

    expect(imported.match.id).toBe(match.id);
    expect(restored.events).toEqual([expect.objectContaining({ id: 'evt-restore', note: 'Cambio tactico' })]);
    expect(restored.coachNotes).toBe('Cerrar canal interno.');
  });

  it('imports duplicate match ids as a copy when requested', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Trebol' });
    const result = await exportMatchArchive(match.id, {
      outputPath: path.join(EXPORT_DIR, 'duplicate.biguanalytics'),
    });

    const imported = await importMatchArchive(result.filePath, {
      duplicateStrategy: 'copy',
      now: () => '2026-06-04T10:00:00.000Z',
    });

    expect(imported.action).toBe('copy');
    expect(imported.match.id).not.toBe(match.id);
    expect(imported.match.importedFromMatchId).toBe(match.id);
    await expect(getMatchById(match.id)).resolves.toEqual(expect.objectContaining({ id: match.id }));
    await expect(getMatchById(imported.match.id)).resolves.toEqual(expect.objectContaining({
      id: imported.match.id,
      importedFromMatchId: match.id,
    }));
  });

  it('makes imported matches visible in Home immediately through local summaries', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'PSG' });
    const result = await exportMatchArchive(match.id, {
      outputPath: path.join(EXPORT_DIR, 'home.biguanalytics'),
    });
    await deleteMatch(match.id);

    await importMatchArchive(result.filePath, { duplicateStrategy: 'replace' });
    const summaries = await getAllMatches();

    expect(summaries.map(item => item.id)).toContain(match.id);
  });

  it('exports local backup without sessions or secrets', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Champagnat' });
    await updateMatch(match.id, {
      events: [{ id: 'evt-backup', type: 'note', timestamp: 5, note: 'Backup note' }],
      cloud: { clubId: 'club-2', refreshToken: 'backup-refresh-token' },
    });
    await fs.writeFile(resolveMatchPath(match.id, 'ai-analysis.json'), JSON.stringify({
      status: 'valid',
      result: { summary: 'Mejorar disciplina.' },
    }), 'utf8');

    const backup = await exportLocalBackup({
      outputPath: path.join(EXPORT_DIR, 'backup.zip'),
      now: () => '2026-06-05T10:00:00.000Z',
      appVersion: '9.9.9-test',
      settings: {
        theme: 'dark',
        user: { name: 'Analista' },
        session: { accessToken: 'settings-access-token' },
        supabaseRefreshToken: 'settings-refresh-token',
      },
    });
    const archive = await readPortableArchive(backup.filePath);
    const serialized = Buffer.concat(archive.entries.map(entry => entry.data)).toString('utf8');

    expect(archive.entries.map(entry => entry.path)).toEqual(expect.arrayContaining([
      'manifest.json',
      `matches/${match.id}/match.json`,
      `matches/${match.id}/ai-analysis.json`,
      'settings.json',
    ]));
    expect(serialized).toContain('Backup note');
    expect(serialized).toContain('Mejorar disciplina.');
    expect(serialized).not.toContain('backup-refresh-token');
    expect(serialized).not.toContain('settings-access-token');
    expect(serialized).not.toContain('settings-refresh-token');
    expect(serialized).not.toMatch(/"accessToken"\s*:|"refreshToken"\s*:|"supabaseRefreshToken"\s*:|"session"\s*:/i);
  });
});
