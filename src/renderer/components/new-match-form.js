// @ts-check
import { openModal } from './modal.js';

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
          <input class="form-input" type="text" id="home-team" value="Bigua" required />
        </div>
        <div class="form-group">
          <label class="form-label">Equipo Visitante <span class="required">*</span></label>
          <input class="form-input" type="text" id="away-team" placeholder="Nombre del rival" required />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Fecha <span class="required">*</span></label>
          <input class="form-input" type="date" id="match-date" value="${today}" required />
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
          <input class="form-input" type="url" id="youtube-url" placeholder="https://www.youtube.com/watch?v=..." />
        </div>
      </div>
      <div id="form-errors"></div>
    </form>
  `;

  let modal;

  async function handleSubmit() {
    const form = document.getElementById('new-match-form');
    const errorsEl = document.getElementById('form-errors');
    errorsEl.innerHTML = '';

    const homeTeam = /** @type {HTMLInputElement} */ (document.getElementById('home-team')).value.trim();
    const awayTeam = /** @type {HTMLInputElement} */ (document.getElementById('away-team')).value.trim();
    const date = /** @type {HTMLInputElement} */ (document.getElementById('match-date')).value;
    const competition = /** @type {HTMLInputElement} */ (document.getElementById('competition')).value.trim();
    const venue = /** @type {HTMLSelectElement} */ (document.getElementById('venue')).value;
    const activeVideoTab = document.querySelector('.form-tab.active')?.dataset.videoTab || 'local';
    const youtubeUrl = /** @type {HTMLInputElement} */ (document.getElementById('youtube-url')).value.trim();

    // Validation
    const errors = [];
    if (!awayTeam) errors.push('El equipo visitante es obligatorio');
    if (!date) errors.push('La fecha es obligatoria');
    if (activeVideoTab === 'youtube' && !youtubeUrl) errors.push('La URL de YouTube es obligatoria');

    if (errors.length > 0) {
      errorsEl.innerHTML = errors.map(e => `<p class="form-error">${e}</p>`).join('');
      return;
    }

    try {
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
