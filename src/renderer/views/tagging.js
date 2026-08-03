// @ts-check
import { renderTagPopup, getPopupOptionByNumber, getPopupZoneByNumber, getZones, focusFirstPopupControl, trapFocusInPopup } from '../components/tag-popup.js';
import { createDrawingEditor } from '../components/drawing-editor.js';
import { cloudEventService } from '../cloud/cloud-event-service.js';
import { cloudMatchService } from '../cloud/cloud-match-service.js';
import { videoReferenceService } from '../cloud/video-reference-service.js';
import { openModal } from '../components/modal.js';
import { openEditMatchModal } from '../components/new-match-form.js';
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { SEQUENCE_COLOR_CHOICES, formatClock, renderTimeline, updateTimelinePlayback, updateTimelinePossession } from '../components/timeline.js';
import { MATCH_EDIT_ICON, getMatchSelectionItems, getMatchTitle } from '../components/match-selection.js';
import { normalizeFieldZone } from '../field-zones.js';
import { drawStrokes } from '../drawing/drawing-engine.js';
import {
  getDrawingSequenceDuration,
  getDrawingSequenceStrokesAtTime,
} from '../drawing/drawing-sequence.js';
import { navigate } from '../router.js';
import {
  EVENT_DEFINITIONS,
  SEQUENCE_RESULT_OPTIONS,
  advancePossession,
  buildSpeechNoteValue,
  buildEventDefinitions,
  buildEventPayload,
  calculatePossessionPercentages,
  closeActivePossession,
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
const DEFAULT_CLIP_PRE_ROLL_SECONDS = 5;
const DEFAULT_CLIP_POST_ROLL_SECONDS = 8;
const YOUTUBE_CLIP_NOTICE = 'Este partido usa video de YouTube. Podés reproducir clips dentro de BiguAnalytics, pero para exportarlos como archivos MP4 necesitás asociar un video local. Requiere conexión a internet.';

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
 * @param {{videoId?: string, embedUrl?: string, url?: string}|null|undefined} source
 * @returns {string}
 */
function buildYouTubeThumbnailUrl(source) {
  const videoId = source?.videoId || extractYouTubeVideoId(source?.embedUrl || source?.url || '');
  return videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : '';
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
export function isEditableTarget(target) {
  const element = /** @type {HTMLElement|null} */ (target);
  if (!element) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable;
}

/**
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function hasSystemModifier(event) {
  return event.ctrlKey || event.metaKey || event.altKey;
}

/**
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function isSpeechToggleHotkey(event) {
  return (event.ctrlKey || event.altKey) && !event.metaKey && String(event.key || '').toLowerCase() === 'm';
}

/**
 * @param {Element|null|undefined} popupHost
 * @param {EventTarget|null} [activeElement]
 * @returns {boolean}
 */
export function isPopupInputFocused(popupHost, activeElement = typeof document !== 'undefined' ? document.activeElement : null) {
  return Boolean(popupHost?.contains?.(/** @type {Node} */ (activeElement)) && isEditableTarget(activeElement));
}

/**
 * @param {{key?: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean}} event
 * @param {EventTarget|null} [activeElement]
 * @returns {boolean}
 */
export function shouldCompletePopupFromKeydown(event, activeElement = typeof document !== 'undefined' ? document.activeElement : null) {
  if (event.key !== 'Enter' || event.shiftKey) return false;
  const element = /** @type {HTMLElement|null} */ (activeElement);
  if (element?.tagName === 'TEXTAREA') return Boolean(event.ctrlKey || event.metaKey);
  if (isEditableTarget(activeElement)) return true;
  return !hasSystemModifier(/** @type {KeyboardEvent} */ (event));
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
    scoreAdjustment: cloneHistoryValue(match?.scoreAdjustment || null),
    scoreOverride: cloneHistoryValue(match?.scoreOverride || null),
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
    scoreAdjustment: cloneHistoryValue(snapshot?.scoreAdjustment || null),
    scoreOverride: cloneHistoryValue(snapshot?.scoreOverride || null),
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
 * @param {Array<object>} events
 * @returns {{homeScore: number, awayScore: number}}
 */
export function calculateScoreFromEvents(events = []) {
  return (Array.isArray(events) ? events : []).reduce((score, event) => {
    const delta = getScoreDeltaForEvent(event);
    if (delta <= 0) return score;
    if (event.team === 'home') score.homeScore += delta;
    if (event.team === 'away') score.awayScore += delta;
    return score;
  }, { homeScore: 0, awayScore: 0 });
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function scoreDelta(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function scoreTotal(value) {
  return Math.max(0, scoreDelta(value));
}

/**
 * @param {{homeDelta: number, awayDelta: number}} adjustment
 * @returns {boolean}
 */
function hasManualScoreAdjustment(adjustment) {
  return adjustment.homeDelta !== 0 || adjustment.awayDelta !== 0;
}

/**
 * @param {{homeScore: number, awayScore: number}} eventScore
 * @param {{homeDelta: number, awayDelta: number}} adjustment
 * @returns {{homeScore: number, awayScore: number}}
 */
function getAdjustedScore(eventScore, adjustment) {
  return {
    homeScore: Math.max(0, scoreTotal(eventScore.homeScore) + scoreDelta(adjustment.homeDelta)),
    awayScore: Math.max(0, scoreTotal(eventScore.awayScore) + scoreDelta(adjustment.awayDelta)),
  };
}

/**
 * @param {object} match
 * @param {{homeScore: number, awayScore: number}} eventScore
 * @returns {{homeDelta: number, awayDelta: number}}
 */
function getManualScoreAdjustment(match, eventScore) {
  if (match?.scoreAdjustment && typeof match.scoreAdjustment === 'object') {
    return {
      homeDelta: scoreDelta(match.scoreAdjustment.homeDelta),
      awayDelta: scoreDelta(match.scoreAdjustment.awayDelta),
    };
  }

  if (match?.scoreOverride?.enabled === true) {
    return {
      homeDelta: scoreTotal(match.scoreOverride.homeScore) - scoreTotal(eventScore.homeScore),
      awayDelta: scoreTotal(match.scoreOverride.awayScore) - scoreTotal(eventScore.awayScore),
    };
  }

  return { homeDelta: 0, awayDelta: 0 };
}

/**
 * @param {object} match
 * @returns {{events: {homeScore: number, awayScore: number}, manual: {homeDelta: number, awayDelta: number}, total: {homeScore: number, awayScore: number}, hasManual: boolean}}
 */
export function getScoreParts(match) {
  const events = calculateScoreFromEvents(match?.events || []);
  const manual = getManualScoreAdjustment(match || {}, events);
  return {
    events,
    manual,
    total: getAdjustedScore(events, manual),
    hasManual: hasManualScoreAdjustment(manual),
  };
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
  const normalizedZone = normalizeFieldZone(selectedZone);
  const selected = normalizedZone?.id || '';
  const selectedLabel = normalizedZone?.label || 'Sin dato';

  return `
    <div class="event-inspector-zone-picker" data-zone-picker>
      <input type="hidden" ${targetAttribute} value="${escapeHtml(selected)}" />
      <details>
        <summary>
          <span>${escapeHtml(label)}</span>
          <strong data-zone-picker-selected>${escapeHtml(selectedLabel)}</strong>
        </summary>
        <div class="tag-popup-field-grid event-inspector-field-grid" role="group" aria-label="${escapeHtml(label)}">
          ${getZones().map(zone => `
            <button
              class="tag-popup-zone-cell event-inspector-zone-cell${selected === zone.value ? ' active' : ''}"
              type="button"
              data-zone-target="${targetAttribute}"
              data-zone-picker-value="${zone.value}"
              data-zone-picker-label="${escapeHtml(zone.label)}"
            >${escapeHtml(zone.label)}</button>
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
 * @param {object} event
 * @returns {string}
 */
export function getTimelineEventNotePreview(event) {
  return typeof event?.note === 'string' ? event.note.trim() : '';
}

/**
 * @param {Array<object>} matches
 * @returns {Array<{id: string, title: string, statusLabel: string, scoreLabel: string, videoLabel: string, dateLabel: string}>}
 */
export function getTaggingMatchSelectionItems(matches = []) {
  return getMatchSelectionItems(matches);
}

/**
 * @param {number|null} duration
 * @returns {boolean}
 */
export function hasKnownDuration(duration) {
  return Number.isFinite(duration) && duration > 0;
}

/**
 * @param {object|Array<object>|null|undefined} possession
 * @returns {string}
 */
export function getPossessionPersistenceFingerprint(possession) {
  const intervals = Array.isArray(possession)
    ? possession
    : Array.isArray(possession?.intervals)
      ? possession.intervals
      : [];
  return JSON.stringify({
    activeTeam: possession?.activeTeam || null,
    activeStart: Number.isFinite(Number(possession?.activeStart)) ? Number(possession.activeStart) : null,
    activeEnd: Number.isFinite(Number(possession?.activeEnd)) ? Number(possession.activeEnd) : null,
    intervals: intervals.map(segment => ({
      team: segment.team === 'away' ? 'away' : segment.team === 'home' ? 'home' : null,
      start: Number.isFinite(Number(segment.start)) ? Number(segment.start) : null,
      end: Number.isFinite(Number(segment.end)) ? Number(segment.end) : null,
    })),
  });
}

/**
 * @param {{changed?: boolean, force?: boolean, now?: number, lastSaveAt?: number, intervalMs?: number}} options
 * @returns {boolean}
 */
export function shouldSavePossessionSnapshot(options = {}) {
  if (options.force) return true;
  if (!options.changed) return false;
  const intervalMs = Number.isFinite(Number(options.intervalMs)) ? Number(options.intervalMs) : POSSESSION_SAVE_INTERVAL_MS;
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const lastSaveAt = Number.isFinite(Number(options.lastSaveAt)) ? Number(options.lastSaveAt) : 0;
  return now - lastSaveAt >= intervalMs;
}

/**
 * @param {object} video
 * @param {number|null} nextDuration
 * @returns {object}
 */
export function buildVideoDurationPatch(video, nextDuration) {
  if (!hasKnownDuration(nextDuration)) {
    return {
      ...video,
      duration: null,
      durationStatus: 'pending',
    };
  }
  return {
    ...video,
    duration: nextDuration,
    durationStatus: 'available',
  };
}

/**
 * @param {string} value
 * @returns {{valid: boolean, seconds: number|null, hasTimestamp: boolean, message: string}}
 */
export function parseManualTimestampInput(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return { valid: true, seconds: null, hasTimestamp: false, message: '' };
  }
  if (trimmed.startsWith('-')) {
    return { valid: false, seconds: null, hasTimestamp: false, message: 'El timestamp no puede ser negativo.' };
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds)
      ? { valid: true, seconds, hasTimestamp: true, message: '' }
      : { valid: false, seconds: null, hasTimestamp: false, message: 'El timestamp no es un numero valido.' };
  }

  const parts = trimmed.split(':');
  if (parts.length === 2 || parts.length === 3) {
    const numericParts = parts.map(part => (/^\d{1,2}$/.test(part) ? Number(part) : Number.NaN));
    const [hours, minutes, seconds] = parts.length === 3
      ? numericParts
      : [0, numericParts[0], numericParts[1]];
    if (numericParts.every(Number.isFinite) && minutes < 60 && seconds < 60) {
      return {
        valid: true,
        seconds: (hours * 3600) + (minutes * 60) + seconds,
        hasTimestamp: true,
        message: '',
      };
    }
  }

  return {
    valid: false,
    seconds: null,
    hasTimestamp: false,
    message: 'Usa formato MM:SS, HH:MM:SS o segundos.',
  };
}

/**
 * @param {string} value
 * @param {{statsOnlyMode?: boolean, duration?: number|null}} [options]
 * @returns {{valid: boolean, seconds: number|null, hasTimestamp: boolean, message: string}}
 */
export function validateManualTimestampInput(value, options = {}) {
  const parsed = parseManualTimestampInput(value);
  if (!parsed.valid) return parsed;
  if (!parsed.hasTimestamp) {
    return options.statsOnlyMode
      ? parsed
      : {
        valid: false,
        seconds: null,
        hasTimestamp: false,
        message: 'El timestamp es obligatorio para guardar este evento.',
      };
  }
  if (!Number.isFinite(parsed.seconds)) {
    return { valid: false, seconds: null, hasTimestamp: false, message: 'El timestamp no es valido.' };
  }
  if (parsed.seconds < 0) {
    return { valid: false, seconds: null, hasTimestamp: false, message: 'El timestamp no puede ser negativo.' };
  }
  if (hasKnownDuration(options.duration) && parsed.seconds > Number(options.duration)) {
    return {
      valid: false,
      seconds: null,
      hasTimestamp: false,
      message: 'El timestamp supera la duracion del video.',
    };
  }
  return parsed;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeSeekParam(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
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
 * @param {number|string|null|undefined} value
 * @param {number} fallback
 * @param {number} min
 * @returns {number}
 */
function normalizeClipSeconds(value, fallback, min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min) return fallback;
  return Math.min(60, Math.round(numeric));
}

/**
 * @param {number|string|null|undefined} timestamp
 * @param {number|string|null|undefined} videoDuration
 * @param {object} [clipSettings]
 * @returns {{start: number, end: number, duration: number}}
 */
export function calculateVirtualClipRange(timestamp, videoDuration, clipSettings = {}) {
  const eventTimestamp = Number(timestamp);
  if (!Number.isFinite(eventTimestamp) || eventTimestamp < 0) throw new Error('El evento no tiene timestamp válido para reproducir.');
  const preRoll = normalizeClipSeconds(clipSettings.clipPreRollSeconds, DEFAULT_CLIP_PRE_ROLL_SECONDS, 0);
  const postRoll = normalizeClipSeconds(clipSettings.clipPostRollSeconds, DEFAULT_CLIP_POST_ROLL_SECONDS, 1);
  const start = Math.max(0, eventTimestamp - preRoll);
  const unclampedEnd = eventTimestamp + postRoll;
  const maxDuration = Number(videoDuration);
  const end = hasKnownDuration(maxDuration) ? Math.min(maxDuration, unclampedEnd) : unclampedEnd;
  return {
    start: Math.round(start * 1000) / 1000,
    end: Math.round(end * 1000) / 1000,
    duration: Math.round(Math.max(0, end - start) * 1000) / 1000,
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
 * @param {unknown} error
 * @returns {string}
 */
export function getSpeechErrorMessage(error) {
  const code = error?.error || error?.name || '';
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'NotAllowedError' || code === 'SecurityError') {
    return 'Permiso de microfono denegado.';
  }
  if (code === 'audio-capture' || code === 'NotFoundError' || code === 'DevicesNotFoundError') {
    return 'No se detecto un microfono disponible.';
  }
  if (code === 'NotReadableError' || code === 'TrackStartError') {
    return 'El microfono esta ocupado por otra aplicacion.';
  }
  if (code === 'network') {
    return 'El servicio de dictado de Chromium no inicio en Electron. Reinicia BiguAnalytics y proba de nuevo.';
  }
  if (code === 'no-speech') return 'No se detecto voz. Proba de nuevo.';
  return 'Error de reconocimiento de voz.';
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

  const initialSeekSeconds = normalizeSeekParam(params.seekTo);
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
  let selectedTimelineDrawingId = null;
  let isEventInspectorEditing = false;
  let isSequenceInspectorEditing = false;
  let optimisticSeek = null;
  let ticker = null;
  let autoCloseTicker = null;
  let mediaResizeCleanup = null;
  let lastPossessionSaveAt = 0;
  let lastSavedPossessionFingerprint = '';
  let pendingPossessionSaveReason = '';
  let pendingPossessionSaveTimer = 0;
  let possessionSaveInFlight = null;
  let lastPersistedVideoDuration = null;
  let undoStack = [];
  let redoStack = [];
  let drawingSession = null;
  let drawingModalOpen = false;
  let liveDrawings = [];
  let liveDrawingRenderKey = '';
  let liveDrawingAnimationFrame = 0;
  let lastPlaybackSyncAt = Date.now();
  let initialSeekConsumed = false;
  let timelineContextMenu = null;
  let newTimelineEventIds = new Set();
  let newTimelineSequenceIds = new Set();
  let speechRecognition = null;
  let speechEngine = null;
  let speechListening = false;
  let speechStopRequested = false;
  let speechStatus = 'idle';
  let speechErrorMessage = '';
  let speechBaseNote = '';
  let speechRenderedNote = '';
  let speechFinalSegments = new Map();
  let speechInterimSegments = new Map();
  let nativeSpeechResultCleanup = null;
  let nativeSpeechErrorCleanup = null;
  let nativeSpeechStatusCleanup = null;

  const cleanup = () => {
    disposed = true;
    stopSpeechNote();
    if (match) {
      void closeActivePossessionSafely('cleanup');
    }
    document.removeEventListener('keydown', handleKeydown);
    if (ticker) window.clearInterval(ticker);
    if (autoCloseTicker) window.clearInterval(autoCloseTicker);
    if (pendingPossessionSaveTimer) {
      window.clearTimeout(pendingPossessionSaveTimer);
      pendingPossessionSaveTimer = 0;
    }
    if (liveDrawingAnimationFrame) window.cancelAnimationFrame(liveDrawingAnimationFrame);
    if (mediaResizeCleanup) mediaResizeCleanup();
    drawingSession?.close?.(false);
    closeTimelineContextMenu();
    youtubePlayer?.destroy?.();
    youtubePlayer = null;
    delete document.body.dataset.playback;
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
      const errorState = document.createElement('div');
      errorState.className = 'error-state';
      const title = document.createElement('h3');
      title.className = 'error-state-title';
      title.textContent = 'Error al cargar tagging';
      const message = document.createElement('p');
      message.className = 'error-state-text';
      message.textContent = error instanceof Error && error.message ? error.message : 'No se pudo abrir el partido';
      const homeButton = document.createElement('button');
      homeButton.className = 'btn btn-primary';
      homeButton.id = 'tagging-home-btn';
      homeButton.type = 'button';
      homeButton.textContent = 'Volver al inicio';
      homeButton.addEventListener('click', () => navigate('home'));
      errorState.appendChild(title);
      errorState.appendChild(message);
      errorState.appendChild(homeButton);
      container.replaceChildren(errorState);
    });

  return cleanup;

  async function loadTaggingEntrypoint() {
    if (params.matchId) {
      const [loadedMatch, loadedSettings] = await Promise.all([
        cloudMatchService.getMatchById(params.matchId),
        window.api.settings.get(),
      ]);
      if (disposed) return;
      settings = loadedSettings;
      initializeMatch(loadedMatch);
      return;
    }

    const matches = await cloudMatchService.listMatches();
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
      eventDefinitions: buildEventDefinitions(settings?.tagging),
      possession: match?.possession,
    });
    lastSavedPossessionFingerprint = getPossessionPersistenceFingerprint(state.possession);
    statsOnlyMode = Boolean(settings?.statsOnlyMode);
    duration = getInitialTimelineDuration(match, statsOnlyMode, duration);
    lastPersistedVideoDuration = hasKnownDuration(match?.video?.duration) ? Number(match.video.duration) : null;
    if (!match) {
      renderNoMatch(container);
      return;
    }
    void ensureVideoDurationStatus();

    updateTopbarContext(getMatchTitle(match));
    setTopbarActions([
      { id: 'dashboard', label: 'Ver Dashboard' },
      { id: 'export-match', label: 'Exportar partido' },
    ], (id) => {
      if (id === 'dashboard') navigate('dashboard', { matchId: match.id });
      if (id === 'export-match') exportCurrentMatch();
    });
    renderShell(container);
    wireMedia();
    loadLiveDrawings();
    document.addEventListener('keydown', handleKeydown);
    ticker = window.setInterval(tick, 250);
    autoCloseTicker = window.setInterval(checkAutoClose, 300);
    renderAll();
    consumeInitialSeekParam();
    renderFirstLaunchHotkeysOverlay();
  }

  function getActiveEventDefinitions() {
    return state.eventDefinitions || buildEventDefinitions(settings?.tagging);
  }

  /**
   * @param {unknown} value
   * @returns {boolean}
   */
  function hasValidClipTimestamp(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp >= 0;
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
            <article class="tagging-match-card" aria-label="${escapeHtml(item.title)}">
              <button class="tagging-match-edit-button" type="button" data-tagging-edit-match-id="${escapeHtml(item.id)}" aria-label="Editar partido ${escapeHtml(item.title)}" title="Editar partido">
                ${MATCH_EDIT_ICON}
              </button>
              <span class="tagging-match-card-kicker">${escapeHtml(item.statusLabel)}</span>
              <strong class="tagging-match-card-title">${escapeHtml(item.title)}</strong>
              <span class="tagging-match-card-video">${escapeHtml(item.videoLabel)}</span>
              <span class="tagging-match-card-footer">
                <span>${escapeHtml(item.dateLabel)}</span>
                <span class="tabular-nums">${escapeHtml(item.scoreLabel)}</span>
              </span>
              <span class="tagging-match-card-actions">
                <button class="btn btn-primary btn-sm" type="button" data-tagging-match-id="${escapeHtml(item.id)}" aria-label="Taggear ${escapeHtml(item.title)}">Taggear</button>
              </span>
            </article>
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

    host.querySelectorAll('[data-tagging-edit-match-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const matchToEdit = matches.find(match => String(match.id) === String(button.dataset.taggingEditMatchId));
        if (!matchToEdit) return;
        openEditMatchModal(matchToEdit, async () => {
          const updatedMatches = await cloudMatchService.listMatches();
          renderMatchSelection(host, updatedMatches);
        });
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
              <div class="tagging-status-panel" id="tagging-status-panel" data-panel-surface="status" aria-hidden="false">
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
                  <div class="score-source-row">
                    <span id="score-source-label">Score por eventos</span>
                    <button type="button" data-score-override-reset hidden>Quitar ajuste</button>
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
                  <small>Q inicia / E cierra</small>
                </section>
                ${statsOnlyMode ? `
                  <label class="status-card manual-timestamp">
                    <span>Timestamp manual</span>
                    <input type="text" id="manual-timestamp" placeholder="mm:ss o vacio" />
                  </label>
                ` : ''}
              </div>
              <div class="tag-popup-host" id="tag-popup-host" data-panel-surface="tag-popup" hidden aria-hidden="true"></div>
              <div class="tag-popup-host sequence-popup-host" id="sequence-popup-host" data-panel-surface="sequence" hidden aria-hidden="true"></div>
              <div class="event-inspector-host" id="event-inspector-host" data-panel-surface="inspector" hidden aria-hidden="true"></div>
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
            ${Object.values(getActiveEventDefinitions()).map(def => `<span><kbd>${def.hotkey}</kbd>${def.label}</span>`).join('')}
            <span><kbd>1</kbd>Posesion local</span>
            <span><kbd>2</kbd>Posesion rival</span>
            <span><kbd>Q</kbd>Inicio secuencia</span>
            <span><kbd>E</kbd>Fin secuencia</span>
            <span><kbd>D</kbd>Dibujo</span>
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
    container.querySelector('[data-score-override-reset]')?.addEventListener('click', clearScoreOverride);

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

  function renderFirstLaunchHotkeysOverlay() {
    if (!settings?.firstLaunch || container.querySelector('.tagging-hotkeys-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'tagging-hotkeys-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Tabla de hotkeys');
    overlay.innerHTML = `
      <section class="tagging-hotkeys-panel">
        <header>
          <span>Primer uso</span>
          <h2>Tabla de hotkeys</h2>
        </header>
        <div class="tagging-hotkeys-grid">
          ${Object.values(getActiveEventDefinitions()).map(def => `
            <div><kbd>${def.hotkey}</kbd><span>${escapeHtml(def.label)}</span></div>
          `).join('')}
          <div><kbd>1</kbd><span>Posesion local</span></div>
          <div><kbd>2</kbd><span>Posesion rival</span></div>
          <div><kbd>Q</kbd><span>Inicio secuencia</span></div>
          <div><kbd>E</kbd><span>Fin secuencia</span></div>
          <div><kbd>D</kbd><span>Dibujo</span></div>
        </div>
        <button class="btn btn-primary" type="button" data-hotkeys-dismiss>Entendido</button>
      </section>
    `;
    container.querySelector('.tagging-view')?.appendChild(overlay);
    overlay.querySelector('[data-hotkeys-dismiss]')?.addEventListener('click', async () => {
      overlay.remove();
      settings = await window.api.settings.set({ firstLaunch: false });
    });
  }

  async function wireMedia() {
    const mediaHost = container.querySelector('#tagging-media-host');
    if (!mediaHost || !match) return;
    localVideo = null;
    if (mediaResizeCleanup) {
      mediaResizeCleanup();
      mediaResizeCleanup = null;
    }
    container.querySelector('#video-controls')?.classList.remove('disabled');

    if (statsOnlyMode) {
      mediaHost.innerHTML = `
        <div class="stats-only-panel">
          <span>Modo solo estadisticas</span>
          <strong>Tagging sin reproductor</strong>
          <p>Usá el timestamp manual o dejalo vacío para eventos fuera de timeline.</p>
        </div>
      `;
      ensureLiveDrawingOverlay(mediaHost);
      container.querySelector('#video-controls')?.classList.add('disabled');
      wireStatsOnlyMediaMetadata(mediaHost);
      return;
    }

    if (match.video?.type === 'youtube') {
      mediaHost.innerHTML = buildYouTubeIframeMarkup(match.video);
      ensureLiveDrawingOverlay(mediaHost);
      renderLiveDrawingOverlay();
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
                consumeInitialSeekParam();
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
      const exists = await window.api.media.localVideoExists(match.video.path);
      if (disposed) return;
      if (!exists) {
        const selected = await videoReferenceService.ensurePlayableLocalVideo(match.video);
        if (selected?.video) {
          if (selected.warning) window.biguShowToast?.(selected.warning, 'info');
          match = await window.api.matches.update(match.id, { video: selected.video, status: 'tagging' });
          wireMedia();
          renderAll();
          return;
        }
        showMissingLocalVideoNotice(mediaHost);
        return;
      }
      const fileUrl = match.video.fileUrl || toFileUrl(match.video.path);
      mediaHost.innerHTML = `<video class="tagging-video" id="tagging-video" src="${fileUrl}" preload="metadata"></video>`;
      localVideo = /** @type {HTMLVideoElement|null} */ (container.querySelector('#tagging-video'));
      ensureLiveDrawingOverlay(mediaHost);
      renderLiveDrawingOverlay();
      localVideo?.addEventListener('loadedmetadata', async () => {
        duration = Number.isFinite(localVideo.duration) ? localVideo.duration : null;
        await persistVideoDuration(duration);
        consumeInitialSeekParam();
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
      localVideo?.addEventListener('error', () => {
        showMissingLocalVideoNotice(mediaHost);
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
    ensureLiveDrawingOverlay(mediaHost);
    renderLiveDrawingOverlay();
    mediaHost.querySelector('#load-local-video')?.addEventListener('click', loadLocalVideo);
  }

  /**
   * @param {Element} mediaHost
   */
  function showMissingLocalVideoNotice(mediaHost) {
    isPlaying = false;
    localVideo = null;
    mediaHost.innerHTML = `
      <div class="video-missing-notice" role="status">
        <span>Video no encontrado</span>
        <strong>El MP4 guardado ya no esta en la ruta original.</strong>
        <p>El partido sigue disponible. Podes tagear sin video o cambiar la ruta del archivo.</p>
        <button class="btn btn-primary" type="button" id="change-local-video">Cambiar ruta</button>
      </div>
    `;
    ensureLiveDrawingOverlay(mediaHost);
    renderLiveDrawingOverlay();
    container.querySelector('#video-controls')?.classList.add('disabled');
    mediaHost.querySelector('#change-local-video')?.addEventListener('click', loadLocalVideo);
    renderControls();
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
    match = await cloudMatchService.updateMatch(match.id, {
      video: buildVideoDurationPatch(match.video, nextDuration),
    });
  }

  async function ensureVideoDurationStatus() {
    if (!match?.video || match.video.type !== 'local') return;
    if (hasKnownDuration(match.video.duration) || match.video.durationStatus === 'pending') return;
    try {
      const updated = await cloudMatchService.updateMatch(match.id, {
        video: buildVideoDurationPatch(match.video, null),
      });
      if (!disposed) match = updated;
    } catch {
      showTaggingFeedback('No se pudo marcar la duracion del video como pendiente.', 'error');
    }
  }

  async function loadLocalVideo() {
    const selected = await window.api.media.selectLocalVideo();
    if (!selected || !match) return;
    match = await cloudMatchService.updateMatch(match.id, { video: selected, status: 'tagging' });
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

  /**
   * @param {object} drawing
   * @returns {number}
   */
  function getLiveDrawingDuration(drawing) {
    const sequenceDuration = getDrawingSequenceDuration(drawing || {});
    if (Number.isFinite(sequenceDuration) && sequenceDuration > 0) return Math.max(0.5, sequenceDuration);
    const durationSeconds = Number(drawing?.durationSeconds);
    return Number.isFinite(durationSeconds) ? Math.max(0.5, durationSeconds) : 3;
  }

  /**
   * @param {object} drawing
   * @param {number} time
   * @returns {Array<object>}
   */
  function getLiveDrawingStrokesAtTime(drawing, time) {
    const elapsedSeconds = Math.max(0, (Number(time) || 0) - (Number(drawing?.timestamp) || 0));
    return getDrawingSequenceStrokesAtTime(drawing || {}, elapsedSeconds);
  }

  /**
   * @param {object} drawing
   * @param {number} time
   * @returns {string}
   */
  function getLiveDrawingCanvasRenderKey(drawing, overlay) {
    const width = Math.max(1, Math.round(Number(drawing.canvas?.width) || localVideo?.videoWidth || overlay.clientWidth || 1280));
    const height = Math.max(1, Math.round(Number(drawing.canvas?.height) || localVideo?.videoHeight || overlay.clientHeight || 720));
    return `${drawing?.id}:${drawing?.timestamp}:${getLiveDrawingDuration(drawing)}:${width}x${height}`;
  }

  /**
   * @param {HTMLElement} overlay
   * @param {Array<object>} activeDrawings
   */
  function redrawLiveDrawingCanvases(overlay, activeDrawings) {
    overlay.querySelectorAll('[data-live-drawing-canvas]').forEach((canvas, index) => {
      const drawingCanvas = /** @type {HTMLCanvasElement} */ (canvas);
      const ctx = drawingCanvas.getContext('2d');
      const drawing = activeDrawings[index];
      if (!ctx || !drawing) return;
      ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
      drawStrokes(ctx, getLiveDrawingStrokesAtTime(drawing, getVisualCurrentTime()));
    });
  }

  function stopLiveDrawingAnimationFrame() {
    if (!liveDrawingAnimationFrame) return;
    window.cancelAnimationFrame(liveDrawingAnimationFrame);
    liveDrawingAnimationFrame = 0;
  }

  function renderLiveDrawingAnimationFrame() {
    liveDrawingAnimationFrame = 0;
    renderLiveDrawingOverlay();
  }

  function scheduleLiveDrawingAnimationFrame() {
    if (liveDrawingAnimationFrame || disposed || drawingSession || drawingModalOpen || statsOnlyMode || !isPlaying) return;
    if (!getActiveLiveDrawings(getVisualCurrentTime()).length) return;
    liveDrawingAnimationFrame = window.requestAnimationFrame(renderLiveDrawingAnimationFrame);
  }

  /**
   * @param {number} time
   * @returns {Array<object>}
   */
  function getActiveLiveDrawings(time) {
    return liveDrawings.filter((drawing) => {
      const start = Number(drawing?.timestamp);
      return Number.isFinite(start)
        && time >= start
        && time < start + getLiveDrawingDuration(drawing);
    });
  }

  /**
   * @param {Array<object>} drawings
   * @param {object|null|undefined} drawing
   * @returns {Array<object>}
   */
  function upsertLiveDrawing(drawings, drawing) {
    if (!drawing?.id) return drawings;
    return [
      ...drawings.filter(item => item.id !== drawing.id),
      drawing,
    ].sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
  }

  async function loadLiveDrawings() {
    if (!match?.id) return;
    const matchId = match.id;
    try {
      const drawingPayload = await window.api.drawings.getForMatch(match.id);
      if (disposed || !match || match.id !== matchId) return;
      liveDrawings = Array.isArray(drawingPayload?.live) ? drawingPayload.live : [];
      liveDrawingRenderKey = '';
      renderLiveDrawingOverlay();
    } catch {
      if (disposed || !match || match.id !== matchId) return;
      liveDrawings = [];
      liveDrawingRenderKey = '';
      renderLiveDrawingOverlay();
    }
  }

  /**
   * @param {Element|null} [mediaHost]
   * @returns {HTMLElement|null}
   */
  function ensureLiveDrawingOverlay(mediaHost = container.querySelector('#tagging-media-host')) {
    if (!(mediaHost instanceof HTMLElement)) return null;
    const existing = /** @type {HTMLElement|null} */ (mediaHost.querySelector('[data-live-drawing-overlay]'));
    if (existing) return existing;
    const overlay = document.createElement('div');
    overlay.className = 'tagging-live-drawing-overlay';
    overlay.setAttribute('data-live-drawing-overlay', '');
    overlay.setAttribute('aria-hidden', 'true');
    mediaHost.appendChild(overlay);
    return overlay;
  }

  function renderLiveDrawingOverlay() {
    const overlay = ensureLiveDrawingOverlay();
    if (!overlay) return;
    if (drawingSession || statsOnlyMode || !match?.video?.type || (match.video.type === 'local' && !localVideo)) {
      overlay.innerHTML = '';
      liveDrawingRenderKey = '';
      stopLiveDrawingAnimationFrame();
      return;
    }

    const playbackTime = getVisualCurrentTime();
    const activeDrawings = getActiveLiveDrawings(playbackTime)
      .filter(drawing => getLiveDrawingStrokesAtTime(drawing, playbackTime).length > 0);
    const renderKey = activeDrawings
      .map(drawing => getLiveDrawingCanvasRenderKey(drawing, overlay))
      .join('|');
    if (renderKey !== liveDrawingRenderKey || overlay.childElementCount !== activeDrawings.length) {
      liveDrawingRenderKey = renderKey;
      overlay.innerHTML = activeDrawings.map((drawing, index) => {
        const width = Math.max(1, Math.round(Number(drawing.canvas?.width) || localVideo?.videoWidth || overlay.clientWidth || 1280));
        const height = Math.max(1, Math.round(Number(drawing.canvas?.height) || localVideo?.videoHeight || overlay.clientHeight || 720));
        return `<canvas class="tagging-live-drawing-canvas" data-live-drawing-canvas="${escapeHtml(drawing.id || index)}" width="${width}" height="${height}"></canvas>`;
      }).join('');
    }

    redrawLiveDrawingCanvases(overlay, activeDrawings);
    if (activeDrawings.length > 0) scheduleLiveDrawingAnimationFrame();
    else stopLiveDrawingAnimationFrame();
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
    match = await cloudMatchService.updateMatch(match.id, getHistoryRestorePayload(snapshot));
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
    const now = Date.now();
    if (optimisticSeek) return getOptimisticPlaybackTime(currentTime, currentTime, optimisticSeek, now);
    if (localVideo && Number.isFinite(Number(localVideo.currentTime))) return Number(localVideo.currentTime);
    const visualTime = isPlaying
      ? currentTime + ((now - lastPlaybackSyncAt) / 1000) * selectedPlaybackRate
      : currentTime;
    return hasKnownDuration(duration) ? Math.min(Number(duration), visualTime) : visualTime;
  }

  /**
   * @param {number} playerTime
   */
  function syncPlaybackTime(playerTime) {
    const now = Date.now();
    const safePlayerTime = Number.isFinite(Number(playerTime)) ? Number(playerTime) : currentTime;
    currentTime = getOptimisticPlaybackTime(safePlayerTime, currentTime, optimisticSeek, now);
    lastPlaybackSyncAt = now;
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
    updateTimelinePossessionView();
    queuePossessionSave('progress');
  }

  function renderControls() {
    document.body.dataset.playback = isPlaying ? 'playing' : 'paused';
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
    renderLiveDrawingOverlay();
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
      onMic: () => toggleSpeechNote(),
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
    }, {
      speech: {
        status: speechStatus,
        errorMessage: speechErrorMessage,
      },
    });
    syncSidePanelMode();
    if (!host.hidden) focusFirstPopupControl(host);
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
      <section class="tag-popup sequence-popup" role="dialog" aria-modal="true" aria-labelledby="sequence-popup-title">
        <header class="tag-popup-header">
          <div>
            <p class="tag-popup-kicker">Secuencia</p>
            <h2 id="sequence-popup-title">Resultado <span>E</span></h2>
          </div>
          <button class="tag-popup-close" type="button" data-sequence-close>x</button>
        </header>
        <div class="tag-popup-options">
          ${SEQUENCE_RESULT_OPTIONS.map((option, index) => `
            <button class="tag-popup-option" type="button" style="--popup-option-index:${index}" data-sequence-result="${option.value}">
              <kbd>${index + 1}</kbd>
              <span>${option.label}</span>
            </button>
          `).join('')}
        </div>
        <div class="sequence-popup-zones">
          ${renderInspectorZonePicker('Zona inicio', 'data-sequence-prompt-zone-start', sequencePrompt.zoneStart)}
          ${renderInspectorZonePicker('Zona fin', 'data-sequence-prompt-zone-end', sequencePrompt.zoneEnd)}
        </div>
        ${sequencePrompt.error ? `<p class="tag-popup-error" role="alert">${escapeHtml(sequencePrompt.error)}</p>` : ''}
      </section>
    `;
    host.querySelector('[data-sequence-close]')?.addEventListener('click', () => {
      sequencePrompt = null;
      renderSequencePrompt();
    });
    host.querySelectorAll('[data-sequence-result]').forEach((button) => {
      button.addEventListener('click', () => saveSequence(button.dataset.sequenceResult));
    });
    wireInspectorZonePickers(host);
    syncSidePanelMode();
    if (!host.hidden) focusFirstPopupControl(host);
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
    const selectedEventNotePreview = getTimelineEventNotePreview(selectedEvent);
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
        ${!isEventInspectorEditing && selectedEventNotePreview ? `
        <div class="event-inspector-note-preview" aria-label="Nota del evento">
          <span>Nota</span>
          <p>${escapeHtml(selectedEventNotePreview)}</p>
        </div>
        ` : ''}
        ${isEventInspectorEditing ? `
          <div class="event-inspector-form">
            <label class="event-inspector-field">
              <span>Timestamp</span>
              <input type="text" data-inspector-timestamp value="${Number.isFinite(Number(selectedEvent.timestamp)) ? escapeHtml(formatClock(selectedEvent.timestamp)) : ''}" placeholder="mm:ss" />
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
    if (!sidePanel) return;

    const hasTagPopup = Boolean(state.activePopup);
    const hasSequencePrompt = Boolean(sequencePrompt);
    const hasEventInspector = Boolean((selectedTimelineEventId || selectedTimelineSequenceKey)
      && !hasTagPopup
      && !hasSequencePrompt);
    const panelMode = hasTagPopup
      ? 'tag-popup'
      : hasSequencePrompt
        ? 'sequence'
        : hasEventInspector
          ? 'inspector'
          : 'status';
    sidePanel.setAttribute('data-panel-mode', panelMode);
    sidePanel.dataset.panelMode = panelMode;

    const surfaces = [
      ['status', sidePanel.querySelector('#tagging-status-panel')],
      ['tag-popup', sidePanel.querySelector('#tag-popup-host')],
      ['sequence', sidePanel.querySelector('#sequence-popup-host')],
      ['inspector', sidePanel.querySelector('#event-inspector-host')],
    ];
    surfaces.forEach(([mode, surface]) => {
      if (!(surface instanceof HTMLElement)) return;
      const isActive = mode === panelMode;
      surface.hidden = !isActive;
      surface.dataset.panelState = isActive ? 'active' : 'inactive';
      surface.setAttribute('aria-hidden', String(!isActive));
      if (!isActive) surface.replaceChildren();
    });
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
        const normalizedZone = normalizeFieldZone(nextZone);

        if (input) input.value = nextZone;
        if (selectedLabel) selectedLabel.textContent = normalizedZone?.label || 'Sin dato';
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
    const score = getScoreParts(match);
    const home = container.querySelector('#score-home');
    const away = container.querySelector('#score-away');
    const homeLabel = container.querySelector('#score-home-label');
    const awayLabel = container.querySelector('#score-away-label');
    const sourceLabel = container.querySelector('#score-source-label');
    const resetOverride = /** @type {HTMLButtonElement|null} */ (container.querySelector('[data-score-override-reset]'));

    if (home) home.textContent = String(score.total.homeScore);
    if (away) away.textContent = String(score.total.awayScore);
    if (homeLabel) homeLabel.textContent = match.homeTeam || 'Bigua';
    if (awayLabel) awayLabel.textContent = match.awayTeam || 'Rival';
    if (sourceLabel) sourceLabel.textContent = score.hasManual ? 'Eventos + ajuste manual' : 'Score por eventos';
    if (resetOverride) {
      resetOverride.hidden = !score.hasManual;
      resetOverride.textContent = 'Quitar ajuste';
    }
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

  function updateTimelinePossessionView() {
    const host = /** @type {HTMLElement|null} */ (container.querySelector('#timeline-host'));
    if (!host) return;
    updateTimelinePossession(host, getPossessionTimelineSegments(state.possession, getTimelinePossessionScaleEnd()), getTimelinePossessionScaleEnd());
  }

  function renderTimelineView(options = {}) {
    const host = /** @type {HTMLElement|null} */ (container.querySelector('#timeline-host'));
    if (!host || !match) return;
    renderTimeline(host, {
      events: match.events || [],
      sequences: match.sequences || [],
      drawings: match.drawings || [],
      possessionSegments: getPossessionTimelineSegments(state.possession, getTimelinePossessionScaleEnd()),
      currentTime: getVisualCurrentTime(),
      duration,
      selectedEventId: selectedTimelineEventId,
      selectedSequenceKey: selectedTimelineSequenceKey,
      selectedDrawingId: selectedTimelineDrawingId,
      newEventIds: Array.from(newTimelineEventIds),
      newSequenceIds: Array.from(newTimelineSequenceIds),
      onSeek: seekTo,
      onEventSelect: selectTimelineEvent,
      onUntimedEventSelect: selectTimelineEvent,
      onSequenceSelect: selectTimelineSequence,
      onDrawingSelect: selectTimelineDrawing,
      onDrawingMove: moveTimelineDrawing,
      onEventContextMenu: openTimelineContextMenu,
      onUntimedEventContextMenu: openTimelineContextMenu,
      onEventMove: moveTimelineEvent,
      preserveScroll: options.preserveScroll,
    });
  }

  /**
   * @param {object|null} drawing
   */
  function selectTimelineDrawing(drawing) {
    if (!drawing) return;
    selectedTimelineDrawingId = drawing.id;
    selectedTimelineEventId = null;
    selectedTimelineSequenceKey = null;
    isEventInspectorEditing = false;
    isSequenceInspectorEditing = false;
    seekTo(Number(drawing.timestamp) || 0);
    renderEventInspector();
    renderTimelineView({ preserveScroll: true });
    void openLiveDrawingEditModal(drawing);
  }

  function closeTimelineContextMenu() {
    timelineContextMenu?.remove?.();
    timelineContextMenu = null;
  }

  /**
   * @param {object|null} timelineEvent
   * @param {{x: number, y: number, block?: HTMLElement}} position
   */
  function openTimelineContextMenu(timelineEvent, position) {
    if (!timelineEvent?.id || !match) return;
    closeTimelineContextMenu();
    const canCaptureFrame = match.video?.type === 'local' && Boolean(localVideo) && hasValidClipTimestamp(timelineEvent.timestamp);
    const isYouTubeSource = match.video?.type === 'youtube';
    const clipActionLabel = isYouTubeSource ? 'Reproducir clip' : 'Exportar clip';
    const menu = document.createElement('div');
    menu.className = 'timeline-context-menu';
    menu.style.left = `${Math.min(position.x, window.innerWidth - 230)}px`;
    menu.style.top = `${Math.min(position.y, window.innerHeight - 170)}px`;
    menu.innerHTML = `
      <button type="button" data-context-edit>Editar</button>
      <button type="button" data-context-delete>Eliminar</button>
      <button type="button" data-context-capture${canCaptureFrame ? '' : ' disabled'}>Capturar frame y dibujar</button>
      <button type="button" data-context-export-clip>${clipActionLabel}</button>
      ${isYouTubeSource ? '<button type="button" data-context-associate-mp4>Asociar MP4 local</button>' : ''}
    `;
    document.body.appendChild(menu);
    timelineContextMenu = menu;

    menu.querySelector('[data-context-edit]')?.addEventListener('click', () => {
      closeTimelineContextMenu();
      openEventEditModal(timelineEvent);
    });
    menu.querySelector('[data-context-delete]')?.addEventListener('click', () => {
      menu.innerHTML = `
        <div class="timeline-context-confirm">¿Eliminar este evento?</div>
        <div class="timeline-context-confirm-actions">
          <button type="button" data-context-delete-no>No</button>
          <button type="button" data-context-delete-yes>Si</button>
        </div>
      `;
      menu.querySelector('[data-context-delete-no]')?.addEventListener('click', closeTimelineContextMenu);
      menu.querySelector('[data-context-delete-yes]')?.addEventListener('click', async () => {
        await deleteTimelineEventWithFade(timelineEvent, position.block);
      });
    });
    menu.querySelector('[data-context-capture]')?.addEventListener('click', () => {
      if (!canCaptureFrame) return;
      closeTimelineContextMenu();
      captureFrameAndDraw(timelineEvent);
    });
    menu.querySelector('[data-context-export-clip]')?.addEventListener('click', async () => {
      closeTimelineContextMenu();
      if (isYouTubeSource) {
        openTimelineClipPlayer(timelineEvent);
        return;
      }
      await exportTimelineClip(timelineEvent);
    });
    menu.querySelector('[data-context-associate-mp4]')?.addEventListener('click', async () => {
      closeTimelineContextMenu();
      await associateLocalMp4WithMatch();
    });
    window.setTimeout(() => {
      document.addEventListener('pointerdown', handleContextOutside, { once: true });
    });
  }

  /**
   * @param {string} message
   * @param {'info'|'error'} tone
   */
  function showTaggingFeedback(message, tone = 'info') {
    let toast = document.getElementById('tagging-feedback-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tagging-feedback-toast';
      toast.className = 'timeline-clip-toast';
      document.body.appendChild(toast);
    }
    window.clearTimeout(Number(toast.dataset.timer || 0));
    toast.hidden = false;
    toast.dataset.tone = tone;
    toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    toast.dataset.timer = String(window.setTimeout(() => {
      toast.hidden = true;
    }, 5000));
  }

  async function exportCurrentMatch() {
    if (!match?.id) return;
    try {
      const result = await window.api.matches.exportArchive(match.id);
      if (!result?.canceled) {
        showTaggingFeedback(result.videoWarning || 'Partido exportado correctamente.', 'info');
      }
    } catch (error) {
      showTaggingFeedback(error?.message || 'No se pudo exportar el partido.', 'error');
    }
  }

  /**
   * @param {string} message
   * @param {string|null} outputDir
   */
  function showClipExportToast(message, outputDir = null) {
    let toast = document.getElementById('tagging-clip-export-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tagging-clip-export-toast';
      toast.className = 'timeline-clip-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    window.clearTimeout(Number(toast.dataset.timer || 0));
    toast.hidden = false;
    toast.innerHTML = `
      <span>${escapeHtml(message)}</span>
      ${outputDir ? '<button type="button" data-open-clip-folder>Abrir carpeta</button>' : ''}
    `;
    toast.querySelector('[data-open-clip-folder]')?.addEventListener('click', () => {
      window.api.files.open(outputDir);
    });
    if (!outputDir && message !== 'Exportando clip...') {
      toast.dataset.timer = String(window.setTimeout(() => {
        toast.hidden = true;
      }, 5000));
    }
  }

  /**
   * @param {object} timelineEvent
   */
  function openTimelineClipPlayer(timelineEvent) {
    if (!hasValidClipTimestamp(timelineEvent?.timestamp)) {
      showClipExportToast('El evento no tiene timestamp valido para reproducir.');
      return;
    }
    navigate('clips', {
      matchId: match.id,
      eventId: timelineEvent.id,
      eventTimestamp: timelineEvent.timestamp,
    });
  }

  async function associateLocalMp4WithMatch() {
    if (!match?.id) return;
    const selected = await window.api.media.selectLocalVideo();
    if (!selected) return;
    match = await cloudMatchService.updateMatch(match.id, { video: selected, status: match.status === 'created' ? 'tagging' : match.status });
    youtubePlayer?.destroy?.();
    youtubePlayer = null;
    youtubePlayerReady = false;
    await wireMedia();
    renderAll();
    showClipExportToast('MP4 local asociado. Ya podés exportar clips reales.');
  }

  /**
   * @param {object} timelineEvent
   * @returns {Promise<string|null>}
   */
  async function getClipExportBlockedMessage(timelineEvent) {
    if (!Number.isFinite(Number(timelineEvent?.timestamp))) return 'El evento no tiene timestamp válido para exportar.';
    if (match?.video?.type !== 'local' || !match.video.path) {
      return 'La exportación de clips requiere tener cargado el archivo MP4 local del partido.';
    }
    const exists = await window.api.media.localVideoExists(match.video.path);
    return exists ? null : 'No se encontró el video original. Volvé a cargar el MP4 del partido.';
  }

  /**
   * @param {object} timelineEvent
   */
  async function exportTimelineClip(timelineEvent) {
    if (!match?.id || !timelineEvent?.id) return;
    const blockedMessage = await getClipExportBlockedMessage(timelineEvent);
    if (blockedMessage) {
      showClipExportToast(blockedMessage);
      return;
    }
    showClipExportToast('Exportando clip...');
    try {
      const result = await window.api.clips.exportSingle({ matchId: match.id, eventId: timelineEvent.id });
      if (result?.canceled) {
        showClipExportToast('Exportación cancelada.');
        return;
      }
      showClipExportToast('Clip exportado correctamente.', result.outputDir);
    } catch (error) {
      showClipExportToast(error.message || 'No se pudo exportar el clip.');
    }
  }

  /**
   * @param {PointerEvent} event
   */
  function handleContextOutside(event) {
    if (timelineContextMenu?.contains(/** @type {Node} */ (event.target))) {
      document.addEventListener('pointerdown', handleContextOutside, { once: true });
      return;
    }
    closeTimelineContextMenu();
  }

  /**
   * @param {object} timelineEvent
   */
  function openEventEditModal(timelineEvent) {
    if (!match) return;
    const selectedEvent = (match.events || []).find(event => event.id === timelineEvent.id);
    if (!selectedEvent) return;
    let modal;
    modal = openModal({
      title: `Editar ${getTimelineEventTitle(selectedEvent)}`,
      body: `
        <div class="timeline-edit-modal">
          <div class="timeline-edit-type">
            <span>Tipo de evento</span>
            <strong>${escapeHtml(getTimelineEventTitle(selectedEvent))}</strong>
          </div>
          <label class="form-group">
            <span class="form-label">Resultado</span>
            <input class="form-input" type="text" data-edit-result value="${escapeHtml(formatEventValue(selectedEvent.result || ''))}" />
          </label>
          <label class="form-group">
            <span class="form-label">Subtipo</span>
            <input class="form-input" type="text" data-edit-subtype value="${escapeHtml(selectedEvent.subtype || '')}" />
          </label>
          <label class="form-group">
            <span class="form-label">Nota</span>
            <textarea class="form-input timeline-edit-note" rows="4" data-edit-note>${escapeHtml(selectedEvent.note || '')}</textarea>
          </label>
          ${renderInspectorZonePicker('Zona del campo', 'data-edit-zone', selectedEvent.zone)}
        </div>
      `,
      allowHtml: true,
      buttons: [
        { label: 'Cancelar', className: 'btn-secondary', onClick: () => modal.close() },
        { label: 'Guardar cambios', className: 'btn-primary', onClick: saveEventEditModal },
      ],
      className: 'timeline-event-edit-modal',
    });

    const overlay = document.getElementById('modal-overlay');
    async function saveEventEditModal() {
      if (!overlay) return;
      const resultInput = /** @type {HTMLInputElement|null} */ (overlay.querySelector('[data-edit-result]'));
      const subtypeInput = /** @type {HTMLInputElement|null} */ (overlay.querySelector('[data-edit-subtype]'));
      const noteInput = /** @type {HTMLTextAreaElement|null} */ (overlay.querySelector('[data-edit-note]'));
      const zoneInput = /** @type {HTMLInputElement|null} */ (overlay.querySelector('[data-edit-zone]'));
      pushUndoSnapshot();
      await cloudEventService.updateEvent(match.id, selectedEvent.id, {
        result: normalizeEventResultInput(resultInput?.value || ''),
        subtype: subtypeInput?.value.trim() || '',
        note: noteInput?.value || '',
        zone: zoneInput?.value.trim() || null,
      });
      match = await cloudMatchService.getMatchById(match.id);
      modal.close();
      renderAll();
    }
    if (overlay) wireInspectorZonePickers(overlay);
  }

  /**
   * @param {object} timelineEvent
   * @param {HTMLElement|undefined} block
   */
  async function deleteTimelineEventWithFade(timelineEvent, block) {
    if (!match || !timelineEvent?.id) return;
    pushUndoSnapshot();
    block?.classList.add('removing');
    await new Promise(resolve => window.setTimeout(resolve, 150));
    await cloudEventService.deleteEvent(match.id, timelineEvent.id);
    closeTimelineContextMenu();
    selectedTimelineEventId = null;
    match = await cloudMatchService.getMatchById(match.id);
    renderAll();
  }

  /**
   * @param {number} timestamp
   * @returns {Promise<string>}
   */
  async function captureLocalVideoFrameAt(timestamp) {
    if (!localVideo) return '';
    const targetTime = hasKnownDuration(duration)
      ? Math.max(0, Math.min(Number(duration), Number(timestamp) || 0))
      : Math.max(0, Number(timestamp) || 0);

    if (!localVideo.paused) {
      localVideo.pause();
      isPlaying = false;
      renderControls();
    }

    if (Math.abs((Number(localVideo.currentTime) || 0) - targetTime) > 0.05) {
      await new Promise((resolve) => {
        const timeout = window.setTimeout(resolve, 900);
        localVideo.addEventListener('seeked', () => {
          window.clearTimeout(timeout);
          window.requestAnimationFrame(resolve);
        }, { once: true });
        currentTime = targetTime;
        optimisticSeek = null;
        localVideo.currentTime = targetTime;
      });
    }

    if (localVideo.readyState < 2) {
      await new Promise((resolve) => {
        const timeout = window.setTimeout(resolve, 600);
        localVideo.addEventListener('loadeddata', () => {
          window.clearTimeout(timeout);
          window.requestAnimationFrame(resolve);
        }, { once: true });
      });
    }

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = localVideo.videoWidth || localVideo.clientWidth || 1280;
    frameCanvas.height = localVideo.videoHeight || localVideo.clientHeight || 720;
    try {
      frameCanvas.getContext('2d')?.drawImage(localVideo, 0, 0, frameCanvas.width, frameCanvas.height);
      return frameCanvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }

  /**
   * @param {object} drawing
   * @returns {Promise<string>}
   */
  async function resolveLiveDrawingEditBackground(drawing) {
    const existing = String(drawing?.backgroundImage || drawing?.imageDataUrl || '').trim();
    if (existing) return existing;
    if (localVideo) return captureLocalVideoFrameAt(Number(drawing?.timestamp) || getVisualCurrentTime());
    if (match?.video?.type === 'youtube') return buildYouTubeThumbnailUrl(match.video);
    return '';
  }

  async function startLiveDrawing() {
    if (!match || statsOnlyMode || drawingSession) return;
    closeActivePopupAnimated();
    if (localVideo && !localVideo.paused) {
      localVideo.pause();
      isPlaying = false;
      renderControls();
    }
    if (youtubePlayer && youtubePlayerReady) {
      youtubePlayer.pauseVideo();
      isPlaying = false;
      renderControls();
    }
    const mediaHost = /** @type {HTMLElement|null} */ (container.querySelector('#tagging-media-host'));
    if (!mediaHost) return;
    const rect = mediaHost.getBoundingClientRect();
    drawingSession = createDrawingEditor(mediaHost, {
      className: 'tagging-live-drawing-editor',
      sequenceMode: true,
      width: localVideo?.videoWidth || Math.round(rect.width) || 1280,
      height: localVideo?.videoHeight || Math.round(rect.height) || 720,
      onSave: async (payload) => {
        const timestamp = getVisualCurrentTime();
        const savedDrawing = await window.api.drawings.saveLive(match.id, {
          timestamp,
          durationSeconds: payload.durationSeconds,
          canvas: payload.canvas,
          backgroundImage: await resolveLiveDrawingEditBackground({ timestamp }),
          steps: payload.steps,
          strokes: payload.strokes,
        });
        liveDrawings = upsertLiveDrawing(liveDrawings, savedDrawing);
        match = await window.api.matches.getById(match.id);
        drawingSession = null;
        liveDrawingRenderKey = '';
        renderLiveDrawingOverlay();
        renderTimelineView({ preserveScroll: true });
      },
      onCancel: () => {
        drawingSession = null;
        renderLiveDrawingOverlay();
      },
    });
    renderLiveDrawingOverlay();
  }

  /**
   * @param {string|null|undefined} drawingId
   * @returns {object|null}
   */
  function getLiveDrawingById(drawingId) {
    return liveDrawings.find(drawing => String(drawing.id) === String(drawingId)) || null;
  }

  /**
   * @param {object} drawing
   */
  async function openLiveDrawingEditModal(drawing) {
    if (!match || !drawing?.id) return;
    const editableDrawing = getLiveDrawingById(drawing.id) || drawing;
    if (!Array.isArray(editableDrawing.strokes)) {
      loadLiveDrawings().then(() => {
        const loadedDrawing = getLiveDrawingById(drawing.id);
        if (loadedDrawing) openLiveDrawingEditModal(loadedDrawing);
      });
      return;
    }

    const backgroundImage = await resolveLiveDrawingEditBackground(editableDrawing);
    let modal;
    let editorSession = null;
    drawingModalOpen = true;
    modal = openModal({
      title: 'Editar dibujo',
      body: `
        <div class="live-drawing-edit-layout">
          <label class="form-group live-drawing-time-field">
            <span class="form-label">Inicio</span>
            <input class="form-input" type="text" data-live-drawing-timestamp value="${escapeHtml(formatClock(Number(editableDrawing.timestamp) || 0))}" placeholder="mm:ss" />
          </label>
          <div class="live-drawing-edit-host" data-live-drawing-edit-host></div>
        </div>
      `,
      allowHtml: true,
      buttons: [
        { label: 'Eliminar dibujo', className: 'event-delete-btn btn-sm', onClick: () => deleteSelectedTimelineDrawing(modal) },
      ],
      className: 'live-drawing-edit-modal',
      onClose: () => {
        drawingModalOpen = false;
        editorSession?.close?.(true);
      },
    });

    const overlay = document.getElementById('modal-overlay');
    const editorHost = /** @type {HTMLElement|null} */ (overlay?.querySelector('[data-live-drawing-edit-host]'));
    if (!editorHost) return;
    editorSession = createDrawingEditor(editorHost, {
      className: 'live-drawing-edit-editor',
      sequenceMode: true,
      width: editableDrawing.canvas?.width || 1280,
      height: editableDrawing.canvas?.height || 720,
      backgroundImage,
      steps: editableDrawing.steps,
      strokes: editableDrawing.strokes,
      durationSeconds: editableDrawing.durationSeconds,
      onSave: async (payload) => {
        const timestampInput = /** @type {HTMLInputElement|null} */ (overlay?.querySelector('[data-live-drawing-timestamp]'));
        const parsedTimestamp = parseManualTimestamp(timestampInput?.value || '');
        const timestamp = parsedTimestamp ?? (Number.isFinite(Number(editableDrawing.timestamp)) ? Number(editableDrawing.timestamp) : 0);
        const updatedDrawing = await window.api.drawings.updateLive(match.id, drawing.id, {
          timestamp,
          durationSeconds: payload.durationSeconds,
          canvas: payload.canvas,
          backgroundImage,
          steps: payload.steps,
          strokes: payload.strokes,
        });
        liveDrawings = upsertLiveDrawing(liveDrawings, updatedDrawing);
        match = await window.api.matches.getById(match.id);
        selectedTimelineDrawingId = updatedDrawing.id;
        liveDrawingRenderKey = '';
        renderLiveDrawingOverlay();
        renderTimelineView({ preserveScroll: true });
        modal.close();
      },
      onCancel: () => modal.close(),
    });
  }

  async function moveTimelineDrawing(drawing, timestamp) {
    if (!match || !drawing?.id || !Number.isFinite(timestamp)) return;
    const updatedDrawing = await window.api.drawings.updateLive(match.id, drawing.id, { timestamp });
    liveDrawings = upsertLiveDrawing(liveDrawings, updatedDrawing);
    match = await window.api.matches.getById(match.id);
    selectedTimelineDrawingId = updatedDrawing.id;
    selectedTimelineEventId = null;
    selectedTimelineSequenceKey = null;
    liveDrawingRenderKey = '';
    seekTo(timestamp);
    renderLiveDrawingOverlay();
    renderTimelineView({ preserveScroll: true });
  }

  /**
   * @param {unknown} error
   * @returns {boolean}
   */
  function isMissingDrawingIpcHandlerError(error) {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.includes('No handler registered') && message.includes('drawings:deleteLive');
  }

  /**
   * @param {string} drawingId
   * @returns {Promise<object>}
   */
  async function deleteLiveDrawingWithFallback(drawingId) {
    if (!match) return { deleted: false, id: drawingId };
    if (typeof window.api.drawings.deleteLive === 'function') {
      try {
        return await window.api.drawings.deleteLive(match.id, drawingId);
      } catch (error) {
        if (!isMissingDrawingIpcHandlerError(error)) throw error;
      }
    }

    const nextDrawings = (Array.isArray(match.drawings) ? match.drawings : [])
      .filter(drawing => String(drawing.id) !== String(drawingId));
    match = await window.api.matches.update(match.id, { drawings: nextDrawings });
    return { deleted: true, id: drawingId };
  }

  async function deleteSelectedTimelineDrawing(modal = null) {
    if (!match || !selectedTimelineDrawingId) return;
    await deleteLiveDrawingWithFallback(selectedTimelineDrawingId);
    liveDrawings = liveDrawings.filter(drawing => String(drawing.id) !== String(selectedTimelineDrawingId));
    match = await window.api.matches.getById(match.id);
    selectedTimelineDrawingId = null;
    liveDrawingRenderKey = '';
    modal?.close?.();
    renderLiveDrawingOverlay();
    renderTimelineView({ preserveScroll: true });
  }

  /**
   * @param {object} timelineEvent
   */
  async function captureFrameAndDraw(timelineEvent) {
    if (!match || !localVideo || !timelineEvent?.id) return;
    const timestamp = Math.max(0, Number(timelineEvent.timestamp) || 0);
    localVideo.pause();
    isPlaying = false;
    currentTime = timestamp;
    optimisticSeek = { time: timestamp, until: Date.now() + SEEK_VISUAL_LOCK_MS };
    const seeked = new Promise(resolve => {
      localVideo.addEventListener('seeked', () => window.requestAnimationFrame(resolve), { once: true });
    });
    const fallbackFrame = new Promise(resolve => {
      window.setTimeout(() => window.requestAnimationFrame(resolve), 250);
    });
    localVideo.currentTime = timestamp;
    await Promise.race([seeked, fallbackFrame]);
    renderControls();
    updateTimelinePlaybackView();
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = localVideo.videoWidth || localVideo.clientWidth || 1280;
    frameCanvas.height = localVideo.videoHeight || localVideo.clientHeight || 720;
    frameCanvas.getContext('2d')?.drawImage(localVideo, 0, 0, frameCanvas.width, frameCanvas.height);
    openFrameDrawingEditor(timelineEvent, frameCanvas.toDataURL('image/png'), frameCanvas.width, frameCanvas.height);
  }

  /**
   * @param {object} timelineEvent
   * @param {string} frameDataUrl
   * @param {number} width
   * @param {number} height
   */
  function openFrameDrawingEditor(timelineEvent, frameDataUrl, width, height) {
    if (!match) return;
    let modal;
    modal = openModal({
      title: 'Capturar frame y dibujar',
      body: '<div class="frame-drawing-editor" data-frame-drawing-host></div>',
      allowHtml: true,
      className: 'frame-drawing-modal',
    });
    const host = /** @type {HTMLElement|null} */ (document.querySelector('[data-frame-drawing-host]'));
    if (!host) return;
    createDrawingEditor(host, {
      width,
      height,
      backgroundImage: frameDataUrl,
      includeImageData: true,
      allowExport: true,
      onSave: async (payload) => {
        await window.api.drawings.saveFrame(match.id, timelineEvent.id, {
          imageDataUrl: payload.imageDataUrl,
          durationSeconds: payload.durationSeconds,
          canvas: payload.canvas,
          strokes: payload.strokes,
        });
        match = await window.api.matches.getById(match.id);
        modal.close();
        renderAll();
      },
      onExport: async (dataUrl) => {
        await window.api.drawings.exportPng(dataUrl, `frame-${formatClock(Number(timelineEvent.timestamp)).replace(':', '-')}.png`);
      },
      onCancel: () => modal.close(),
    });
  }

  /**
   * @param {object|null} event
   */
  function selectTimelineEvent(event) {
    if (!event?.id) return;
    selectedTimelineEventId = event.id;
    selectedTimelineSequenceKey = null;
    selectedTimelineDrawingId = null;
    isEventInspectorEditing = false;
    isSequenceInspectorEditing = false;
    renderEventInspector();
    renderTimelineView();
  }

  async function moveTimelineEvent(event, timestamp) {
    if (!match || !event?.id || !Number.isFinite(timestamp)) return;
    pushUndoSnapshot();
    await cloudEventService.updateEvent(match.id, event.id, { timestamp });
    match = await cloudMatchService.getMatchById(match.id);
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
    selectedTimelineDrawingId = null;
    isEventInspectorEditing = false;
    isSequenceInspectorEditing = false;
    renderEventInspector();
    seekTo(Number(sequence.start));
    renderTimelineView();
  }

  function closeEventInspector() {
    selectedTimelineEventId = null;
    selectedTimelineSequenceKey = null;
    selectedTimelineDrawingId = null;
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
      team: teamInput?.value === 'home' || teamInput?.value === 'away' ? teamInput.value : null,
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
    const timestampInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-inspector-timestamp]'));
    const timestampValidation = validateManualTimestampInput(timestampInput?.value || '', { statsOnlyMode: true, duration });
    if (!timestampValidation.valid) {
      showTaggingFeedback(timestampValidation.message, 'error');
      return;
    }
    const updates = readInspectorForm();
    updates.timestamp = timestampValidation.seconds;
    pushUndoSnapshot();
    await cloudEventService.updateEvent(match.id, selectedTimelineEventId, updates);
    match = await cloudMatchService.getMatchById(match.id);
    isEventInspectorEditing = false;
    renderAll();
  }

  async function deleteSelectedTimelineEvent() {
    if (!match || !selectedTimelineEventId) return;
    pushUndoSnapshot();
    await cloudEventService.deleteEvent(match.id, selectedTimelineEventId);
    selectedTimelineEventId = null;
    selectedTimelineSequenceKey = null;
    selectedTimelineDrawingId = null;
    isEventInspectorEditing = false;
    isSequenceInspectorEditing = false;
    match = await cloudMatchService.getMatchById(match.id);
    renderAll();
  }

  async function saveSelectedTimelineSequence() {
    if (!match || !selectedTimelineSequenceKey) return;
    const startInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-start]'));
    const endInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-end]'));
    const zoneStartInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-zone-start]'));
    const zoneEndInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-zone-end]'));
    const startValidation = validateManualTimestampInput(startInput?.value || '', { statsOnlyMode: false, duration });
    const endValidation = validateManualTimestampInput(endInput?.value || '', { statsOnlyMode: false, duration });
    if (!startValidation.valid || !endValidation.valid) {
      showTaggingFeedback(startValidation.message || endValidation.message, 'error');
      return;
    }
    if (Number(endValidation.seconds) <= Number(startValidation.seconds)) {
      showTaggingFeedback('El fin de secuencia debe ser posterior al inicio.', 'error');
      return;
    }
    if (!zoneStartInput?.value.trim() || !zoneEndInput?.value.trim()) {
      showTaggingFeedback('Selecciona zona de inicio y zona de fin para guardar la secuencia.', 'error');
      return;
    }
    const updates = readSequenceInspectorForm();
    const nextSequences = (match.sequences || []).map(sequence => (
      getSequenceKey(sequence) === selectedTimelineSequenceKey
        ? { ...sequence, ...updates }
        : sequence
    ));
    pushUndoSnapshot();
    match = await cloudMatchService.updateMatch(match.id, {
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
    match = await cloudMatchService.updateMatch(match.id, {
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
      currentTime = Number(localVideo.currentTime) || currentTime;
      lastPlaybackSyncAt = Date.now();
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
      lastPlaybackSyncAt = Date.now();
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

  function consumeInitialSeekParam() {
    if (initialSeekSeconds === null || initialSeekConsumed) return;
    seekTo(initialSeekSeconds);
    if (statsOnlyMode || localVideo || youtubePlayerReady || !match?.video?.type) {
      initialSeekConsumed = true;
    }
  }

  /**
   * @param {number} requestedTime
   */
  function pauseActivePossessionForControlledSeek(requestedTime) {
    if (!state.possession?.activeTeam) return;
    if (Math.abs((Number(requestedTime) || 0) - getVisualCurrentTime()) <= POSSESSION_MAX_GAP_SECONDS) return;
    state = closeActivePossession(state, getVisualCurrentTime());
    void flushPossessionSave('seek', true);
    renderPossession();
    renderTimelineView({ preserveScroll: true });
    showTaggingFeedback('Posesion pausada por seek manual. Reactivala con 1 o 2.', 'info');
  }

  function seekTo(seconds) {
    const requestedTime = Math.max(0, Number(seconds) || 0);
    pauseActivePossessionForControlledSeek(requestedTime);
    if (!localVideo && !youtubePlayer) {
      currentTime = hasKnownDuration(duration)
        ? Math.min(duration, requestedTime)
        : requestedTime;
      optimisticSeek = null;
      lastPlaybackSyncAt = Date.now();
      renderControls();
      updateTimelinePlaybackView();
      return;
    }

    currentTime = hasKnownDuration(duration)
      ? Math.min(duration, requestedTime)
      : requestedTime;
    lastPlaybackSyncAt = Date.now();
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
      const playerTime = Number(youtubePlayer.getCurrentTime());
      syncPlaybackTime(playerTime);
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
      const validation = validateManualTimestampInput(manual?.value || '', { statsOnlyMode: true, duration });
      return validation.valid ? validation.seconds : null;
    }
    return getVisualCurrentTime();
  }

  /**
   * @param {string} actionLabel
   * @returns {number|null}
   */
  function getRequiredTagTimestamp(actionLabel) {
    if (!statsOnlyMode) return getVisualCurrentTime();
    const manual = /** @type {HTMLInputElement|null} */ (container.querySelector('#manual-timestamp'));
    const validation = validateManualTimestampInput(manual?.value || '', { statsOnlyMode: false, duration });
    if (!validation.valid || !Number.isFinite(validation.seconds)) {
      showTaggingFeedback(`${actionLabel}: ${validation.message}`, 'error');
      return null;
    }
    return validation.seconds;
  }

  /**
   * @param {string} value
   * @returns {number|null}
   */
  function parseManualTimestamp(value) {
    const parsed = parseManualTimestampInput(value);
    return parsed.valid ? parsed.seconds : null;
  }

  async function handlePopupOption(value) {
    const result = selectPopupOption(state, value);
    state = result.state;
    if (result.completed && result.event) {
      stopSpeechNote();
      await saveEvent(result.event);
    }
    renderAll();
  }

  async function completeActivePopup() {
    const result = completePopup(state);
    state = result.state;
    if (result.completed && result.event) {
      stopSpeechNote();
      await saveEvent(result.event);
    }
    renderAll();
  }

  async function saveEvent(event) {
    if (!match) return;
    const eventPayload = buildEventPayload(event);
    if (!eventPayload) return;
    if (statsOnlyMode) {
      const manual = /** @type {HTMLInputElement|null} */ (container.querySelector('#manual-timestamp'));
      const timestampValidation = validateManualTimestampInput(manual?.value || '', { statsOnlyMode: true, duration });
      if (!timestampValidation.valid) {
        showTaggingFeedback(timestampValidation.message, 'error');
        return;
      }
      eventPayload.timestamp = timestampValidation.seconds;
    } else {
      const timestampValidation = validateManualTimestampInput(String(eventPayload.timestamp ?? ''), { statsOnlyMode: false, duration });
      if (!timestampValidation.valid) {
        showTaggingFeedback(timestampValidation.message, 'error');
        return;
      }
      eventPayload.timestamp = timestampValidation.seconds;
    }
    const previousEventIds = new Set((match.events || []).map(item => String(item.id || item.timestamp)));
    pushUndoSnapshot();
    await cloudEventService.addEvent(match.id, eventPayload);
    match = await cloudMatchService.getMatchById(match.id);
    const createdEvent = (match.events || []).find(item => !previousEventIds.has(String(item.id || item.timestamp)));
    markNewTimelineEntry(newTimelineEventIds, createdEvent?.id || createdEvent?.timestamp);
    const pointsDelta = getScoreDeltaForEvent(eventPayload);
    if (pointsDelta > 0) {
      renderScoreboard();
    }
  }

  async function savePossession() {
    if (!match) return;
    match = await cloudMatchService.updateMatch(match.id, {
      possession: state.possession,
      status: match.status === 'created' ? 'tagging' : match.status,
    });
  }

  /**
   * @param {string} reason
   * @param {boolean} [force]
   */
  function queuePossessionSave(reason, force = false) {
    if (!match) return;
    pendingPossessionSaveReason = reason || pendingPossessionSaveReason || 'progress';
    const fingerprint = getPossessionPersistenceFingerprint(state.possession);
    const changed = fingerprint !== lastSavedPossessionFingerprint;
    const now = Date.now();
    if (!shouldSavePossessionSnapshot({
      changed,
      force,
      now,
      lastSaveAt: lastPossessionSaveAt,
      intervalMs: POSSESSION_SAVE_INTERVAL_MS,
    })) {
      if (changed && !pendingPossessionSaveTimer) {
        const waitMs = Math.max(0, POSSESSION_SAVE_INTERVAL_MS - (now - lastPossessionSaveAt));
        pendingPossessionSaveTimer = window.setTimeout(() => {
          pendingPossessionSaveTimer = 0;
          void flushPossessionSave(pendingPossessionSaveReason || 'progress', false);
        }, waitMs);
      }
      return;
    }
    void flushPossessionSave(reason, force);
  }

  /**
   * @param {string} reason
   * @param {boolean} [force]
   * @returns {Promise<boolean>}
   */
  async function flushPossessionSave(reason, force = false) {
    if (!match) return true;
    if (pendingPossessionSaveTimer) {
      window.clearTimeout(pendingPossessionSaveTimer);
      pendingPossessionSaveTimer = 0;
    }
    const fingerprint = getPossessionPersistenceFingerprint(state.possession);
    const changed = fingerprint !== lastSavedPossessionFingerprint;
    if (!force && !changed) return true;
    if (possessionSaveInFlight) await possessionSaveInFlight;
    possessionSaveInFlight = savePossessionSafely(reason)
      .then((saved) => {
        if (saved) {
          lastSavedPossessionFingerprint = getPossessionPersistenceFingerprint(state.possession);
          lastPossessionSaveAt = Date.now();
          pendingPossessionSaveReason = '';
        }
        return saved;
      })
      .finally(() => {
        possessionSaveInFlight = null;
      });
    return possessionSaveInFlight;
  }

  /**
   * @param {string} reason
   * @returns {Promise<boolean>}
   */
  async function savePossessionSafely(reason) {
    try {
      await savePossession();
      return true;
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
      showTaggingFeedback(`No se pudo guardar el cierre de posesion.${detail}`, 'error');
      return false;
    }
  }

  /**
   * @param {string} reason
   * @returns {Promise<boolean>}
   */
  async function closeActivePossessionSafely(reason) {
    void reason;
    if (!match) return true;
    try {
      state = closeActivePossession(state, getVisualCurrentTime());
      return flushPossessionSave(reason, true);
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
      showTaggingFeedback(`No se pudo guardar el cierre de posesion.${detail}`, 'error');
      return false;
    }
  }

  async function resetPossessionWithWarning() {
    if (!match) return;
    const confirmed = window.confirm('Esto va a borrar toda la posesion marcada en este partido. Continuar?');
    if (!confirmed) return;
    pushUndoSnapshot();
    state = resetPossession(state);
    await flushPossessionSave('reset', true);
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
    const current = getScoreParts(match);
    const safeDelta = scoreDelta(delta);
    const nextManual = { ...current.manual };
    if (team === 'home') {
      nextManual.homeDelta = Math.max(-current.events.homeScore, nextManual.homeDelta + safeDelta);
    } else {
      nextManual.awayDelta = Math.max(-current.events.awayScore, nextManual.awayDelta + safeDelta);
    }
    const nextScore = getAdjustedScore(current.events, nextManual);
    const scoreAdjustment = hasManualScoreAdjustment(nextManual)
      ? {
        ...nextManual,
        updatedAt: new Date().toISOString(),
      }
      : null;
    match = await cloudMatchService.updateMatch(match.id, {
      ...nextScore,
      scoreAdjustment,
      scoreOverride: null,
      status: match.status === 'created' ? 'tagging' : match.status,
    });
    renderScoreboard();
  }

  async function clearScoreOverride() {
    if (!match) return;
    pushUndoSnapshot();
    const score = calculateScoreFromEvents(match.events || []);
    match = await cloudMatchService.updateMatch(match.id, {
      ...score,
      scoreAdjustment: null,
      scoreOverride: null,
      status: match.status === 'created' ? 'tagging' : match.status,
    });
    renderScoreboard();
  }

  async function saveSequence(result) {
    if (!match || !sequencePrompt) return;
    const zoneStartInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-prompt-zone-start]'));
    const zoneEndInput = /** @type {HTMLInputElement|null} */ (container.querySelector('[data-sequence-prompt-zone-end]'));
    const finished = finishSequence(state, sequencePrompt.timestamp, result, {
      zoneStart: zoneStartInput?.value.trim() || sequencePrompt.zoneStart || null,
      zoneEnd: zoneEndInput?.value.trim() || sequencePrompt.zoneEnd || null,
      requireZones: true,
    });
    if (finished.error) {
      sequencePrompt = {
        ...sequencePrompt,
        result,
        zoneStart: zoneStartInput?.value.trim() || sequencePrompt.zoneStart || '',
        zoneEnd: zoneEndInput?.value.trim() || sequencePrompt.zoneEnd || '',
        error: finished.error,
      };
      showTaggingFeedback(finished.error, 'error');
      renderSequencePrompt();
      return;
    }
    pushUndoSnapshot();
    state = finished.state;
    sequencePrompt = null;
    if (finished.sequence) {
      const enrichedSequence = enrichSequenceFromEvents(finished.sequence, match.events || []);
      const nextSequence = { ...enrichedSequence, color: enrichedSequence.color || 'red' };
      markNewTimelineEntry(newTimelineSequenceIds, getSequenceKey(nextSequence));
      match = await cloudMatchService.updateMatch(match.id, {
        sequences: [...(match.sequences || []), nextSequence],
        status: match.status === 'created' ? 'tagging' : match.status,
      });
    }
    renderAll();
  }

  /**
   * @param {Set<string>} collection
   * @param {string|number|null|undefined} id
   */
  function markNewTimelineEntry(collection, id) {
    if (id === null || id === undefined) return;
    const key = String(id);
    collection.add(key);
    window.setTimeout(() => {
      collection.delete(key);
    }, 260);
  }

  function resetSpeechSession(noteInput = null) {
    speechBaseNote = noteInput?.value || state.activePopup?.note || '';
    speechRenderedNote = speechBaseNote;
    speechFinalSegments = new Map();
    speechInterimSegments = new Map();
  }

  function resetSpeechUiState() {
    speechStatus = 'idle';
    speechErrorMessage = '';
    speechListening = false;
    speechStopRequested = false;
    speechRecognition = null;
    speechEngine = null;
    stopNativeSpeechSubscriptions();
    resetSpeechSession();
  }

  function stopNativeSpeechSubscriptions() {
    nativeSpeechResultCleanup?.();
    nativeSpeechErrorCleanup?.();
    nativeSpeechStatusCleanup?.();
    nativeSpeechResultCleanup = null;
    nativeSpeechErrorCleanup = null;
    nativeSpeechStatusCleanup = null;
  }

  /**
   * @param {{transcript?: string, isFinal?: boolean}} payload
   */
  function applyNativeSpeechResult(payload) {
    const noteInput = /** @type {HTMLTextAreaElement|null} */ (container.querySelector('[data-popup-note]'));
    const transcript = String(payload?.transcript || '').trim();
    if (!noteInput || !transcript) return;

    if (speechRenderedNote && noteInput.value !== speechRenderedNote) {
      resetSpeechSession(noteInput);
    }

    if (payload.isFinal === false) {
      speechInterimSegments.set(0, transcript);
    } else {
      const finalIndex = speechFinalSegments.size
        ? Math.max(...speechFinalSegments.keys()) + 1
        : 0;
      speechFinalSegments.set(finalIndex, transcript);
      speechInterimSegments.clear();
    }

    const nextNote = buildSpeechNoteValue(
      speechBaseNote,
      getSpeechSegmentsText(speechFinalSegments),
      getSpeechSegmentsText(speechInterimSegments),
    );
    noteInput.value = nextNote;
    speechRenderedNote = nextNote;
    state = updatePopupNote(state, nextNote);
  }

  /**
   * @param {HTMLTextAreaElement} noteInput
   * @returns {Promise<boolean>}
   */
  async function startNativeSpeechNote(noteInput) {
    if (!window.api?.speech?.start) return false;

    resetSpeechSession(noteInput);
    stopNativeSpeechSubscriptions();
    speechEngine = 'native';
    speechStopRequested = false;
    speechListening = true;
    speechStatus = 'listening';
    speechErrorMessage = '';

    nativeSpeechResultCleanup = window.api.speech.onResult?.((payload) => {
      if (speechEngine !== 'native' || speechStopRequested) return;
      applyNativeSpeechResult(payload);
    });
    nativeSpeechErrorCleanup = window.api.speech.onError?.((payload) => {
      if (speechEngine !== 'native' || speechStopRequested) return;
      speechListening = false;
      speechStatus = 'error';
      speechErrorMessage = payload?.message || 'No se pudo iniciar el dictado nativo de Windows.';
      stopNativeSpeechSubscriptions();
      renderPopup();
    });
    nativeSpeechStatusCleanup = window.api.speech.onStatus?.((payload) => {
      if (speechEngine !== 'native' || speechStopRequested) return;
      if (payload?.status === 'idle') {
        speechListening = false;
        speechStatus = 'idle';
        renderPopup();
      }
    });

    try {
      const result = await window.api.speech.start({ language: settings?.microphone?.language || 'es-AR' });
      if (result?.ok) {
        renderPopup();
        return true;
      }
      speechListening = false;
      speechStatus = 'error';
      speechErrorMessage = result?.message || 'No se pudo iniciar el dictado nativo de Windows.';
      stopNativeSpeechSubscriptions();
      renderPopup();
      return true;
    } catch (error) {
      speechListening = false;
      speechStatus = 'error';
      speechErrorMessage = getSpeechErrorMessage(error);
      stopNativeSpeechSubscriptions();
      renderPopup();
      return true;
    }
  }

  /**
   * @param {object|null|undefined} microphone
   * @returns {MediaStreamConstraints}
   */
  function getSpeechMicrophoneConstraints(microphone) {
    const deviceId = String(microphone?.deviceId || '');
    return {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    };
  }

  /**
   * @param {MediaStream|null} stream
   */
  function stopSpeechPermissionStream(stream) {
    stream?.getTracks?.().forEach(track => track.stop());
  }

  /**
   * @param {unknown} error
   * @returns {boolean}
   */
  function isSelectedMicrophoneUnavailable(error) {
    const name = error?.name || '';
    return name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError' || name === 'NotFoundError';
  }

  async function requestSpeechMicrophoneAccess() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const microphone = settings?.microphone || {};
    try {
      const stream = await navigator.mediaDevices.getUserMedia(getSpeechMicrophoneConstraints(microphone));
      stopSpeechPermissionStream(stream);
    } catch (error) {
      if (microphone.deviceId && isSelectedMicrophoneUnavailable(error)) {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stopSpeechPermissionStream(fallbackStream);
        return;
      }
      throw error;
    }
  }

  /**
   * @param {Map<number, string>} segments
   * @returns {string}
   */
  function getSpeechSegmentsText(segments) {
    return Array.from(segments.entries())
      .sort(([left], [right]) => left - right)
      .map(([, transcript]) => transcript.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  /**
   * @param {SpeechRecognitionEvent} event
   */
  function applySpeechResult(event) {
    const noteInput = /** @type {HTMLTextAreaElement|null} */ (container.querySelector('[data-popup-note]'));
    if (!noteInput) return;

    if (speechRenderedNote && noteInput.value !== speechRenderedNote) {
      resetSpeechSession(noteInput);
    }

    const startIndex = Number.isInteger(event.resultIndex) ? event.resultIndex : 0;
    for (let index = startIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = String(result?.[0]?.transcript || '').trim();
      if (!transcript) continue;
      if (result.isFinal) {
        speechFinalSegments.set(index, transcript);
        speechInterimSegments.delete(index);
      } else {
        speechInterimSegments.set(index, transcript);
      }
    }

    const nextNote = buildSpeechNoteValue(
      speechBaseNote,
      getSpeechSegmentsText(speechFinalSegments),
      getSpeechSegmentsText(speechInterimSegments),
    );
    noteInput.value = nextNote;
    speechRenderedNote = nextNote;
    state = updatePopupNote(state, nextNote);
  }

  async function startSpeechNote() {
    const noteInput = /** @type {HTMLTextAreaElement|null} */ (container.querySelector('[data-popup-note]'));
    if (!noteInput) {
      speechStatus = 'disabled';
      speechErrorMessage = 'No se encontro el campo de nota para dictar.';
      renderPopup();
      return;
    }

    if (await startNativeSpeechNote(noteInput)) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      speechStatus = 'disabled';
      speechErrorMessage = 'El dictado por voz no esta disponible en este entorno de Electron.';
      renderPopup();
      return;
    }

    try {
      await requestSpeechMicrophoneAccess();
      resetSpeechSession(noteInput);
      speechStopRequested = false;
      speechListening = true;
      speechStatus = 'listening';
      speechErrorMessage = '';
      speechEngine = 'web-speech';

      const recognition = new SpeechRecognition();
      speechRecognition = recognition;
      recognition.lang = settings?.microphone?.language || 'es-AR';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = applySpeechResult;
      recognition.onerror = (event) => {
        if (speechStopRequested && event.error === 'aborted') return;
        speechListening = false;
        speechStatus = 'error';
        speechErrorMessage = getSpeechErrorMessage(event);
        renderPopup();
      };
      recognition.onend = () => {
        speechRecognition = null;
        speechListening = false;
        if (!speechStopRequested && speechStatus === 'listening') {
          speechStatus = 'idle';
          renderPopup();
        }
      };
      recognition.start();
      renderPopup();
    } catch (error) {
      speechListening = false;
      speechStatus = 'error';
      speechErrorMessage = getSpeechErrorMessage(error);
      renderPopup();
    }
  }

  function stopSpeechNote(shouldRender = false) {
    speechStopRequested = true;
    speechListening = false;
    if (speechEngine === 'native') {
      window.api.speech.stop?.();
      stopNativeSpeechSubscriptions();
    }
    if (speechRecognition) {
      try {
        speechRecognition.stop();
      } catch {
        speechRecognition.abort?.();
      }
    }
    speechRecognition = null;
    speechEngine = null;
    if (speechStatus === 'listening') speechStatus = 'idle';
    if (shouldRender) renderPopup();
  }

  function toggleSpeechNote() {
    if (speechListening || speechRecognition) {
      stopSpeechNote(true);
      return;
    }
    startSpeechNote();
  }

  function checkAutoClose() {
    const popupHost = container.querySelector('#tag-popup-host');
    if (!shouldAutoClosePopup(state, Date.now(), { isInteracting: isPopupInputFocused(popupHost) })) return;
    closeActivePopupAnimated();
  }

  function closeActivePopupAnimated() {
    stopSpeechNote();
    const popupEl = container.querySelector('#tag-popup-host .tag-popup');
    if (!popupEl) {
      state = closePopup(state);
      resetSpeechUiState();
      renderPopup();
      return;
    }

    popupEl.classList.add('closing');
    window.setTimeout(() => {
      state = closePopup(state);
      resetSpeechUiState();
      renderPopup();
    }, 80);
  }

  /**
   * @param {KeyboardEvent} event
   */
  function handleKeydown(event) {
    const key = event.key.toUpperCase();
    const popupHost = /** @type {HTMLElement|null} */ (container.querySelector('#tag-popup-host'));

    if (drawingSession || drawingModalOpen) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !isEditableTarget(document.activeElement)) {
      event.preventDefault();
      event.shiftKey ? redoLastChange() : undoLastChange();
      return;
    }

    if (state.activePopup) {
      if (isSpeechToggleHotkey(event)) {
        event.preventDefault();
        toggleSpeechNote();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActivePopupAnimated();
        return;
      }
      if (popupHost && trapFocusInPopup(popupHost, event)) return;
      if (shouldCompletePopupFromKeydown(event, document.activeElement)) {
        event.preventDefault();
        completeActivePopup();
        return;
      }
      if (isEditableTarget(document.activeElement)) return;
      if (hasSystemModifier(event)) return;
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
      if (!isEditableTarget(document.activeElement) && event.key.length === 1) {
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

    if (hasSystemModifier(event)) return;

    if (sequencePrompt) {
      const sequenceHost = container.querySelector('#sequence-popup-host');
      if (sequenceHost && trapFocusInPopup(sequenceHost, event)) return;
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

    if ((selectedTimelineDrawingId || selectedTimelineEventId || selectedTimelineSequenceKey) && event.key === 'Escape') {
      event.preventDefault();
      closeEventInspector();
      return;
    }

    if (isEditableTarget(document.activeElement)) return;

    if ((selectedTimelineDrawingId || selectedTimelineEventId || selectedTimelineSequenceKey) && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      if (selectedTimelineDrawingId) {
        deleteSelectedTimelineDrawing();
      } else if (selectedTimelineSequenceKey) {
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
      const possessionTimestamp = getRequiredTagTimestamp('Posesion');
      if (possessionTimestamp === null) return;
      pushUndoSnapshot();
      state = advancePossession(state, possessionTimestamp, POSSESSION_MAX_GAP_SECONDS);
      state = togglePossession(state, key === '1' ? 'home' : 'away', possessionTimestamp);
      void flushPossessionSave('hotkey', true);
      renderPossession();
      renderTimelineView();
      return;
    }
    if (key === 'Q') {
      event.preventDefault();
      const sequenceStart = getRequiredTagTimestamp('Inicio de secuencia');
      if (sequenceStart === null) return;
      state = startSequence(state, sequenceStart);
      renderPossession();
      return;
    }
    if (key === 'E' && state.sequence.active) {
      event.preventDefault();
      const sequenceEnd = getRequiredTagTimestamp('Fin de secuencia');
      if (sequenceEnd === null) return;
      sequencePrompt = { timestamp: sequenceEnd };
      renderSequencePrompt();
      return;
    }
    if (key === 'D') {
      event.preventDefault();
      startLiveDrawing();
      return;
    }
    if (getActiveEventDefinitions()[key]) {
      event.preventDefault();
      selectedTimelineEventId = null;
      selectedTimelineSequenceKey = null;
      selectedTimelineDrawingId = null;
      isEventInspectorEditing = false;
      isSequenceInspectorEditing = false;
      renderEventInspector();
      resetSpeechUiState();
      state = openTagPopup(state, key, getTagTimestamp());
      renderPopup();
    }
  }
}
