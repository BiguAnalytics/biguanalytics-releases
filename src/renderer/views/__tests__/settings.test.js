import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as settingsModule from '../settings.js';

const {
  getSelectedThemeValue,
  getAutoCloseMsFromSeconds,
  getAutoCloseSecondsValue,
  getClipExportSettingsPayload,
  getRecordedHotkeyValue,
  getMicrophoneSettingsPayload,
  getMicrophoneLevelTone,
  getDecibelsFromRms,
  getAISettingsPayload,
  getDefaultHotkeyLabelPayload,
  getHotkeySettingsPayload,
  wireSettingsChoiceCards,
  getUpdaterProgressPercent,
  getReadableUpdaterError,
} = settingsModule;

const settingsSource = readFileSync(new URL('../settings.js', import.meta.url), 'utf8');
const layoutSource = readFileSync(new URL('../../../styles/layout.css', import.meta.url), 'utf8');

describe('settings auto close unit conversion', () => {
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

  it('exposes an enable switch and only shows the seconds control when enabled', () => {
    expect(settingsSource).toContain('id="tagging-auto-close-enabled"');
    expect(settingsSource).toContain('data-auto-close-settings');
    expect(settingsSource).toContain('autoCloseEnabled: autoCloseEnabled.checked');
    expect(settingsSource).toContain('autoCloseInput.disabled = !autoCloseEnabled.checked');
  });

  it('exposes the popup video pause preference', () => {
    expect(settingsSource).toContain('id="tagging-pause-video-on-popup"');
    expect(settingsSource).toContain('pauseVideoOnPopup: pauseVideoOnPopup.checked');
  });

  it('activates checkbox and radio controls from any point in their option card', () => {
    expect(settingsSource).toContain('function wireSettingsChoiceCards');
    expect(settingsSource).toContain("label.settings-toggle, label.settings-theme-option");
    expect(settingsSource).toContain('event.preventDefault();');
    expect(settingsSource).toContain('input.click();');

    const clickHandlers = [];
    const input = { click: vi.fn() };
    const label = {
      dataset: {},
      querySelector: () => input,
      addEventListener: (type, handler) => {
        if (type === 'click') clickHandlers.push(handler);
      },
    };

    wireSettingsChoiceCards?.({ querySelectorAll: () => [label] });
    clickHandlers[0]?.({ target: {}, preventDefault: vi.fn() });

    expect(input.click).toHaveBeenCalledTimes(1);
  });
});

