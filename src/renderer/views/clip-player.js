// @ts-check
import { cloudMatchService } from '../cloud/cloud-match-service.js';
import { getMatchTitle } from '../components/match-selection.js';
import { setSidebarExpanded } from '../components/sidebar.js';
import { formatClock } from '../components/timeline.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { navigate } from '../router.js';

let activeCleanup = null;
let youtubeApiPromise = null;

const YOUTUBE_IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';
const DEFAULT_CLIP_PRE_ROLL_SECONDS = 3;
const DEFAULT_CLIP_POST_ROLL_SECONDS = 10;

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
  const videoId = source?.videoId || extractYouTubeVideoId(source?.embedUrl || source?.url || '');
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

function normalizeClipSeconds(value, fallback, min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min) return fallback;
  return Math.min(60, Math.round(numeric));
}

export function calculateClipPlayerRange(timestamp, videoDuration, settings = {}) {
  const eventTimestamp = Number(timestamp);
  if (!Number.isFinite(eventTimestamp) || eventTimestamp < 0) throw new Error('El evento no tiene timestamp valido para reproducir.');
  const preRoll = normalizeClipSeconds(settings.clipPreRollSeconds, DEFAULT_CLIP_PRE_ROLL_SECONDS, 0);
  const postRoll = normalizeClipSeconds(settings.clipPostRollSeconds, DEFAULT_CLIP_POST_ROLL_SECONDS, 1);
  const start = Math.max(0, eventTimestamp - preRoll);
  const maxDuration = Number(videoDuration);
  const unclampedEnd = eventTimestamp + postRoll;
  const end = Number.isFinite(maxDuration) && maxDuration > 0 ? Math.min(maxDuration, unclampedEnd) : unclampedEnd;
  return {
    start: Math.round(start * 1000) / 1000,
    end: Math.round(end * 1000) / 1000,
    duration: Math.round(Math.max(0, end - start) * 1000) / 1000,
  };
}

function normalizeClipFilterKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}

function hasValidClipTimestamp(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0;
}

function identifyBiguaTeam(match = {}) {
  if (String(match.homeTeam || '').toLowerCase().includes('bigua')) return 'home';
  if (String(match.awayTeam || '').toLowerCase().includes('bigua')) return 'away';
  return 'home';
}

function resolveClipTeamFilter(team, match = {}) {
  const normalized = normalizeClipFilterKey(team || 'all');
  if (!normalized || normalized === 'all') return null;
  if (normalized === 'home' || normalized === 'away') return normalized;
  const bigua = identifyBiguaTeam(match);
  if (normalized === 'bigua') return bigua;
  if (normalized === 'rival') return bigua === 'home' ? 'away' : 'home';
  return null;
}

function filterClipPlayerEvents(events = [], filters = {}, match = {}) {
  const type = normalizeClipFilterKey(filters.type || 'all');
  const result = normalizeClipFilterKey(filters.result || 'all');
  const team = resolveClipTeamFilter(filters.team, match);
  const fromSeconds = Number(filters.fromSeconds);
  const toSeconds = Number(filters.toSeconds);
  const hasFrom = Number.isFinite(fromSeconds);
  const hasTo = Number.isFinite(toSeconds);

  return (Array.isArray(events) ? events : [])
    .filter((event) => {
      if (!hasValidClipTimestamp(event?.timestamp)) return false;
      const timestamp = Number(event.timestamp);
      if (type !== 'all' && normalizeClipFilterKey(event.type) !== type) return false;
      if (result !== 'all') {
        const resultMatches = [event.result, event.outcome, event.subtype]
          .some(value => normalizeClipFilterKey(value) === result);
        if (!resultMatches) return false;
      }
      if (team && event.team !== team) return false;
      if (hasFrom && timestamp < fromSeconds) return false;
      if (hasTo && timestamp > toSeconds) return false;
      return true;
    })
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
}

function getClipRequestFromParams(params = {}) {
  return {
    eventId: params.eventId || null,
    eventTimestamp: params.eventTimestamp === '' || params.eventTimestamp === undefined ? null : Number(params.eventTimestamp),
    type: params.clipType || params.type || 'all',
    result: params.clipResult || params.result || 'all',
    team: params.clipTeam || params.team || 'all',
    fromSeconds: params.clipFrom === '' || params.clipFrom === undefined ? null : Number(params.clipFrom),
    toSeconds: params.clipTo === '' || params.clipTo === undefined ? null : Number(params.clipTo),
  };
}

