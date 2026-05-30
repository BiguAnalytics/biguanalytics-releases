// @ts-check
import { createMatchCard, createNewMatchCard, isMatchDisputed } from '../components/match-card.js';
import { createKpiCard } from '../components/kpi-card.js';
import { openNewMatchModal } from '../components/new-match-form.js';
import { openConfirmDialog } from '../components/confirm-dialog.js';
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { navigate } from '../router.js';

/**
 * Calculates season KPIs from all matches.
 * @param {Array} matches
 * @returns {Array<{label: string, value: string|number, delta: string, state: 'normal'|'alert'|'positive', size: 'large'|'medium'|'small'}>}
 */
function calculateSeasonKpis(matches) {
  const total = matches.length;
  if (total === 0) {
    return [
      { label: 'Partidos', value: '0', delta: 'Temporada actual', state: 'normal', size: 'medium' },
      { label: 'Victorias', value: '—', delta: '', state: 'normal', size: 'medium' },
      { label: 'Puntos a Favor', value: '—', delta: '', state: 'normal', size: 'medium' },
      { label: 'Puntos en Contra', value: '—', delta: '', state: 'normal', size: 'medium' },
    ];
  }

  const wins = matches.filter(m => m.homeScore > m.awayScore).length;
  const pointsFor = matches.reduce((acc, m) => acc + (m.homeScore || 0), 0);
  const pointsAgainst = matches.reduce((acc, m) => acc + (m.awayScore || 0), 0);
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return [
    { label: 'Partidos', value: String(total), delta: 'Temporada actual', state: 'normal', size: 'medium' },
    { label: 'Victorias', value: `${winRate}%`, delta: `${wins} de ${total}`, state: winRate >= 50 ? 'positive' : 'alert', size: 'medium' },
    { label: 'Pts a Favor', value: String(pointsFor), delta: `Prom: ${total > 0 ? Math.round(pointsFor / total) : 0}`, state: 'normal', size: 'medium' },
    { label: 'Pts en Contra', value: String(pointsAgainst), delta: `Prom: ${total > 0 ? Math.round(pointsAgainst / total) : 0}`, state: 'normal', size: 'medium' },
  ];
}

/**
 * Gets the destination for an existing match card.
 * @param {{id: string, status?: string}} match
 * @returns {{route: string, params: {matchId: string}}}
 */