describe('settings hotkey configuration', () => {
  it('renders editable built-in hotkeys and custom hotkey rows', () => {
    expect(settingsSource).toContain('Atajos de tagging');
    expect(settingsSource).toContain("key: 'ruck'");
    expect(settingsSource).toContain("key: 'scrum'");
    expect(settingsSource).toContain('data-default-hotkey="${field.key}"');
    expect(settingsSource).toContain('Atajos personalizados');
    expect(settingsSource).toContain('data-custom-hotkey-row');
    expect(settingsSource).toContain('data-custom-hotkey-add');
    expect(settingsSource).toContain('data-custom-hotkey-label');
    expect(settingsSource).toContain('data-custom-hotkey-options');
  });

  it('uses a recording button flow and reset action for hotkey changes', () => {
    expect(settingsSource).toContain('data-hotkey-record');
    expect(settingsSource).toContain('Pulse una tecla');
    expect(settingsSource).toContain('data-hotkey-reset');
    expect(settingsSource).toContain('Restablecer predeterminados');
    expect(settingsSource).toContain('beginHotkeyRecording');
    expect(settingsSource).toContain('resetHotkeyDefaults');
    expect(settingsSource).toContain('readonly');
  });

  it('records only single plain letter or number keys', () => {
    expect(getRecordedHotkeyValue?.({ key: 'x' })).toBe('X');
    expect(getRecordedHotkeyValue?.({ key: '7' })).toBe('7');
    expect(getRecordedHotkeyValue?.({ key: 'ArrowLeft' })).toBe('');
    expect(getRecordedHotkeyValue?.({ key: 'c', ctrlKey: true })).toBe('');
    expect(getRecordedHotkeyValue?.({ key: 'm', metaKey: true })).toBe('');
    expect(getRecordedHotkeyValue?.({ key: 'a', altKey: true })).toBe('');
  });

  it('saves hotkey settings inside the existing tagging settings payload', () => {
    expect(settingsSource).toContain('getHotkeySettingsPayload(container, settings)');
    expect(settingsSource).toContain('hotkeys: getDefaultHotkeyPayload(container, settings)');
    expect(settingsSource).toContain('customHotkeys: getCustomHotkeyPayload(container)');
    expect(settingsSource).toContain('tagging: {');
    expect(settingsSource).toContain('...getHotkeySettingsPayload(container, settings)');
    expect(settingsSource).toContain('hotkeyLabels: getDefaultHotkeyLabelPayload(container, settings)');
  });

  it('turns the tagging shortcuts into an internal settings subsection', () => {
    expect(settingsSource).toContain("subsection === 'hotkeys'");
    expect(settingsSource).toContain("navigate('settings', { subsection: 'hotkeys' })");
    expect(settingsSource).toContain('data-settings-back');
    expect(settingsSource).toContain('data-default-hotkey-label');
  });

  it('collects editable built-in shortcut labels', () => {
    const container = {
      querySelector(selector) {
        return {
          '[data-default-hotkey="ruck"]': { value: 'H' },
          '[data-default-hotkey-label="ruck"]': { value: 'Pepe' },
        }[selector] || null;
      },
    };

    expect(getDefaultHotkeyLabelPayload?.(container, { tagging: { hotkeyLabels: { scrum: 'Scrum' } } })).toEqual(expect.objectContaining({
      ruck: 'Pepe',
      scrum: 'Scrum',
    }));
    expect(getHotkeySettingsPayload?.(container, { tagging: { hotkeyLabels: { ruck: 'Ruck' }, customHotkeys: [] } })).toEqual(expect.objectContaining({
      hotkeyLabels: expect.objectContaining({ ruck: 'Pepe' }),
    }));
  });
});

describe('settings clip export configuration', () => {
  it('renders clip export settings with bounded second inputs', () => {
    expect(settingsSource).toContain('Exportación de clips');
    expect(settingsSource).toContain('id="clip-pre-roll"');
    expect(settingsSource).toContain('id="clip-post-roll"');
    expect(settingsSource).toContain('id="clip-output-mode"');
    expect(settingsSource).toContain('id="clip-export-quality"');
    expect(settingsSource).toContain('value="combined" selected');
    expect(settingsSource).toContain('&#218;nico MP4');
    expect(settingsSource).toContain('min="0" max="60" step="1"');
    expect(settingsSource).toContain('min="1" max="60" step="1"');
    expect(settingsSource).toContain('clipPreRollSeconds');
    expect(settingsSource).toContain('clipPostRollSeconds');
    expect(settingsSource).toContain('clipOutputModeDefault');
    expect(settingsSource).toContain('clipExportQuality');
  });

  it('normalizes clip export settings before persisting them', () => {
    const container = {
      querySelector(selector) {
        return {
          '#clip-pre-roll': { value: '-2' },
          '#clip-post-roll': { value: '99' },
          '#clip-output-mode': { value: 'combined' },
          '#clip-export-quality': { value: 'reencode' },
        }[selector] || null;
      },
    };

    expect(getClipExportSettingsPayload?.(container)).toEqual({
      clipPreRollSeconds: 5,
      clipPostRollSeconds: 60,
      clipOutputModeDefault: 'combined',
      clipExportQuality: 'reencode',
    });
  });
});

