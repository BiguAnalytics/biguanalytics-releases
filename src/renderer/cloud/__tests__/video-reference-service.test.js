import { describe, expect, it, vi } from 'vitest';

import {
  buildVideoReferencePayload,
  createVideoReferenceService,
  mapVideoReferenceToLocalVideo,
} from '../video-reference-service.js';

describe('videoReferenceService', () => {
  it('maps YouTube sources without asking for a local file', async () => {
    const localApi = {
      media: {
        selectLocalVideo: vi.fn(),
      },
    };
    const service = createVideoReferenceService({ localApi });

    const payload = buildVideoReferencePayload('match-1', {
      type: 'youtube',
      url: 'https://www.youtube.com/watch?v=abc123',
      videoId: 'abc123',
    });

    expect(payload).toMatchObject({
      match_id: 'match-1',
      source_type: 'youtube',
      youtube_url: 'https://www.youtube.com/watch?v=abc123',
      youtube_video_id: 'abc123',
      start_offset_ms: 0,
    });
    expect(await service.ensurePlayableLocalVideo({ type: 'youtube' })).toEqual({ video: { type: 'youtube' }, warning: '' });
    expect(localApi.media.selectLocalVideo).not.toHaveBeenCalled();
  });

  it('requires selecting a local MP4 and warns when metadata does not match', async () => {
    const localApi = {
      media: {
        selectLocalVideo: vi.fn(async () => ({
          type: 'local',
          path: 'D:\\Videos\\otra-fecha.mp4',
          fileUrl: 'file:///D:/Videos/otra-fecha.mp4',
          name: 'otra-fecha.mp4',
          size: 12,
          fingerprintHash: 'b'.repeat(64),
        })),
      },
    };
    const service = createVideoReferenceService({
      localApi,
      readDurationMs: vi.fn(async () => 120000),
    });

    const result = await service.ensurePlayableLocalVideo({
      type: 'local',
      sourceType: 'local_mp4',
      name: 'fecha-1.mp4',
      size: 10,
      duration: 121,
      fingerprintHash: 'a'.repeat(64),
      startOffsetMs: 0,
      needsLocalFile: true,
    });

    expect(localApi.media.selectLocalVideo).toHaveBeenCalledTimes(1);
    expect(result.video).toEqual(expect.objectContaining({
      type: 'local',
      path: 'D:\\Videos\\otra-fecha.mp4',
      sourceType: 'local_mp4',
      fingerprintHash: 'b'.repeat(64),
    }));
    expect(result.warning).toBe('Este video no parece ser el mismo; los timestamps pueden no coincidir');
  });

  it('maps cloud local_mp4 references to local placeholders without storing video bytes', () => {
    expect(mapVideoReferenceToLocalVideo({
      source_type: 'local_mp4',
      local_file_name: 'fecha-1.mp4',
      local_file_size: 100,
      local_duration_ms: 90000,
      local_fingerprint_hash: 'a'.repeat(64),
      start_offset_ms: 500,
    })).toEqual({
      type: 'local',
      sourceType: 'local_mp4',
      path: '',
      fileUrl: '',
      name: 'fecha-1.mp4',
      size: 100,
      duration: 90,
      fingerprintHash: 'a'.repeat(64),
      startOffsetMs: 500,
      needsLocalFile: true,
    });
  });
});
