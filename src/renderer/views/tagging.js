// @ts-check
import { renderTagPopup, getPopupOptionByNumber, getPopupZoneByNumber, getZones } from '../components/tag-popup.js';
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { SEQUENCE_COLOR_CHOICES, formatClock, renderTimeline, updateTimelinePlayback } from '../components/timeline.js';
import { navigate } from '../router.js';
import {
  EVENT_DEFINITIONS,
  SEQUENCE_RESULT_OPTIONS,
  advancePossession,
  buildEventPayload,
  calculatePossessionPercentages,
  closePopup,
  completePopup,
  createTaggerState,
  enrichSequenceFromEvents,
  finishSequence,
  getPossessionTimelineSegments,
  openTagPopup,
  selectPopupOption,
  selectPopupZone,
  shouldAutoClosePopup,
  startSequence,
  resetPossession,
  togglePossession,
  updatePopupNote,
} from '../tagging/tagger.js';

let activeCleanup = null;
let youtubeApiPromise = null;
const YOUTUBE_IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';
const SEEK_VISUAL_LOCK_MS = 1200;
const POSSESSION_SAVE_INTERVAL_MS = 1000;
const POSSESSION_MAX_GAP_SECONDS = 2;
const POINTS_SCORE_DELTAS = {
  try: 5,
  conversion: 2,
  'pk-goal': 3,
  drop: 3,
  'try-penal': 7,
};
const HISTORY_LIMIT = 60;
const YOUTUBE_PLAYER_STATE = {
  ended: 0,
  playing: 1,
  paused: 2,
};

/**
 * @param {string} path
 * @returns {string}
 */
function toFileUrl(path) {
  return `file:///${encodeURI(path.replaceAll('\\', '/'))}`;
}

/**
 * @param {string} url
 * @returns {string}
 */
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

/**
 * Builds the official YouTube embed URL for IFrame API playback.
 * @param {{videoId?: string, embedUrl?: string, url?: string}|string} source
 * @returns {string}
 */
export function buildYouTubeEmbedUrl(source) {
  const videoId = typeof source === 'string'
    ? extractYouTubeVideoId(source)
    : source.videoId || extractYouTubeVideoId(source.embedUrl || source.url || '');

  if (!videoId) return '';
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
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

/**
 * @param {{videoId?: string, embedUrl?: string, url?: string}|string} source
 * @returns {string}
 */
export function buildYouTubeIframeMarkup(source) {
  const playerSrc = buildYouTubeEmbedUrl(source);
  return `
    <div class="youtube-iframe-shell">
      <iframe
        class="youtube-player-frame"
        id="youtube-player-frame"
        title="Reproductor de YouTube"
        tabindex="-1"
        allow="autoplay; encrypted-media"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
        src="${playerSrc}"
      ></iframe>
      <div class="youtube-loading-state" aria-hidden="true">Cargando video...</div>
      <div class="youtube-error-state hidden" id="youtube-error-state" role="alert"></div>
    </div>
  `;
}

/**
 * @param {number} code
 * @returns {string}
 */
export function getYouTubeErrorMessage(code) {
  if (code === 101 || code === 150) {
    return 'Este video no permite reproduccion embebida. Abrilo en YouTube o cargá un MP4 local.';
  }
  if (code === 153) {
    return 'YouTube rechazo la reproduccion por falta de identificacion del cliente. Revisá la conexión o usá un MP4 local.';
  }
  if (code === 2) {
    return 'La URL de YouTube no es valida para reproducir este partido.';
  }
  return 'No se pudo reproducir el video de YouTube. Probá de nuevo o cargá un MP4 local.';
}

/**
 * @returns {Promise<object>}
 */
function ensureYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') previousReady();
      resolve(window.YT);
    };

    const existing = document.querySelector(`script[src="${YOUTUBE_IFRAME_API_SRC}"]`);
    if (existing) return;

    const script = document.createElement('script');
    script.src = YOUTUBE_IFRAME_API_SRC;
    script.async = true;
    script.onerror = () => reject(new Error('No se pudo cargar la API de YouTube'));
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

/**
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isEditableTarget(target) {
  const element = /** @type {HTMLElement|null} */ (target);
  if (!element) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable;
}

/**
 * @param {object} match
 * @returns {string}
 */
function getMatchTitle(match) {
  return `${match.homeTeam || 'Bigua'} vs ${match.awayTeam || 'Rival'}`;
}

/**
 * @param {object} match
 * @returns {Array<string>}
 */
function getRoster(match) {
  return Array.isArray(match.roster) && match.roster.length > 0 ? match.roster : [match.homeTeam || 'Bigua'];
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * @param {string} value
 * @returns {string}
 */
function formatEventValue(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Sin dato';
}

/**
 * @param {string} value
 * @returns {string}
 */
export function normalizeEventResultInput(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

/**
 * @param {string|null|undefined} currentZone
 * @param {string|null|undefined} selectedZone
 * @returns {string}
 */
export function getToggledZone(currentZone, selectedZone) {
  const current = String(currentZone || '');
  const selected = String(selectedZone || '');
  return current === selected ? '' : selected;
}

/**
 * @param {object} match
 * @param {'home'|'away'} team
 * @param {number} delta
 * @returns {{homeScore: number, awayScore: number}}
 */
export function getUpdatedScore(match, team, delta) {
  const homeScore = Math.max(0, Number(match?.homeScore) || 0);
  const awayScore = Math.max(0, Number(match?.awayScore) || 0);
  const safeDelta = Number(delta) || 0;

  return {
    homeScore: team === 'home' ? Math.max(0, homeScore + safeDelta) : homeScore,
    awayScore: team === 'away' ? Math.max(0, awayScore + safeDelta) : awayScore,
  };
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneHistoryValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * @param {object} match
 * @param {object} [possessionOverride]
 * @returns {object}
 */
export function createTaggingHistorySnapshot(match, possessionOverride) {
  return {
    events: cloneHistoryValue(match?.events || []),
    sequences: cloneHistoryValue(match?.sequences || []),
    possession: cloneHistoryValue(possessionOverride ?? match?.possession ?? {
      activeTeam: null,
      activeStart: null,
      activeEnd: null,
      intervals: [],
    }),
    homeScore: Math.max(0, Number(match?.homeScore) || 0),
    awayScore: Math.max(0, Number(match?.awayScore) || 0),
    status: match?.status || 'created',
  };
}

/**
 * @param {object} snapshot
 * @returns {object}
 */
export function getHistoryRestorePayload(snapshot) {
  return {
    events: cloneHistoryValue(snapshot?.events || []),
    sequences: cloneHistoryValue(snapshot?.sequences || []),
    possession: cloneHistoryValue(snapshot?.possession ?? {
      activeTeam: null,
      activeStart: null,
      activeEnd: null,
      intervals: [],
    }),
    homeScore: Math.max(0, Number(snapshot?.homeScore) || 0),
    awayScore: Math.max(0, Number(snapshot?.awayScore) || 0),
    status: snapshot?.status || 'created',
  };
}

/**
 * @param {object} event
 * @returns {number}
 */
export function getScoreDeltaForEvent(event) {
  if (event?.type !== 'points') return 0;
  return POINTS_SCORE_DELTAS[normalizeEventResultInput(event.result)] || 0;
}

/**
 * @param {object} match
 * @param {boolean} statsOnlyMode
 * @param {number|null} currentDuration
 * @returns {number|null}
 */
export function getInitialTimelineDuration(match, statsOnlyMode, currentDuration = null) {
  if (hasKnownDuration(currentDuration)) return currentDuration;
  const videoDuration = Number(match?.video?.duration);
  if (statsOnlyMode && hasKnownDuration(videoDuration)) return videoDuration;
  return currentDuration ?? null;
}

/**
 * @param {string} label
 * @param {string} targetAttribute
 * @param {string|null|undefined} selectedZone
 * @returns {string}
 */
function renderInspectorZonePicker(label, targetAttribute, selectedZone) {
  const selected = selectedZone || '';

  return `
    <div class="event-inspector-zone-picker" data-zone-picker>
      <input type="hidden" ${targetAttribute} value="${escapeHtml(selected)}" />
      <details>
        <summary>
          <span>${escapeHtml(label)}</span>
          <strong data-zone-picker-selected>${escapeHtml(selected || 'Sin dato')}</strong>
        </summary>
        <div class="tag-popup-field-grid event-inspector-field-grid" role="group" aria-label="${escapeHtml(label)}">
          ${getZones().map(zone => `
            <button
              class="tag-popup-zone-cell event-inspector-zone-cell${selected === zone.value ? ' active' : ''}"
              type="button"
              data-zone-target="${targetAttribute}"
              data-zone-picker-value="${zone.value}"
            >${zone.label}</button>
          `).join('')}
        </div>
      </details>
    </div>
  `;
}

/**
 * @param {object} event
 * @returns {string}
 */
export function getTimelineEventTitle(event) {
  const definition = Object.values(EVENT_DEFINITIONS).find(def => def.type === event?.type);
  return definition?.label || formatEventValue(event?.type);
}

/**
 * @param {object} event
 * @param {object} match
 * @returns {Array<{label: string, value: string}>}
 */
export function getTimelineEventDetails(event, match = {}) {
  const rows = [
    { label: 'Timestamp', value: formatClock(event?.timestamp) },
    { label: 'Equipo', value: event?.team === 'away' ? match.awayTeam || 'Rival' : match.homeTeam || 'Bigua' },
  ];

  if (event?.result) rows.push({ label: 'Resultado', value: formatEventValue(event.result) });
  if (event?.subtype) rows.push({ label: 'Subtipo', value: formatEventValue(event.subtype) });
  if (event?.player) rows.push({ label: 'Jugador', value: event.player });
  if (event?.zone) rows.push({ label: 'Zona', value: event.zone });

  return rows;
}

/**
 * @param {string} value
 * @returns {Date}
 */
function parseMatchDate(value) {
  const dateValue = String(value || '');
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  return isoDateOnly
    ? new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]))
    : new Date(dateValue);
}