describe('settings microphone configuration', () => {
  it('renders a microphone section with device selection, live meter and monitoring test', () => {
    expect(settingsSource).toContain('Audio / Microfono');
    expect(settingsSource).toContain('data-microphone-select');
    expect(settingsSource).toContain('data-microphone-level');
    expect(settingsSource).toContain('data-microphone-db');
    expect(settingsSource).toContain('data-microphone-test');
    expect(settingsSource).toContain('Probar microfono');
    expect(settingsSource).toContain('navigator.mediaDevices.enumerateDevices');
    expect(settingsSource).toContain('navigator.mediaDevices.getUserMedia');
    expect(settingsSource).toContain('AnalyserNode');
    expect(settingsSource).toContain('requestAnimationFrame');
    expect(settingsSource).toContain('Usa auriculares para evitar acople.');
  });

  it('uses a readable custom microphone select treatment', () => {
    expect(settingsSource).toContain('class="form-select settings-microphone-select"');
    expect(layoutSource).toContain('.settings-microphone-select');
    expect(layoutSource).toContain('appearance: none');
    expect(layoutSource).toContain('right 22px center');
    expect(layoutSource).toContain('.settings-microphone-select option');
    expect(layoutSource).toContain('background: #f8fafc');
    expect(layoutSource).toContain('border-color: transparent');
    expect(layoutSource).not.toContain('.settings-microphone-select:focus {\n  border-color: var(--color-accent)');
  });

  it('builds the persisted microphone payload with es-AR as the dictation language', () => {
    expect(getMicrophoneSettingsPayload).toBeTypeOf('function');
    const container = {
      querySelector(selector) {
        if (selector !== '[data-microphone-select]') return null;
        return {
          value: 'device-1',
          selectedOptions: [
            {
              textContent: 'Plantronics BT600',
              dataset: { deviceLabel: 'Plantronics BT600' },
            },
          ],
        };
      },
    };

    expect(getMicrophoneSettingsPayload(container)).toEqual({
      deviceId: 'device-1',
      label: 'Plantronics BT600',
      language: 'es-AR',
    });
  });

  it('maps microphone volume to dB and green/yellow/red meter tones', () => {
    expect(getDecibelsFromRms).toBeTypeOf('function');
    expect(getMicrophoneLevelTone).toBeTypeOf('function');
    expect(getDecibelsFromRms(1)).toBe(0);
    expect(getDecibelsFromRms(0)).toBe(-100);
    expect(getMicrophoneLevelTone(-42)).toBe('green');
    expect(getMicrophoneLevelTone(-18)).toBe('yellow');
    expect(getMicrophoneLevelTone(-6)).toBe('red');
  });
});

