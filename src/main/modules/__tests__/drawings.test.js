import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

import { createMatch, getMatchById } from '../storage.js';
import { addEvent } from '../events.js';
import {
  saveLiveDrawing,
  updateLiveDrawing,
  deleteLiveDrawing,
  saveFrameDrawing,
  getMatchDrawings,
  getAnnotatedFramesForPdf,
} from '../drawings.js';

const TEST_USER_DATA = path.join(process.cwd(), '.vitest-user-data');
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

async function resetTestData() {
  await fs.rm(TEST_USER_DATA, { recursive: true, force: true });
}

describe('drawings.js', () => {
  beforeEach(resetTestData);
  afterEach(resetTestData);

  it('rejects malicious match ids before reading or writing drawing files', async () => {
    await expect(saveLiveDrawing('../escape', { timestamp: 1, canvas: {}, strokes: [] })).rejects.toThrow(/match id/i);
    await expect(updateLiveDrawing('bad/id', 'drawing-1', { timestamp: 2 })).rejects.toThrow(/match id/i);
    await expect(deleteLiveDrawing('bad\\id', 'drawing-1')).rejects.toThrow(/match id/i);
    await expect(saveFrameDrawing('C:\\escape', 'event-1', { imageDataUrl: PNG_DATA_URL })).rejects.toThrow(/match id/i);
    await expect(getMatchDrawings('..')).rejects.toThrow(/match id/i);
  });

  it('saves live drawings as match markers without adding analytics events', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

    const drawing = await saveLiveDrawing(match.id, {
      timestamp: 126.4,
      durationSeconds: 3,
      canvas: { width: 1280, height: 720 },
      backgroundImage: 'data:image/png;base64,ZmFtZQ==',
      strokes: [{ id: 's1', tool: 'line', points: [{ x: 1, y: 1 }, { x: 20, y: 20 }] }],
    });
    const saved = await getMatchById(match.id);
    const drawingFile = path.join(TEST_USER_DATA, 'data', match.id, 'drawings', `${drawing.id}.json`);

    expect(saved.events).toEqual([]);
    expect(saved.drawings).toEqual([
      expect.objectContaining({
        id: drawing.id,
        timestamp: 126.4,
        durationSeconds: 3,
        file: `drawings/${drawing.id}.json`,
      }),
    ]);
    expect(JSON.parse(await fs.readFile(drawingFile, 'utf-8'))).toEqual(expect.objectContaining({
      kind: 'live-sequence',
      matchId: match.id,
      backgroundImage: 'data:image/png;base64,ZmFtZQ==',
      stepCount: 1,
      steps: [
        expect.objectContaining({
          label: 'Etapa 1',
          strokes: expect.any(Array),
        }),
      ],
    }));
  });

  it('saves live drawing payloads as playable drawing sequences', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

    const drawing = await saveLiveDrawing(match.id, {
      timestamp: 18,
      canvas: { width: 1280, height: 720 },
      backgroundImage: 'data:image/png;base64,ZmFtZQ==',
      steps: [
        {
          id: 'setup',
          label: 'Etapa 1',
          durationSeconds: 1.5,
          strokes: [{ id: 'p9', tool: 'player', points: [{ x: 120, y: 180 }] }],
        },
        {
          id: 'break',
          label: 'Etapa 2',
          durationSeconds: 2,
          strokes: [{ id: 'arrow', tool: 'arrow', points: [{ x: 120, y: 180 }, { x: 240, y: 220 }] }],
        },
      ],
    });
    const saved = await getMatchById(match.id);
    const drawingFile = path.join(TEST_USER_DATA, 'data', match.id, 'drawings', `${drawing.id}.json`);
    const stored = JSON.parse(await fs.readFile(drawingFile, 'utf-8'));
    const loaded = await getMatchDrawings(match.id);

    expect(drawing).toEqual(expect.objectContaining({
      kind: 'live-sequence',
      durationSeconds: 1.5,
      stepCount: 2,
      steps: [
        expect.objectContaining({ id: 'setup', label: 'Etapa 1', durationSeconds: 1.5 }),
        expect.objectContaining({ id: 'break', label: 'Etapa 2', durationSeconds: 2 }),
      ],
    }));
    expect(saved.drawings).toEqual([
      expect.objectContaining({
        id: drawing.id,
        kind: 'live-sequence',
        timestamp: 18,
        durationSeconds: 1.5,
        stepCount: 2,
        file: `drawings/${drawing.id}.json`,
      }),
    ]);
    expect(stored).toEqual(expect.objectContaining({
      kind: 'live-sequence',
      steps: expect.any(Array),
    }));
    expect(loaded.live).toEqual([
      expect.objectContaining({
        id: drawing.id,
        kind: 'live-sequence',
        stepCount: 2,
        steps: [
          expect.objectContaining({ id: 'setup', strokes: [expect.objectContaining({ id: 'p9' })] }),
          expect.objectContaining({ id: 'break', strokes: [expect.objectContaining({ id: 'arrow' })] }),
        ],
      }),
    ]);
  });

  it('wraps legacy single-stage live drawing payloads into one-step sequences', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

    const drawing = await saveLiveDrawing(match.id, {
      timestamp: 20,
      durationSeconds: 4,
      canvas: { width: 1280, height: 720 },
      strokes: [{ id: 'single-step', tool: 'line', points: [{ x: 1, y: 1 }, { x: 20, y: 20 }] }],
    });

    expect(drawing.kind).toBe('live-sequence');
    expect(drawing.durationSeconds).toBe(4);
    expect(drawing.stepCount).toBe(1);
    expect(drawing.steps).toEqual([
      expect.objectContaining({
        label: 'Etapa 1',
        durationSeconds: 4,
        strokes: [expect.objectContaining({ id: 'single-step' })],
      }),
    ]);
  });

  it('saves captured frame pngs and links them to the source event', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
    const event = await addEvent(match.id, { type: 'ruck', team: 'home', timestamp: 42, note: 'zona corta' });

    const result = await saveFrameDrawing(match.id, event.id, {
      imageDataUrl: PNG_DATA_URL,
      durationSeconds: 4.5,
      canvas: { width: 1920, height: 1080 },
      strokes: [{ id: 's1', tool: 'arrow', points: [{ x: 10, y: 10 }, { x: 90, y: 90 }] }],
    });
    const saved = await getMatchById(match.id);
    const pngFile = path.join(TEST_USER_DATA, 'data', match.id, 'frames', `${event.id}.png`);

    expect(result.drawingId).toBe(event.id);
    expect(await fs.readFile(pngFile)).toBeInstanceOf(Buffer);
    expect(saved.events[0]).toEqual(expect.objectContaining({ id: event.id, drawingId: event.id }));
  });

  it('rejects invalid or oversized frame images before writing files', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
    const event = await addEvent(match.id, { type: 'ruck', team: 'home', timestamp: 42 });
    const giantPng = `data:image/png;base64,${Buffer.alloc(6 * 1024 * 1024).toString('base64')}`;

    await expect(saveFrameDrawing(match.id, event.id, {
      imageDataUrl: 'data:image/png;base64,not valid base64!',
      durationSeconds: 2,
    })).rejects.toThrow(/base64/i);
    await expect(saveFrameDrawing(match.id, event.id, {
      imageDataUrl: giantPng,
      durationSeconds: 2,
    })).rejects.toThrow(/tama/i);

    const framesPath = path.join(TEST_USER_DATA, 'data', match.id, 'frames');
    await expect(fs.readdir(framesPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('limits the number of annotated frame drawings per match', async () => {
    const events = Array.from({ length: 251 }, (_, index) => ({
      id: `evt-${index}`,
      type: 'ruck',
      team: 'home',
      timestamp: index,
      drawingId: index < 250 ? `evt-${index}` : undefined,
    }));
    const match = await createMatch({ id: 'frame-limit-match', homeTeam: 'Bigua', awayTeam: 'Rival', events });

    await expect(saveFrameDrawing(match.id, 'evt-250', {
      imageDataUrl: PNG_DATA_URL,
      durationSeconds: 2,
    })).rejects.toThrow(/limite/i);
  });

  it('returns complete live drawings and pdf-ready annotated frame attachments', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
    const event = await addEvent(match.id, { type: 'penal', team: 'away', result: 'defensa', timestamp: 75 });

    await saveLiveDrawing(match.id, {
      timestamp: 20,
      durationSeconds: 2,
      canvas: { width: 1280, height: 720 },
      strokes: [{ id: 'live-1', tool: 'freehand', points: [{ x: 12, y: 18 }, { x: 92, y: 118 }] }],
    });
    await saveFrameDrawing(match.id, event.id, { imageDataUrl: PNG_DATA_URL, durationSeconds: 2, canvas: {}, strokes: [] });

    const drawings = await getMatchDrawings(match.id);
    const pdfPayload = await getAnnotatedFramesForPdf(match.id);

    expect(drawings.live).toEqual([
      expect.objectContaining({
        kind: 'live-sequence',
        timestamp: 20,
        durationSeconds: 2,
        stepCount: 1,
        canvas: { width: 1280, height: 720 },
        steps: [
          expect.objectContaining({
            label: 'Etapa 1',
            strokes: [expect.objectContaining({ id: 'live-1', tool: 'freehand' })],
          }),
        ],
        strokes: [expect.objectContaining({ id: 'live-1', tool: 'freehand' })],
      }),
    ]);
    expect(drawings.frames).toEqual([expect.objectContaining({ eventId: event.id, drawingId: event.id })]);
    expect(pdfPayload).toEqual(expect.objectContaining({
      frames: [
        expect.objectContaining({
          eventId: event.id,
          timestamp: 75,
          imageDataUrl: expect.stringContaining('data:image/png;base64,'),
        }),
      ],
      omitted: {
        overLimit: 0,
        oversized: 0,
        missing: 0,
      },
    }));
  });

  it('reports omitted annotated frames without reading beyond the PDF attachment limit', async () => {
    const events = Array.from({ length: 83 }, (_, index) => ({
      id: `evt-${index}`,
      type: 'ruck',
      team: 'home',
      timestamp: index,
      drawingId: `evt-${index}`,
    }));
    const match = await createMatch({ id: 'pdf-frame-omissions', homeTeam: 'Bigua', awayTeam: 'Rival', events });
    const framesPath = path.join(TEST_USER_DATA, 'data', match.id, 'frames');
    await fs.mkdir(framesPath, { recursive: true });
    await Promise.all(events.map(event => fs.writeFile(path.join(framesPath, `${event.drawingId}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))));

    const payload = await getAnnotatedFramesForPdf(match.id);

    expect(payload.frames).toHaveLength(80);
    expect(payload.omitted.overLimit).toBe(3);
    expect(payload.warning).toContain('80');
    expect(payload.warning).toContain('3');
  });

  it('skips oversized annotated frames and reports them in the PDF payload', async () => {
    const events = [
      { id: 'evt-small', type: 'ruck', team: 'home', timestamp: 1, drawingId: 'evt-small' },
      { id: 'evt-large', type: 'ruck', team: 'home', timestamp: 2, drawingId: 'evt-large' },
    ];
    const match = await createMatch({ id: 'pdf-frame-size-limit', homeTeam: 'Bigua', awayTeam: 'Rival', events });
    const framesPath = path.join(TEST_USER_DATA, 'data', match.id, 'frames');
    await fs.mkdir(framesPath, { recursive: true });
    await fs.writeFile(path.join(framesPath, 'evt-small.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    await fs.writeFile(path.join(framesPath, 'evt-large.png'), Buffer.alloc(5 * 1024 * 1024 + 1));

    const payload = await getAnnotatedFramesForPdf(match.id);

    expect(payload.frames).toEqual([
      expect.objectContaining({
        eventId: 'evt-small',
        timestamp: 1,
        imageDataUrl: expect.stringContaining('data:image/png;base64,'),
      }),
    ]);
    expect(payload.omitted.oversized).toBe(1);
  });

  it('limits annotated frame attachments loaded for PDF export', async () => {
    const events = Array.from({ length: 81 }, (_, index) => ({
      id: `evt-${index}`,
      type: 'ruck',
      team: 'home',
      timestamp: index,
      drawingId: `evt-${index}`,
    }));
    const match = await createMatch({ id: 'pdf-frame-limit', homeTeam: 'Bigua', awayTeam: 'Rival', events });
    const framesPath = path.join(TEST_USER_DATA, 'data', match.id, 'frames');
    await fs.mkdir(framesPath, { recursive: true });
    await Promise.all(events.map(event => fs.writeFile(path.join(framesPath, `${event.drawingId}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))));

    const payload = await getAnnotatedFramesForPdf(match.id);

    expect(payload.frames).toHaveLength(80);
    expect(payload.frames.at(-1)).toEqual(expect.objectContaining({ eventId: 'evt-79' }));
    expect(payload.omitted.overLimit).toBe(1);
  });

  it('updates and deletes live drawing timeline elements without touching analytics events', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
    const drawing = await saveLiveDrawing(match.id, {
      timestamp: 20,
      durationSeconds: 2,
      canvas: { width: 1280, height: 720 },
      strokes: [{ id: 'old-stroke', tool: 'line', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }],
    });

    const updated = await updateLiveDrawing(match.id, drawing.id, {
      timestamp: 36.5,
      durationSeconds: 4,
      canvas: { width: 1920, height: 1080 },
      backgroundImage: 'data:image/png;base64,dXBkYXRlZC1mcmFtZQ==',
      strokes: [{ id: 'new-stroke', tool: 'arrow', points: [{ x: 3, y: 4 }, { x: 50, y: 60 }] }],
    });
    const afterUpdate = await getMatchById(match.id);

    expect(updated).toEqual(expect.objectContaining({
      id: drawing.id,
      timestamp: 36.5,
      durationSeconds: 4,
      canvas: { width: 1920, height: 1080 },
      backgroundImage: 'data:image/png;base64,dXBkYXRlZC1mcmFtZQ==',
      strokes: [expect.objectContaining({ id: 'new-stroke', tool: 'arrow' })],
    }));
    expect(afterUpdate.events).toEqual([]);
    expect(afterUpdate.drawings).toEqual([
      expect.objectContaining({
        id: drawing.id,
        timestamp: 36.5,
        durationSeconds: 4,
      }),
    ]);

    await deleteLiveDrawing(match.id, drawing.id);
    const afterDelete = await getMatchById(match.id);
    const drawingsPath = path.join(TEST_USER_DATA, 'data', match.id, 'drawings', `${drawing.id}.json`);

    expect(afterDelete.events).toEqual([]);
    expect(afterDelete.drawings).toEqual([]);
    await expect(fs.readFile(drawingsPath, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
