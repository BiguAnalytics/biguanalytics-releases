// @ts-check
import { cloudMatchService } from '../cloud/cloud-match-service.js';
import { openModal } from './modal.js';

/**
 * @param {string} value
 * @returns {string}
 */
export function validateYouTubeUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return 'La URL de YouTube es obligatoria.';
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '');
    const isYouTube = host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be';
    const hasVideoId = host === 'youtu.be'
      ? parsed.pathname.length > 1
      : Boolean(parsed.searchParams.get('v') || parsed.pathname.includes('/embed/'));
    return isYouTube && hasVideoId ? '' : 'Ingresá una URL válida de YouTube.';
  } catch {
    return 'Ingresá una URL válida de YouTube.';
  }
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
 * @param {HTMLElement} form
 * @param {string} fieldId
 * @param {string} message
 */
function setFieldError(form, fieldId, message) {
  const field = form.querySelector(`#${fieldId}`);
  const group = field?.closest('.form-group');
  const error = form.querySelector(`[data-field-error="${fieldId}"]`);
  group?.classList.toggle('has-error', Boolean(message));
  field?.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (error) error.textContent = message;
}

/**
 * @param {HTMLElement} form
 */
function clearFormErrors(form) {
  form.querySelectorAll('.form-group.has-error').forEach(group => group.classList.remove('has-error'));
  form.querySelectorAll('[aria-invalid="true"]').forEach(field => field.setAttribute('aria-invalid', 'false'));
  form.querySelectorAll('[data-field-error]').forEach(error => {
    error.textContent = '';
  });
}

/**
 * @returns {string}
 */
function getTodayInputValue() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * @param {object|null|undefined} video
 * @returns {'local'|'youtube'}
 */
function getInitialVideoTab(video) {
  return video?.type === 'youtube' ? 'youtube' : 'local';
}

/**
 * @param {object|null|undefined} video
 * @returns {object}
 */
function buildPendingLocalVideo(video = null) {
  return {
    type: 'local',
    sourceType: 'local_mp4',
    path: video?.path || '',
    fileUrl: video?.fileUrl || '',
    name: video?.name || '',
    size: Number(video?.size) || 0,
    duration: Number.isFinite(Number(video?.duration)) ? Number(video.duration) : null,
    fingerprintHash: video?.fingerprintHash || '',
    startOffsetMs: Number(video?.startOffsetMs) || 0,
    needsLocalFile: !video?.path,
  };
}

/**
 * @param {object|null|undefined} video
 * @returns {string}
 */
function getLocalVideoSummary(video) {
  if (video?.name) return `MP4 actual: ${video.name}`;
  if (video?.path) return `MP4 actual: ${String(video.path).split(/[\\/]/).filter(Boolean).pop() || video.path}`;
  if (video?.type === 'youtube') return 'Cambiar a MP4 local pendiente. Podes asociar el archivo al entrar a tagging o desde este formulario.';
  return 'Sin MP4 asociado. Podes elegirlo ahora o al entrar a tagging.';
}

/**
 * @param {object} options
 * @param {'create'|'edit'} options.mode
 * @param {object|null} [options.match]
 * @param {string} options.today
 * @returns {string}
 */
