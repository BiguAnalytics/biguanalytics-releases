// @ts-check
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
 * Opens the new match creation modal.
 * @param {function} onCreated - Called with match data when form is submitted successfully
 */
export function openNewMatchModal(onCreated) {
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  const formHtml = `
    <form id="new-match-form" novalidate>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Equipo Local</label>
          <input class="form-input" type="text" id="home-team" value="Bigua" required aria-describedby="home-team-error" />
          <p class="form-error" id="home-team-error" data-field-error="home-team"></p>
        </div>
        <div class="form-group">
          <label class="form-label">Equipo Visitante <span class="required">*</span></label>
          <input class="form-input" type="text" id="away-team" placeholder="Nombre del rival" required aria-describedby="away-team-error" />
          <p class="form-error" id="away-team-error" data-field-error="away-team"></p>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Fecha <span class="required">*</span></label>
          <input class="form-input" type="date" id="match-date" value="${today}" required aria-describedby="match-date-error" />
          <p class="form-error" id="match-date-error" data-field-error="match-date"></p>
        </div>
        <div class="form-group">
          <label class="form-label">Competencia</label>
          <input class="form-input" type="text" id="competition" placeholder="Top 12, Regional, etc." />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Condición</label>
        <select class="form-select" id="venue">
          <option value="home">Local</option>
          <option value="away">Visitante</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Video</label>
        <div class="form-tabs" role="tablist" aria-label="Origen del video">
          <button class="form-tab active" type="button" data-video-tab="local">MP4 local</button>
          <button class="form-tab" type="button" data-video-tab="youtube">Video de YouTube</button>
        </div>
        <div class="form-tab-panel active" id="video-tab-local">
          <p class="form-help">El archivo MP4 se elige al entrar al modo Tagging. No se copia ni se sube.</p>
        </div>
        <div class="form-tab-panel" id="video-tab-youtube">
          <input class="form-input" type="url" id="youtube-url" placeholder="https://www.youtube.com/watch?v=..." aria-describedby="youtube-url-error" />
          <p class="form-error" id="youtube-url-error" data-field-error="youtube-url"></p>
        </div>
      </div>
      <div id="form-errors"></div>
    </form>
  `;

  let modal;

  async function handleSubmit() {
    const form = document.getElementById('new-match-form');
    const errorsEl = document.getElementById('form-errors');
    const submitButton = /** @type {HTMLButtonElement|null} */ (document.getElementById('create-match-btn'));
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
        submitButton.textContent = 'Creando...';
      }
      const video = activeVideoTab === 'youtube'
        ? await window.api.media.normalizeYouTube(youtubeUrl)
        : null;

      const match = await window.api.matches.create({
        homeTeam: homeTeam || 'Bigua',
        awayTeam,
        date,
        competition: competition || 'Sin competencia',
        venue,
        video,
      });

      modal.close();
      onCreated(match);
    } catch (error) {
      errorsEl.innerHTML = `<p class="form-error">Error al crear el partido: ${error.message}</p>`;
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Crear Partido';
      }
    }
  }

  modal = openModal({
    title: 'Nuevo Partido',
    body: formHtml,
    buttons: [
      {
        label: 'Cancelar',
        className: 'btn-secondary',
        onClick: () => modal.close(),
      },
      {
        label: 'Crear Partido',
        className: 'btn-primary',
        id: 'create-match-btn',
        onClick: handleSubmit,
      },
    ],
  });

  // Focus the away team input
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
}
