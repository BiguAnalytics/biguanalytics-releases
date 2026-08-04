import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');
const seasonSource = readFileSync(new URL('../season.js', import.meta.url), 'utf8');
const seasonCss = readFileSync(new URL('../../../styles/components/season.css', import.meta.url), 'utf8');

describe('season view', () => {
  it('replaces the placeholder route with the season renderer', () => {
    expect(routerSource).toContain("import { renderSeason } from './views/season.js'");
    expect(routerSource).toContain('season: renderSeason');
    expect(routerSource).not.toContain("section: 'season'");
  });

  it('renders sortable table, competition filter, KPI averages and evolution charts', () => {
    expect(seasonSource).toContain("import { cloudMatchService } from '../cloud/cloud-match-service.js';");
    expect(seasonSource).toContain('cloudMatchService.listMatches({ localFirst: true, refreshInBackground: true })');
    expect(seasonSource).toContain('window.api.analytics.getSeasonStats');
    expect(seasonSource).toContain('data-season-sort');
    expect(seasonSource).toContain('data-season-competition');
    expect(seasonSource).toContain('chart-season-rucks');
    expect(seasonSource).toContain('chart-season-penalties');
    expect(seasonSource).toContain('chart-season-lineouts');
    expect(seasonSource).toContain('chart-season-breaklines');
    expect(seasonSource).toContain('Evolución histórica');
    expect(seasonSource).toContain("navigate('dashboard', { matchId:");
    expect(seasonCss).toContain('.season-view');
  });

  it('loads configurable event labels for season metrics and table headers', () => {
    expect(seasonSource).toContain("import { getEventLabels } from '../tagging/event-labels.js';");
    expect(seasonSource).toContain('window.api.settings.get()');
    expect(seasonSource).toContain('getEventLabels(settings.tagging)');
  });
});