describe('settings AI backend configuration', () => {
  it('renders secure AI backend status and connection test controls without editable backend URL, provider API keys or manual AI tokens', () => {
    expect(settingsSource).toContain('Configuracion IA');
    expect(settingsSource).toContain('Backend IA seguro');
    expect(settingsSource).toContain('Conectado');
    expect(settingsSource).toContain('No disponible');
    expect(settingsSource).not.toContain('data-ai-backend-url');
    expect(settingsSource).not.toContain('URL del backend');
    expect(settingsSource).not.toContain('type="url"');
    expect(settingsSource).not.toContain('data-ai-token-masked');
    expect(settingsSource).not.toContain('Token de cliente');
    expect(settingsSource).toContain('data-ai-test-connection');
    expect(settingsSource).toContain('Probar conexion');
    expect(settingsSource).toContain('window.biguAIConfig.testConnection');
    expect(settingsSource).not.toContain('window.biguAIConfig.set');
    expect(settingsSource).not.toContain('GEMINI_API_KEY');
    expect(settingsSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(settingsSource).not.toContain('API key de Gemini');
  });

  it('does not build a renderer payload that can change the AI backend URL', () => {
    expect(getAISettingsPayload).toBeTypeOf('function');
    const container = {
      querySelector(selector) {
        return {
          '[data-ai-backend-url]': { value: ' https://ai.biguanalytics.example/// ' },
        }[selector] || null;
      },
    };

    expect(getAISettingsPayload(container)).toEqual({});
  });

  it('tests the fixed backend connection without persisting renderer AI config', () => {
    const container = {
      querySelector(selector) {
        return {
          '[data-ai-backend-url]': { value: ' https://ai.biguanalytics.example/// ' },
        }[selector] || null;
      },
    };

    expect(getAISettingsPayload(container)).toEqual({});
    expect(settingsSource).not.toContain('await window.biguAIConfig?.set?.(getAISettingsPayload(container))');
    expect(settingsSource).not.toContain('await window.biguAIConfig.set(getAISettingsPayload(container))');
  });
});

describe('settings updater configuration', () => {
  it('renders an updates section with current version, manual check, download progress and install action', () => {
    expect(settingsSource).toContain('Actualizaciones');
    expect(settingsSource).toContain('Version actual');
    expect(settingsSource).toContain('data-updater-current-version');
    expect(settingsSource).toContain('data-updater-check');
    expect(settingsSource).toContain('Buscar actualizacion');
    expect(settingsSource).toContain('Nueva version disponible');
    expect(settingsSource).toContain('data-updater-download');
    expect(settingsSource).toContain('Descargar');
    expect(settingsSource).toContain('data-updater-progress');
    expect(settingsSource).toContain('Reiniciar e instalar');
    expect(settingsSource).toContain('Estas usando la ultima version');
  });

  it('uses the fixed main-process updater API without allowing a user supplied update URL', () => {
    expect(settingsSource).toContain('window.api.updater.getStatus');
    expect(settingsSource).toContain('window.api.updater.check');
    expect(settingsSource).toContain('window.api.updater.download');
    expect(settingsSource).toContain('window.api.updater.install');
    expect(settingsSource).toContain('window.api.updater.onEvent');
    expect(settingsSource).not.toContain('data-updates-url');
    expect(settingsSource).not.toContain('UPDATES_URL');
    expect(settingsSource).not.toContain('type="url"');
  });

  it('normalizes updater progress percentage for display', () => {
    expect(getUpdaterProgressPercent).toBeTypeOf('function');
    expect(getUpdaterProgressPercent?.({ percent: 42.6 })).toBe(43);
    expect(getUpdaterProgressPercent?.({ percent: -12 })).toBe(0);
    expect(getUpdaterProgressPercent?.({ percent: 140 })).toBe(100);
    expect(getUpdaterProgressPercent?.({})).toBe(0);
  });

  it('shows updater errors without technical stacks', () => {
    expect(getReadableUpdaterError).toBeTypeOf('function');
    const message = getReadableUpdaterError?.({
      message: 'Error: network failed\n    at AutoUpdater.checkForUpdates (updater.js:10:2)',
      stack: 'secret stack',
    });

    expect(message).toBe('No se pudo completar la actualizacion. Revisa tu conexion e intenta nuevamente.');
    expect(message).not.toContain('AutoUpdater');
    expect(message).not.toContain('at ');
    expect(message).not.toContain('stack');
  });
});

describe('settings theme selection', () => {
  it('reads a checked light theme option from the settings form', () => {
    expect(getSelectedThemeValue?.({
      querySelector: () => ({ value: 'light' }),
    })).toBe('light');
  });

  it('falls back to dark mode when the settings form has no valid theme option', () => {
    expect(getSelectedThemeValue?.({
      querySelector: () => ({ value: 'experimental' }),
    })).toBe('dark');
    expect(getSelectedThemeValue?.({
      querySelector: () => null,
    })).toBe('dark');
  });
});

describe('settings interaction polish', () => {
  it('keeps the save action visible while the settings content scrolls', () => {
    expect(settingsSource).toContain('settings-save-bar');
    expect(settingsSource).toContain('Guardar ajustes');
    expect(layoutSource).toMatch(/\.settings-save-bar\s*{[\s\S]*position:\s*sticky;[\s\S]*top:\s*var\(--space-2\)/s);
    expect(layoutSource).toContain('.settings-save-bar .settings-feedback');
  });
});
