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

  it('lists corrupt tactical board files with recoverable status instead of hiding them', async () => {
    const boardsPath = path.join(TEST_USER_DATA, 'data', 'tactical-boards');
    const boardFile = path.join(boardsPath, 'broken-board.json');
    await fs.mkdir(boardsPath, { recursive: true });
    await fs.writeFile(boardFile, '{ broken board', 'utf-8');

    const list = await listTacticalBoards();

    expect(list).toEqual([
      expect.objectContaining({
        id: 'broken-board',
        status: 'corrupt',
        corrupt: true,
        recoverable: true,
        filePath: boardFile,
        error: expect.stringMatching(/json/i),
      }),
    ]);
    expect(await fs.readFile(boardFile, 'utf-8')).toBe('{ broken board');
  });

  it('creates boards with reusable field appearance defaults', async () => {
    const board = await createTacticalBoard({ name: 'Sistema defensivo' });

    expect(board.canvas).toEqual(expect.objectContaining({
      width: 1200,
      height: 720,
      backgroundColor: '#0E3B2A',
      fieldTemplate: 'full',
    }));
  });

  it('persists tactical boards as drawing sequences with a legacy strokes preview', async () => {
    const board = await createTacticalBoard({
      name: 'Salida 22',
      steps: [
        {
          id: 'shape',
          label: 'Etapa 1',
          durationSeconds: 1.5,
          strokes: [{ id: 'p9', tool: 'player' }],
        },
        {
          id: 'launch',
          label: 'Etapa 2',
          durationSeconds: 2,
          strokes: [{ id: 'run', tool: 'arrow' }],
        },
      ],
    });

    expect(board).toEqual(expect.objectContaining({
      kind: 'drawing-sequence',
      stepCount: 2,
      durationSeconds: 1.5,
      steps: [
        expect.objectContaining({ id: 'shape', durationSeconds: 1.5 }),
        expect.objectContaining({ id: 'launch', durationSeconds: 2 }),
      ],
      strokes: [expect.objectContaining({ id: 'p9' })],
    }));
  });

  it('persists named drawing sequences with ordered frames and stable element ids', async () => {
    const board = await createTacticalBoard({
      name: 'Ataque desde scrum',
      frames: [
        {
          id: 'frame-1',
          name: 'Setup',
          order: 0,
          durationSeconds: 3,
          elements: [{ id: 'p9', type: 'player', points: [{ x: 120, y: 180 }] }],
          thumbnail: 'data:image/png;base64,setup',
        },
        {
          id: 'frame-2',
          name: 'Salida',
          order: 1,
          durationSeconds: 3,
          elements: [{ id: 'p9', type: 'player', points: [{ x: 220, y: 240 }] }],
        },
      ],
    });

    expect(board).toEqual(expect.objectContaining({
      kind: 'drawing-sequence',
      frameCount: 2,
      stepCount: 2,
      durationSeconds: 3,
      frames: [
        expect.objectContaining({
          id: 'frame-1',
          name: 'Setup',
          order: 0,
          elements: [expect.objectContaining({ id: 'p9', type: 'player' })],
        }),
        expect.objectContaining({
          id: 'frame-2',
          name: 'Salida',
          order: 1,
          elements: [expect.objectContaining({ id: 'p9', type: 'player' })],
        }),
      ],
      drawingSequences: [
        expect.objectContaining({
          id: board.id,
          name: 'Ataque desde scrum',
          isOpen: true,
          frames: expect.any(Array),
        }),
      ],
      steps: [
        expect.objectContaining({ id: 'frame-1', strokes: [expect.objectContaining({ id: 'p9' })] }),
        expect.objectContaining({ id: 'frame-2', strokes: [expect.objectContaining({ id: 'p9' })] }),
      ],
    }));
    expect(board.drawingSequences[0].frames[0]).toEqual(expect.objectContaining({
      id: 'frame-1',
      duration: 3,
      elements: [expect.objectContaining({ id: 'p9' })],
      thumbnail: 'data:image/png;base64,setup',
    }));

    const list = await listTacticalBoards();
    expect(list[0]).toEqual(expect.objectContaining({
      id: board.id,
      frameCount: 2,
      stepCount: 2,
    }));
  });

  it('preserves cuadro thumbnail metadata to avoid preview regeneration loops', async () => {
    const board = await createTacticalBoard({
      name: 'Jugada con previews',
      frames: [
        {
          id: 'cuadro-1',
          name: 'Cuadro 1',
          order: 0,
          durationSeconds: 2,
          elements: [{ id: 'p1', tool: 'player' }],
          thumbnail: 'data:image/png;base64,preview',
          thumbnailWidth: 640,
          thumbnailHeight: 384,
          thumbnailVersion: 2,
        },
      ],
    });

    expect(board.frames[0]).toEqual(expect.objectContaining({
      thumbnailWidth: 640,
      thumbnailHeight: 384,
      thumbnailVersion: 2,
    }));
    expect(board.drawingSequences[0].frames[0]).toEqual(expect.objectContaining({
      thumbnailWidth: 640,
      thumbnailHeight: 384,
      thumbnailVersion: 2,
    }));

    const reloaded = await getTacticalBoard(board.id);
    expect(reloaded.frames[0]).toEqual(expect.objectContaining({
      thumbnailWidth: 640,
      thumbnailHeight: 384,
      thumbnailVersion: 2,
    }));

    const updated = await updateTacticalBoard(board.id, { name: 'Jugada actualizada' });
    expect(updated.frames[0]).toEqual(expect.objectContaining({
      thumbnailWidth: 640,
      thumbnailHeight: 384,
      thumbnailVersion: 2,
    }));
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
