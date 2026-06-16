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

  it('defaults the versioned walkthrough to incomplete and preserves identity completion flags', () => {
    expect(mergeSettings().onboarding.walkthrough.v1).toEqual({
      completed: false,
      identityKey: '',
      completedByIdentity: {},
    });

    expect(mergeSettings({
      onboarding: {
        walkthrough: {
          v1: {
            completed: true,
            identityKey: 'profile-1::device-1',
            completedByIdentity: { 'profile-1::device-1': true },
          },
        },
      },
    }).onboarding.walkthrough.v1).toEqual({
      completed: true,
      identityKey: 'profile-1::device-1',
      completedByIdentity: { 'profile-1::device-1': true },
    });
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

  it('provides editable tagging hotkey defaults and deeply merges custom shortcuts', () => {
    const settings = mergeSettings({
      tagging: {
        autoCloseMs: 5000,
        hotkeys: { ruck: 'H' },
        customHotkeys: [
          { id: 'line-speed', hotkey: 'J', label: 'Salida rapida', resultOptions: ['buena', 'mala'] },
        ],
      },
    });

    expect(settings.tagging.hotkeys).toEqual(expect.objectContaining({
      ruck: 'H',
      scrum: 'S',
      lineout: 'L',
      penal: 'P',
      points: 'T',
      'break-line': 'B',
      kick: 'K',
      maul: 'M',
      turnover: 'V',
      card: 'A',
      note: 'N',
    }));
    expect(settings.tagging.customHotkeys).toEqual([
      { id: 'line-speed', hotkey: 'J', label: 'Salida rapida', resultOptions: ['buena', 'mala'] },
    ]);
  });

  it('provides and deeply merges microphone settings for voice dictation', () => {
    expect(mergeSettings().microphone).toEqual({
      deviceId: '',
      label: 'Microfono predeterminado',
      language: 'es-AR',
    });

    expect(mergeSettings({
      microphone: { deviceId: 'mic-1', label: 'Plantronics BT600' },
    }).microphone).toEqual({
      deviceId: 'mic-1',
      label: 'Plantronics BT600',
      language: 'es-AR',
    });
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

  it('provides validated clip export defaults and clamps unreasonable durations', () => {
    expect(mergeSettings()).toEqual(expect.objectContaining({
      clipPreRollSeconds: 3,
      clipPostRollSeconds: 10,
      clipOutputModeDefault: 'separate',
      clipExportQuality: 'copy',
    }));

    expect(mergeSettings({
      clipPreRollSeconds: -4,
      clipPostRollSeconds: 90,
      clipOutputModeDefault: 'unsupported',
      clipExportQuality: 'unknown',
    })).toEqual(expect.objectContaining({
      clipPreRollSeconds: 3,
      clipPostRollSeconds: 60,
      clipOutputModeDefault: 'separate',
      clipExportQuality: 'copy',
    }));
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

    const settings = await repository.update({
      user: { name: 'Ana' },
      dashboard: { filters: { zone: 'Z7' } },
      tagging: { hotkeys: { ruck: 'H' } },
      microphone: { deviceId: 'mic-1', label: 'Plantronics BT600' },
      onboarding: {
        walkthrough: {
          v1: {
            completed: true,
            identityKey: 'profile-1::device-1',
            completedByIdentity: { 'profile-1::device-1': true },
          },
        },
      },
    });

    expect(settings.user).toEqual({ name: 'Ana', role: 'ANALISTA' });
    expect(settings.dashboard.filters).toEqual({ team: 'bigua', timeBand: 'all', zone: 'Z7' });
    expect(settings.tagging.hotkeys).toEqual(expect.objectContaining({ ruck: 'H', scrum: 'S' }));
    expect(settings.microphone).toEqual({ deviceId: 'mic-1', label: 'Plantronics BT600', language: 'es-AR' });
    expect(settings.onboarding.walkthrough.v1.completedByIdentity).toEqual({ 'profile-1::device-1': true });
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
