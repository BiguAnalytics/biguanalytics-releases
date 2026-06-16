import { describe, expect, it } from 'vitest';

import {
  getCloudListStatusMessage,
  getMatchDestination,
  getWelcomeName,
  shouldShowHomeEmptyState,
} from '../home.js';
import { validateYouTubeUrl } from '../../components/new-match-form.js';

describe('home match navigation', () => {
  it('loads, creates and deletes club matches through cloudMatchService', async () => {
    const homeSource = await import('node:fs').then(fs => fs.readFileSync(new URL('../home.js', import.meta.url), 'utf8'));
    const formSource = await import('node:fs').then(fs => fs.readFileSync(new URL('../../components/new-match-form.js', import.meta.url), 'utf8'));

    expect(homeSource).toContain("import { cloudMatchService, normalizeMatchForHome } from '../cloud/cloud-match-service.js';");
    expect(homeSource).toContain("import { openEditMatchModal, openNewMatchModal } from '../components/new-match-form.js';");
    expect(homeSource).toContain('cloudMatchService.listMatches({ localFirst: true, refreshInBackground: true })');
    expect(homeSource).toContain('cloudMatchService.deleteMatch(m.id)');
    expect(homeSource).toContain('onEdit: (m) => {');
    expect(homeSource).toContain('openEditMatchModal(m, () => refreshHomeData(homeRoot.parentElement || homeRoot))');
    expect(formSource).toContain("import { cloudMatchService } from '../cloud/cloud-match-service.js';");
    expect(formSource).toContain('cloudMatchService.createMatch({');
    expect(formSource).toContain('cloudMatchService.updateMatch(match.id, {');
    expect(formSource).toContain('Guardar cambios');
  });

  it('routes analyzed matches to dashboard and unfinished matches to tagging', () => {
    expect(getMatchDestination({ id: 'match-1', status: 'analyzed' })).toEqual({
      route: 'dashboard',
      params: { matchId: 'match-1' },
    });
    expect(getMatchDestination({ id: 'match-3', status: 'tagging', homeScore: 3, awayScore: 1 })).toEqual({
      route: 'dashboard',
      params: { matchId: 'match-3' },
    });
    expect(getMatchDestination({ id: 'match-2', status: 'created' })).toEqual({
      route: 'tagging',
      params: { matchId: 'match-2' },
    });
  });

  it('summarizes partial cloud list errors without blocking cached matches', () => {
    expect(getCloudListStatusMessage?.({
      partial: true,
      cached: 4,
      total: 5,
      errors: [{ matchId: 'match-5', message: 'disk full' }],
    })).toContain('4 de 5');
    expect(getCloudListStatusMessage?.({
      partial: false,
      cached: 5,
      total: 5,
      errors: [],
    })).toBe('');
  });

  it('does not show the definitive empty state before first cloud sync finishes', () => {
    expect(shouldShowHomeEmptyState([], {
      loading: false,
      initialCloudSyncPending: true,
      hasCloudSession: true,
    })).toBe(false);
    expect(shouldShowHomeEmptyState([], {
      loading: false,
      initialCloudSyncPending: false,
      hasCloudSession: true,
    })).toBe(true);
    expect(shouldShowHomeEmptyState([], {
      loading: false,
      initialCloudSyncPending: true,
      hasCloudSession: false,
    })).toBe(true);
    expect(shouldShowHomeEmptyState([{ id: 'match-1' }], {
      loading: false,
      initialCloudSyncPending: true,
      hasCloudSession: true,
    })).toBe(false);
  });

  it('keeps the welcome name sourced from user settings populated by licensing', async () => {
    const homeSource = await import('node:fs').then(fs => fs.readFileSync(new URL('../home.js', import.meta.url), 'utf8'));
    expect(homeSource).toContain('getWelcomeName');
    expect(homeSource).toContain('settings?.user?.name');
    expect(homeSource).not.toContain('function getNameFromEmail');
    expect(getWelcomeName({ user: { name: 'maxdibe07@gmail.com', email: 'maxdibe07@gmail.com' } })).toBe('');
    expect(getWelcomeName({ user: { displayName: 'Maximo D.', email: 'maxdibe07@gmail.com' } })).toBe('Maximo D.');
    expect(getWelcomeName({ user: { firstName: 'Maximo', lastName: 'Diaz', email: 'maxdibe07@gmail.com' } })).toBe('Maximo D.');
  });

  it('renders the Home shell before awaiting match or settings reads', async () => {
    const homeSource = await import('node:fs').then(fs => fs.readFileSync(new URL('../home.js', import.meta.url), 'utf8'));

    expect(homeSource).toContain('mountHomeView');
    expect(homeSource).toContain('loadHomeData');
    expect(homeSource.indexOf('mountHomeView(container')).toBeLessThan(homeSource.indexOf('loadHomeData()'));
    expect(homeSource).not.toContain('const [matches, homeSettings] = await Promise.all');
  });

  it('mounts a single Home root and updates slots instead of appending a second Home', async () => {
    const homeSource = await import('node:fs').then(fs => fs.readFileSync(new URL('../home.js', import.meta.url), 'utf8'));

    expect(homeSource).toContain('data-home-instance');
    expect(homeSource).toContain('function mountHomeView');
    expect(homeSource).toContain('export async function refreshHomeData');
    expect(homeSource).toContain('export function updateHomeMatches');
    expect(homeSource).toContain('export function updateHomeProfile');
    expect(homeSource).toContain("markStartup('home:mount'");
    expect(homeSource).toContain("markStartup('home:update'");
    expect(homeSource).toContain("markStartup('home:duplicate-mount-prevented'");
    expect(homeSource).not.toContain('renderHomeShell');
    expect(homeSource).not.toContain('container.appendChild(header)');
    expect(homeSource).not.toContain('<span>Usuario</span>');
    expect(homeSource).not.toContain('Bienvenido, <span>Usuario</span>');
  });

  it('updates Home after cloud refresh without a full renderHome remount', async () => {
    const homeSource = await import('node:fs').then(fs => fs.readFileSync(new URL('../home.js', import.meta.url), 'utf8'));

    expect(homeSource).toContain("window.addEventListener('bigu:home-matches-updated'");
    expect(homeSource).toContain("markStartup('cloud-sync:update-matches'");
    expect(homeSource).not.toContain('openNewMatchModal(() => renderHome(container))');
    expect(homeSource).not.toContain('openEditMatchModal(m, () => renderHome(container))');
    expect(homeSource).not.toContain('renderHome(container);');
  });

  it('does not calculate full analytics or season stats while rendering Home', async () => {
    const homeSource = await import('node:fs').then(fs => fs.readFileSync(new URL('../home.js', import.meta.url), 'utf8'));

    expect(homeSource).not.toContain('getSeasonStats');
    expect(homeSource).not.toContain('calculateMatchStats');
    expect(homeSource).not.toContain('window.api.analytics');
  });

  it('uses the global walkthrough target on the new match action instead of the legacy first-step tooltip', async () => {
    const homeSource = await import('node:fs').then(fs => fs.readFileSync(new URL('../home.js', import.meta.url), 'utf8'));

    expect(homeSource).toContain('data-tour-id="new-match"');
    expect(homeSource).not.toContain('renderFirstLaunchHomeTooltip');
    expect(homeSource).not.toContain('home-first-launch-tooltip');
    expect(homeSource).toContain('Nuevo partido');
  });

  it('validates YouTube URLs before creating the iframe source', () => {
    expect(validateYouTubeUrl('https://youtu.be/lp5DkHR97_w')).toBe('');
    expect(validateYouTubeUrl('https://www.youtube.com/watch?v=lp5DkHR97_w')).toBe('');
    expect(validateYouTubeUrl('https://vimeo.com/123')).toBe('Ingresá una URL válida de YouTube.');
  });
});
