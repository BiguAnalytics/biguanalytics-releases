// @ts-check
import { createMatchCard, createNewMatchCard, isMatchDisputed } from '../components/match-card.js';
import { createKpiCard } from '../components/kpi-card.js';
import { openEditMatchModal, openNewMatchModal } from '../components/new-match-form.js';
import { openConfirmDialog } from '../components/confirm-dialog.js';
import { openModal } from '../components/modal.js';
import { cloudMatchService, normalizeMatchForHome } from '../cloud/cloud-match-service.js';
import { setSidebarExpanded } from '../components/sidebar.js';
import { setTopbarActions, updateTopbarContext } from '../components/topbar.js';
import { navigate } from '../router.js';
import { markStartup, timeStartup } from '../startup-timing.js';

const TRANSFER_VIDEO_WARNING = 'El video no se incluye en el export. Si queres moverlo a otra PC, copia tambien el archivo MP4.';

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
      { label: 'Victorias', value: '-', delta: '', state: 'normal', size: 'medium' },
      { label: 'Puntos a Favor', value: '-', delta: '', state: 'normal', size: 'medium' },
      { label: 'Puntos en Contra', value: '-', delta: '', state: 'normal', size: 'medium' },
    ];
  }

  const wins = matches.filter(m => m.homeScore > m.awayScore).length;
  const pointsFor = matches.reduce((acc, m) => acc + (m.homeScore || 0), 0);
  const pointsAgainst = matches.reduce((acc, m) => acc + (m.awayScore || 0), 0);
  const winRate = Math.round((wins / total) * 100);

  return [
    { label: 'Partidos', value: String(total), delta: 'Temporada actual', state: 'normal', size: 'medium' },
    { label: 'Victorias', value: `${winRate}%`, delta: `${wins} de ${total}`, state: winRate >= 50 ? 'positive' : 'alert', size: 'medium' },
    { label: 'Pts a Favor', value: String(pointsFor), delta: `Prom: ${Math.round(pointsFor / total)}`, state: 'normal', size: 'medium' },
    { label: 'Pts en Contra', value: String(pointsAgainst), delta: `Prom: ${Math.round(pointsAgainst / total)}`, state: 'normal', size: 'medium' },
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
    return { user: {}, firstLaunch: false };
  }
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

/**
 * @param {object} settings
 * @returns {string}
 */
export function getWelcomeName(settings) {
  const user = settings?.user || settings || {};
  const profile = settings?.profile || {};
  const name = String(settings?.user?.displayName || user.displayName || settings?.displayName || settings?.user?.name || user.name || settings?.name || '').trim();
  if (name && name.toLowerCase() !== 'usuario' && !isEmailLike(name)) return name;
  const firstName = String(user.firstName || profile.first_name || '').trim();
  const lastName = String(user.lastName || profile.last_name || '').trim();
  const composed = [firstName, lastName ? `${lastName.charAt(0)}.` : ''].filter(Boolean).join(' ');
  if (composed) return composed;
  return '';
}

/**
 * @param {object|null|undefined} status
 * @returns {string}
 */
export function getCloudListStatusMessage(status) {
  if (!status?.partial) return '';
  const total = Number(status.total) || 0;
  const cached = Number(status.cached) || 0;
  const failed = Math.max(0, total - cached);
  if (total > 0) return `Cloud sync parcial: se cargaron ${cached} de ${total} partidos. ${failed} quedan pendientes.`;
  const firstError = Array.isArray(status.errors) && status.errors[0]?.message ? ` ${status.errors[0].message}` : '';
  return `Cloud sync parcial: mostrando cache local.${firstError}`;
}

/**
 * @param {Array<object>} matches
 * @param {object} status
 * @returns {boolean}
 */
export function shouldShowHomeEmptyState(matches = [], status = {}) {
  if (status.loading) return false;
  if (Array.isArray(matches) && matches.length > 0) return false;
  return !(status.initialCloudSyncPending && status.hasCloudSession !== false);
}

/**
 * @param {object} match
 * @returns {HTMLElement}
 */
