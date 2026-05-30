import { describe, expect, it } from 'vitest';

import { getMatchDestination } from '../home.js';
import { validateYouTubeUrl } from '../../components/new-match-form.js';

describe('home match navigation', () => {
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

  it('keeps the welcome name sourced from user settings populated by licensing', async () => {
    const homeSource = await import('node:fs').then(fs => fs.readFileSync(new URL('../home.js', import.meta.url), 'utf8'));
    expect(homeSource).toContain('getWelcomeName');
    expect(homeSource).toContain('settings?.user?.name');
  });

  it('renders first-launch onboarding on the new match action only while firstLaunch is enabled', async () => {
    const homeSource = await import('node:fs').then(fs => fs.readFileSync(new URL('../home.js', import.meta.url), 'utf8'));

    expect(homeSource).toContain('renderFirstLaunchHomeTooltip');
    expect(homeSource).toContain('firstLaunch');
    expect(homeSource).toContain('home-first-launch-tooltip');
    expect(homeSource).toContain('Nuevo partido');
  });

  it('validates YouTube URLs before creating the iframe source', () => {
    expect(validateYouTubeUrl('https://youtu.be/lp5DkHR97_w')).toBe('');
    expect(validateYouTubeUrl('https://www.youtube.com/watch?v=lp5DkHR97_w')).toBe('');
    expect(validateYouTubeUrl('https://vimeo.com/123')).toBe('Ingresá una URL válida de YouTube.');
  });
});
