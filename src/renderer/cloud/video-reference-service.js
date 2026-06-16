// @ts-check

const VIDEO_MISMATCH_WARNING = 'Este video no parece ser el mismo; los timestamps pueden no coincidir';

/**
 * @param {number|null|undefined} seconds
 * @returns {number|null}
 */
function secondsToMs(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) : null;
}

/**
 * @param {number|null|undefined} ms
 * @returns {number|null}
 */
function msToSeconds(ms) {
  const value = Number(ms);
  return Number.isFinite(value) && value >= 0 ? value / 1000 : null;
}

/**
 * @param {object|null|undefined} video
 * @returns {'youtube'|'local_mp4'|''}
 */
export function getVideoSourceType(video) {
  if (!video) return '';
  if (video.sourceType === 'youtube' || video.type === 'youtube') return 'youtube';
  if (video.sourceType === 'local_mp4' || video.type === 'local') return 'local_mp4';
  return '';
}

/**
 * @param {string} matchId
 * @param {object|null|undefined} video
 * @returns {object|null}
 */
export function buildVideoReferencePayload(matchId, video) {
  const sourceType = getVideoSourceType(video);
  if (!matchId || !sourceType) return null;
  const startOffsetMs = Number(video?.startOffsetMs ?? video?.start_offset_ms ?? 0) || 0;

  if (sourceType === 'youtube') {
    return {
      match_id: matchId,
      source_type: 'youtube',
      youtube_url: video.url || video.youtubeUrl || '',
      youtube_video_id: video.videoId || video.youtubeVideoId || '',
      local_file_name: null,
      local_file_size: null,
      local_duration_ms: null,
      local_fingerprint_hash: null,
      start_offset_ms: Math.max(0, startOffsetMs),
    };
  }

  return {
    match_id: matchId,
    source_type: 'local_mp4',
    youtube_url: null,
    youtube_video_id: null,
    local_file_name: video.name || video.localFileName || '',
    local_file_size: Number.isFinite(Number(video.size ?? video.localFileSize)) ? Number(video.size ?? video.localFileSize) : null,
    local_duration_ms: (secondsToMs(video.duration) ?? Number(video.durationMs ?? video.localDurationMs)) || null,
    local_fingerprint_hash: video.fingerprintHash || video.localFingerprintHash || null,
    start_offset_ms: Math.max(0, startOffsetMs),
  };
}

/**
 * @param {object|null|undefined} reference
 * @returns {object|null}
 */
export function mapVideoReferenceToLocalVideo(reference) {
  if (!reference) return null;
  if (Array.isArray(reference)) return mapVideoReferenceToLocalVideo(reference[0]);
  if (reference.source_type === 'youtube') {
    return {
      type: 'youtube',
      sourceType: 'youtube',
      url: reference.youtube_url || '',
      videoId: reference.youtube_video_id || '',
      startOffsetMs: Number(reference.start_offset_ms) || 0,
    };
  }
  if (reference.source_type !== 'local_mp4') return null;
  return {
    type: 'local',
    sourceType: 'local_mp4',
    path: '',
    fileUrl: '',
    name: reference.local_file_name || '',
    size: Number(reference.local_file_size) || 0,
    duration: msToSeconds(reference.local_duration_ms),
    fingerprintHash: reference.local_fingerprint_hash || '',
    startOffsetMs: Number(reference.start_offset_ms) || 0,
    needsLocalFile: true,
  };
}

/**
 * @param {string} fileUrl
 * @returns {Promise<number|null>}
 */
function readDurationMsFromVideo(fileUrl) {
  if (typeof document === 'undefined' || !fileUrl) return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const cleanup = () => {
      video.removeAttribute('src');
      video.load?.();
      video.remove();
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Number(video.duration);
      cleanup();
      resolve(Number.isFinite(duration) ? Math.round(duration * 1000) : null);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
    video.src = fileUrl;
  });
}

/**
 * @param {object} selected
 * @param {number|null} durationMs
 * @returns {object}
 */
function selectedVideoToLocal(selected, durationMs) {
  return {
    type: 'local',
    sourceType: 'local_mp4',
    path: selected.path || '',
    fileUrl: selected.fileUrl || '',
    name: selected.name || '',
    size: Number(selected.size) || 0,
    duration: msToSeconds(durationMs),
    fingerprintHash: selected.fingerprintHash || '',
    startOffsetMs: Number(selected.startOffsetMs) || 0,
    needsLocalFile: false,
  };
}

/**
 * @param {{localApi?: object, readDurationMs?: function(string): Promise<number|null>}} [deps]
 */
export function createVideoReferenceService(deps = {}) {
  const localApi = deps.localApi || globalThis.window?.api;
  const readDurationMs = deps.readDurationMs || readDurationMsFromVideo;

  return {
    /**
     * @param {object|null|undefined} video
     * @returns {Promise<{video: object|null, warning: string}>}
     */
    async ensurePlayableLocalVideo(video) {
      if (!video || getVideoSourceType(video) !== 'local_mp4') {
        return { video: video || null, warning: '' };
      }

      if (video.path && !video.needsLocalFile) {
        return { video, warning: '' };
      }

      const selected = await localApi.media.selectLocalVideo();
      if (!selected) return { video: null, warning: '' };
      const durationMs = Number(selected.durationMs || selected.localDurationMs) || await readDurationMs(selected.fileUrl);
      const nextVideo = {
        ...selectedVideoToLocal(selected, durationMs),
        startOffsetMs: Number(video.startOffsetMs) || 0,
      };

      const expectedSize = Number(video.size);
      const expectedDurationMs = secondsToMs(video.duration);
      const sizeMismatch = Number.isFinite(expectedSize) && expectedSize > 0 && expectedSize !== nextVideo.size;
      const hashMismatch = Boolean(video.fingerprintHash && nextVideo.fingerprintHash && video.fingerprintHash !== nextVideo.fingerprintHash);
      const durationMismatch = Number.isFinite(expectedDurationMs)
        && Number.isFinite(durationMs)
        && Math.abs(expectedDurationMs - durationMs) > 1000;

      return {
        video: nextVideo,
        warning: sizeMismatch || hashMismatch || durationMismatch ? VIDEO_MISMATCH_WARNING : '',
      };
    },
  };
}

export const videoReferenceService = createVideoReferenceService();
export { VIDEO_MISMATCH_WARNING };