function createDeleteMatchMessage(match) {
  const message = document.createElement('span');
  message.appendChild(document.createTextNode('Estas seguro de que queres eliminar el partido '));
  const teams = document.createElement('strong');
  teams.textContent = `${match?.homeTeam || 'Bigua'} vs ${match?.awayTeam || 'Rival'}`;
  message.appendChild(teams);
  message.appendChild(document.createTextNode('?'));
  return message;
}

/**
 * @param {string} title
 * @param {unknown} error
 * @param {string} fallback
 * @param {function} onRetry
 * @returns {HTMLElement}
 */
function createErrorState(title, error, fallback, onRetry) {
  const wrapper = document.createElement('div');
  wrapper.className = 'error-state';

  const heading = document.createElement('h3');
  heading.className = 'error-state-title';
  heading.textContent = title;
  wrapper.appendChild(heading);

  const text = document.createElement('p');
  text.className = 'error-state-text';
  text.textContent = error instanceof Error && error.message ? error.message : fallback;
  wrapper.appendChild(text);

  const retry = document.createElement('button');
  retry.className = 'btn btn-primary';
  retry.type = 'button';
  retry.textContent = 'Reintentar';
  retry.addEventListener('click', onRetry);
  wrapper.appendChild(retry);

  return wrapper;
}

/**
 * @param {HTMLElement} containerOrRoot
 * @returns {HTMLElement|null}
 */
function resolveHomeRoot(containerOrRoot) {
  if (containerOrRoot.matches?.('[data-home-instance="true"]')) return containerOrRoot;
  return getMountedHome(containerOrRoot);
}

/**
 * @param {string} title
 * @param {string} message
 * @param {string|null} [filePath]
 */
function showTransferResult(title, message, filePath = null) {
  let modal;
  modal = openModal({
    title,
    body: message,
    buttons: [
      ...(filePath ? [{
        label: 'Abrir archivo',
        className: 'btn-secondary',
        onClick: () => {
          window.api.files.open(filePath);
        },
      }] : []),
      {
        label: 'Cerrar',
        className: 'btn-primary',
        onClick: () => modal.close(),
      },
    ],
  });
}

/**
 * @param {string} filePath
 * @param {'replace'|'copy'} duplicateStrategy
 * @param {HTMLElement} homeRoot
 * @returns {Promise<void>}
 */
async function completeImportMatch(filePath, duplicateStrategy, homeRoot) {
  const imported = await window.api.matches.importArchive(filePath, { duplicateStrategy });
  if (imported?.canceled) return;
  if (imported?.needsDecision) {
    openImportConflictDialog(filePath, imported, homeRoot);
    return;
  }
  await refreshHomeData(homeRoot.parentElement || homeRoot);
  showTransferResult('Partido importado', 'El partido importado ya esta disponible en Inicio.');
}

/**
 * @param {string} filePath
 * @param {object} conflict
 * @param {HTMLElement} homeRoot
 */
function openImportConflictDialog(filePath, conflict, homeRoot) {
  const incoming = conflict.incoming || {};
  const body = document.createElement('div');
  const message = document.createElement('p');
  message.className = 'confirm-dialog-message';
  message.textContent = `Ya existe un partido con el mismo ID: ${incoming.homeTeam || 'Bigua'} vs ${incoming.awayTeam || 'Rival'}.`;
  const warning = document.createElement('p');
  warning.className = 'confirm-dialog-warning';
  warning.textContent = 'Reemplazar pisa el partido local. Importar como copia conserva ambos.';
  body.appendChild(message);
  body.appendChild(warning);

  let modal;
  modal = openModal({
    title: 'Partido ya existente',
    body,
    buttons: [
      {
        label: 'Cancelar',
        className: 'btn-secondary',
        onClick: () => modal.close(),
      },
      {
        label: 'Importar como copia',
        className: 'btn-secondary',
        onClick: () => {
          modal.close();
          completeImportMatch(filePath, 'copy', homeRoot).catch(error => {
            showTransferResult('Error al importar', error?.message || 'No se pudo importar el partido.');
          });
        },
      },
      {
        label: 'Reemplazar',
        className: 'btn-danger',
        onClick: () => {
          modal.close();
          completeImportMatch(filePath, 'replace', homeRoot).catch(error => {
            showTransferResult('Error al importar', error?.message || 'No se pudo importar el partido.');
          });
        },
      },
    ],
  });
}

