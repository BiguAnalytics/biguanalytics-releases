import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  getAutoCloseMsFromSeconds,
  getAutoCloseSecondsValue,
} from '../settings.js';

describe('settings auto close unit conversion', () => {
  const settingsSource = readFileSync(new URL('../settings.js', import.meta.url), 'utf8');

  it('displays stored popup auto-close milliseconds as seconds', () => {
    expect(getAutoCloseSecondsValue?.(8000)).toBe(8);
    expect(getAutoCloseSecondsValue?.(8500)).toBe(8.5);
    expect(getAutoCloseSecondsValue?.(null)).toBe(8);
  });

  it('saves entered popup auto-close seconds back as milliseconds', () => {
    expect(getAutoCloseMsFromSeconds?.('8')).toBe(8000);
    expect(getAutoCloseMsFromSeconds?.('2.5')).toBe(2500);
    expect(getAutoCloseMsFromSeconds?.('')).toBe(8000);
  });

  it('labels and constrains the settings input in seconds instead of milliseconds', () => {
    expect(settingsSource).toContain('Auto-cierre de popup (segundos)');
    expect(settingsSource).toContain('id="tagging-auto-close" min="1" step="0.5"');
    expect(settingsSource).toContain('getAutoCloseSecondsValue(settings.tagging?.autoCloseMs)');
    expect(settingsSource).toContain('autoCloseMs: getAutoCloseMsFromSeconds(autoClose.value)');
    expect(settingsSource).not.toContain('Auto-cierre de popup (ms)');
    expect(settingsSource).not.toContain('min="1000" step="500"');
  });
});
