import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

import { createMatch, getMatchById } from '../storage.js';
import { addEvent } from '../events.js';
import {
  saveLiveDrawing,
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

  it('saves live drawings as match markers without adding analytics events', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });

    const drawing = await saveLiveDrawing(match.id, {
      timestamp: 126.4,
      durationSeconds: 3,
      canvas: { width: 1280, height: 720 },
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
      kind: 'live',
      matchId: match.id,
      strokes: expect.any(Array),
    }));
  });

  it('saves captured frame pngs and links them to the source event', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
    const event = await addEvent(match.id, { type: 'ruck', timestamp: 42, note: 'zona corta' });

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

  it('returns live markers and pdf-ready annotated frame attachments', async () => {
    const match = await createMatch({ homeTeam: 'Bigua', awayTeam: 'Rival' });
    const event = await addEvent(match.id, { type: 'penal', result: 'defensa', timestamp: 75 });

    await saveLiveDrawing(match.id, { timestamp: 20, durationSeconds: 2, canvas: {}, strokes: [] });
    await saveFrameDrawing(match.id, event.id, { imageDataUrl: PNG_DATA_URL, durationSeconds: 2, canvas: {}, strokes: [] });

    const drawings = await getMatchDrawings(match.id);
    const frames = await getAnnotatedFramesForPdf(match.id);

    expect(drawings.live).toHaveLength(1);
    expect(drawings.frames).toEqual([expect.objectContaining({ eventId: event.id, drawingId: event.id })]);
    expect(frames).toEqual([
      expect.objectContaining({
        eventId: event.id,
        timestamp: 75,
        imageDataUrl: expect.stringContaining('data:image/png;base64,'),
      }),
    ]);
  });
});
