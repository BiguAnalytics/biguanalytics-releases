import { describe, it, expect } from 'vitest';

import { createSettingsRepository, mergeSettings, parseSettingsStoreJson } from '../settings.js';

describe('settings.js', () => {
  it('preserves default user fields when persisted settings contain a partial user', () => {
    const settings = mergeSettings({ user: { name: 'Jorge G.' } });

    expect(settings.user).toEqual({
      name: 'Jorge G.',
      role: 'ANALISTA',
    });
  });

  it('preserves the persisted visual theme setting', () => {
    expect(mergeSettings().theme).toBe('dark');
    expect(mergeSettings({ theme: 'light' }).theme).toBe('light');
  });

  it('defaults first launch onboarding to visible and preserves dismissal', () => {
    expect(mergeSettings().firstLaunch).toBe(true);
    expect(mergeSettings({ firstLaunch: false }).firstLaunch).toBe(false);
  });

  it('provides and merges phase 3 alert thresholds', () => {
    const settings = mergeSettings({
      alerts: {
        penaltiesMax: 12,
        ruckWinPctMin: 55,
      },
    });

    expect(settings.alerts).toEqual(expect.objectContaining({
      ruckWinPctMin: 55,
      penaltiesMax: 12,
      lineoutWinPctMin: 40,
      scrumWinPctMin: 50,
      breakLinesConcededMax: 5,
    }));
  });

  it('provides and deeply merges phase 3.5 dashboard personalization defaults', () => {
    const settings = mergeSettings({
      dashboard: {
        template: 'forwards',
        selectedKpis: ['scrumWinPct', 'lineoutWinPct', 'ruckWinPct', 'penalties'],
        filters: { timeBand: '40-60' },
      },
    });

    expect(settings.dashboard).toEqual(expect.objectContaining({
      template: 'forwards',
      pdfTemplate: 'complete',
      selectedKpis: ['scrumWinPct', 'lineoutWinPct', 'ruckWinPct', 'penalties'],
    }));
    expect(settings.dashboard.filters).toEqual({
      team: 'bigua',
      timeBand: '40-60',
      zone: 'all',
    });
    expect(settings.dashboard.sectionOrder).toEqual(expect.arrayContaining(['set-pieces', 'rucks', 'discipline', 'heatmap']));
    expect(settings.dashboard.visibleSections).toEqual(expect.arrayContaining(['set-pieces', 'rucks', 'discipline', 'heatmap']));
  });

  it('updates settings through a store while preserving nested default fields', async () => {
    const saved = [];
    const store = {
      value: undefined,
      get(key) {
        return key === 'settings' ? this.value : undefined;
      },
      set(key, value) {
        saved.push({ key, value });
        this.value = value;
      },
    };
    const repository = createSettingsRepository(store);

    const settings = await repository.update({ user: { name: 'Ana' }, dashboard: { filters: { zone: 'Z7' } } });

    expect(settings.user).toEqual({ name: 'Ana', role: 'ANALISTA' });
    expect(settings.dashboard.filters).toEqual({ team: 'bigua', timeBand: 'all', zone: 'Z7' });
    expect(saved).toEqual([{ key: 'settings', value: settings }]);
  });

  it('parses settings store JSON when the file starts with BOM bytes rendered as mojibake', () => {
    const parsed = parseSettingsStoreJson('∩╗┐{"settings":{"user":{"name":"Jorge G."}}}');

    expect(parsed.settings.user.name).toBe('Jorge G.');
  });

  it('parses settings store JSON when the file starts with a UTF-8 BOM', () => {
    const parsed = parseSettingsStoreJson('\uFEFF{"settings":{"theme":"light"}}');

    expect(parsed.settings.theme).toBe('light');
  });
});