/**
 * @param {object} match
 * @returns {number}
 */
function getMatchSortTime(match) {
  const timestamp = parseMatchDate(match?.createdAt || match?.date || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * @param {object} match
 * @returns {string}
 */
function getMatchDateLabel(match) {
  const date = parseMatchDate(match?.date || match?.createdAt || '');
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

/**
 * @param {object} match
 * @returns {string}
 */
function getMatchVideoLabel(match) {
  const video = match?.video || {};
  if (video.name) return String(video.name);
  if (video.type === 'youtube') return 'YouTube';
  if (video.path) return String(video.path).split(/[\\/]/).filter(Boolean).pop() || 'MP4 local';
  if (video.type === 'local') return 'MP4 local';
  return 'Sin video';
}

/**
 * @param {string} status
 * @returns {string}
 */
function getMatchStatusLabel(status) {
  if (status === 'analyzed') return 'Analizado';
  if (status === 'tagging') return 'Tagging';
  if (status === 'created') return 'Pendiente';
  return formatEventValue(status);
}

/**
 * @param {Array<object>} matches
 * @returns {Array<{id: string, title: string, statusLabel: string, scoreLabel: string, videoLabel: string, dateLabel: string}>}
 */
export function getTaggingMatchSelectionItems(matches = []) {
  return [...matches]
    .filter(match => match?.id)
    .sort((a, b) => getMatchSortTime(b) - getMatchSortTime(a))
    .map(match => {
      const homeScore = Number.isFinite(Number(match.homeScore)) ? Number(match.homeScore) : 0;
      const awayScore = Number.isFinite(Number(match.awayScore)) ? Number(match.awayScore) : 0;

      return {
        id: String(match.id),
        title: getMatchTitle(match),
        statusLabel: getMatchStatusLabel(match.status),
        scoreLabel: `${homeScore} - ${awayScore}`,
        videoLabel: getMatchVideoLabel(match),
        dateLabel: getMatchDateLabel(match),
      };
    });
}

/**
 * @param {number|null} duration
 * @returns {boolean}
 */
export function hasKnownDuration(duration) {
  return Number.isFinite(duration) && duration > 0;
}

/**
 * @param {number|null} currentTime
 * @param {number|null} duration
 * @returns {string}
 */
export function formatVideoReadout(currentTime, duration) {
  return `${formatClock(currentTime)} / ${hasKnownDuration(duration) ? formatClock(duration) : '--:--'}`;
}

/**
 * @param {number|null} currentTime
 * @param {number|null} duration
 * @returns {{max: number, value: number, disabled: boolean}}
 */
export function getScrubberState(currentTime, duration) {
  if (!hasKnownDuration(duration)) {
    return { max: 1, value: 0, disabled: true };
  }

  return {
    max: duration,
    value: Math.max(0, Math.min(duration, Number(currentTime) || 0)),
    disabled: false,
  };
}

/**
 * @param {number|null} playerTime
 * @param {number} fallbackTime
 * @param {{time: number, until: number}|null} optimisticSeek
 * @param {number} now
 * @returns {number}
 */
export function getOptimisticPlaybackTime(playerTime, fallbackTime, optimisticSeek, now = Date.now()) {
  const safePlayerTime = Number.isFinite(Number(playerTime)) ? Number(playerTime) : fallbackTime;
  if (!optimisticSeek || now >= optimisticSeek.until) return safePlayerTime;
  return Math.abs(safePlayerTime - optimisticSeek.time) <= 0.75
    ? safePlayerTime
    : optimisticSeek.time;
}

/**
 * @param {{left: number, width: number}} rect
 * @param {number} clientX
 * @param {number} duration
 * @returns {number}
 */
export function getScrubberSeekTime(rect, clientX, duration) {
  if (!Number.isFinite(rect.width) || rect.width <= 0 || !hasKnownDuration(duration)) return 0;
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return Math.round(ratio * duration * 100) / 100;
}

/**
 * @param {number} start
 * @param {number} currentTime
 * @returns {number}
 */
export function getDisplayedSequenceElapsed(start, currentTime) {
  if (!Number.isFinite(start) || !Number.isFinite(currentTime)) return 0;
  return Math.max(0, Math.floor(currentTime) - Math.floor(start));
}

/**
 * @param {object} sequence
 * @returns {string}
 */
function getSequenceKey(sequence) {
  return String(sequence?.id || `${sequence?.start}-${sequence?.end}-${sequence?.result || 'sequence'}`);
}

/**
 * @param {HTMLElement} container
 * @param {object} params
 * @returns {function}
 */
export function renderTagging(container, params = {}) {
  if (activeCleanup) activeCleanup();

  let disposed = false;
  let match = null;
  let settings = null;
  let state = createTaggerState();
  let currentTime = 0;
  let duration = null;
  let isPlaying = false;
  let statsOnlyMode = false;
  let sequencePrompt = null;
  let localVideo = null;
  let youtubePlayer = null;
  let youtubePlayerReady = false;
  let selectedPlaybackRate = 1;
  let selectedTimelineEventId = null;
  let selectedTimelineSequenceKey = null;
  let isEventInspectorEditing = false;
  let isSequenceInspectorEditing = false;
  let optimisticSeek = null;
  let ticker = null;
  let autoCloseTicker = null;
  let mediaResizeCleanup = null;
  let lastPossessionSaveAt = 0;
  let lastPersistedVideoDuration = null;
  let undoStack = [];
  let redoStack = [];

  const cleanup = () => {
    disposed = true;
    if (match) {
      syncPossessionProgress(getVisualCurrentTime());
      savePossession();
    }
    document.removeEventListener('keydown', handleKeydown);
    if (ticker) window.clearInterval(ticker);
    if (autoCloseTicker) window.clearInterval(autoCloseTicker);
    if (mediaResizeCleanup) mediaResizeCleanup();
    youtubePlayer?.destroy?.();
    youtubePlayer = null;
  };
  activeCleanup = cleanup;

  setSidebarExpanded(false);
  updateTopbarContext('Tagging');
  setTopbarActions([{ id: 'home', label: 'Inicio' }], (id) => navigate(id));

  container.innerHTML = `
    <section class="tagging-view view-enter" tabindex="-1">
      <div class="tagging-loading">Cargando partido...</div>
    </section>
  `;

  loadTaggingEntrypoint()
    .catch((error) => {
      if (disposed) return;
      container.innerHTML = `
        <div class="error-state">
          <h3 class="error-state-title">Error al cargar tagging</h3>
          <p class="error-state-text">${error.message || 'No se pudo abrir el partido'}</p>
          <button class="btn btn-primary" id="tagging-home-btn">Volver al inicio</button>
        </div>
      `;
      container.querySelector('#tagging-home-btn')?.addEventListener('click', () => navigate('home'));
    });

  return cleanup;

  async function loadTaggingEntrypoint() {
    if (params.matchId) {
      const [loadedMatch, loadedSettings] = await Promise.all([
        window.api.matches.getById(params.matchId),
        window.api.settings.get(),
      ]);
      if (disposed) return;
      settings = loadedSettings;
      initializeMatch(loadedMatch);
      return;
    }

    const matches = await window.api.matches.getAll();
    if (disposed) return;
    if (matches.length === 0) {
      renderNoMatch(container);
      return;
    }
    renderMatchSelection(container, matches);
  }

  /**
   * @param {object|null} loadedMatch
   */
  function initializeMatch(loadedMatch) {
    match = loadedMatch;
    state = createTaggerState({
      autoCloseMs: settings?.tagging?.autoCloseMs || 8000,
      possession: match?.possession,
    });
    statsOnlyMode = Boolean(settings?.statsOnlyMode);
    duration = getInitialTimelineDuration(match, statsOnlyMode, duration);
    lastPersistedVideoDuration = hasKnownDuration(match?.video?.duration) ? Number(match.video.duration) : null;

    if (!match) {
      renderNoMatch(container);
      return;
    }

    updateTopbarContext(getMatchTitle(match));
    setTopbarActions([{ id: 'dashboard', label: 'Ver Dashboard' }], () => navigate('dashboard', { matchId: match.id }));
    renderShell(container);
    wireMedia();
    document.addEventListener('keydown', handleKeydown);
    ticker = window.setInterval(tick, 250);
    autoCloseTicker = window.setInterval(checkAutoClose, 300);
    renderAll();
  }

  /**
   * @param {HTMLElement} host
   * @param {Array<object>} matches
   */
  function renderMatchSelection(host, matches) {
    const items = getTaggingMatchSelectionItems(matches);
    host.innerHTML = `
      <section class="tagging-match-select-view view-enter">
        <header class="tagging-match-select-header">
          <span>Tagging</span>
          <h1>Elegir video para taggear</h1>
          <p>Partidos disponibles ordenados por actividad reciente.</p>
        </header>
        <div class="tagging-match-select-grid" aria-label="Videos disponibles para tagging">
          ${items.map(item => `
            <button class="tagging-match-card" type="button" data-tagging-match-id="${escapeHtml(item.id)}" aria-label="Taggear ${escapeHtml(item.title)}">
              <span class="tagging-match-card-kicker">${escapeHtml(item.statusLabel)}</span>
              <strong class="tagging-match-card-title">${escapeHtml(item.title)}</strong>
              <span class="tagging-match-card-video">${escapeHtml(item.videoLabel)}</span>
              <span class="tagging-match-card-footer">
                <span>${escapeHtml(item.dateLabel)}</span>
                <span class="tabular-nums">${escapeHtml(item.scoreLabel)}</span>
              </span>
            </button>
          `).join('')}
        </div>
      </section>
    `;

    host.querySelectorAll('[data-tagging-match-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const selected = items.find(item => item.id === button.dataset.taggingMatchId);
        if (selected) navigate('tagging', { matchId: selected.id });
      });
    });
  }

  /**
   * @param {HTMLElement} host
   */
  function renderNoMatch(host) {
    host.innerHTML = `
      <section class="construction-view">
        <div class="construction-panel">
          <span class="construction-eyebrow">Tagging</span>
          <h1 class="construction-title">No hay partido activo</h1>
          <p class="construction-text">Creá o seleccioná un partido desde Inicio para comenzar el flujo de tagging.</p>
          <button class="btn btn-primary construction-back" id="go-home">Ir a Inicio</button>
        </div>
      </section>
    `;
    host.querySelector('#go-home')?.addEventListener('click', () => navigate('home'));
  }

  /**
   * @param {HTMLElement} host
   */
  function renderShell(host) {
    host.innerHTML = `
      <section class="tagging-view view-enter" tabindex="-1">
        <div class="tagging-main">
          <div class="tagging-video-stage">
            <div class="tagging-video-frame" id="tagging-video-frame">
              <div class="tagging-media-host" id="tagging-media-host"></div>
              <div class="tagging-timecode tabular-nums" id="tagging-timecode">00:00</div>
            </div>
            <aside class="tagging-side-panel" id="tagging-side-panel" aria-label="Panel operativo de tagging">
              <div class="tagging-status-panel" id="tagging-status-panel">
                <div class="status-panel-heading">
                  <span>Estado del partido</span>
                  <strong>Tagging en vivo</strong>
                </div>
                <section class="status-card status-score-card" aria-label="Marcador manual">
                  <div class="scoreboard-compact">
                    <div class="score-team-control">
                      <span id="score-home-label">Bigua</span>
                      <div class="score-stepper" aria-label="Puntos Bigua">
                        <button type="button" data-score-team="home" data-score-delta="-1" aria-label="Quitar punto local">-</button>
                        <button type="button" data-score-team="home" data-score-delta="1" aria-label="Agregar punto local">+</button>
                      </div>
                    </div>
                    <strong class="scoreline" aria-label="Marcador">
                      <span id="score-home">0</span>
                      <span>-</span>
                      <span id="score-away">0</span>
                    </strong>
                    <div class="score-team-control score-team-control-away">
                      <span id="score-away-label">Rival</span>
                      <div class="score-stepper" aria-label="Puntos rival">
                        <button type="button" data-score-team="away" data-score-delta="-1" aria-label="Quitar punto rival">-</button>
                        <button type="button" data-score-team="away" data-score-delta="1" aria-label="Agregar punto rival">+</button>
                      </div>
                    </div>
                  </div>
                </section>
                <section class="status-card status-possession-card" aria-label="Posesion">
                  <div class="status-card-header">
                    <span>Posesion</span>
                    <strong id="possession-split">Bigua 0% - 0% Rival</strong>
                  </div>
                  <div class="possession-meter" aria-hidden="true">
                    <span id="possession-home-bar"></span>
                    <span id="possession-away-bar"></span>
                  </div>
                  <button class="possession-reset-btn" type="button" data-possession-reset>Resetear posesion</button>
                </section>
                <section class="status-card status-sequence-card">
                  <span class="status-label">Secuencia</span>
                  <strong id="sequence-card">Q inicia secuencia</strong>
                  <small>Q inicia · E cierra</small>
                </section>
                <label class="status-card manual-timestamp">
                  <span>Timestamp manual</span>
                  <input type="text" id="manual-timestamp" placeholder="mm:ss o vacio" />
                </label>
              </div>
              <div class="tag-popup-host" id="tag-popup-host"></div>
              <div class="tag-popup-host sequence-popup-host" id="sequence-popup-host"></div>
              <div class="event-inspector-host" id="event-inspector-host"></div>
            </aside>
          </div>
          <div class="video-controls" id="video-controls">
            <button class="video-control-btn" type="button" data-action="back">-10s</button>
            <button class="video-play-btn" type="button" data-action="play">Play</button>
            <button class="video-control-btn" type="button" data-action="forward">+10s</button>
            <div class="video-scrubber-wrap">
              <input class="video-scrubber" type="range" min="0" max="1" step="0.1" value="0" id="video-scrubber" disabled />
              <span class="video-hover-time" id="video-hover-time"></span>
            </div>
            <span class="video-time-readout tabular-nums" id="video-time-readout">0:00 / --:--</span>
            <select class="video-speed" id="video-speed" aria-label="Velocidad">
              <option value="0.5">0.5x</option>
              <option value="1" selected>1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </div>
        </div>
        <div class="timeline-host" id="timeline-host"></div>
        <div class="hotkey-bar" id="hotkey-bar">
          <button class="hotkey-toggle" type="button" id="hotkey-toggle">Hotkeys</button>
          <div class="hotkey-items">
            ${Object.values(EVENT_DEFINITIONS).map(def => `<span><kbd>${def.hotkey}</kbd>${def.label}</span>`).join('')}
            <span><kbd>1</kbd>Posesion local</span>
            <span><kbd>2</kbd>Posesion rival</span>
            <span><kbd>Q</kbd>Inicio secuencia</span>
            <span><kbd>E</kbd>Fin secuencia</span>
          </div>
        </div>
      </section>
    `;

    container.querySelector('#hotkey-toggle')?.addEventListener('click', () => {
      container.querySelector('#hotkey-bar')?.classList.toggle('collapsed');
    });

    container.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => handleVideoAction(button.dataset.action));
    });

    container.querySelectorAll('[data-score-team]').forEach((button) => {
      button.addEventListener('click', () => {
        updateScore(button.dataset.scoreTeam, Number(button.dataset.scoreDelta));
      });
    });

    container.querySelector('[data-possession-reset]')?.addEventListener('click', resetPossessionWithWarning);

    const scrubber = /** @type {HTMLInputElement|null} */ (container.querySelector('#video-scrubber'));
    scrubber?.addEventListener('pointerdown', seekFromScrubberPointer);
    scrubber?.addEventListener('click', seekFromScrubberPointer);
    scrubber?.addEventListener('input', () => seekTo(Number(scrubber.value)));
    scrubber?.addEventListener('change', () => seekTo(Number(scrubber.value)));
    scrubber?.addEventListener('mousemove', (event) => updateScrubberPreview(event));
    scrubber?.addEventListener('mouseleave', () => {
      const preview = container.querySelector('#video-hover-time');
      if (preview) preview.textContent = '';
    });

    container.querySelector('#video-speed')?.addEventListener('change', (event) => {
      setPlaybackRate(Number(event.target.value));
    });
  }

  function wireMedia() {
    const mediaHost = container.querySelector('#tagging-media-host');
    if (!mediaHost || !match) return;
    if (mediaResizeCleanup) {
      mediaResizeCleanup();
      mediaResizeCleanup = null;
    }

    if (statsOnlyMode) {
      mediaHost.innerHTML = `
        <div class="stats-only-panel">
          <span>Modo solo estadisticas</span>
          <strong>Tagging sin reproductor</strong>
          <p>Usá el timestamp manual o dejalo vacío para eventos fuera de timeline.</p>
        </div>
      `;
      container.querySelector('#video-controls')?.classList.add('disabled');
      wireStatsOnlyMediaMetadata(mediaHost);
      return;
    }

    if (match.video?.type === 'youtube') {
      mediaHost.innerHTML = buildYouTubeIframeMarkup(match.video);
      const youtubeFrame = /** @type {HTMLIFrameElement|null} */ (container.querySelector('#youtube-player-frame'));
      const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => syncYouTubePlayerSize())
        : null;
      resizeObserver?.observe(mediaHost);
      window.addEventListener('resize', syncYouTubePlayerSize);
      mediaResizeCleanup = () => {
        window.removeEventListener('resize', syncYouTubePlayerSize);
        resizeObserver?.disconnect();
      };

      ensureYouTubeIframeApi()
        .then(() => {
          if (disposed || !youtubeFrame) return;
          youtubePlayer = new window.YT.Player(youtubeFrame, {
            events: {
              onReady: () => {
                if (disposed) return;
                youtubePlayerReady = true;
                container.querySelector('.youtube-loading-state')?.classList.add('hidden');
                syncYouTubePlayerSize();
                youtubePlayer.setPlaybackRate(selectedPlaybackRate);
                youtubePlayer.playVideo();
                isPlaying = true;
                renderControls();
              },
              onStateChange: (event) => {
                if (disposed) return;
                isPlaying = event.data === YOUTUBE_PLAYER_STATE.playing;
                if (event.data === YOUTUBE_PLAYER_STATE.ended || event.data === YOUTUBE_PLAYER_STATE.paused) {
                  isPlaying = false;
                }
                renderControls();
              },
              onError: (event) => {
                if (disposed) return;
                showYouTubeError(Number(event.data));
              },
            },
          });
          window.requestAnimationFrame(syncYouTubePlayerSize);
        })
        .catch(() => showYouTubeError(0));
      return;
    }

    if (match.video?.type === 'local') {
      const fileUrl = match.video.fileUrl || toFileUrl(match.video.path);
      mediaHost.innerHTML = `<video class="tagging-video" id="tagging-video" src="${fileUrl}" preload="metadata"></video>`;
      localVideo = /** @type {HTMLVideoElement|null} */ (container.querySelector('#tagging-video'));
      localVideo?.addEventListener('loadedmetadata', async () => {
        duration = Number.isFinite(localVideo.duration) ? localVideo.duration : null;
        await persistVideoDuration(duration);
        renderAll();
      });
      localVideo?.addEventListener('timeupdate', () => {
        syncPlaybackTime(localVideo.currentTime);
        renderControls();
        updateTimelinePlaybackView();
      });
      localVideo?.addEventListener('ended', () => {
        isPlaying = false;
        renderControls();
      });
      return;
    }

    mediaHost.innerHTML = `
      <div class="video-empty-state">
        <strong>Sin video cargado</strong>
        <p>Cargá un MP4 local sin copiar el archivo al proyecto.</p>
        <button class="btn btn-primary" type="button" id="load-local-video">Cargar MP4</button>
      </div>
    `;
    mediaHost.querySelector('#load-local-video')?.addEventListener('click', loadLocalVideo);
  }

  /**
   * @param {HTMLElement} mediaHost
   */
  function wireStatsOnlyMediaMetadata(mediaHost) {
    duration = getInitialTimelineDuration(match, statsOnlyMode, duration);
    if (hasKnownDuration(duration) || match?.video?.type !== 'local') {
      renderControls();
      renderTimelineView({ preserveScroll: true });
      return;
    }

    const metadataVideo = document.createElement('video');
    metadataVideo.preload = 'metadata';
    metadataVideo.src = match.video.fileUrl || toFileUrl(match.video.path);
    metadataVideo.style.display = 'none';
    metadataVideo.addEventListener('loadedmetadata', async () => {
      const nextDuration = Number(metadataVideo.duration);
      if (!hasKnownDuration(nextDuration)) return;
      duration = nextDuration;
      await persistVideoDuration(nextDuration);
      renderControls();
      renderTimelineView({ preserveScroll: true });
    });
    mediaHost.appendChild(metadataVideo);
  }

  /**
   * @param {number|null} nextDuration
   */
  async function persistVideoDuration(nextDuration) {
    if (!match?.video || !hasKnownDuration(nextDuration)) return;
    if (lastPersistedVideoDuration !== null && Math.abs(lastPersistedVideoDuration - nextDuration) < 0.5) return;
    lastPersistedVideoDuration = nextDuration;
    match = await window.api.matches.update(match.id, {
      video: {
        ...match.video,
        duration: nextDuration,
      },
    });
  }

  async function loadLocalVideo() {
    const selected = await window.api.media.selectLocalVideo();
    if (!selected || !match) return;
    match = await window.api.matches.update(match.id, { video: selected, status: 'tagging' });
    wireMedia();
    renderAll();
  }

  function renderAll() {
    renderControls();
    renderScoreboard();
    renderPopup();
    renderSequencePrompt();
    renderEventInspector();
    renderPossession();
    renderTimelineView();
  }

  function pushUndoSnapshot() {
    if (!match) return;
    undoStack.push(createTaggingHistorySnapshot(match, state.possession));
    if (undoStack.length > HISTORY_LIMIT) undoStack = undoStack.slice(-HISTORY_LIMIT);
    redoStack = [];
  }

  /**
   * @param {object} snapshot
   */
  async function restoreHistorySnapshot(snapshot) {
    if (!match || !snapshot) return;
    match = await window.api.matches.update(match.id, getHistoryRestorePayload(snapshot));
    state = {
      ...state,
      activePopup: null,
      possession: cloneHistoryValue(snapshot.possession),
      sequence: {
        ...state.sequence,
        active: null,
      },
    };
    selectedTimelineEventId = null;
    selectedTimelineSequenceKey = null;
    isEventInspectorEditing = false;
    isSequenceInspectorEditing = false;
    renderAll();
  }

  async function undoLastChange() {
    const snapshot = undoStack.pop();
    if (!snapshot || !match) return;
    redoStack.push(createTaggingHistorySnapshot(match, state.possession));
    await restoreHistorySnapshot(snapshot);
  }

  async function redoLastChange() {
    const snapshot = redoStack.pop();
    if (!snapshot || !match) return;
    undoStack.push(createTaggingHistorySnapshot(match, state.possession));
    await restoreHistorySnapshot(snapshot);
  }

  function getVisualCurrentTime() {
    return getOptimisticPlaybackTime(currentTime, currentTime, optimisticSeek, Date.now());
  }

  /**
   * @param {number} playerTime
   */
  function syncPlaybackTime(playerTime) {
    const now = Date.now();
    const safePlayerTime = Number.isFinite(Number(playerTime)) ? Number(playerTime) : currentTime;
    currentTime = getOptimisticPlaybackTime(safePlayerTime, currentTime, optimisticSeek, now);
    if (!optimisticSeek || now >= optimisticSeek.until || Math.abs(safePlayerTime - optimisticSeek.time) <= 0.75) {
      optimisticSeek = null;
    }
    syncPossessionProgress(currentTime);
  }

  /**
   * @param {number} timestamp
   */
  function syncPossessionProgress(timestamp) {
    const nextState = advancePossession(state, timestamp, POSSESSION_MAX_GAP_SECONDS);
    if (nextState === state) return;
    state = nextState;
    renderPossession();

    const now = Date.now();
    if (now - lastPossessionSaveAt >= POSSESSION_SAVE_INTERVAL_MS) {
      lastPossessionSaveAt = now;
      savePossession();
    }
  }

  function renderControls() {
    const timecode = container.querySelector('#tagging-timecode');
    const readout = container.querySelector('#video-time-readout');
    const playButton = container.querySelector('[data-action="play"]');
    const scrubber = /** @type {HTMLInputElement|null} */ (container.querySelector('#video-scrubber'));
    const visualCurrentTime = getVisualCurrentTime();
    const scrubberState = getScrubberState(visualCurrentTime, duration);
    if (timecode) timecode.textContent = formatClock(visualCurrentTime);
    if (readout) readout.textContent = formatVideoReadout(visualCurrentTime, duration);
    if (playButton) playButton.textContent = isPlaying ? 'Pause' : 'Play';
    if (scrubber) {
      const progress = scrubberState.disabled ? 0 : (scrubberState.value / scrubberState.max) * 100;
      scrubber.max = String(scrubberState.max);
      scrubber.value = String(scrubberState.value);
      scrubber.disabled = scrubberState.disabled;
      scrubber.style.setProperty('--scrubber-progress', `${Math.max(0, Math.min(100, progress))}%`);
    }
  }

  function renderPopup() {
    const host = /** @type {HTMLElement|null} */ (container.querySelector('#tag-popup-host'));
    if (!host || !match) return;
    renderTagPopup(host, state, {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      roster: getRoster(match),
    }, {
      onClose: () => {
        closeActivePopupAnimated();
      },
      onComplete: () => completeActivePopup(),
      onMic: () => startSpeechNote(),
      onNote: (note) => {
        state = updatePopupNote(state, note);
      },
      onOption: (value) => {
        handlePopupOption(value);
      },
      onZone: (zone) => {
        state = selectPopupZone(state, zone);
        renderPopup();
      },
    });
    syncSidePanelMode();
  }

  function renderSequencePrompt() {
    const host = container.querySelector('#sequence-popup-host');
    if (!host) return;
    if (!sequencePrompt) {
      host.innerHTML = '';
      syncSidePanelMode();
      return;
    }

    host.innerHTML = `
      <section class="tag-popup sequence-popup" role="dialog" aria-label="Resultado de secuencia">
        <header class="tag-popup-header">
          <div>
            <p class="tag-popup-kicker">Secuencia</p>
            <h2>Resultado <span>E</span></h2>
          </div>
          <button class="tag-popup-close" type="button" data-sequence-close>x</button>
        </header>
        <div class="tag-popup-options">
          ${SEQUENCE_RESULT_OPTIONS.map((option, index) => `
            <button class="tag-popup-option" type="button" data-sequence-result="${option.value}">
              <kbd>${index + 1}</kbd>
              <span>${option.label}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `;
    host.querySelector('[data-sequence-close]')?.addEventListener('click', () => {
      sequencePrompt = null;
      renderSequencePrompt();
    });
    host.querySelectorAll('[data-sequence-result]').forEach((button) => {
      button.addEventListener('click', () => saveSequence(button.dataset.sequenceResult));
    });
    syncSidePanelMode();
  }

  function renderEventInspector() {
    const host = /** @type {HTMLElement|null} */ (container.querySelector('#event-inspector-host'));
    if (!host || !match) return;

    const selectedSequence = (match.sequences || []).find(sequence => getSequenceKey(sequence) === selectedTimelineSequenceKey);
    if (selectedSequence) {
      const sequenceDuration = Number.isFinite(selectedSequence.duration)
        ? selectedSequence.duration
        : selectedSequence.end - selectedSequence.start;
      const sequenceName = selectedSequence.name?.trim() || formatEventValue(selectedSequence.result);
      const metaRows = [
        { label: 'Resultado', value: formatEventValue(selectedSequence.result) },
        { label: 'Fases', value: String(selectedSequence.phases ?? 0) },
        { label: 'Zona inicio', value: selectedSequence.zoneStart || 'Sin dato' },
        { label: 'Zona fin', value: selectedSequence.zoneEnd || 'Sin dato' },
      ];
      const selectedColor = selectedSequence.color || 'red';

      host.innerHTML = `
        <section class="event-inspector sequence-inspector" role="dialog" aria-label="Detalle de la secuencia seleccionada">
          <header class="event-inspector-header">
            <div>
              <p class="event-inspector-kicker">Secuencia seleccionada</p>
              <h2>${escapeHtml(sequenceName)}</h2>
            </div>
            <div class="event-inspector-actions">
              ${!isSequenceInspectorEditing ? '<button class="btn btn-secondary btn-sm" type="button" data-sequence-edit>Editar</button>' : ''}
              <button class="event-inspector-close" type="button" data-event-close aria-label="Cerrar detalle">x</button>
            </div>
          </header>
          ${!isSequenceInspectorEditing ? `
          <div class="sequence-inspector-time-grid">
            <div class="sequence-inspector-stat">
              <span>Inicio</span>
              <strong>${formatClock(selectedSequence.start)}</strong>
            </div>
            <div class="sequence-inspector-stat">
              <span>Hasta</span>
              <strong>${formatClock(selectedSequence.end)}</strong>
            </div>
            <div class="sequence-inspector-stat">
              <span>Duracion</span>
              <strong>${formatClock(sequenceDuration)}</strong>
            </div>
          </div>
          <div class="sequence-inspector-meta-grid">
            ${metaRows.map(row => `
              <div class="sequence-inspector-stat">
                <span>${escapeHtml(row.label)}</span>
                <strong>${escapeHtml(row.value)}</strong>
              </div>
            `).join('')}
          </div>
          ` : ''}
          ${isSequenceInspectorEditing ? `
            <div class="event-inspector-form sequence-inspector-form">
              <label class="event-inspector-field">
                <span>Nombre opcional</span>
                <input type="text" data-sequence-name value="${escapeHtml(selectedSequence.name || '')}" placeholder="Ej: Ataque 22m" />
              </label>
              <label class="event-inspector-field">
                <span>Inicio</span>
                <input type="text" data-sequence-start value="${escapeHtml(formatClock(selectedSequence.start))}" placeholder="mm:ss" />
              </label>
              <label class="event-inspector-field">
                <span>Hasta</span>
                <input type="text" data-sequence-end value="${escapeHtml(formatClock(selectedSequence.end))}" placeholder="mm:ss" />
              </label>
              <label class="event-inspector-field">
                <span>Resultado</span>
                <select data-sequence-result-edit>
                  ${SEQUENCE_RESULT_OPTIONS.map(option => `
                    <option value="${option.value}"${selectedSequence.result === option.value ? ' selected' : ''}>${option.label}</option>
                  `).join('')}
                </select>
              </label>
              <label class="event-inspector-field">
                <span>Fases</span>
                <input type="number" min="0" step="1" data-sequence-phases value="${Number(selectedSequence.phases ?? 0)}" />
              </label>
              ${renderInspectorZonePicker('Zona inicio', 'data-sequence-zone-start', selectedSequence.zoneStart)}
              ${renderInspectorZonePicker('Zona fin', 'data-sequence-zone-end', selectedSequence.zoneEnd)}
              <fieldset class="sequence-color-field">
                <legend>Color</legend>
                <div class="sequence-color-grid">
                  ${SEQUENCE_COLOR_CHOICES.map(color => `
                    <label class="sequence-color-option">
                      <input type="radio" name="sequence-color" data-sequence-color value="${color.value}"${selectedColor === color.value ? ' checked' : ''} />
                      <span class="sequence-color-swatch" style="--sequence-color:${color.color}"></span>
                      <strong>${color.label}</strong>
                    </label>
                  `).join('')}
                </div>
              </fieldset>
            </div>
          ` : ''}
          <footer class="event-inspector-footer">
            <button class="btn event-delete-btn btn-sm" type="button" data-sequence-delete>Borrar</button>
            ${isSequenceInspectorEditing ? `
              <div class="event-inspector-save-actions">
                <button class="btn btn-secondary btn-sm" type="button" data-sequence-cancel-edit>Cancelar</button>
                <button class="btn btn-primary btn-sm" type="button" data-sequence-save>Guardar</button>
              </div>
            ` : ''}
          </footer>
        </section>
      `;

      host.querySelector('[data-event-close]')?.addEventListener('click', closeEventInspector);
      wireInspectorZonePickers(host);
      host.querySelector('[data-sequence-edit]')?.addEventListener('click', () => {
        isSequenceInspectorEditing = true;
        renderEventInspector();
      });
      host.querySelector('[data-sequence-cancel-edit]')?.addEventListener('click', () => {
        isSequenceInspectorEditing = false;
        renderEventInspector();
      });
      host.querySelector('[data-sequence-save]')?.addEventListener('click', saveSelectedTimelineSequence);
      host.querySelector('[data-sequence-delete]')?.addEventListener('click', deleteSelectedTimelineSequence);
      syncSidePanelMode();
      return;
    }

    const selectedEvent = (match.events || []).find(event => event.id === selectedTimelineEventId);
    if (!selectedEvent) {
      host.innerHTML = '';
      selectedTimelineEventId = null;
      selectedTimelineSequenceKey = null;
      isEventInspectorEditing = false;
      isSequenceInspectorEditing = false;
      syncSidePanelMode();
      return;
    }

    const rows = getTimelineEventDetails(selectedEvent, match);
    host.innerHTML = `
      <section class="event-inspector" role="dialog" aria-label="Detalle del evento seleccionado">
        <header class="event-inspector-header">
          <div>
            <p class="event-inspector-kicker">Evento seleccionado</p>
            <h2>${escapeHtml(getTimelineEventTitle(selectedEvent))}</h2>
          </div>
          <div class="event-inspector-actions">
            ${!isEventInspectorEditing ? '<button class="btn btn-secondary btn-sm" type="button" data-event-edit>Editar</button>' : ''}
            <button class="event-inspector-close" type="button" data-event-close aria-label="Cerrar detalle">x</button>
          </div>
        </header>
        ${!isEventInspectorEditing ? `
        <div class="event-inspector-meta-grid">
          ${rows.map(row => `
            <div class="event-inspector-stat">
              <span>${escapeHtml(row.label)}</span>
              <strong>${escapeHtml(row.value)}</strong>
            </div>
          `).join('')}
        </div>
        ` : ''}
        ${isEventInspectorEditing ? `
          <div class="event-inspector-form">
            <label class="event-inspector-field">
              <span>Timestamp</span>
              <input type="text" data-inspector-timestamp value="${escapeHtml(formatClock(selectedEvent.timestamp))}" placeholder="mm:ss" />
            </label>
            <label class="event-inspector-field">
              <span>Equipo</span>
              <select data-inspector-team>
                <option value="home"${selectedEvent.team !== 'away' ? ' selected' : ''}>${escapeHtml(match.homeTeam || 'Bigua')}</option>
                <option value="away"${selectedEvent.team === 'away' ? ' selected' : ''}>${escapeHtml(match.awayTeam || 'Rival')}</option>
              </select>
            </label>
            <label class="event-inspector-field">
              <span>Resultado</span>
              <input type="text" data-inspector-result value="${escapeHtml(formatEventValue(selectedEvent.result || ''))}" placeholder="Resultado" />
            </label>
            <label class="event-inspector-field">
              <span>Subtipo</span>
              <input type="text" data-inspector-subtype value="${escapeHtml(selectedEvent.subtype || '')}" placeholder="Subtipo" />
            </label>
            ${renderInspectorZonePicker('Zona', 'data-inspector-zone', selectedEvent.zone)}
            <label class="event-inspector-field">
              <span>Jugador</span>
              <input type="text" data-inspector-player value="${escapeHtml(selectedEvent.player || '')}" placeholder="Jugador" />
            </label>
            <label class="event-inspector-note">
              <span>Editar nota</span>
              <textarea rows="4" data-event-note-edit placeholder="Detalle del evento">${escapeHtml(selectedEvent.note || '')}</textarea>
            </label>
          </div>
        ` : ''}
        <footer class="event-inspector-footer">
          <button class="btn event-delete-btn btn-sm" type="button" data-event-delete>Borrar</button>
          ${isEventInspectorEditing ? `
            <div class="event-inspector-save-actions">
              <button class="btn btn-secondary btn-sm" type="button" data-event-cancel-edit>Cancelar</button>
              <button class="btn btn-primary btn-sm" type="button" data-event-save>Guardar</button>
            </div>
          ` : ''}
        </footer>
      </section>
    `;

    host.querySelector('[data-event-close]')?.addEventListener('click', closeEventInspector);
    wireInspectorZonePickers(host);
    host.querySelector('[data-event-edit]')?.addEventListener('click', () => {
      isEventInspectorEditing = true;
      renderEventInspector();
    });
    host.querySelector('[data-event-cancel-edit]')?.addEventListener('click', () => {
      isEventInspectorEditing = false;
      renderEventInspector();
    });
    host.querySelector('[data-event-save]')?.addEventListener('click', saveSelectedTimelineEvent);
    host.querySelector('[data-event-delete]')?.addEventListener('click', deleteSelectedTimelineEvent);
    syncSidePanelMode();
  }

  function syncSidePanelMode() {
    const sidePanel = container.querySelector('#tagging-side-panel');
    const hasActivePopup = Boolean(state.activePopup || sequencePrompt);
    const hasEventInspector = Boolean((selectedTimelineEventId || selectedTimelineSequenceKey) && !hasActivePopup);
    sidePanel?.classList.toggle('has-active-popup', hasActivePopup);
    sidePanel?.classList.toggle('has-event-inspector', hasEventInspector);
  }

  /**
   * @param {HTMLElement} host
   */
  function wireInspectorZonePickers(host) {
    host.querySelectorAll('[data-zone-picker-value]').forEach((button) => {
      button.addEventListener('click', () => {
        const picker = button.closest('[data-zone-picker]');
        const targetAttribute = button.dataset.zoneTarget;
        const selectedZone = button.dataset.zonePickerValue || '';
        const input = targetAttribute ? host.querySelector(`[${targetAttribute}]`) : null;
        const nextZone = getToggledZone(input?.value, selectedZone);
        const selectedLabel = picker?.querySelector('[data-zone-picker-selected]');
        const details = button.closest('details');

        if (input) input.value = nextZone;
        if (selectedLabel) selectedLabel.textContent = nextZone || 'Sin dato';
        picker?.querySelectorAll('[data-zone-picker-value]').forEach((zoneButton) => {
          zoneButton.classList.toggle('active', Boolean(nextZone) && zoneButton.dataset.zonePickerValue === nextZone);
        });
        if (details) details.open = false;
      });
    });
  }

  function renderPossession() {
    const visualCurrentTime = getVisualCurrentTime();
    const percentages = calculatePossessionPercentages(state.possession, visualCurrentTime);
    const split = container.querySelector('#possession-split');
    const homeBar = /** @type {HTMLElement|null} */ (container.querySelector('#possession-home-bar'));
    const awayBar = /** @type {HTMLElement|null} */ (container.querySelector('#possession-away-bar'));
    const sequenceCard = container.querySelector('#sequence-card');
    const homeTeam = match?.homeTeam || 'Bigua';
    const awayTeam = match?.awayTeam || 'Rival';
    if (split) split.textContent = `${homeTeam} ${percentages.home}% - ${percentages.away}% ${awayTeam}`;
    if (homeBar) homeBar.style.width = `${percentages.home}%`;
    if (awayBar) awayBar.style.width = `${percentages.away}%`;
    if (sequenceCard) {
      if (state.sequence.active) {
        sequenceCard.innerHTML = `<span class="sequence-recording-dot" aria-hidden="true"></span>Secuencia activa desde ${formatClock(state.sequence.active.start)}<span class="sequence-live-end">Hasta ${formatClock(visualCurrentTime)} | Va ${formatClock(getDisplayedSequenceElapsed(state.sequence.active.start, visualCurrentTime))}</span>`;
        return;
      }
      sequenceCard.innerHTML = 'Q inicia secuencia';
    }
  }

  function renderScoreboard() {
    if (!match) return;
    const homeScore = Math.max(0, Number(match.homeScore) || 0);
    const awayScore = Math.max(0, Number(match.awayScore) || 0);
    const home = container.querySelector('#score-home');
    const away = container.querySelector('#score-away');
    const homeLabel = container.querySelector('#score-home-label');
    const awayLabel = container.querySelector('#score-away-label');

    if (home) home.textContent = String(homeScore);
    if (away) away.textContent = String(awayScore);
    if (homeLabel) homeLabel.textContent = match.homeTeam || 'Bigua';
    if (awayLabel) awayLabel.textContent = match.awayTeam || 'Rival';
  }

  function getTimelinePossessionScaleEnd() {
    if (hasKnownDuration(duration)) return duration;
    return Math.max(getVisualCurrentTime(), ...getPossessionTimelineSegments(state.possession).map(segment => segment.end), 1);
  }

  function updateTimelinePlaybackView() {
    const host = /** @type {HTMLElement|null} */ (container.querySelector('#timeline-host'));
    if (!host) return;
    updateTimelinePlayback(host, getVisualCurrentTime());
  }

  function renderTimelineView(options = {}) {
    const host = /** @type {HTMLElement|null} */ (container.querySelector('#timeline-host'));
    if (!host || !match) return;
    renderTimeline(host, {
      events: match.events || [],
      sequences: match.sequences || [],
      possessionSegments: getPossessionTimelineSegments(state.possession, getTimelinePossessionScaleEnd()),
      currentTime: getVisualCurrentTime(),
      duration,
      selectedSequenceKey: selectedTimelineSequenceKey,
      onSeek: seekTo,
      onEventSelect: selectTimelineEvent,
      onSequenceSelect: selectTimelineSequence,
      onEventMove: moveTimelineEvent,
      preserveScroll: options.preserveScroll,
    });
  }

  /**
   * @param {object|null} event
   */
  function selectTimelineEvent(event) {
    if (!event?.id) return;
    selectedTimelineEventId = event.id;
    selectedTimelineSequenceKey = null;
    isEventInspectorEditing = false;
    isSequenceInspectorEditing = false;
    renderEventInspector();
    renderTimelineView();
  }

  async function moveTimelineEvent(event, timestamp) {
    if (!match || !event?.id || !Number.isFinite(timestamp)) return;
    pushUndoSnapshot();
    await window.api.events.update(match.id, event.id, { timestamp });
    match = await window.api.matches.getById(match.id);
    selectedTimelineEventId = event.id;
    selectedTimelineSequenceKey = null;
    isEventInspectorEditing = false;
    isSequenceInspectorEditing = false;
    seekTo(timestamp);
    renderAll();
  }

  /**
   * @param {object|null} sequence
   */
  function selectTimelineSequence(sequence) {
    if (!sequence) return;
    selectedTimelineEventId = null;
    selectedTimelineSequenceKey = getSequenceKey(sequence);
    isEventInspectorEditing = false;
    isSequenceInspectorEditing = false;
    renderEventInspector();
    seekTo(Number(sequence.start));
    renderTimelineView();
  }

  function closeEventInspector() {
    selectedTimelineEventId = null;
    selectedTimelineSequenceKey = null;
    isEventInspectorEditing = false;
    isSequenceInspectorEditing = false;
    renderEventInspector();
    renderTimelineView();
  }

  function readInspectorForm() {
    const timestampInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-inspector-timestamp]'));
    const teamInput = /** @type {HTMLSelectElement|null} */ (container.querySelector('[data-inspector-team]'));
    const resultInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-inspector-result]'));
    const subtypeInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-inspector-subtype]'));
    const zoneInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-inspector-zone]'));
    const playerInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-inspector-player]'));
    const noteInput = /** @type {HTMLTextAreaElement|null} */ (container.querySelector('[data-event-note-edit]'));
    const selectedEvent = (match?.events || []).find(event => event.id === selectedTimelineEventId);
    const timestamp = parseManualTimestamp(timestampInput?.value || '');

    return {
      timestamp: timestamp ?? selectedEvent?.timestamp ?? null,
      team: teamInput?.value || 'home',
      result: normalizeEventResultInput(resultInput?.value || ''),
      subtype: subtypeInput?.value.trim() || '',
      zone: zoneInput?.value.trim() || null,
      player: playerInput?.value.trim() || '',
      note: noteInput?.value || '',
    };
  }

  function readSequenceInspectorForm() {
    const nameInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-name]'));
    const startInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-start]'));
    const endInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-end]'));
    const resultInput = /** @type {HTMLSelectElement|null} */ (container.querySelector('[data-sequence-result-edit]'));
    const phasesInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-phases]'));
    const zoneStartInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-zone-start]'));
    const zoneEndInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-zone-end]'));
    const colorInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-color]:checked'));
    const selectedSequence = (match?.sequences || []).find(sequence => getSequenceKey(sequence) === selectedTimelineSequenceKey);
    const start = parseManualTimestamp(startInput?.value || '') ?? selectedSequence?.start ?? 0;
    const end = parseManualTimestamp(endInput?.value || '') ?? selectedSequence?.end ?? start;
    const normalizedStart = Math.max(0, start);
    const normalizedEnd = Math.max(normalizedStart, end);
    const phases = Number(phasesInput?.value);

    return {
      name: nameInput?.value.trim() || '',
      start: normalizedStart,
      end: normalizedEnd,
      duration: Number((normalizedEnd - normalizedStart).toFixed(2)),
      result: resultInput?.value || selectedSequence?.result || 'try',
      phases: Number.isFinite(phases) && phases >= 0 ? Math.floor(phases) : selectedSequence?.phases ?? 0,
      zoneStart: zoneStartInput?.value.trim() || null,
      zoneEnd: zoneEndInput?.value.trim() || null,
      color: colorInput?.value || selectedSequence?.color || 'red',
    };
  }

  async function saveSelectedTimelineEvent() {
    if (!match || !selectedTimelineEventId) return;
    pushUndoSnapshot();
    await window.api.events.update(match.id, selectedTimelineEventId, readInspectorForm());
    match = await window.api.matches.getById(match.id);
    isEventInspectorEditing = false;
    renderAll();
  }

  async function deleteSelectedTimelineEvent() {
    if (!match || !selectedTimelineEventId) return;
    pushUndoSnapshot();
    await window.api.events.delete(match.id, selectedTimelineEventId);
    selectedTimelineEventId = null;
    selectedTimelineSequenceKey = null;
    isEventInspectorEditing = false;
    isSequenceInspectorEditing = false;
    match = await window.api.matches.getById(match.id);
    renderAll();
  }

  async function saveSelectedTimelineSequence() {
    if (!match || !selectedTimelineSequenceKey) return;
    const updates = readSequenceInspectorForm();
    const nextSequences = (match.sequences || []).map(sequence => (
      getSequenceKey(sequence) === selectedTimelineSequenceKey
        ? { ...sequence, ...updates }
        : sequence
    ));
    pushUndoSnapshot();
    match = await window.api.matches.update(match.id, {
      sequences: nextSequences,
    });
    isSequenceInspectorEditing = false;
    renderAll();
  }

  async function deleteSelectedTimelineSequence() {
    if (!match || !selectedTimelineSequenceKey) return;
    const nextSequences = (match.sequences || [])
      .filter(sequence => getSequenceKey(sequence) !== selectedTimelineSequenceKey);
    pushUndoSnapshot();
    match = await window.api.matches.update(match.id, {
      sequences: nextSequences,
    });
    selectedTimelineSequenceKey = null;
    isEventInspectorEditing = false;
    isSequenceInspectorEditing = false;
    renderAll();
  }

  function handleVideoAction(action) {
    if (action === 'play') togglePlay();
    if (action === 'back') seekBy(-10);
    if (action === 'forward') seekBy(10);
  }

  function togglePlay() {
    if (statsOnlyMode) return;
    if (localVideo) {
      if (localVideo.paused) {
        localVideo.play();
        isPlaying = true;
      } else {
        localVideo.pause();
        isPlaying = false;
      }
      renderControls();
      return;
    }

    if (youtubePlayer && youtubePlayerReady) {
      isPlaying = !isPlaying;
      if (isPlaying) {
        youtubePlayer.playVideo();
      } else {
        youtubePlayer.pauseVideo();
      }
      renderControls();
    }
  }

  function syncYouTubePlayerSize() {
    if (!youtubePlayer || !youtubePlayerReady) return;
    const player = youtubePlayer;
    const mediaHost = container.querySelector('#tagging-media-host');
    if (!mediaHost) return;
    const rect = mediaHost.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    player.setSize(width, height);
  }

  /**
   * @param {number} code
   */
  function showYouTubeError(code) {
    const errorEl = container.querySelector('#youtube-error-state');
    if (!errorEl) return;
    errorEl.textContent = getYouTubeErrorMessage(code);
    errorEl.classList.remove('hidden');
    container.querySelector('.youtube-loading-state')?.classList.add('hidden');
    isPlaying = false;
    renderControls();
  }

  function seekBy(delta) {
    seekTo(Math.max(0, currentTime + delta));
  }

  function seekTo(seconds) {
    const requestedTime = Math.max(0, Number(seconds) || 0);
    if (!localVideo && !youtubePlayer) {
      currentTime = hasKnownDuration(duration)
        ? Math.min(duration, requestedTime)
        : requestedTime;
      optimisticSeek = null;
      renderControls();
      updateTimelinePlaybackView();
      return;
    }

    currentTime = hasKnownDuration(duration)
      ? Math.min(duration, requestedTime)
      : requestedTime;
    optimisticSeek = { time: currentTime, until: Date.now() + SEEK_VISUAL_LOCK_MS };
    if (localVideo) localVideo.currentTime = currentTime;
    if (youtubePlayer && youtubePlayerReady) youtubePlayer.seekTo(currentTime, true);
    renderControls();
    updateTimelinePlaybackView();
    renderPossession();
  }

  function setPlaybackRate(rate) {
    selectedPlaybackRate = rate;
    if (localVideo) localVideo.playbackRate = rate;
    if (youtubePlayer && youtubePlayerReady) youtubePlayer.setPlaybackRate(rate);
  }

  function tick() {
    if (statsOnlyMode) return;
    if (youtubePlayer && youtubePlayerReady) {
      syncYouTubePlayerSize();
      syncPlaybackTime(youtubePlayer.getCurrentTime());
      const nextDuration = Number(youtubePlayer.getDuration());
      const durationChanged = hasKnownDuration(nextDuration) && Math.abs((duration || 0) - nextDuration) >= 0.5;
      duration = hasKnownDuration(nextDuration) ? nextDuration : duration;
      persistVideoDuration(nextDuration);
      isPlaying = youtubePlayer.getPlayerState() === YOUTUBE_PLAYER_STATE.playing;
      renderControls();
      if (durationChanged) {
        renderTimelineView({ preserveScroll: true });
      } else {
        updateTimelinePlaybackView();
      }
    }
    renderPossession();
  }

  function updateScrubberPreview(event) {
    const scrubber = /** @type {HTMLInputElement} */ (event.currentTarget);
    const preview = container.querySelector('#video-hover-time');
    if (!preview) return;
    if (!hasKnownDuration(duration)) {
      preview.textContent = '';
      return;
    }
    const rect = scrubber.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    preview.textContent = formatClock(ratio * duration);
    preview.setAttribute('style', `left:${ratio * 100}%`);
  }

  /**
   * @param {PointerEvent|MouseEvent} event
   */
  function seekFromScrubberPointer(event) {
    if (!hasKnownDuration(duration)) return;
    const scrubber = /** @type {HTMLInputElement} */ (event.currentTarget);
    seekTo(getScrubberSeekTime(scrubber.getBoundingClientRect(), event.clientX, duration));
  }

  function getTagTimestamp() {
    if (statsOnlyMode) {
      const manual = /** @type {HTMLInputElement|null} */ (container.querySelector('#manual-timestamp'));
      return parseManualTimestamp(manual?.value || '');
    }
    return getVisualCurrentTime();
  }

  /**
   * @param {string} value
   * @returns {number|null}
   */
  function parseManualTimestamp(value) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+:\d{1,2}$/.test(trimmed)) {
      const [minutes, seconds] = trimmed.split(':').map(Number);
      return minutes * 60 + seconds;
    }
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }

  async function handlePopupOption(value) {
    const result = selectPopupOption(state, value);
    state = result.state;
    if (result.completed && result.event) {
      await saveEvent(result.event);
    }
    renderAll();
  }

  async function completeActivePopup() {
    const result = completePopup(state);
    state = result.state;
    if (result.completed && result.event) {
      await saveEvent(result.event);
    }
    renderAll();
  }

  async function saveEvent(event) {
    if (!match) return;
    const eventPayload = buildEventPayload(event);
    pushUndoSnapshot();
    await window.api.events.add(match.id, eventPayload);
    const pointsDelta = getScoreDeltaForEvent(eventPayload);
    if (pointsDelta > 0) {
      match = await window.api.matches.update(match.id, {
        ...getUpdatedScore(match, eventPayload.team === 'away' ? 'away' : 'home', pointsDelta),
        status: match.status === 'created' ? 'tagging' : match.status,
      });
      return;
    }
    match = await window.api.matches.getById(match.id);
  }

  async function savePossession() {
    if (!match) return;
    match = await window.api.matches.update(match.id, {
      possession: state.possession,
      status: match.status === 'created' ? 'tagging' : match.status,
    });
  }

  async function resetPossessionWithWarning() {
    if (!match) return;
    const confirmed = window.confirm('Esto va a borrar toda la posesion marcada en este partido. Continuar?');
    if (!confirmed) return;
    pushUndoSnapshot();
    state = resetPossession(state);
    await savePossession();
    renderPossession();
    renderTimelineView();
  }

  /**
   * @param {string} team
   * @param {number} delta
   */
  async function updateScore(team, delta) {
    if (!match || (team !== 'home' && team !== 'away')) return;
    pushUndoSnapshot();
    match = await window.api.matches.update(match.id, {
      ...getUpdatedScore(match, team, delta),
      status: match.status === 'created' ? 'tagging' : match.status,
    });
    renderScoreboard();
  }

  async function saveSequence(result) {
    if (!match || !sequencePrompt) return;
    pushUndoSnapshot();
    const finished = finishSequence(state, sequencePrompt.timestamp, result);
    state = finished.state;
    sequencePrompt = null;
    if (finished.sequence) {
      const enrichedSequence = enrichSequenceFromEvents(finished.sequence, match.events || []);
      match = await window.api.matches.update(match.id, {
        sequences: [...(match.sequences || []), { ...enrichedSequence, color: enrichedSequence.color || 'red' }],
        status: match.status === 'created' ? 'tagging' : match.status,
      });
    }
    renderAll();
  }

  function startSpeechNote() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const noteInput = /** @type {HTMLTextAreaElement|null} */ (container.querySelector('[data-popup-note]'));
    if (!SpeechRecognition || !noteInput) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0]?.transcript || '')
        .join(' ')
        .trim();
      const nextNote = [noteInput.value, transcript].filter(Boolean).join(' ');
      noteInput.value = nextNote;
      state = updatePopupNote(state, nextNote);
    };
    recognition.start();
  }

  function checkAutoClose() {
    if (!shouldAutoClosePopup(state)) return;
    closeActivePopupAnimated();
  }

  function closeActivePopupAnimated() {
    const popupEl = container.querySelector('#tag-popup-host .tag-popup');
    if (!popupEl) {
      state = closePopup(state);
      renderPopup();
      return;
    }

    popupEl.classList.add('closing');
    window.setTimeout(() => {
      state = closePopup(state);
      renderPopup();
    }, 80);
  }

  /**
   * @param {KeyboardEvent} event
   */
  function handleKeydown(event) {
    const key = event.key.toUpperCase();
    const popupHost = /** @type {HTMLElement|null} */ (container.querySelector('#tag-popup-host'));

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !isEditableTarget(event.target)) {
      event.preventDefault();
      event.shiftKey ? redoLastChange() : undoLastChange();
      return;
    }

    if (state.activePopup) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActivePopupAnimated();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        completeActivePopup();
        return;
      }
      if (/^[1-9]$/.test(event.key) && popupHost) {
        const zone = getPopupZoneByNumber(popupHost, event.key);
        const option = zone ? null : getPopupOptionByNumber(popupHost, event.key);
        if (zone) {
          event.preventDefault();
          state = selectPopupZone(state, zone);
          renderPopup();
          return;
        }
        if (option) {
          event.preventDefault();
          handlePopupOption(option);
          return;
        }
      }
      if (!isEditableTarget(event.target) && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        const note = /** @type {HTMLTextAreaElement|null} */ (container.querySelector('[data-popup-note]'));
        if (note) {
          event.preventDefault();
          note.focus();
          note.value += event.key;
          state = updatePopupNote(state, note.value);
        }
      }
      return;
    }

    if (sequencePrompt) {
      if (event.key === 'Escape') {
        event.preventDefault();
        sequencePrompt = null;
        renderSequencePrompt();
        return;
      }
      if (/^[1-5]$/.test(event.key)) {
        event.preventDefault();
        saveSequence(SEQUENCE_RESULT_OPTIONS[Number(event.key) - 1].value);
        return;
      }
    }

    if ((selectedTimelineEventId || selectedTimelineSequenceKey) && event.key === 'Escape') {
      event.preventDefault();
      closeEventInspector();
      return;
    }

    if (isEditableTarget(event.target)) return;

    if ((selectedTimelineEventId || selectedTimelineSequenceKey) && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      if (selectedTimelineSequenceKey) {
        deleteSelectedTimelineSequence();
      } else {
        deleteSelectedTimelineEvent();
      }
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      togglePlay();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seekBy(-5);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      seekBy(5);
      return;
    }
    if (key === '1' || key === '2') {
      event.preventDefault();
      const possessionTimestamp = getTagTimestamp() || currentTime;
      pushUndoSnapshot();
      state = advancePossession(state, possessionTimestamp, POSSESSION_MAX_GAP_SECONDS);
      state = togglePossession(state, key === '1' ? 'home' : 'away', possessionTimestamp);
      savePossession();
      renderPossession();
      renderTimelineView();
      return;
    }
    if (key === 'Q') {
      event.preventDefault();
      state = startSequence(state, getTagTimestamp() || currentTime);
      renderPossession();
      return;
    }
    if (key === 'E' && state.sequence.active) {
      event.preventDefault();
      sequencePrompt = { timestamp: getTagTimestamp() || currentTime };
      renderSequencePrompt();
      return;
    }
    if (EVENT_DEFINITIONS[key]) {
      event.preventDefault();
      selectedTimelineEventId = null;
      selectedTimelineSequenceKey = null;
      isEventInspectorEditing = false;
      isSequenceInspectorEditing = false;
      renderEventInspector();
      state = openTagPopup(state, key, getTagTimestamp());
      renderPopup();
    }
  }
}
