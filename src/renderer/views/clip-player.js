// @ts-check
import { cloudMatchService } from '../cloud/cloud-match-service.js';
import {
  CLIP_LOCAL_VIDEO_MISSING_MESSAGE,
  CLIP_MISSING_TIMESTAMPS_MESSAGE,
  CLIP_NO_EVENTS_MESSAGE,
  CLIP_NO_VIDEO_MESSAGE,
  calculateClipRange,
  filterClipEvents,
  getClipCandidateEvents,
  getClipRequestFromParams,
  getEventResultLabel,
  getEventTeamLabel,
  getEventTypeLabel,
  getPlayableVideo,
  hasValidClipTimestamp,
  normalizeClipFilterKey,
} from '../clips/clip-events.js';
import { getMatchSelectionItems, getMatchTitle } from '../components/match-selection.js';
import { setSidebarExpanded } from '../components/sidebar.js';
import { formatClock } from '../components/timeline.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { navigate } from '../router.js';

let activeCleanup = null;
let youtubeApiPromise = null;

const YOUTUBE_IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';
const DEFAULT_CLIP_PRE_ROLL_SECONDS = 5;
const DEFAULT_CLIP_POST_ROLL_SECONDS = 8;
const DEFAULT_CLIP_OUTPUT_MODE = 'combined';
const CLIP_QUEUE_PAGE_SIZE = 10;
const RUGBY_HALF_SECONDS = 40 * 60;

const QUICK_FILTERS = [
  { id: 'all', label: 'Todos', emptyLabel: 'Evento' },
  { id: 'scrum', label: 'Scrums', emptyLabel: 'Scrum' },
  { id: 'ruck', label: 'Rucks', emptyLabel: 'Ruck' },
  { id: 'penal', label: 'Penales', emptyLabel: 'Penal' },
  { id: 'kick', label: 'Kicks', emptyLabel: 'Kick' },
  { id: 'points', label: 'Try/Puntos', emptyLabel: 'Try/Puntos' },
  { id: 'break-line', label: 'Break Lines', emptyLabel: 'Break Line' },
  { id: 'note', label: 'Notas', emptyLabel: 'Nota' },
  { id: 'turnover', label: 'Turnovers', emptyLabel: 'Turnover' },
  { id: 'lineout', label: 'Line Outs', emptyLabel: 'Line Out' },
  { id: 'maul', label: 'Mauls', emptyLabel: 'Maul' },
];

const TEAM_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'bigua', label: 'Bigua' },
  { id: 'rival', label: 'Rival' },
];

const RESULT_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'ganado', label: 'Ganado' },
  { id: 'perdido', label: 'Perdido' },
  { id: 'sucio', label: 'Sucio' },
  { id: 'positivo', label: 'Positivo' },
  { id: 'negativo', label: 'Negativo' },
];

const PERIOD_FILTERS = [
  { id: 'all', label: 'Todo el partido' },
  { id: 'first-half', label: 'Primer tiempo' },
  { id: 'second-half', label: 'Segundo tiempo' },
  { id: 'custom', label: 'Rango personalizado' },
];

const OUTPUT_MODE_OPTIONS = [
  { id: 'combined', label: '\u00danico MP4' },
  { id: 'separate', label: 'Clips separados' },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function extractYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.slice(1);
    if (parsed.pathname.includes('/embed/')) return parsed.pathname.split('/embed/')[1].split('/')[0];
    return parsed.searchParams.get('v') || '';
  } catch {
    return '';
  }
}

function buildYouTubeEmbedUrl(source) {
  const videoId = source?.videoId || source?.youtubeVideoId || extractYouTubeVideoId(source?.embedUrl || source?.url || source?.youtubeUrl || '');
  if (!videoId) return '';
  const params = new URLSearchParams({
    enablejsapi: '1',
    playsinline: '1',
    controls: '1',
    autoplay: '1',
    rel: '0',
    fs: '0',
    iv_load_policy: '3',
  });
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

function ensureYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    let script = null;
    const handleReady = () => {
      if (typeof previousReady === 'function') previousReady();
      resolve(window.YT);
    };
    const fail = (error) => {
      if (script?.parentNode) script.remove();
      if (window.onYouTubeIframeAPIReady === handleReady) window.onYouTubeIframeAPIReady = previousReady;
      youtubeApiPromise = null;
      reject(error);
    };
    window.onYouTubeIframeAPIReady = handleReady;

    const existing = document.querySelector(`script[src="${YOUTUBE_IFRAME_API_SRC}"]`);
    if (existing) {
      script = existing;
      script.addEventListener('error', () => fail(new Error('No se pudo cargar la API de YouTube')), { once: true });
      return;
    }

    script = document.createElement('script');
    script.src = YOUTUBE_IFRAME_API_SRC;
    script.async = true;
    script.onerror = () => fail(new Error('No se pudo cargar la API de YouTube'));
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @returns {number}
 */
function normalizeClipSeconds(value, fallback, min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min) return fallback;
  return Math.min(60, Math.round(numeric));
}

export function calculateClipPlayerRange(timestamp, videoDuration, settings = {}) {
  return calculateClipRange(timestamp, videoDuration, settings);
}

export function getClipQueuePageWindow(totalClips, requestedPageIndex = 0, pageSize = CLIP_QUEUE_PAGE_SIZE) {
  const safeTotal = Math.max(0, Number(totalClips) || 0);
  const safePageSize = Math.max(1, Math.round(Number(pageSize) || CLIP_QUEUE_PAGE_SIZE));
  const totalPages = safeTotal > 0 ? Math.ceil(safeTotal / safePageSize) : 0;
  const maxPageIndex = Math.max(0, totalPages - 1);
  const pageIndex = Math.max(0, Math.min(maxPageIndex, Math.round(Number(requestedPageIndex) || 0)));
  const start = totalPages > 0 ? pageIndex * safePageSize : 0;
  const end = Math.min(safeTotal, start + safePageSize);

  return {
    pageIndex,
    pageSize: safePageSize,
    totalPages,
    start,
    end,
    hasPrevious: pageIndex > 0,
    hasNext: totalPages > 0 && pageIndex < totalPages - 1,
  };
}

