import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

import {
  createTacticalBoard,
  deleteTacticalBoard,
  getTacticalBoard,
  listTacticalBoards,
  renameTacticalBoard,
  updateTacticalBoard,
} from '../tactical-boards.js';

const TEST_USER_DATA = path.join(process.cwd(), '.vitest-user-data');

async function resetTestData() {
  await fs.rm(TEST_USER_DATA, { recursive: true, force: true });
}

describe('tactical-boards.js', () => {
  beforeEach(resetTestData);
  afterEach(resetTestData);

  it('creates and lists tactical boards with thumbnails', async () => {
    const board = await createTacticalBoard({
      name: 'Salida 22',
      thumbnail: 'data:image/png;base64,thumb',
      canvas: { width: 1200, height: 720 },
      strokes: [{ id: 's1', tool: 'rect' }],
    });

    const list = await listTacticalBoards();

    expect(board.id).toBeDefined();
    expect(list).toEqual([
      expect.objectContaining({ id: board.id, name: 'Salida 22', thumbnail: 'data:image/png;base64,thumb' }),
    ]);
  });

  it('updates, renames and deletes tactical boards', async () => {
    const board = await createTacticalBoard({ name: 'Nuevo tablero', canvas: {}, strokes: [] });

    await updateTacticalBoard(board.id, { strokes: [{ id: 's2', tool: 'text', text: 'Presion' }] });
    await renameTacticalBoard(board.id, 'Presion alta');
    const renamed = await getTacticalBoard(board.id);

    expect(renamed.name).toBe('Presion alta');
    expect(renamed.strokes).toEqual([expect.objectContaining({ id: 's2' })]);

    await deleteTacticalBoard(board.id);
    await expect(getTacticalBoard(board.id)).rejects.toThrow('Tactical board not found');
  });
});