/**
 * @param {HTMLElement} containerOrRoot
 * @returns {Promise<void>}
 */
async function handleImportMatch(containerOrRoot) {
  const homeRoot = resolveHomeRoot(containerOrRoot);
  if (!homeRoot) return;
  try {
    const selected = await window.api.matches.selectImportArchive();
    if (selected?.canceled || !selected?.filePath) return;
    await completeImportMatch(selected.filePath, undefined, homeRoot);
  } catch (error) {
    showTransferResult('Error al importar', error?.message || 'No se pudo importar el partido.');
  }
}

/**
 * @param {object} match
 * @returns {Promise<void>}
 */
async function handleExportMatch(match) {
  try {
    const result = await window.api.matches.exportArchive(match.id);
    if (result?.canceled) return;
    const warning = result?.videoWarning || (match.video?.type === 'local' ? TRANSFER_VIDEO_WARNING : '');
    const message = warning || 'Partido exportado correctamente.';
    showTransferResult('Exportar partido', message, result.filePath || null);
  } catch (error) {
    showTransferResult('Error al exportar', error?.message || 'No se pudo exportar el partido.');
  }
}

/**
 * @param {HTMLElement} container
 * @returns {HTMLElement|null}
 */
function getMountedHome(container) {
  return container.querySelector('[data-home-instance="true"]');
}

/**
 * @param {HTMLElement} container
 * @returns {HTMLElement}
 */
function mountHomeView(container) {
  const existing = getMountedHome(container);
  if (existing) {
    markStartup('home:duplicate-mount-prevented', {
      count: container.querySelectorAll('[data-home-instance="true"]').length,
    });
    return existing;
  }

  markStartup('home:mount');
  container.classList.add('view-enter');
  const root = document.createElement('section');
  root.className = 'home-view';
  root.setAttribute('data-home-instance', 'true');
  root.innerHTML = `
    <div class="home-header" data-home-header>
      <div class="home-eyebrow">Temporada 2026</div>
      <h1 class="home-welcome" data-home-welcome>Cargando perfil...</h1>
      <p class="home-subtitle">Panel de analisis de partidos para Bigua Rugby Club.</p>
    </div>
    <div class="home-kpi-row" data-home-kpis></div>
    <div class="home-stats-action" data-home-actions>
      <button class="btn btn-primary home-new-match-btn" type="button" data-home-new-match data-tour-id="new-match">
        <span>+</span>
        Nuevo partido
      </button>
      <span class="home-hero-note">Datos locales, flujo rapido de tagging y revision tecnica.</span>
    </div>
    <div data-home-sync></div>
    <div class="match-list" data-home-matches></div>
  `;
  container.replaceChildren(root);

  root.querySelector('[data-home-new-match]')?.addEventListener('click', () => {
    openNewMatchModal(() => refreshHomeData(container));
  });
  updateHomeMatches(root, [], { loading: true });
  return root;
}

/**
 * @returns {Promise<{matches: Array<object>, homeSettings: object}>}
 */
async function loadHomeData() {
  const results = await Promise.all([
    timeStartup('matches:list-local', () => cloudMatchService.listMatches({ localFirst: true, refreshInBackground: true })),
    timeStartup('settings:load', () => getHomeSettings()),
  ]);
  return {
    matches: results[0],
    homeSettings: results[1],
  };
}

/**
 * @param {HTMLElement} homeRoot
 * @param {object} settingsOrAccess
 */
export function updateHomeProfile(homeRoot, settingsOrAccess = {}) {
  const welcome = homeRoot.querySelector('[data-home-welcome]');
  if (!welcome) return;
  const name = getWelcomeName(settingsOrAccess);
  welcome.innerHTML = '';
  if (!name) {
    welcome.textContent = 'Cargando perfil...';
    homeRoot.dataset.profileState = 'loading';
  } else {
    welcome.appendChild(document.createTextNode('Bienvenido, '));
    const nameEl = document.createElement('span');
    nameEl.textContent = name;
    welcome.appendChild(nameEl);
    welcome.appendChild(document.createTextNode(' 👋'));
    homeRoot.dataset.profileState = 'ready';
  }
  markStartup('home:profile-update', { hasName: Boolean(name) });
}