export function getSelectedClipIdsForExport(clips = [], selectedClipIds = new Set()) {
  const selected = selectedClipIds instanceof Set
    ? selectedClipIds
    : new Set(Array.from(selectedClipIds || []).map(id => String(id)));
  return clips
    .map(clip => String(clip?.id || ''))
    .filter(id => id && selected.has(id));
}

export function getClipExportProgressMessage(payload = {}) {
  const rawMessage = String(payload?.message || '').trim();
  const message = rawMessage || (
    Number.isFinite(Number(payload?.current)) && Number.isFinite(Number(payload?.total))
      ? `Exportando ${Number(payload.current)}/${Number(payload.total)} clips`
      : 'Exportando clips...'
  );
  return /^guardando archivo/i.test(message) ? message : `Guardando archivo - ${message}`;
}

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
function formatClipLabel(value) {
  return String(value || '')
    .trim()
    .split(/(\s+|\/|-)/)
    .map(part => (/^(\s+|\/|-)$/.test(part) || part === '' ? part : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`))
    .join('');
}

/**
 * @param {string} type
 * @param {string} result
 * @returns {string}
 */
function getEventTitle(type, result) {
  return [type, normalizeClipFilterKey(result) === 'sin-resultado' ? '' : result].filter(Boolean).join(' / ');
}

/**
 * @param {number|null|undefined} seconds
 * @returns {string}
 */
function formatTimeInput(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return '';
  const safeSeconds = Math.max(0, Math.floor(Number(seconds)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/**
 * @param {string|null|undefined} value
 * @returns {number|null}
 */
function parseTimeInput(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map(part => Number(part));
  if (parts.length === 2 && parts.every(Number.isFinite)) return Math.max(0, (parts[0] * 60) + parts[1]);
  if (parts.length === 3 && parts.every(Number.isFinite)) return Math.max(0, (parts[0] * 3600) + (parts[1] * 60) + parts[2]);
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
}

/**
 * @param {object} match
 * @returns {number|null}
 */
function getVideoDurationSeconds(match = {}) {
  const duration = Number(match.video?.duration || match.videoDuration || match.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

/**
 * @param {unknown} value
 * @returns {'combined'|'separate'}
 */
function normalizeClipOutputMode(value) {
  return value === 'separate' ? 'separate' : DEFAULT_CLIP_OUTPUT_MODE;
}

/**
 * @param {object} match
 * @param {string} period
 * @param {object} params
 * @returns {{fromSeconds: number|null, toSeconds: number|null}}
 */
function getPeriodRange(match = {}, period = 'all', params = {}) {
  const videoDuration = getVideoDurationSeconds(match);
  if (period === 'custom') {
    return {
      fromSeconds: params.clipFrom === '' || params.clipFrom === null || params.clipFrom === undefined ? 0 : Number(params.clipFrom),
      toSeconds: params.clipTo === '' || params.clipTo === null || params.clipTo === undefined ? videoDuration : Number(params.clipTo),
    };
  }
  if (period === 'first-half') return { fromSeconds: 0, toSeconds: RUGBY_HALF_SECONDS };
  if (period === 'second-half') {
    return {
      fromSeconds: RUGBY_HALF_SECONDS,
      toSeconds: videoDuration && videoDuration > RUGBY_HALF_SECONDS ? videoDuration : null,
    };
  }
  return { fromSeconds: null, toSeconds: null };
}

/**
 * @param {object} params
 * @param {object} match
 * @returns {{eventId: string|null, eventTimestamp: number|null, type: string, result: string, team: string, period: string, fromSeconds: number|null, toSeconds: number|null}}
 */
function getClipRequest(params = {}, match = {}) {
  const request = getClipRequestFromParams(params);
  const period = params.clipPeriod || params.period || (request.fromSeconds !== null || request.toSeconds !== null ? 'custom' : 'all');
  const range = getPeriodRange(match, period, params);
  return {
    ...request,
    type: request.type || 'all',
    result: request.result || 'all',
    team: request.team || 'all',
    period,
    fromSeconds: range.fromSeconds,
    toSeconds: range.toSeconds,
  };
}

/**
 * @param {object|null|undefined} video
 * @returns {{status: 'local'|'youtube'|'none'|'local-missing', label: string, message: string, helper: string, video: {type: 'youtube'|'local', src: string}|null, canPlay: boolean, canExport: boolean}}
 */
function getVideoSourceState(video) {
  const sourceType = video?.sourceType || video?.type || '';
  if (sourceType === 'youtube') {
    const playable = getPlayableVideo(video);
    return playable
      ? {
        status: 'youtube',
        label: 'YouTube',
        message: 'Los clips de YouTube solo pueden reproducirse, no exportarse.',
        helper: 'Usa seek sobre el reproductor de YouTube integrado. Requiere conexión a internet.',
        video: playable,
        canPlay: true,
        canExport: false,
      }
      : {
        status: 'none',
        label: 'Sin video asociado',
        message: CLIP_NO_VIDEO_MESSAGE,
        helper: 'Sin video solo se pueden listar eventos, no reproducir clips.',
        video: null,
        canPlay: false,
        canExport: false,
      };
  }

  if (sourceType === 'local' || sourceType === 'local_mp4') {
    if (video?.localMissing || video?.needsLocalFile || !video?.path) {
      return {
        status: 'local-missing',
        label: 'Video local no asociado en esta PC',
        message: CLIP_LOCAL_VIDEO_MISSING_MESSAGE,
        helper: 'El partido conserva la referencia del video, pero esta PC necesita asociar el MP4 local para reproducir o exportar.',
        video: null,
        canPlay: false,
        canExport: false,
      };
    }
    const playable = getPlayableVideo(video);
    return playable
      ? {
        status: 'local',
        label: 'MP4 local',
        message: 'MP4 local asociado.',
        helper: 'Podés reproducir segmentos y exportar clips seleccionados.',
        video: playable,
        canPlay: true,
        canExport: true,
      }
      : {
        status: 'local-missing',
        label: 'Video local no asociado en esta PC',
        message: CLIP_LOCAL_VIDEO_MISSING_MESSAGE,
        helper: 'Asociá el MP4 local para reproducir y exportar.',
        video: null,
        canPlay: false,
        canExport: false,
      };
  }

  return {
    status: 'none',
    label: 'Sin video asociado',
    message: CLIP_NO_VIDEO_MESSAGE,
    helper: 'Sin video solo se pueden listar eventos, no reproducir clips.',
    video: null,
    canPlay: false,
    canExport: false,
  };
}

/**
 * @param {string} type
 * @returns {string}
 */
function getFilterTypeLabel(type) {
  const normalized = normalizeClipFilterKey(type || 'all');
  return QUICK_FILTERS.find(filter => filter.id === normalized)?.emptyLabel || getEventTypeLabel({ type });
}

/**
 * @param {string} team
 * @returns {string}
 */
function getFilterTeamLabel(team) {
  const normalized = normalizeClipFilterKey(team || 'all');
  if (normalized === 'bigua') return 'Bigua';
  if (normalized === 'rival') return 'Rival';
  return 'Todos';
}

/**
 * @param {object} request
 * @param {Array<object>} sourceEvents
 * @param {number} skippedUntimedCount
 * @param {Array<object>} allSourceEvents
 * @param {object} match
 * @returns {string}
 */
function buildEmptyClipMessage(request, sourceEvents, skippedUntimedCount, allSourceEvents = [], match = {}) {
  if (sourceEvents.length > 0 && skippedUntimedCount > 0) return CLIP_MISSING_TIMESTAMPS_MESSAGE;
  const type = normalizeClipFilterKey(request.type || 'all');
  const team = normalizeClipFilterKey(request.team || 'all');
  const result = normalizeClipFilterKey(request.result || 'all');
  const hasTypeEvidence = type && type !== 'all'
    ? filterClipEvents(allSourceEvents, { ...request, type, team: 'all', result: 'all' }, match, { requireTimestamp: false }).length > 0
    : true;
  const hasTeamEvidence = team && team !== 'all'
    ? filterClipEvents(allSourceEvents, { ...request, type: 'all', team, result: 'all' }, match, { requireTimestamp: false }).length > 0
    : true;
  if (sourceEvents.length === 0 && (!hasTypeEvidence || !hasTeamEvidence)) return CLIP_NO_EVENTS_MESSAGE;
  if (type && type !== 'all' && team && team !== 'all') {
    return `No hay eventos del tipo ${getFilterTypeLabel(type)} para ${getFilterTeamLabel(team)}.`;
  }
  if (type && type !== 'all') return `No hay eventos del tipo ${getFilterTypeLabel(type)}.`;
  if (team && team !== 'all') return `No hay eventos para ${getFilterTeamLabel(team)}.`;
  if (result && result !== 'all') return `No hay eventos con resultado ${getFilterTypeLabel(result)}.`;
  return CLIP_NO_EVENTS_MESSAGE;
}

/**
 * @param {object} match
 * @param {object} settings
 * @param {object} params
 * @returns {{status: 'ready'|'blocked', message: string, warning: string, source: object, video: {type: 'youtube'|'local', src: string}|null, clips: Array<object>, skippedUntimedCount: number, request: object, outputMode: 'combined'|'separate', clipSettings: {clipPreRollSeconds: number, clipPostRollSeconds: number}}}
 */
export function buildClipPlayerState(match = {}, settings = {}, params = {}) {
  const request = getClipRequest(params, match);
  const allSourceEvents = getClipCandidateEvents(match, { ...request, type: 'all', team: 'all', result: 'all' });
  const sourceEvents = getClipCandidateEvents(match, request);
  const timedEvents = request.eventId || Number.isFinite(request.eventTimestamp)
    ? sourceEvents.filter(event => hasValidClipTimestamp(event?.timestamp))
    : filterClipEvents(sourceEvents, request, match, { requireTimestamp: true });
  const skippedUntimedCount = sourceEvents.filter(event => !hasValidClipTimestamp(event?.timestamp)).length;
  const videoDuration = Number(match.video?.duration || match.videoDuration || match.duration);
  const clipSettings = {
    clipPreRollSeconds: normalizeClipSeconds(params.clipPreRollSeconds ?? settings.clipPreRollSeconds, DEFAULT_CLIP_PRE_ROLL_SECONDS, 0),
    clipPostRollSeconds: normalizeClipSeconds(params.clipPostRollSeconds ?? settings.clipPostRollSeconds, DEFAULT_CLIP_POST_ROLL_SECONDS, 1),
  };
  const outputMode = normalizeClipOutputMode(params.clipOutputMode ?? settings.clipOutputModeDefault);
  const clips = timedEvents.map((event, index) => {
    const range = calculateClipPlayerRange(event.timestamp, videoDuration, clipSettings);
    const typeLabel = formatClipLabel(getEventTypeLabel(event));
    const resultLabel = formatClipLabel(getEventResultLabel(event));
    return {
      id: event.id || `${event.timestamp}-${index}`,
      event,
      index,
      start: range.start,
      end: range.end,
      duration: range.duration,
      timestamp: Number(event.timestamp),
      title: getEventTitle(typeLabel, resultLabel),
      typeLabel,
      resultLabel,
      teamLabel: getEventTeamLabel(event, match),
      note: event.note || event.notes || '',
      zone: event.zone || event.fieldZone || event.field_zone || '',
    };
  });
  const source = getVideoSourceState(match.video);
  const emptyMessage = buildEmptyClipMessage(request, sourceEvents, skippedUntimedCount, allSourceEvents, match);
  const hasPlayableVideo = Boolean(source.video);
  const message = clips.length === 0 ? emptyMessage : hasPlayableVideo ? '' : source.message;

  return {
    status: hasPlayableVideo && clips.length > 0 ? 'ready' : 'blocked',
    message,
    warning: clips.length > 0 && skippedUntimedCount > 0 ? CLIP_MISSING_TIMESTAMPS_MESSAGE : '',
    source,
    video: source.video,
    clips,
    skippedUntimedCount,
    request,
    outputMode,
    clipSettings,
  };
}

/**
 * @param {Array<{id: string, label: string}>} options
 * @param {string} selected
 * @returns {string}
 */
function renderOptions(options, selected) {
  return options.map(option => `
    <option value="${escapeHtml(option.id)}"${option.id === selected ? ' selected' : ''}>${escapeHtml(option.label)}</option>
  `).join('');
}

function renderSourcePanel(match, state) {
  const source = state.source;
  const canAssociate = source.status !== 'local' || !source.canExport;
  return `
    <section class="clip-player-source" data-clip-player-source data-source-status="${escapeHtml(source.status)}">
      <div>
        <span>Fuente actual</span>
        <strong>${escapeHtml(source.label)}</strong>
        <p>${escapeHtml(source.helper)}</p>
        ${source.status === 'youtube' ? '<p>Exportar MP4 no está disponible para YouTube.</p>' : ''}
        ${source.status === 'none' ? '<p>Sin video solo se pueden listar eventos, no reproducir clips.</p>' : ''}
      </div>
      ${canAssociate ? '<button class="btn btn-secondary" type="button" data-associate-local-mp4>Asociar MP4 local</button>' : ''}
      ${match.video?.name ? `<small>${escapeHtml(match.video.name)}</small>` : ''}
    </section>
  `;
}

function renderFilters(state) {
  const request = state.request;
  const isCustom = request.period === 'custom';
  return `
    <section class="clip-player-filters" aria-label="Filtros de clips">
      <div class="clip-player-filter-row" role="list" aria-label="Filtros rápidos">
        ${QUICK_FILTERS.map(filter => `
          <button class="clip-filter-chip${request.type === filter.id ? ' active' : ''}" type="button" data-clip-filter-type="${escapeHtml(filter.id)}">
            ${escapeHtml(filter.label)}
          </button>
        `).join('')}
      </div>
      <div class="clip-player-filter-grid">
        <label>
          <span>Equipo</span>
          <select data-clip-filter-team>${renderOptions(TEAM_FILTERS, request.team || 'all')}</select>
        </label>
        <label>
          <span>Resultado</span>
          <select data-clip-filter-result>${renderOptions(RESULT_FILTERS, request.result || 'all')}</select>
        </label>
        <label>
          <span>Periodo</span>
          <select data-clip-filter-period>${renderOptions(PERIOD_FILTERS, request.period || 'all')}</select>
        </label>
        <label>
          <span>Salida</span>
          <select data-clip-output-mode>${renderOptions(OUTPUT_MODE_OPTIONS, state.outputMode || DEFAULT_CLIP_OUTPUT_MODE)}</select>
        </label>
        <label ${isCustom ? '' : 'hidden'}>
          <span>Desde</span>
          <input type="text" inputmode="numeric" data-clip-filter-from value="${escapeHtml(formatTimeInput(request.fromSeconds))}" placeholder="mm:ss">
        </label>
        <label ${isCustom ? '' : 'hidden'}>
          <span>Hasta</span>
          <input type="text" inputmode="numeric" data-clip-filter-to value="${escapeHtml(formatTimeInput(request.toSeconds))}" placeholder="mm:ss">
        </label>
        <label>
          <span>Iniciar segundos antes</span>
          <input type="number" min="0" max="60" data-clip-preroll-seconds value="${state.clipSettings.clipPreRollSeconds}">
        </label>
        <label>
          <span>Terminar segundos después</span>
          <input type="number" min="1" max="60" data-clip-postroll-seconds value="${state.clipSettings.clipPostRollSeconds}">
        </label>
      </div>
    </section>
  `;
}

function renderClipMedia(match, state) {
  if (state.video?.type === 'local') {
    return `
      <video
        class="clip-player-frame"
        data-clip-local-video
        controls
        preload="metadata"
        src="${escapeHtml(state.video.src)}"
      ></video>
    `;
  }

  if (state.video?.type === 'youtube') {
    return `
      <iframe
        id="clip-youtube-player-frame"
        class="clip-player-frame"
        title="Reproductor de clips de YouTube"
        allow="autoplay; encrypted-media"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
        src="${buildYouTubeEmbedUrl(match.video)}"
      ></iframe>
    `;
  }

  return `
    <div class="clip-player-no-video">
      <strong>${escapeHtml(state.source.label)}</strong>
      <span>${escapeHtml(state.source.helper)}</span>
    </div>
  `;
}

function formatClipQueueRange(pageWindow, totalClips) {
  if (!totalClips) return '0 de 0';
  return `${pageWindow.start + 1}-${pageWindow.end} de ${totalClips}`;
}

function renderQueue(clips, activeIndex = 0, canPlay = false, pageIndex = 0, selectedClipIds = null) {
  if (clips.length === 0) {
    return '<div class="clip-player-list-empty">No hay eventos con timestamp para este filtro.</div>';
  }
  const pageWindow = getClipQueuePageWindow(clips.length, pageIndex);
  return clips.slice(pageWindow.start, pageWindow.end).map((clip, offset) => {
    const index = pageWindow.start + offset;
    const checked = !selectedClipIds || selectedClipIds.has(String(clip.id));
    return `
    <article class="clip-player-queue-item${index === activeIndex ? ' active' : ''}" data-clip-row="${index}">
      <label class="clip-player-select">
        <input type="checkbox" ${checked ? 'checked' : ''} data-clip-select value="${escapeHtml(clip.id)}">
        <span>${String(index + 1).padStart(2, '0')}</span>
      </label>
      <div class="clip-player-queue-copy">
        <strong>${escapeHtml(clip.title)}</strong>
        <em>${formatClock(clip.timestamp)} · ${formatClock(clip.duration)}</em>
        <div class="clip-player-meta-grid">
          <span class="clip-player-meta-item"><b>Tipo</b><span>${escapeHtml(clip.typeLabel)}</span></span>
          <span class="clip-player-meta-item"><b>Equipo</b><span>${escapeHtml(clip.teamLabel)}</span></span>
          <span class="clip-player-meta-item"><b>Resultado</b><span>${escapeHtml(clip.resultLabel)}</span></span>
          ${clip.zone ? `<span class="clip-player-meta-item"><b>Zona</b><span>${escapeHtml(clip.zone)}</span></span>` : ''}
        </div>
        ${clip.note ? `<small class="clip-player-note">${escapeHtml(clip.note)}</small>` : ''}
      </div>
      <button class="clip-player-play-label" type="button" data-clip-index="${index}" ${canPlay ? '' : 'disabled'}>Reproducir</button>
    </article>
  `;
  }).join('');
}

function renderClipPlayerShell(match, state, activeIndex = 0, queuePageIndex = 0) {
  const title = getMatchTitle(match);
  const clips = state.clips || [];
  const queueWindow = getClipQueuePageWindow(clips.length, queuePageIndex);
  const canExport = Boolean(state.source.canExport && clips.length > 0);
  const exportReason = state.source.status === 'youtube'
    ? 'Los clips de YouTube solo pueden reproducirse, no exportarse.'
    : state.source.status === 'local'
      ? ''
      : state.source.message;
  const exportLabel = state.outputMode === 'combined' ? 'Exportar video unico' : 'Exportar clips seleccionados';
  return `
    <section class="clip-player-view view-enter">
      <header class="clip-player-header">
        <div>
          <span>${escapeHtml(title)}</span>
          <h1>Clips</h1>
          <p>Reproducí segmentos del partido filtrados por evento.</p>
        </div>
        <button class="btn btn-secondary" type="button" data-back-dashboard>Volver al dashboard</button>
      </header>
      <main class="clip-player-layout">
        <div class="clip-player-left">
          ${renderSourcePanel(match, state)}
          ${renderFilters(state)}
        </div>
        <div class="clip-player-right">
          <section class="clip-player-stage" data-clip-player-stage>
            ${renderClipMedia(match, state)}
            <div class="clip-player-status" data-clip-player-status>${state.video ? 'Reproductor listo.' : state.source.message}</div>
          </section>
          <div class="clip-player-export-progress" data-clip-export-progress data-export-visible="false" aria-live="polite" role="status">
            <span>Guardando archivo</span>
            <strong data-clip-export-progress-label>Esperando exportacion</strong>
          </div>
          <footer class="clip-player-controls">
            <button class="btn btn-secondary" type="button" data-clip-prev ${clips.length ? '' : 'disabled'}>Anterior</button>
            <label class="clip-player-playlist">
              <input type="checkbox" data-clip-playlist>
              <span>Playlist</span>
            </label>
            <div>
              <span data-clip-player-progress>${clips.length ? `Clip ${activeIndex + 1} / ${clips.length}` : 'Sin clips reproducibles'}</span>
              <strong data-clip-player-current>${escapeHtml(clips[activeIndex]?.title || 'Sin clip')}</strong>
            </div>
            <button class="btn btn-secondary" type="button" data-clip-next ${clips.length ? '' : 'disabled'}>Siguiente</button>
            <button class="btn btn-primary" type="button" data-clip-export-selected ${canExport ? '' : 'disabled'}>${exportLabel}</button>
            ${exportReason ? `<small data-clip-export-reason>${escapeHtml(exportReason)}</small>` : ''}
          </footer>
        </div>
        <section class="clip-player-queue" data-clip-player-queue>
          <header>
            <div>
              <span>Lista de clips/eventos</span>
              <strong data-clip-player-count>${clips.length} clips</strong>
            </div>
            <div class="clip-player-carousel-controls" aria-label="Paginacion de clips">
              <span data-clip-carousel-range>${escapeHtml(formatClipQueueRange(queueWindow, clips.length))}</span>
              <button class="clip-player-carousel-button" type="button" data-clip-page-prev aria-label="Ver clips anteriores" ${queueWindow.hasPrevious ? '' : 'disabled'}>&lsaquo;</button>
              <button class="clip-player-carousel-button" type="button" data-clip-page-next aria-label="Ver clips siguientes" ${queueWindow.hasNext ? '' : 'disabled'}>&rsaquo;</button>
            </div>
          </header>
          ${state.warning ? `<div class="clip-player-warning" role="status">${escapeHtml(state.warning)}</div>` : ''}
          ${state.message ? `<div class="clip-player-warning" role="status">${escapeHtml(state.message)}</div>` : ''}
          <div data-clip-player-list>${renderQueue(clips, activeIndex, Boolean(state.video), queuePageIndex)}</div>
        </section>
      </main>
    </section>
  `;
}

function renderClipPlayerMessage(container, title, message, matchId = null) {
  container.innerHTML = `
    <section class="clip-player-view view-enter">
      <div class="clip-player-empty">
        <span>Clips</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        ${matchId ? '<button class="btn btn-primary" type="button" data-back-dashboard>Volver al dashboard</button>' : ''}
      </div>
    </section>
  `;
}

/**
 * @param {HTMLElement} container
 * @param {Array<object>} matches
 */
function renderClipMatchSelection(container, matches) {
  const items = getMatchSelectionItems(matches);
  const selectionModuleLabel = 'Clips';
  updateTopbarContext('Clips');
  setTopbarActions([{ id: 'home', label: 'Inicio' }], () => navigate('home'));

  container.innerHTML = `
    <section class="tagging-match-select-view clip-match-select-view view-enter">
      <header class="tagging-match-select-header">
        <span>Clips</span>
        <h1>Elegir partido para clipear</h1>
        <p>${items.length === 0 ? 'Todavía no hay partidos disponibles. Creá o importá uno desde Inicio.' : 'Seleccioná un partido para ver clips.'}</p>
      </header>
      <div class="tagging-match-select-grid" aria-label="Partidos disponibles para clips">
        ${items.length === 0 ? `
          <button class="tagging-match-card" type="button" data-clip-home aria-label="Ir a Inicio">
            <span class="tagging-match-card-kicker">Sin partidos</span>
            <strong class="tagging-match-card-title">Crear o importar partido</strong>
            <span class="tagging-match-card-video">Inicio</span>
            <span class="tagging-match-card-footer">
              <span>Partidos</span>
              <span class="tabular-nums">0 - 0</span>
            </span>
          </button>
        ` : items.map(item => `
          <article class="tagging-match-card" data-clip-match-card-id="${escapeHtml(item.id)}" role="button" tabindex="0" aria-label="${escapeHtml(item.title)}">
            <span class="tagging-match-card-kicker">${escapeHtml(selectionModuleLabel)}</span>
            <strong class="tagging-match-card-title">${escapeHtml(item.title)}</strong>
            <span class="tagging-match-card-video">${escapeHtml(item.videoLabel)}</span>
            <span class="tagging-match-card-footer">
              <span>${escapeHtml(item.dateLabel)}</span>
              <span class="tabular-nums">${escapeHtml(item.scoreLabel)}</span>
            </span>
            <span class="tagging-match-card-actions">
              <button class="btn btn-primary btn-sm" type="button" data-clip-match-id="${escapeHtml(item.id)}" aria-label="Ver clips de ${escapeHtml(item.title)}">Ver clips</button>
            </span>
          </article>
        `).join('')}
      </div>
    </section>
  `;

  container.querySelector('[data-clip-home]')?.addEventListener('click', () => navigate('home'));
  container.querySelectorAll('[data-clip-match-id]').forEach(button => {
    button.addEventListener('click', () => navigate('clips', { matchId: button.dataset.clipMatchId }));
  });
  container.querySelectorAll('[data-clip-match-card-id]').forEach((card) => {
    const primaryAction = card.querySelector('[data-clip-match-id]');
    const openSelectedMatch = () => primaryAction?.click();
    card.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('button')) return;
      openSelectedMatch();
    });
    card.addEventListener('keydown', (event) => {
      if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      openSelectedMatch();
    });
  });
}

/**
 * Renders the dedicated Clips view.
 * @param {HTMLElement} container
 * @param {object} params
 */
export function renderClipPlayer(container, params = {}, lifecycle = {}) {
  if (activeCleanup) activeCleanup();

  let disposed = false;
  let match = null;
  let settings = {};
  let clips = [];
  let clipState = null;
  let activeIndex = 0;
  let activeClip = null;
  let queuePageIndex = 0;
  let selectedClipIds = new Set();
  let youtubePlayer = null;
  let youtubePlayerReady = false;
  let localVideo = null;
  let ticker = null;
  let currentParams = { ...params };
  let playlistEnabled = false;
  const cleanupFns = [];
  const isActive = () => !disposed
    && lifecycle?.isCurrent?.() !== false
    && lifecycle?.signal?.aborted !== true;

  const cleanup = () => {
    disposed = true;
    if (ticker) window.clearInterval(ticker);
    cleanupFns.splice(0).forEach(remove => remove?.());
    youtubePlayer?.stopVideo?.();
    youtubePlayer?.destroy?.();
    youtubePlayer = null;
    localVideo?.pause?.();
    localVideo?.removeAttribute('src');
    localVideo?.load?.();
    localVideo = null;
    if (activeCleanup === cleanup) activeCleanup = null;
  };
  activeCleanup = cleanup;

  setSidebarExpanded(false);
  updateTopbarContext('Clips');
  setTopbarActions(
    currentParams.matchId ? [{ id: 'dashboard', label: 'Volver al dashboard' }] : [{ id: 'home', label: 'Inicio' }],
    () => {
      if (match?.id) navigate('dashboard', { matchId: match.id });
      if (!match?.id) navigate('home');
    },
  );

  container.innerHTML = `
    <section class="clip-player-view view-enter">
      <div class="clip-player-loading">Cargando clips...</div>
    </section>
  `;

  load();
  return cleanup;

  async function load() {
    try {
      if (!currentParams.matchId) {
        const matches = await cloudMatchService.listMatches({ localFirst: true, refreshInBackground: true });
        if (isActive()) renderClipMatchSelection(container, matches);
        return;
      }

      const [loadedMatch, loadedSettings] = await Promise.all([
        cloudMatchService.getMatchById(currentParams.matchId, { localFirst: true }),
        window.api.settings.get(),
      ]);
      if (!isActive()) return;
      match = loadedMatch;
      settings = loadedSettings || {};
      await verifyLocalVideoAvailability();
      if (!isActive()) return;
      renderCurrentState(0);
    } catch (error) {
      if (!isActive()) return;
      renderClipPlayerMessage(container, 'No se pudieron cargar los clips', error instanceof Error ? error.message : 'Error desconocido.');
    }
  }

  async function verifyLocalVideoAvailability() {
    if (!match?.video || (match.video.type !== 'local' && match.video.sourceType !== 'local_mp4') || !match.video.path) return;
    if (typeof window.api.media?.localVideoExists !== 'function') return;
    const exists = await window.api.media.localVideoExists(match.video.path);
    if (!isActive()) return;
    if (!exists) match = { ...match, video: { ...match.video, localMissing: true, needsLocalFile: true } };
  }

  function renderCurrentState(nextActiveIndex = activeIndex) {
    if (!isActive() || !match) return;
    cleanupFns.splice(0).forEach(remove => remove?.());
    clipState = buildClipPlayerState(match, settings, currentParams);
    clips = clipState.clips;
    selectedClipIds = new Set(clips.map(clip => String(clip.id)).filter(Boolean));
    activeIndex = Math.max(0, Math.min(clips.length - 1, nextActiveIndex));
    queuePageIndex = getClipQueuePageWindow(clips.length, Math.floor(activeIndex / CLIP_QUEUE_PAGE_SIZE)).pageIndex;
    activeClip = clips[activeIndex] || null;
    updateTopbarContext(`${match.homeTeam || 'Bigua'} vs ${match.awayTeam || 'Rival'}`);
    container.innerHTML = renderClipPlayerShell(match, clipState, activeIndex, queuePageIndex);
    wireActions();
    initializePlayer();
  }

  function wireActions() {
    wireStaticActions();
    container.querySelectorAll('[data-clip-filter-type]').forEach(button => {
      button.addEventListener('click', () => {
        currentParams = { ...currentParams, clipType: button.dataset.clipFilterType || 'all' };
        renderCurrentState(0);
      });
    });
    container.querySelector('[data-clip-filter-team]')?.addEventListener('change', (event) => {
      currentParams = { ...currentParams, clipTeam: event.currentTarget.value || 'all' };
      renderCurrentState(0);
    });
    container.querySelector('[data-clip-filter-result]')?.addEventListener('change', (event) => {
      currentParams = { ...currentParams, clipResult: event.currentTarget.value || 'all' };
      renderCurrentState(0);
    });
    container.querySelector('[data-clip-filter-period]')?.addEventListener('change', (event) => {
      currentParams = { ...currentParams, clipPeriod: event.currentTarget.value || 'all' };
      renderCurrentState(0);
    });
    container.querySelector('[data-clip-output-mode]')?.addEventListener('change', (event) => {
      currentParams = { ...currentParams, clipOutputMode: event.currentTarget.value || DEFAULT_CLIP_OUTPUT_MODE };
      renderCurrentState(activeIndex);
    });
    container.querySelectorAll('[data-clip-filter-from], [data-clip-filter-to]').forEach(input => {
      input.addEventListener('change', () => {
        currentParams = {
          ...currentParams,
          clipPeriod: 'custom',
          clipFrom: parseTimeInput(container.querySelector('[data-clip-filter-from]')?.value) ?? '',
          clipTo: parseTimeInput(container.querySelector('[data-clip-filter-to]')?.value) ?? '',
        };
        renderCurrentState(0);
      });
    });
    container.querySelector('[data-clip-preroll-seconds]')?.addEventListener('change', (event) => {
      currentParams = { ...currentParams, clipPreRollSeconds: event.currentTarget.value };
      renderCurrentState(activeIndex);
    });
    container.querySelector('[data-clip-postroll-seconds]')?.addEventListener('change', (event) => {
      currentParams = { ...currentParams, clipPostRollSeconds: event.currentTarget.value };
      renderCurrentState(activeIndex);
    });
    container.querySelector('[data-clip-prev]')?.addEventListener('click', () => playClipAt(Math.max(0, activeIndex - 1)));
    container.querySelector('[data-clip-next]')?.addEventListener('click', () => playClipAt(Math.min(clips.length - 1, activeIndex + 1)));
    container.querySelector('[data-clip-page-prev]')?.addEventListener('click', () => {
      queuePageIndex = getClipQueuePageWindow(clips.length, queuePageIndex - 1).pageIndex;
      renderQueueState();
    });
    container.querySelector('[data-clip-page-next]')?.addEventListener('click', () => {
      queuePageIndex = getClipQueuePageWindow(clips.length, queuePageIndex + 1).pageIndex;
      renderQueueState();
    });
    container.querySelector('[data-clip-playlist]')?.addEventListener('change', (event) => {
      playlistEnabled = Boolean(event.currentTarget.checked);
    });
    wireQueueClipActions();
    container.querySelector('[data-clip-export-selected]')?.addEventListener('click', exportSelectedClips);
    container.querySelector('[data-associate-local-mp4]')?.addEventListener('click', associateLocalMp4);
    cleanupFns.push(window.api.clips.onProgress?.(payload => updateExportProgress(payload)));
    cleanupFns.push(window.api.clips.onComplete?.(payload => {
      finishExportProgress(payload?.outputDir ? 'Clips exportados correctamente.' : 'Exportacion finalizada.', 'complete');
      updateStatus(payload?.outputDir ? 'Clips exportados correctamente.' : 'Exportación finalizada.');
      if (payload?.outputDir) window.biguShowToast?.('Clips exportados correctamente.', 'info');
    }));
    cleanupFns.push(window.api.clips.onError?.(payload => finishExportProgress(payload?.message || 'No se pudieron exportar los clips.', 'error')));
  }

  function wireStaticActions() {
    container.querySelector('[data-back-dashboard]')?.addEventListener('click', () => {
      if (match?.id) navigate('dashboard', { matchId: match.id });
    });
  }

  async function associateLocalMp4() {
    if (!isActive() || !match?.id) return;
    const selected = await window.api.media.selectLocalVideo();
    if (!isActive() || !selected) return;
    const previousVideo = match.video && match.video.type !== 'local' ? { remoteVideo: match.video } : {};
    match = await cloudMatchService.updateMatch(match.id, {
      video: { ...selected, ...previousVideo },
      status: match.status === 'created' ? 'tagging' : match.status,
    });
    if (!isActive()) return;
    await verifyLocalVideoAvailability();
    renderCurrentState(activeIndex);
  }

  async function exportSelectedClips() {
    if (!isActive()) return;
    if (!match?.id || !clipState?.source?.canExport) {
      updateStatus(clipState?.source?.message || 'La exportación requiere un MP4 local.');
      return;
    }
    const selectedIds = getSelectedClipIdsForExport(clips, selectedClipIds);
    if (selectedIds.length === 0) {
      updateStatus('Seleccioná al menos un clip para exportar.');
      return;
    }
    updateExportProgress({ message: `Selecciona carpeta de destino para ${selectedIds.length} clips...` });
    try {
      await window.api.clips.exportBatch({
        matchId: match.id,
        outputMode: clipState.outputMode,
        clipPreRollSeconds: clipState.clipSettings.clipPreRollSeconds,
        clipPostRollSeconds: clipState.clipSettings.clipPostRollSeconds,
        filters: {
          type: clipState.request.type,
          result: clipState.request.result,
          team: clipState.request.team,
          fromSeconds: clipState.request.fromSeconds,
          toSeconds: clipState.request.toSeconds,
          eventIds: selectedIds,
        },
      });
    } catch (error) {
      finishExportProgress(error instanceof Error ? error.message : 'No se pudieron exportar los clips.', 'error');
    }
  }

  function initializePlayer() {
    if (!isActive()) return;
    youtubePlayer?.stopVideo?.();
    youtubePlayer?.destroy?.();
    youtubePlayer = null;
    youtubePlayerReady = false;
    localVideo?.pause?.();
    localVideo?.removeAttribute('src');
    localVideo?.load?.();
    localVideo = null;
    if (ticker) {
      window.clearInterval(ticker);
      ticker = null;
    }
    if (!clipState?.video || clips.length === 0) return;
    if (clipState.video.type === 'youtube') {
      initializeYouTubePlayer().catch(error => {
        if (isActive()) updateStatus(error instanceof Error ? error.message : 'No se pudo cargar YouTube.');
      });
      return;
    }
    initializeLocalPlayer();
  }

  async function initializeYouTubePlayer() {
    const frame = container.querySelector('#clip-youtube-player-frame');
    if (!frame) return;
    const YT = await ensureYouTubeIframeApi();
    if (!isActive()) return;
    youtubePlayer = new YT.Player(frame, {
      events: {
        onReady: () => {
          if (!isActive()) return;
          youtubePlayerReady = true;
          ticker = window.setInterval(tick, 250);
        },
        onError: () => updateStatus('No se pudo reproducir el video de YouTube. Asociá un MP4 local si necesitás exportar archivos.'),
      },
    });
  }

  function initializeLocalPlayer() {
    localVideo = /** @type {HTMLVideoElement|null} */ (container.querySelector('[data-clip-local-video]'));
    if (!localVideo) return;
    localVideo.addEventListener('timeupdate', tick);
    localVideo.addEventListener('error', () => {
      if (isActive()) updateStatus(CLIP_LOCAL_VIDEO_MISSING_MESSAGE);
    });
    localVideo.load?.();
  }

  function playClipAt(index) {
    if (clips.length === 0) return;
    if (!clipState?.video) {
      updateStatus(clipState?.source?.message || CLIP_NO_VIDEO_MESSAGE);
      return;
    }
    if (clipState.video.type === 'youtube' && (!youtubePlayer || !youtubePlayerReady)) {
      updateStatus('El reproductor de YouTube todavía se está cargando.');
      return;
    }
    if (clipState.video.type === 'local' && !localVideo) return;
    activeIndex = Math.max(0, Math.min(clips.length - 1, index));
    activeClip = clips[activeIndex];
    if (clipState.video.type === 'youtube') {
      youtubePlayer.seekTo(activeClip.start, true);
      youtubePlayer.playVideo();
    } else if (localVideo) {
      localVideo.currentTime = activeClip.start;
      const playback = localVideo.play?.();
      if (playback && typeof playback.catch === 'function') {
        playback.catch(() => updateStatus('Usá el control del video para iniciar la reproducción.'));
      }
    }
    renderPlaybackState();
  }

  function advanceClipQueue() {
    if (playlistEnabled && activeIndex < clips.length - 1) {
      playClipAt(activeIndex + 1);
      return;
    }
    youtubePlayer?.pauseVideo?.();
    localVideo?.pause?.();
    updateStatus('Clip finalizado.');
  }

  function tick() {
    if (!activeClip) return;
    const currentTime = clipState?.video?.type === 'local'
      ? Number(localVideo?.currentTime)
      : youtubePlayerReady && youtubePlayer
        ? Number(youtubePlayer.getCurrentTime())
        : Number.NaN;
    if (Number.isFinite(currentTime) && currentTime >= activeClip.end - 0.1) {
      advanceClipQueue();
    }
  }

  function updateStatus(message) {
    if (!isActive()) return;
    const status = container.querySelector('[data-clip-player-status]');
    if (status) status.textContent = message;
    if (!/youtube/i.test(String(message)) || clipState?.video?.type !== 'youtube') return;
    const stage = container.querySelector('[data-clip-player-stage]');
    if (!stage || stage.querySelector('[data-clip-youtube-retry]')) return;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-secondary';
    retry.dataset.clipYoutubeRetry = 'true';
    retry.textContent = 'Reintentar carga de YouTube';
    retry.addEventListener('click', () => {
      if (!isActive()) return;
      retry.remove();
      initializePlayer();
    });
    stage.appendChild(retry);
  }

  function updateExportProgress(payload = {}) {
    const message = getClipExportProgressMessage(payload);
    const progress = container.querySelector('[data-clip-export-progress]');
    const label = container.querySelector('[data-clip-export-progress-label]');
    updateStatus(message);
    if (progress) {
      progress.dataset.exportVisible = 'true';
      progress.dataset.tone = 'active';
    }
    if (label) label.textContent = message;
  }

  function finishExportProgress(message, tone) {
    const progress = container.querySelector('[data-clip-export-progress]');
    const label = container.querySelector('[data-clip-export-progress-label]');
    updateStatus(message);
    if (progress) {
      progress.dataset.exportVisible = 'true';
      progress.dataset.tone = tone;
    }
    if (label) label.textContent = message;
  }

  function wireQueueClipActions() {
    container.querySelectorAll('[data-clip-index]').forEach(button => {
      button.addEventListener('click', () => playClipAt(Number(button.dataset.clipIndex) || 0));
    });
    container.querySelectorAll('[data-clip-select]').forEach(input => {
      input.addEventListener('change', (event) => {
        const clipId = String(event.currentTarget.value || '');
        if (!clipId) return;
        if (event.currentTarget.checked) selectedClipIds.add(clipId);
        else selectedClipIds.delete(clipId);
      });
    });
  }

  function renderQueueState() {
    const pageWindow = getClipQueuePageWindow(clips.length, queuePageIndex);
    queuePageIndex = pageWindow.pageIndex;
    const range = container.querySelector('[data-clip-carousel-range]');
    const previous = container.querySelector('[data-clip-page-prev]');
    const next = container.querySelector('[data-clip-page-next]');
    const list = container.querySelector('[data-clip-player-list]');
    if (range) range.textContent = formatClipQueueRange(pageWindow, clips.length);
    if (previous) previous.disabled = !pageWindow.hasPrevious;
    if (next) next.disabled = !pageWindow.hasNext;
    if (list) {
      list.innerHTML = renderQueue(clips, activeIndex, Boolean(clipState?.video), queuePageIndex, selectedClipIds);
      wireQueueClipActions();
    }
  }

  function renderPlaybackState() {
    updateStatus(`Reproduciendo ${activeIndex + 1} / ${clips.length}: ${activeClip?.title || 'clip'}`);
    const progress = container.querySelector('[data-clip-player-progress]');
    const current = container.querySelector('[data-clip-player-current]');
    if (progress) progress.textContent = `Clip ${activeIndex + 1} / ${clips.length}`;
    if (current) current.textContent = activeClip?.title || 'Sin clip';
    queuePageIndex = getClipQueuePageWindow(clips.length, Math.floor(activeIndex / CLIP_QUEUE_PAGE_SIZE)).pageIndex;
    renderQueueState();
  }
}
