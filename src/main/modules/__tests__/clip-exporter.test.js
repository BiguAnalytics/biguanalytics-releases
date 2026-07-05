import { describe, expect, it, vi } from 'vitest';

import {
  buildClipFfmpegArgs,
  buildSeparatorFfmpegArgs,
  calculateClipRange,
  createClipExporter,
  filterEventsForClipExport,
  sanitizeClipFileName,
} from '../clip-exporter.js';

const MATCH = {
  id: 'match-1',
  homeTeam: 'Bigua',
  awayTeam: 'Los Cardos',
  date: '2026-05-31',
  video: {
    type: 'local',
    path: 'C:\\Partidos\\bigua-los-cardos.mp4',
    duration: 100,
  },
  events: [
    { id: 'e1', type: 'ruck', result: 'ganado', team: 'home', timestamp: 5 },
    { id: 'e2', type: 'ruck', result: 'perdido', team: 'home', timestamp: 64 },
    { id: 'e3', type: 'penal', result: 'defensa', team: 'away', timestamp: 80 },
    { id: 'e4', type: 'kick', result: 'touch', team: 'home', timestamp: null },
  ],
};

const MATCH_WITHOUT_DURATION = {
  ...MATCH,
  video: {
    ...MATCH.video,
    duration: null,
  },
};

function createTestExporter(overrides = {}) {
  return createClipExporter({
    getMatchById: vi.fn(async () => MATCH),
    getSettings: vi.fn(async () => ({
      clipPreRollSeconds: 3,
      clipPostRollSeconds: 10,
      clipOutputModeDefault: 'separate',
      clipExportQuality: 'copy',
    })),
    selectOutputDirectory: vi.fn(async () => 'C:\\Exports'),
    pathExists: vi.fn(async () => true),
    ensureDirectory: vi.fn(async () => {}),
    getVideoDuration: vi.fn(async () => 100),
    runClip: vi.fn(async () => {}),
    ...overrides,
  });
}

describe('clip-exporter ranges', () => {
  it('calculates a normal clip window with pre-roll and post-roll', () => {
    expect(calculateClipRange(64, 100, { clipPreRollSeconds: 3, clipPostRollSeconds: 10 })).toEqual({
      start: 61,
      end: 74,
      duration: 13,
    });
  });

  it('clamps clips near the start to zero', () => {
    expect(calculateClipRange(2, 100, { clipPreRollSeconds: 3, clipPostRollSeconds: 10 })).toEqual({
      start: 0,
      end: 12,
      duration: 12,
    });
  });

  it('clamps clips near the end to the video duration', () => {
    expect(calculateClipRange(95, 100, { clipPreRollSeconds: 3, clipPostRollSeconds: 10 })).toEqual({
      start: 92,
      end: 100,
      duration: 8,
    });
  });
});

