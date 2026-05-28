import { describe, expect, it, vi } from 'vitest';

import { buildYouTubeRequestHeaders, normalizeYouTubeSource, selectLocalVideo, toFileUrl } from '../media.js';

describe('media.js', () => {
  it('opens a native MP4 picker and returns a local file reference', async () => {
    const dialog = {
      showOpenDialog: vi.fn(async () => ({
        canceled: false,
        filePaths: ['C:\\Videos\\bigua-rival.mp4'],
      })),
    };

    const selected = await selectLocalVideo(dialog, {});

    expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      properties: ['openFile'],
      filters: [{ name: 'Videos MP4', extensions: ['mp4'] }],
    }));
    expect(selected).toEqual({
      type: 'local',
      path: 'C:\\Videos\\bigua-rival.mp4',
      name: 'bigua-rival.mp4',
      fileUrl: 'file:///C:/Videos/bigua-rival.mp4',
    });
  });

  it('returns null when local video selection is cancelled', async () => {
    const dialog = {
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    };

    await expect(selectLocalVideo(dialog, {})).resolves.toBeNull();
  });

  it('normalizes YouTube URLs for the official iframe player', () => {
    expect(normalizeYouTubeSource('https://www.youtube.com/watch?v=abc123XYZ')).toEqual({
      type: 'youtube',
      url: 'https://www.youtube.com/watch?v=abc123XYZ',
      embedUrl: 'https://www.youtube.com/embed/abc123XYZ?enablejsapi=1&playsinline=1&controls=0&disablekb=1&autoplay=1&rel=0&fs=0&iv_load_policy=3',
      videoId: 'abc123XYZ',
    });
  });

  it('normalizes shortened YouTube URLs without using app or data origins', () => {
    const source = normalizeYouTubeSource('https://youtu.be/lp5DkHR97_w');

    expect(source).toEqual({
      type: 'youtube',
      url: 'https://youtu.be/lp5DkHR97_w',
      embedUrl: 'https://www.youtube.com/embed/lp5DkHR97_w?enablejsapi=1&playsinline=1&controls=0&disablekb=1&autoplay=1&rel=0&fs=0&iv_load_policy=3',
      videoId: 'lp5DkHR97_w',
    });
    expect(source.embedUrl).not.toContain('app://');
    expect(source.embedUrl).not.toContain('data:');
  });

  it('converts Windows paths into file URLs', () => {
    expect(toFileUrl('D:\\Partidos\\fecha 1.mp4')).toBe('file:///D:/Partidos/fecha%201.mp4');
  });

  it('adds identity headers for YouTube embedded player requests', () => {
    expect(buildYouTubeRequestHeaders(
      { 'User-Agent': 'Electron' },
      'https://www.youtube.com/embed/lp5DkHR97_w',
    )).toEqual({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: 'https://biguanalytics.local/',
      Origin: 'https://biguanalytics.local',
    });
  });

  it('adds a Referer for the YouTube IFrame API script when Electron omits it', () => {
    expect(buildYouTubeRequestHeaders(
      {},
      'https://www.youtube.com/iframe_api',
    )).toEqual({
      Referer: 'https://biguanalytics.local/',
      Origin: 'https://biguanalytics.local',
    });
  });

  it('does not override signed YouTube media request headers', () => {
    expect(buildYouTubeRequestHeaders(
      { 'User-Agent': 'Electron', Range: 'bytes=0-' },
      'https://rr1---sn-q4flrnes.googlevideo.com/videoplayback',
    )).toEqual({
      'User-Agent': 'Electron',
      Range: 'bytes=0-',
    });
  });
});