function buildMatchFormHtml({ mode, match = null, today }) {
  const videoTab = getInitialVideoTab(match?.video);
  const isEdit = mode === 'edit';
  const localActive = videoTab === 'local';
  const youtubeActive = videoTab === 'youtube';

  return `
    <form id="new-match-form" novalidate>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Equipo Local</label>
          <input class="form-input" type="text" id="home-team" value="${escapeHtml(match?.homeTeam || 'Bigua')}" required aria-describedby="home-team-error" />
          <p class="form-error" id="home-team-error" data-field-error="home-team"></p>
        </div>
        <div class="form-group">
          <label class="form-label">Equipo Visitante <span class="required">*</span></label>
          <input class="form-input" type="text" id="away-team" value="${escapeHtml(match?.awayTeam || '')}" placeholder="Nombre del rival" required aria-describedby="away-team-error" />
          <p class="form-error" id="away-team-error" data-field-error="away-team"></p>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Fecha <span class="required">*</span></label>
          <input class="form-input" type="date" id="match-date" value="${escapeHtml(match?.date || today)}" required aria-describedby="match-date-error" />
          <p class="form-error" id="match-date-error" data-field-error="match-date"></p>
        </div>
        <div class="form-group">
          <label class="form-label">Competencia</label>
          <input class="form-input" type="text" id="competition" value="${escapeHtml(match?.competition || '')}" placeholder="Top 12, Regional, etc." />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Condicion</label>
        <select class="form-select" id="venue">
          <option value="home"${match?.venue !== 'away' ? ' selected' : ''}>Local</option>
          <option value="away"${match?.venue === 'away' ? ' selected' : ''}>Visitante</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Video</label>
        <div class="form-tabs" role="tablist" aria-label="Origen del video">
          <button class="form-tab${localActive ? ' active' : ''}" type="button" data-video-tab="local">MP4 local</button>
          <button class="form-tab${youtubeActive ? ' active' : ''}" type="button" data-video-tab="youtube">Video de YouTube</button>
        </div>
        <div class="form-tab-panel${localActive ? ' active' : ''}" id="video-tab-local">
          <div class="form-video-picker">
            <p class="form-help" data-local-video-summary>${escapeHtml(isEdit ? getLocalVideoSummary(match?.video) : 'El archivo MP4 se puede elegir ahora o al entrar al modo Tagging. No se copia ni se sube.')}</p>
            <button class="btn btn-secondary btn-sm" type="button" id="select-local-video-btn">Elegir MP4 local</button>
          </div>
        </div>
        <div class="form-tab-panel${youtubeActive ? ' active' : ''}" id="video-tab-youtube">
          <input class="form-input" type="url" id="youtube-url" value="${escapeHtml(match?.video?.type === 'youtube' ? match.video.url || '' : '')}" placeholder="https://www.youtube.com/watch?v=..." aria-describedby="youtube-url-error" />
          <p class="form-error" id="youtube-url-error" data-field-error="youtube-url"></p>
        </div>
      </div>
      <div id="form-errors"></div>
    </form>
  `;
}

/**
 * @param {object} options
 * @param {'create'|'edit'} options.mode
 * @param {object|null} [options.match]
 * @param {function} options.onSaved
 */
