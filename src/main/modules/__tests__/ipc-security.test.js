import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isAllowedVideoPath,
  registerAllowedVideoPath,
  resolveAllowedVideoPath,
  validateMatchCachePayload,
  validateMatchCreatePayload,
  validateMatchUpdatePayload,
  validatePendingSyncFilters,
  validatePendingSyncIds,
  validatePendingSyncOperation,
} from '../../ipc.js';

const ipcSource = readFileSync(resolve(process.cwd(), 'src/main/ipc.js'), 'utf8');

const VALID_MATCH = {
  id: 'match-1',
  homeTeam: 'Bigua',
  awayTeam: 'Rival',
  date: '2026-08-05',
  venue: 'home',
  status: 'tagging',
  video: { type: 'local', path: 'C:\\Partidos\\fecha-1.mp4', name: 'fecha-1.mp4', size: 10 },
  roster: ['Jugador 1'],
  events: [{ id: 'evt-1', type: 'points', team: 'home', result: 'try', timestamp: 12, note: '' }],
  drawings: [{ id: 'drawing-1', kind: 'frame', timestamp: 12, file: 'frames/drawing-1.png' }],
  sequences: [{ id: 'seq-1', start: 1, end: 2, team: 'home', result: 'try', phases: 1 }],
  possession: { intervals: [{ team: 'home', start: 0, end: 10 }] },
  coachNotes: 'Nota de partido',
};

describe('IPC security validation', () => {
  it('exposes deep validators for match and sync DTOs', () => {
    expect(validateMatchCreatePayload).toBeTypeOf('function');
    expect(validateMatchUpdatePayload).toBeTypeOf('function');
    expect(validateMatchCachePayload).toBeTypeOf('function');
    expect(validatePendingSyncOperation).toBeTypeOf('function');
  });

  it('accepts the canonical match cache shape without changing its public fields', () => {
    expect(validateMatchCreatePayload(VALID_MATCH)).toMatchObject(VALID_MATCH);
    expect(validateMatchCachePayload(VALID_MATCH)).toMatchObject(VALID_MATCH);
    expect(validateMatchUpdatePayload({ events: VALID_MATCH.events, status: 'tagging' }))
      .toMatchObject({ events: VALID_MATCH.events, status: 'tagging' });
  });

  it('rejects unknown match fields and oversized nested collections', () => {
    expect(() => validateMatchCreatePayload({ ...VALID_MATCH, injected: true })).toThrow(/campo|match/i);
    expect(() => validateMatchCachePayload({
      ...VALID_MATCH,
      events: Array.from({ length: 10001 }, (_, index) => ({
        id: `evt-${index}`,
        type: 'note',
      })),
    })).toThrow(/limite|evento/i);
  });

  it('validates pending sync operation shape and rejects arbitrary properties', () => {
    expect(validatePendingSyncOperation({
      id: 'pending-1',
      matchId: 'match-1',
      entity: 'match_events',
      action: 'upsert',
      payload: { id: 'evt-1' },
    })).toMatchObject({ entity: 'match_events', action: 'upsert' });
    expect(() => validatePendingSyncOperation({
      matchId: 'match-1',
      entity: 'match_events',
      action: 'upsert',
      payload: { id: 'evt-1' },
      injected: 'reject',
    })).toThrow(/campo|sync/i);
    expect(() => validatePendingSyncFilters({ matchId: '../escape' })).toThrow(/match id/i);
    expect(() => validatePendingSyncIds(Array.from({ length: 1001 }, (_, index) => `id-${index}`)))
      .toThrow(/limite|id/i);
  });

  it('allows only registered video files with a supported video extension', () => {
    const registered = registerAllowedVideoPath('C:\\Partidos\\fecha-2.MP4');
    expect(isAllowedVideoPath(registered)).toBe(true);
    expect(resolveAllowedVideoPath(registered)).toBe(registered);
    expect(() => registerAllowedVideoPath('C:\\Partidos\\notas.txt')).toThrow(/video|extension/i);
    expect(() => resolveAllowedVideoPath('C:\\Partidos\\no-registrado.mp4')).toThrow(/autorizada|registrada/i);
  });

  it('routes metadata IPC through the registered video path validator', () => {
    expect(ipcSource).toContain('resolveAllowedVideoPath(filePath)');
    expect(ipcSource).toContain("getLocalVideoMetadata(resolveAllowedVideoPath(filePath))");
    expect(ipcSource).toContain("localVideoExists(resolveAllowedVideoPath(filePath))");
  });
});
