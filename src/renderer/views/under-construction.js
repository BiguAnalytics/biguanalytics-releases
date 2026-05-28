// @ts-check

const VIEW_COPY = {
  tagging: {
    eyebrow: 'Fase 2',
    title: 'Tagging en construccion',
    text: 'El flujo de video, hotkeys y timeline se implementa en la siguiente fase.',
  },
  dashboard: {
    eyebrow: 'Fase 3',
    title: 'Dashboard en construccion',
    text: 'Los reportes, metricas y exportacion se activaran cuando exista el motor de analisis.',
  },
  season: {
    eyebrow: 'Fase 4',
    title: 'Temporada en construccion',
    text: 'La vista historica de temporada queda reservada para herramientas avanzadas.',
  },
  settings: {
    eyebrow: 'Configuracion',
    title: 'Ajustes en construccion',
    text: 'Los umbrales y preferencias editables se incorporan en la fase de dashboard.',
  },
};

/**
 * Renders a scoped under-construction view.
 * @param {HTMLElement} container
 * @param {{section?: string, matchId?: string}} params
 */
export function renderUnderConstruction(container, params = {}) {
  const section = params.section || 'tagging';
  const copy = VIEW_COPY[section] || VIEW_COPY.tagging;

  container.innerHTML = `
    <section class="construction-view view-enter">
      <div class="construction-panel">
        <span class="construction-eyebrow">${copy.eyebrow}</span>
        <h1 class="construction-title">${copy.title}</h1>
        <p class="construction-text">${copy.text}</p>
        ${params.matchId ? `<p class="construction-meta">Partido: ${params.matchId}</p>` : ''}
        <button class="btn btn-secondary construction-back" id="construction-back">Volver al inicio</button>
      </div>
    </section>
  `;

  container.querySelector('#construction-back')?.addEventListener('click', () => {
    window.location.hash = '#home';
  });
}