function getEventTitle(event) {
  const type = normalizeClipFilterKey(event?.type || 'evento').replaceAll('-', ' ');
  const result = event?.result || event?.outcome || event?.subtype || '';
  return [type, result].filter(Boolean).join(' / ');
}

function buildClipQueue(match, settings, params) {
  const request = getClipRequestFromParams(params);
  const eventIdMatches = request.eventId
    ? (match.events || []).filter(event => String(event.id) === String(request.eventId))
    : [];
  const sourceEvents = eventIdMatches.length > 0
    ? eventIdMatches
    : Number.isFinite(request.eventTimestamp)
      ? (match.events || []).filter(event => Number(event.timestamp) === Number(request.eventTimestamp))
      : filterClipPlayerEvents(match.events || [], request, match);
  const videoDuration = Number(match.video?.duration || match.videoDuration || match.duration);
  return sourceEvents
    .filter(event => hasValidClipTimestamp(event?.timestamp))
    .map((event, index) => {
      const range = calculateClipPlayerRange(event.timestamp, videoDuration, settings);
      return {
        event,
        index,
        start: range.start,
        end: range.end,
        duration: range.duration,
        title: getEventTitle(event),
      };
    });
}

function renderQueue(clips, activeIndex = 0) {
  return clips.map((clip, index) => `
    <button class="clip-player-queue-item${index === activeIndex ? ' active' : ''}" type="button" data-clip-index="${index}">
      <span>${String(index + 1).padStart(2, '0')}</span>
      <strong>${escapeHtml(clip.title)}</strong>
      <em>${formatClock(clip.event.timestamp)} · ${formatClock(clip.duration)}</em>
    </button>
  `).join('');
}