/**
 * @param {HTMLElement} homeRoot
 * @param {string} message
 */
function updateHomeSyncNotice(homeRoot, message) {
  const host = homeRoot.querySelector('[data-home-sync]');
  if (!host) return;
  host.innerHTML = '';
  if (!message) return;
  const syncNotice = document.createElement('div');
  syncNotice.className = 'home-sync-notice';
  syncNotice.setAttribute('role', 'status');
  syncNotice.textContent = message;
  host.appendChild(syncNotice);
}

/**
 * @param {HTMLElement} matchSection
 * @param {string} title
 * @param {string} text
 */
function renderMatchLoading(matchSection, title, text) {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.setAttribute('aria-live', 'polite');
  empty.innerHTML = `
    <h3 class="empty-state-title">${title}</h3>
    <p class="empty-state-text">${text}</p>
  `;
  matchSection.appendChild(empty);
}

/**
 * @param {HTMLElement} homeRoot
 * @param {Array<object>} matches
 * @param {object} [status]
 */
export function updateHomeMatches(homeRoot, matches = [], status = {}) {
  const safeMatches = (Array.isArray(matches) ? matches : []).map(normalizeMatchForHome).filter(match => match.id);
  const kpiRow = homeRoot.querySelector('[data-home-kpis]');
  if (kpiRow) {
    kpiRow.replaceChildren(...calculateSeasonKpis(safeMatches).map(kpi => createKpiCard(kpi)));
  }

  updateHomeSyncNotice(homeRoot, getCloudListStatusMessage(status.partial !== undefined ? status : cloudMatchService.getLastListStatus?.()));

  const matchSection = homeRoot.querySelector('[data-home-matches]');
  if (!matchSection) return;
  matchSection.innerHTML = '';

  const matchHeader = document.createElement('div');
  matchHeader.className = 'match-list-header';
  matchHeader.innerHTML = '<h2 class="match-list-title">Partidos</h2>';
  matchSection.appendChild(matchHeader);

  if ((status.loading || !shouldShowHomeEmptyState(safeMatches, status)) && safeMatches.length === 0) {
    renderMatchLoading(matchSection, 'Cargando partidos...', status.initialCloudSyncPending ? 'Sincronizando nube.' : 'Leyendo cache local.');
    markStartup('home:matches-update', { count: 0, loading: true });
    return;
  }

  if (!safeMatches.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="64" height="64" opacity="0.3"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
      </div>
      <h3 class="empty-state-title">Aun no hay partidos</h3>
      <p class="empty-state-text">Crea tu primer partido para empezar a analizar. Podes cargar un MP4, usar YouTube o trabajar en modo solo estadisticas.</p>
      <button class="btn btn-primary" type="button" data-empty-new-match data-tour-id="new-match">Nuevo partido</button>
    `;
    matchSection.appendChild(empty);
    empty.querySelector('[data-empty-new-match]')?.addEventListener('click', () => {
      openNewMatchModal(() => refreshHomeData(homeRoot.parentElement || homeRoot));
    });
    markStartup('home:matches-update', { count: 0, loading: false });
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'match-cards-grid';
  grid.id = 'match-cards-grid';
  grid.appendChild(createNewMatchCard(() => {
    openNewMatchModal(() => refreshHomeData(homeRoot.parentElement || homeRoot));
  }));

  [...safeMatches]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .forEach(match => {
      const card = createMatchCard(match, {
        onClick: (m) => {
          if (m.status === 'corrupt') {
            matchSection.replaceChildren(createErrorState(
              'Partido corrupto recuperable',
              new Error(m.error || 'No se pudo leer el match.json local.'),
              'El archivo local esta danado, pero no fue borrado ni sobrescrito.',
              () => refreshHomeData(homeRoot.parentElement || homeRoot)
            ));
            return;
          }
          const destination = getMatchDestination(m);
          pressMatchCardBeforeNavigate(card, () => navigate(destination.route, destination.params));
        },
        onEdit: (m) => {
          openEditMatchModal(m, () => refreshHomeData(homeRoot.parentElement || homeRoot));
        },
        onExport: (m) => {
          handleExportMatch(m);
        },
        onDelete: (m) => {
          openConfirmDialog({
            title: 'Eliminar partido',
            message: createDeleteMatchMessage(m),
            warning: 'Esta accion no se puede deshacer. Se eliminaran todos los eventos y datos asociados.',
            confirmLabel: 'Eliminar',
            onConfirm: async () => {
              try {
                await cloudMatchService.deleteMatch(m.id);
                await refreshHomeData(homeRoot.parentElement || homeRoot);
              } catch (error) {
                matchSection.replaceChildren(createErrorState(
                  'Error al eliminar',
                  error,
                  'No se pudo eliminar el partido',
                  () => refreshHomeData(homeRoot.parentElement || homeRoot)
                ));
              }
            },
          });
        },
      });
      grid.appendChild(card);
    });

  matchSection.appendChild(grid);
  markStartup('home:matches-update', { count: safeMatches.length, loading: false });
}

/**
 * @param {HTMLElement} homeRoot
 * @param {unknown} error
 */
function updateHomeError(homeRoot, error) {
  const matchSection = homeRoot.querySelector('[data-home-matches]');
  if (!matchSection) return;
  matchSection.replaceChildren(createErrorState(
    'Error al cargar',
    error,
    'No se pudieron cargar los datos',
    () => refreshHomeData(homeRoot.parentElement || homeRoot)
  ));
}

/**
 * @param {HTMLElement} containerOrRoot
 * @returns {Promise<{matches: Array<object>, homeSettings: object}|null>}
 */
export async function refreshHomeData(containerOrRoot) {
  const container = containerOrRoot.matches?.('[data-home-instance="true"]')
    ? containerOrRoot.parentElement
    : containerOrRoot;
  if (!container) return null;
  const homeRoot = getMountedHome(container) || mountHomeView(container);
  markStartup('home:update');

  try {
    const { matches, homeSettings } = await loadHomeData();
    updateHomeProfile(homeRoot, homeSettings);
    updateHomeMatches(homeRoot, matches, cloudMatchService.getLastListStatus?.());
    window.dispatchEvent?.(new CustomEvent('bigu:home-initial-data-ready'));
    return { matches, homeSettings };
  } catch (error) {
    updateHomeError(homeRoot, error);
    window.dispatchEvent?.(new CustomEvent('bigu:home-initial-data-ready'));
    return null;
  }
}

/**
 * @param {HTMLElement} homeRoot
 * @returns {function}
 */
function wireHomeUpdates(homeRoot) {
  const onCloudMatchesUpdated = (event) => {
    if (!homeRoot.isConnected) return;
    markStartup('cloud-sync:update-matches', { route: 'home' });
    updateHomeMatches(homeRoot, event.detail?.matches || [], event.detail?.status || {});
  };
  const onProfileUpdated = (event) => {
    if (!homeRoot.isConnected) return;
    updateHomeProfile(homeRoot, event.detail?.user || event.detail?.access || {});
  };
  window.addEventListener('bigu:home-matches-updated', onCloudMatchesUpdated);
  window.addEventListener('bigu:home-profile-updated', onProfileUpdated);
  return () => {
    window.removeEventListener('bigu:home-matches-updated', onCloudMatchesUpdated);
    window.removeEventListener('bigu:home-profile-updated', onProfileUpdated);
  };
}

/**
 * Renders the Home view into the container.
 * @param {HTMLElement} container
 * @returns {function}
 */
export function renderHome(container) {
  markStartup('home:render:start');
  setSidebarExpanded(true);
  updateTopbarContext('Temporada 2026');
  setTopbarActions([
    { id: 'import-match', label: 'Importar partido' },
    { id: 'season', label: 'Temporada' },
    { id: 'settings', label: 'Ajustes' },
  ], (id) => {
    if (id === 'import-match') {
      handleImportMatch(container);
      return;
    }
    navigate(id);
  });

  mountHomeView(container);
  const homeRoot = getMountedHome(container);
  if (!homeRoot) return () => {};
  const cleanup = wireHomeUpdates(homeRoot);
  refreshHomeData(container).catch(() => {});
  return cleanup;
}