describe('clip-exporter filtering and names', () => {
  it('filters by event type and ignores events without a valid timestamp', () => {
    expect(filterEventsForClipExport(MATCH.events, { type: 'ruck' }, MATCH).map(event => event.id)).toEqual(['e1', 'e2']);
  });

  it('filters by inclusive temporal range', () => {
    expect(filterEventsForClipExport(MATCH.events, { fromSeconds: 60, toSeconds: 80 }, MATCH).map(event => event.id)).toEqual(['e2', 'e3']);
  });

  it('treats empty temporal filters as the full video range instead of zero seconds', () => {
    expect(filterEventsForClipExport(MATCH.events, {
      fromSeconds: null,
      toSeconds: '',
    }, MATCH).map(event => event.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('filters by combined type, result and temporal range', () => {
    const events = filterEventsForClipExport(MATCH.events, {
      type: 'ruck',
      result: 'perdido',
      fromSeconds: 60,
      toSeconds: 70,
    }, MATCH);

    expect(events.map(event => event.id)).toEqual(['e2']);
  });

  it('maps Bigua and Rival filters to the match home and away teams', () => {
    expect(filterEventsForClipExport(MATCH.events, { team: 'bigua' }, MATCH).map(event => event.id)).toEqual(['e1', 'e2']);
    expect(filterEventsForClipExport(MATCH.events, { team: 'rival' }, MATCH).map(event => event.id)).toEqual(['e3']);
  });

  it('sanitizes Windows-safe ordered file names', () => {
    expect(sanitizeClipFileName(3, { type: 'penal', result: 'defensa', timestamp: 1102 })).toBe('003_penal_defensa_18-22.mp4');
    expect(sanitizeClipFileName(1, { type: 'line out', result: 'ganado:sucio?', timestamp: 3724 })).toBe('001_line_out_ganado_sucio_01-02-04.mp4');
  });
});

describe('clip-exporter batch orchestration', () => {
  it('exports a selected batch as one combined MP4 with branded separators', async () => {
    const runClip = vi.fn(async () => {});
    const runSeparator = vi.fn(async () => {});
    const runConcat = vi.fn(async () => {});
    const cleanupTempDirectory = vi.fn(async () => {});
    const exporter = createTestExporter({
      getSettings: vi.fn(async () => ({
        clipPreRollSeconds: 3,
        clipPostRollSeconds: 10,
        clipOutputModeDefault: 'combined',
        clipExportQuality: 'copy',
      })),
      runClip,
      runSeparator,
      runConcat,
      cleanupTempDirectory,
    });

    const result = await exporter.exportBatch({ matchId: 'match-1', filters: { type: 'ruck' } });
    const concatJob = runConcat.mock.calls[0]?.[0];

    expect(runClip).toHaveBeenCalledTimes(2);
    expect(runClip.mock.calls[0][0]).toEqual(expect.objectContaining({
      quality: 'reencode',
      normalizeForConcat: true,
    }));
    expect(runSeparator).toHaveBeenCalledTimes(2);
    expect(runSeparator.mock.calls[0][0]).toEqual(expect.objectContaining({
      clipNumber: 1,
      totalClips: 2,
      title: 'Ruck / Ganado',
    }));
    expect(runConcat).toHaveBeenCalledTimes(1);
    expect(concatJob.inputs).toHaveLength(4);
    expect(concatJob.outputPath).toContain('BiguAnalytics_Clips_Bigua_vs_Los_Cardos_2026-05-31.mp4');
    expect(cleanupTempDirectory).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      canceled: false,
      exported: 2,
      failed: 0,
      total: 2,
      outputMode: 'combined',
      outputFile: concatJob.outputPath,
      files: [concatJob.outputPath],
    }));
  });

  it('exports only valid filtered events in a batch folder', async () => {
    const runClip = vi.fn(async () => {});
    const exporter = createTestExporter({ runClip });

    const result = await exporter.exportBatch({ matchId: 'match-1', filters: { type: 'ruck' } });

    expect(result).toEqual(expect.objectContaining({
      canceled: false,
      exported: 2,
      failed: 0,
      total: 2,
      outputDir: 'C:\\Exports\\BiguAnalytics_Clips_Bigua_vs_Los_Cardos_2026-05-31',
    }));
    expect(runClip).toHaveBeenCalledTimes(2);
    expect(runClip.mock.calls[0][0].outputPath).toContain('001_ruck_ganado_00-05.mp4');
    expect(runClip.mock.calls[1][0].outputPath).toContain('002_ruck_perdido_01-04.mp4');
  });

  it('continues batch export when one clip fails and reports the failed count', async () => {
    const runClip = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('ffmpeg failed'));
    const exporter = createTestExporter({ runClip });

    const result = await exporter.exportBatch({ matchId: 'match-1', filters: { type: 'ruck' } });

    expect(result.exported).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it('uses caller-provided clip seconds instead of falling back to persisted defaults', async () => {
    const runClip = vi.fn(async () => {});
    const exporter = createTestExporter({ runClip });

    await exporter.exportBatch({
      matchId: 'match-1',
      filters: { type: 'ruck' },
      clipPreRollSeconds: 12,
      clipPostRollSeconds: 4,
    });

    expect(runClip.mock.calls[0][0].range).toEqual({
      start: 0,
      end: 9,
      duration: 9,
    });
    expect(runClip.mock.calls[1][0].range).toEqual({
      start: 52,
      end: 68,
      duration: 16,
    });
  });

  it('runs independent batch clip jobs with bounded parallelism before concatenating combined output', async () => {
    const inFlight = [];
    let maxInFlight = 0;
    let releaseNext;
    const waiters = [];
    const runClip = vi.fn(async () => {
      inFlight.push('clip');
      maxInFlight = Math.max(maxInFlight, inFlight.length);
      await new Promise(resolve => {
        waiters.push(resolve);
        releaseNext = () => waiters.shift()?.();
      });
      inFlight.pop();
    });
    const runSeparator = vi.fn(async () => {});
    const runConcat = vi.fn(async () => {});
    const exporter = createTestExporter({
      getSettings: vi.fn(async () => ({
        clipPreRollSeconds: 3,
        clipPostRollSeconds: 10,
        clipOutputModeDefault: 'combined',
        clipExportQuality: 'copy',
      })),
      runClip,
      runSeparator,
      runConcat,
      maxParallelClipExports: 2,
    });

    const exportPromise = exporter.exportBatch({ matchId: 'match-1', filters: { type: 'ruck' } });
    await vi.waitUntil(() => runClip.mock.calls.length === 2);

    expect(maxInFlight).toBe(2);
    expect(runConcat).not.toHaveBeenCalled();

    releaseNext();
    releaseNext();
    await exportPromise;

    expect(runSeparator).toHaveBeenCalledTimes(2);
    expect(runConcat).toHaveBeenCalledTimes(1);
  });

  it('rejects export when the original MP4 no longer exists', async () => {
    const exporter = createTestExporter({ pathExists: vi.fn(async () => false) });

    await expect(exporter.exportSingle({ matchId: 'match-1', eventId: 'e1' }))
      .rejects.toThrow('No se encontró el video original. Volvé a cargar el MP4 del partido.');
  });

  it('reports ffprobe startup errors without throwing an internal ReferenceError', async () => {
    const exporter = createTestExporter({
      getMatchById: vi.fn(async () => MATCH_WITHOUT_DURATION),
      getVideoDuration: undefined,
    });

    await expect(exporter.exportSingle({
      matchId: 'match-1',
      eventId: 'e1',
    }, {
      ffprobePath: 'C:\\BiguAnalytics\\missing-ffprobe.exe',
    })).rejects.toThrow(/ENOENT|missing-ffprobe/i);
  });

  it('stops the queue after cancellation and leaves generated clips in place', async () => {
    let exporter;
    const runClip = vi.fn(async () => {
      exporter.cancelExport();
    });
    exporter = createTestExporter({ runClip });

    const result = await exporter.exportBatch({ matchId: 'match-1', filters: { type: 'ruck' } });

    expect(result.canceled).toBe(true);
    expect(result.exported).toBe(1);
    expect(result.total).toBe(2);
    expect(runClip).toHaveBeenCalledTimes(1);
  });
});

describe('clip-exporter ffmpeg commands', () => {
  it('builds longer dark-blue separator screens without the red overlay', () => {
    const args = buildSeparatorFfmpegArgs({
      outputPath: 'C:\\exports\\separator.mp4',
      clipNumber: 1,
      totalClips: 3,
      title: 'Ruck / Ganado',
      timestampLabel: 'Tiempo 00:42',
    }, false);
    const command = args.join(' ');

    expect(command).toContain('d=2.85');
    expect(command).toContain('-t 2.85');
    expect(command).toContain('0x080E1A');
    expect(command).toContain('0x0F2340');
    expect(command).not.toContain('0xC8102E');
  });

  it('builds reencoded frame-safe clip args for combined exports instead of stream copy', () => {
    const args = buildClipFfmpegArgs({
      inputPath: 'C:\\videos\\match.mp4',
      outputPath: 'C:\\exports\\clip.mp4',
      range: { start: 12.4, duration: 8.2 },
      quality: 'reencode',
      normalizeForConcat: true,
    });

    expect(args).toEqual(expect.arrayContaining([
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
    ]));
    expect(args.join(' ')).toContain('scale=1920:1080');
    expect(args.join(' ')).not.toContain('-c copy');
  });
});