function renderClipPlayerShell(match, clips, activeIndex = 0) {
  const title = getMatchTitle(match);
  return `
    <section class="clip-player-view view-enter">
      <header class="clip-player-header">
        <div>
          <span>Reproducción de clips</span>
          <h1>${escapeHtml(title)}</h1>
          <p>Pantalla separada del tagging para revisar clips sin mezclar el flujo de anotación.</p>
        </div>
        <button class="btn btn-secondary" type="button" data-back-dashboard>Volver al dashboard</button>
      </header>
      <main class="clip-player-layout">
        <section class="clip-player-stage" data-clip-player-stage>
          <iframe
            id="clip-youtube-player-frame"
            class="clip-player-frame"
            title="Reproductor de clips de YouTube"
            allow="autoplay; encrypted-media"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
            src="${buildYouTubeEmbedUrl(match.video)}"
          ></iframe>
          <div class="clip-player-status" data-clip-player-status>Cargando reproductor...</div>
        </section>
        <aside class="clip-player-queue" data-clip-player-queue>
          <header>
            <span>Cola</span>
            <strong data-clip-player-count>${clips.length} clips</strong>
          </header>
          <div data-clip-player-list>${renderQueue(clips, activeIndex)}</div>
        </aside>
      </main>
      <footer class="clip-player-controls">
        <button class="btn btn-secondary" type="button" data-clip-prev>Anterior</button>
        <div>
          <span data-clip-player-progress>Clip ${activeIndex + 1} / ${clips.length}</span>
          <strong data-clip-player-current>${escapeHtml(clips[activeIndex]?.title || 'Sin clip')}</strong>
        </div>
        <button class="btn btn-primary" type="button" data-clip-next>Siguiente</button>
      </footer>
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

export function renderClipPlayer(container, params = {}) {
  if (activeCleanup) activeCleanup();

  let disposed = false;
  let match = null;
  let clips = [];
  let activeIndex = 0;
  let activeClip = null;
  let youtubePlayer = null;
  let youtubePlayerReady = false;
  let ticker = null;

  const cleanup = () => {
    disposed = true;
    if (ticker) window.clearInterval(ticker);
    youtubePlayer?.destroy?.();
    youtubePlayer = null;
  };
  activeCleanup = cleanup;

  setSidebarExpanded(false);
  updateTopbarContext('Clips');
  setTopbarActions([{ id: 'dashboard', label: 'Volver al dashboard' }], () => {
    if (match?.id) navigate('dashboard', { matchId: match.id });
  });

  container.innerHTML = `
    <section class="clip-player-view view-enter">
      <div class="clip-player-loading">Cargando clips...</div>
    </section>
  `;

  load();
  return cleanup;

  async function load() {
    try {
      if (!params.matchId) {
        renderClipPlayerMessage(container, 'No hay partido seleccionado', 'Abrí clips desde el Dashboard de un partido.');
        return;
      }

      const [loadedMatch, settings] = await Promise.all([
        cloudMatchService.getMatchById(params.matchId),
        window.api.settings.get(),
      ]);
      if (disposed) return;
      match = loadedMatch;

      if (match?.video?.type !== 'youtube') {
        renderClipPlayerMessage(container, 'Pantalla de reproducción YouTube', 'Para MP4 local, usá Exportar clips desde el módulo de clips del Dashboard.', match?.id);
        wireStaticActions();
        return;
      }

      clips = buildClipQueue(match, settings, params);
      if (clips.length === 0) {
        renderClipPlayerMessage(container, 'No hay clips para reproducir', 'No hay eventos con timestamp que coincidan con estos filtros.', match.id);
        wireStaticActions();
        return;
      }

      container.innerHTML = renderClipPlayerShell(match, clips, 0);
      wirePlayerActions();
      await initializeYouTubePlayer();
    } catch (error) {
      renderClipPlayerMessage(container, 'No se pudieron cargar los clips', error instanceof Error ? error.message : 'Error desconocido.');
    }
  }

  function wireStaticActions() {
    container.querySelector('[data-back-dashboard]')?.addEventListener('click', () => {
      if (match?.id) navigate('dashboard', { matchId: match.id });
    });
  }

  function wirePlayerActions() {
    wireStaticActions();
    container.querySelector('[data-clip-prev]')?.addEventListener('click', () => playClipAt(Math.max(0, activeIndex - 1)));
    container.querySelector('[data-clip-next]')?.addEventListener('click', () => advanceClipQueue());
    container.querySelectorAll('[data-clip-index]').forEach(button => {
      button.addEventListener('click', () => playClipAt(Number(button.dataset.clipIndex) || 0));
    });
  }

  async function initializeYouTubePlayer() {
    const frame = container.querySelector('#clip-youtube-player-frame');
    if (!frame) return;
    const YT = await ensureYouTubeIframeApi();
    if (disposed) return;
    youtubePlayer = new YT.Player(frame, {
      events: {
        onReady: () => {
          youtubePlayerReady = true;
          playClipAt(0);
          ticker = window.setInterval(tick, 250);
        },
        onError: () => updateStatus('No se pudo reproducir el video de YouTube. Asociá un MP4 local si necesitás exportar archivos.'),
      },
    });
  }

  function playClipAt(index) {
    if (!youtubePlayer || !youtubePlayerReady || clips.length === 0) return;
    activeIndex = Math.max(0, Math.min(clips.length - 1, index));
    activeClip = clips[activeIndex];
    youtubePlayer.seekTo(activeClip.start, true);
    youtubePlayer.playVideo();
    renderPlaybackState();
  }

  function advanceClipQueue() {
    if (activeIndex < clips.length - 1) {
      playClipAt(activeIndex + 1);
      return;
    }
    youtubePlayer?.pauseVideo?.();
    updateStatus('Reproducción de clips finalizada.');
  }

  function tick() {
    if (!youtubePlayerReady || !youtubePlayer || !activeClip) return;
    const currentTime = Number(youtubePlayer.getCurrentTime());
    if (Number.isFinite(currentTime) && currentTime >= activeClip.end - 0.1) {
      advanceClipQueue();
    }
  }

  function updateStatus(message) {
    const status = container.querySelector('[data-clip-player-status]');
    if (status) status.textContent = message;
  }

  function renderPlaybackState() {
    updateStatus(`Reproduciendo ${activeIndex + 1} / ${clips.length}: ${activeClip?.title || 'clip'}`);
    const progress = container.querySelector('[data-clip-player-progress]');
    const current = container.querySelector('[data-clip-player-current]');
    const list = container.querySelector('[data-clip-player-list]');
    if (progress) progress.textContent = `Clip ${activeIndex + 1} / ${clips.length}`;
    if (current) current.textContent = activeClip?.title || 'Sin clip';
    if (list) list.innerHTML = renderQueue(clips, activeIndex);
    container.querySelectorAll('[data-clip-index]').forEach(button => {
      button.addEventListener('click', () => playClipAt(Number(button.dataset.clipIndex) || 0));
    });
  }
}
