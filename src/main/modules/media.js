// @ts-check
const path = require('path');

const YOUTUBE_EMBED_REFERER = 'https://biguanalytics.local/';
const YOUTUBE_EMBED_ORIGIN = 'https://biguanalytics.local';
const YOUTUBE_CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * @param {string} videoId
 * @returns {string}
 */
function buildYouTubeEmbedUrl(videoId) {
  const params = new URLSearchParams({
    enablejsapi: '1',
    playsinline: '1',
    controls: '0',
    disablekb: '1',
    autoplay: '1',
    rel: '0',
    fs: '0',
    iv_load_policy: '3',
  });

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

/**
 * @param {string} requestUrl
 * @returns {boolean}
 */
function isYouTubeEmbedRequest(requestUrl) {
  try {
    const parsed = new URL(requestUrl);
    const host = parsed.hostname.replace(/^www\./, '');
    return ['youtube.com', 'youtube-nocookie.com'].includes(host)
      && parsed.pathname.startsWith('/embed/');
  } catch {
    return false;
  }
}

/**
 * @param {string} requestUrl
 * @returns {boolean}
 */
function isYouTubePlayerRequest(requestUrl) {
  try {
    const parsed = new URL(requestUrl);
    const host = parsed.hostname.replace(/^www\./, '');
    return ['youtube.com', 'youtube-nocookie.com'].includes(host);
  } catch {
    return false;
  }
}

/**
 * Converts a local path into a browser-safe file URL.
 * @param {string} filePath
 * @returns {string}
 */
function toFileUrl(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return `file:///${encodeURI(normalized)}`;
}

/**
 * Extracts a YouTube video id from common URL formats.
 * @param {string} url
 * @returns {string}
 */
function getYouTubeVideoId(url) {
  const parsed = new URL(url);
  if (parsed.hostname.includes('youtu.be')) {
    return parsed.pathname.slice(1);
  }
  if (parsed.pathname.includes('/embed/')) {
    return parsed.pathname.split('/embed/')[1].split('/')[0];
  }
  return parsed.searchParams.get('v') || '';
}

/**
 * Normalizes a YouTube URL for official IFrame API playback.
 * @param {string} url
 * @returns {{type: 'youtube', url: string, embedUrl: string, videoId: string}}
 */
function normalizeYouTubeSource(url) {
  const trimmed = String(url || '').trim();
  const videoId = getYouTubeVideoId(trimmed);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  return {
    type: 'youtube',
    url: trimmed,
    embedUrl: buildYouTubeEmbedUrl(videoId),
    videoId,
  };
}

/**
 * Builds request headers required by YouTube embeds inside Electron.
 * @param {Record<string, string>} requestHeaders
 * @param {string} [requestUrl]
 * @returns {Record<string, string>}
 */
function buildYouTubeRequestHeaders(requestHeaders = {}, requestUrl = '') {
  if (!isYouTubePlayerRequest(requestUrl)) {
    return { ...requestHeaders };
  }

  const headers = { ...requestHeaders };
  if (isYouTubeEmbedRequest(requestUrl)) {
    delete headers['user-agent'];
    delete headers['User-Agent'];
    headers['User-Agent'] = YOUTUBE_CHROME_USER_AGENT;
  }

  return {
    ...headers,
    Referer: headers.Referer || headers.referer || YOUTUBE_EMBED_REFERER,
    Origin: headers.Origin || headers.origin || YOUTUBE_EMBED_ORIGIN,
  };
}

/**
 * Opens the native local MP4 picker.
 * @param {{showOpenDialog: function(object, object): Promise<{canceled: boolean, filePaths: string[]}>}} dialog
 * @param {object} browserWindow
 * @returns {Promise<{type: 'local', path: string, name: string, fileUrl: string}|null>}
 */
async function selectLocalVideo(dialog, browserWindow) {
  const result = await dialog.showOpenDialog(browserWindow, {
    title: 'Seleccionar video del partido',
    properties: ['openFile'],
    filters: [{ name: 'Videos MP4', extensions: ['mp4'] }],
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    type: 'local',
    path: filePath,
    name: path.basename(filePath),
    fileUrl: toFileUrl(filePath),
  };
}

module.exports = {
  buildYouTubeRequestHeaders,
  normalizeYouTubeSource,
  selectLocalVideo,
  toFileUrl,
};