export function getMatchDestination(match) {
  return {
    route: isMatchDisputed(match) ? 'dashboard' : 'tagging',
    params: { matchId: match.id },
  };
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * @param {HTMLElement|null} card
 * @param {function} callback
 */
export function pressMatchCardBeforeNavigate(card, callback) {
  if (!card || prefersReducedMotion()) {
    callback();
    return;
  }

  card.classList.add('is-pressing');
  window.setTimeout(() => {
    card.classList.remove('is-pressing');
    callback();
  }, 150);
}

/**
 * Gets the configured home settings.
 * @returns {Promise<object>}
 */
async function getHomeSettings() {
  try {
    return await window.api?.settings?.get?.();
  } catch {
    return { user: { name: 'Usuario' }, firstLaunch: false };
  }
}

/**
 * @param {object} settings
 * @returns {string}
 */
function getWelcomeName(settings) {
  return settings?.user?.name || 'Usuario';
}

/**
 * @param {HTMLElement} host
 */
function renderFirstLaunchHomeTooltip(host) {
  if (window.sessionStorage?.getItem('bigu:firstLaunchHomeTooltipDismissed') === 'true') return;
  const tooltip = document.createElement('div');
  tooltip.className = 'home-first-launch-tooltip';
  tooltip.innerHTML = `
    <strong>Primer paso</strong>
    <span>Creá un partido desde Nuevo partido para cargar video o usar modo solo estadisticas.</span>
    <button type="button" aria-label="Cerrar ayuda de primer uso">Entendido</button>
  `;
  host.appendChild(tooltip);
  tooltip.querySelector('button')?.addEventListener('click', () => {
    window.sessionStorage?.setItem('bigu:firstLaunchHomeTooltipDismissed', 'true');
    tooltip.remove();
  });
}

/**
 * Renders the Home view into the container.
 * @param {HTMLElement} container - The container to render into
 */
export async function renderHome(container) {
  setSidebarExpanded(true);
  updateTopbarContext('Temporada 2026');
  setTopbarActions([
    { id: 'season', label: 'Temporada' },
    { id: 'settings', label: 'Ajustes' },
  ], (id) => navigate(id));

  container.innerHTML = '';
  container.classList.add('view-enter');

  try {
    const [matches, homeSettings] = await Promise.all([
      window.api.matches.getAll(),
      getHomeSettings(),
    ]);
    const userName = getWelcomeName(homeSettings);
    const kpis = calculateSeasonKpis(matches);

    // Header
    const header = document.createElement('div');
    header.className = 'home-header';
    header.innerHTML = `
      <div class="home-eyebrow">Temporada 2026</div>
      <h1 class="home-welcome">Bienvenido, <span></span> &#128075;</h1>
      <p class="home-subtitle">Panel de analisis de partidos para Bigua Rugby Club.</p>
    `;
    header.querySelector('.home-welcome span').textContent = userName;
    container.appendChild(header);

    // KPI Row
    const kpiRow = document.createElement('div');
    kpiRow.className = 'home-kpi-row';
    kpis.forEach(kpi => {
      kpiRow.appendChild(createKpiCard(kpi));
    });
    container.appendChild(kpiRow);

    const statsAction = document.createElement('div');
    statsAction.className = 'home-stats-action';
    statsAction.innerHTML = `
      <button class="btn btn-primary home-new-match-btn" id="stats-new-match-btn">
        <span>+</span>
        Nuevo partido
      </button>
      <span class="home-hero-note">Datos locales, flujo rapido de tagging y revision tecnica.</span>
    `;
    container.appendChild(statsAction);

    statsAction.querySelector('#stats-new-match-btn')?.addEventListener('click', () => {
      openNewMatchModal(() => renderHome(container));
    });
    if (homeSettings?.firstLaunch) {
      renderFirstLaunchHomeTooltip(statsAction);
    }

    // Match List Section
    const matchSection = document.createElement('div');
    matchSection.className = 'match-list';

    const matchHeader = document.createElement('div');
    matchHeader.className = 'match-list-header';
    matchHeader.innerHTML = `
      <h2 class="match-list-title">Partidos</h2>
    `;
    matchSection.appendChild(matchHeader);

    if (matches.length === 0) {
      // Empty state
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div class="empty-state-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="64" height="64" opacity="0.3"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        </div>
        <h3 class="empty-state-title">Aún no hay partidos</h3>
        <p class="empty-state-text">Crea tu primer partido para empezar a analizar. Podes cargar un MP4, usar YouTube o trabajar en modo solo estadisticas.</p>
        <button class="btn btn-primary" id="empty-new-match-btn" type="button">Nuevo partido</button>
      `;
      matchSection.appendChild(empty);
      empty.querySelector('#empty-new-match-btn')?.addEventListener('click', () => {
        openNewMatchModal(() => renderHome(container));
      });
    } else {
      // Match cards grid
      const grid = document.createElement('div');
      grid.className = 'match-cards-grid';
      grid.id = 'match-cards-grid';

      // New match card first
      grid.appendChild(createNewMatchCard(() => {
        openNewMatchModal(() => renderHome(container));
      }));

      // Existing matches (newest first)
      const sorted = [...matches].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      sorted.forEach(match => {
        const card = createMatchCard(match, {
          onClick: (m) => {
            const destination = getMatchDestination(m);
            pressMatchCardBeforeNavigate(card, () => navigate(destination.route, destination.params));
          },
          onDelete: (m) => {
            openConfirmDialog({
              title: 'Eliminar partido',
              message: `¿Estás seguro de que querés eliminar el partido <strong>${m.homeTeam} vs ${m.awayTeam}</strong>?`,
              warning: 'Esta acción no se puede deshacer. Se eliminarán todos los eventos y datos asociados.',
              confirmLabel: 'Eliminar',
              onConfirm: async () => {
                try {
                  await window.api.matches.delete(m.id);
                  renderHome(container);
                } catch (error) {
                  container.innerHTML = `
                    <div class="error-state">
                      <h3 class="error-state-title">Error al eliminar</h3>
                      <p class="error-state-text">${error.message || 'No se pudo eliminar el partido'}</p>
                      <button class="btn btn-primary" id="retry-btn">Reintentar</button>
                    </div>
                  `;
                  container.querySelector('#retry-btn')?.addEventListener('click', () => renderHome(container));
                }
              },
            });
          },
        });
        grid.appendChild(card);
      });

      matchSection.appendChild(grid);
    }

    container.appendChild(matchSection);

  } catch (error) {
    container.innerHTML = `
      <div class="error-state">
        <h3 class="error-state-title">Error al cargar</h3>
        <p class="error-state-text">${error.message || 'No se pudieron cargar los datos'}</p>
        <button class="btn btn-primary" id="retry-btn">Reintentar</button>
      </div>
    `;
    const retryBtn = container.querySelector('#retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => renderHome(container));
    }
  }
}
