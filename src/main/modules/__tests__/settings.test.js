import { describe, it, expect } from 'vitest';

import { createSettingsRepository, mergeSettings } from '../settings.js';

describe('settings.js', () => {
  it('preserves default user fields when persisted settings contain a partial user', () => {
    const settings = mergeSettings({ user: { name: 'Jorge G.' } });

    expect(settings.user).toEqual({
      name: 'Jorge G.',
      role: 'ENTRENADOR',
    });
  });

  it('preserves the persisted visual theme setting', () => {
    expect(mergeSettings().theme).toBe('dark');
    expect(mergeSettings({ theme: 'light' }).theme).toBe('light');
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

    const settings = await repository.update({ user: { name: 'Ana' } });

    expect(settings.user).toEqual({ name: 'Ana', role: 'ENTRENADOR' });
    expect(saved).toEqual([{ key: 'settings', value: settings }]);
  });
});