function openMatchModal({ mode, match = null, onSaved }) {
  const isEdit = mode === 'edit';
  const formHtml = buildMatchFormHtml({ mode, match, today: getTodayInputValue() });
  let selectedLocalVideo = match?.video?.type === 'local' ? buildPendingLocalVideo(match.video) : null;
  let modal;

  async function handleSubmit() {
    const form = document.getElementById('new-match-form');
    const errorsEl = document.getElementById('form-errors');
    const submitButton = /** @type {HTMLButtonElement|null} */ (document.getElementById(isEdit ? 'save-match-btn' : 'create-match-btn'));
    if (!(form instanceof HTMLElement) || !errorsEl) return;
    clearFormErrors(form);
    errorsEl.innerHTML = '';

    const homeTeam = /** @type {HTMLInputElement} */ (document.getElementById('home-team')).value.trim();
    const awayTeam = /** @type {HTMLInputElement} */ (document.getElementById('away-team')).value.trim();
    const date = /** @type {HTMLInputElement} */ (document.getElementById('match-date')).value;
    const competition = /** @type {HTMLInputElement} */ (document.getElementById('competition')).value.trim();
    const venue = /** @type {HTMLSelectElement} */ (document.getElementById('venue')).value;
    const activeVideoTab = document.querySelector('.form-tab.active')?.dataset.videoTab || 'local';
    const youtubeUrl = /** @type {HTMLInputElement} */ (document.getElementById('youtube-url')).value.trim();

    const errors = [];
    if (!homeTeam) errors.push(['home-team', 'El equipo local es obligatorio.']);
    if (!awayTeam) errors.push(['away-team', 'El equipo visitante es obligatorio.']);
    if (!date) errors.push(['match-date', 'La fecha es obligatoria.']);
    const youtubeError = activeVideoTab === 'youtube' ? validateYouTubeUrl(youtubeUrl) : '';
    if (youtubeError) errors.push(['youtube-url', youtubeError]);

    if (errors.length > 0) {
      errors.forEach(([fieldId, message]) => setFieldError(form, fieldId, message));
      const firstField = form.querySelector(`#${errors[0][0]}`);
      firstField?.focus();
      return;
    }

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = isEdit ? 'Guardando...' : 'Creando...';
      }

      const video = activeVideoTab === 'youtube'
        ? await window.api.media.normalizeYouTube(youtubeUrl)
        : selectedLocalVideo || (isEdit ? buildPendingLocalVideo(match?.video?.type === 'local' ? match.video : null) : null);

      if (isEdit && match?.id) {
        const updatedMatch = await cloudMatchService.updateMatch(match.id, {
          homeTeam: homeTeam || 'Bigua',
          awayTeam,
          date,
          competition: competition || 'Sin competencia',
          venue,
          video,
        });
        modal.close();
        onSaved(updatedMatch);
        return;
      }

      const createdMatch = await cloudMatchService.createMatch({
        homeTeam: homeTeam || 'Bigua',
        awayTeam,
        date,
        competition: competition || 'Sin competencia',
        venue,
        video,
      });

      modal.close();
      onSaved(createdMatch);
    } catch (error) {
      errorsEl.innerHTML = `<p class="form-error">Error al ${isEdit ? 'guardar' : 'crear'} el partido: ${escapeHtml(error.message)}</p>`;
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = isEdit ? 'Guardar cambios' : 'Crear Partido';
      }
    }
  }

  modal = openModal({
    title: isEdit ? 'Editar partido' : 'Nuevo Partido',
    body: formHtml,
    allowHtml: true,
    buttons: [
      {
        label: 'Cancelar',
        className: 'btn-secondary',
        onClick: () => modal.close(),
      },
      {
        label: isEdit ? 'Guardar cambios' : 'Crear Partido',
        className: 'btn-primary',
        id: isEdit ? 'save-match-btn' : 'create-match-btn',
        onClick: handleSubmit,
      },
    ],
  });

  setTimeout(() => {
    const awayInput = document.getElementById('away-team');
    if (awayInput) awayInput.focus();
  }, 200);

  document.querySelectorAll('[data-video-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const selected = tab.dataset.videoTab;
      document.querySelectorAll('[data-video-tab]').forEach(item => item.classList.toggle('active', item === tab));
      document.querySelectorAll('.form-tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `video-tab-${selected}`);
      });
    });
  });

  document.getElementById('select-local-video-btn')?.addEventListener('click', async () => {
    const selected = await window.api.media.selectLocalVideo();
    if (!selected) return;
    selectedLocalVideo = buildPendingLocalVideo(selected);
    const summary = document.querySelector('[data-local-video-summary]');
    if (summary) summary.textContent = getLocalVideoSummary(selectedLocalVideo);
    document.querySelectorAll('[data-video-tab]').forEach(item => item.classList.toggle('active', item.dataset.videoTab === 'local'));
    document.querySelectorAll('.form-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'video-tab-local');
    });
  });
}

/**
 * Opens the new match creation modal.
 * @param {function} onCreated - Called with match data when form is submitted successfully
 */
export function openNewMatchModal(onCreated) {
  openMatchModal({ mode: 'create', onSaved: onCreated });
}

/**
 * Opens the match edit modal.
 * @param {object} match
 * @param {function} onUpdated
 */
export function openEditMatchModal(match, onUpdated) {
  openMatchModal({ mode: 'edit', match, onSaved: onUpdated });
}
