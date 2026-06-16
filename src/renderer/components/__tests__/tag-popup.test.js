import { readFileSync } from 'node:fs';
import { vi } from 'vitest';

import { describe, expect, it } from 'vitest';

import { createTaggerState, openTagPopup } from '../../tagging/tagger.js';
import * as tagPopup from '../tag-popup.js';

const { getPopupZoneByNumber, getZones, renderTagPopup } = tagPopup;

const tagPopupCss = readFileSync(new URL('../../../styles/components/tag-popup.css', import.meta.url), 'utf8');

function createHost() {
  return {
    innerHTML: '',
    querySelector() {
      return { addEventListener() {} };
    },
    querySelectorAll() {
      return [];
    },
  };
}

describe('tag popup field zones', () => {
  it('shows the four fast rugby field sectors', () => {
    expect(getZones().map(zone => [zone.value, zone.label, zone.key])).toEqual([
      ['own_22', '22 propia', '1'],
      ['own_half', 'Campo propio', '2'],
      ['opp_half', 'Campo rival', '3'],
      ['opp_22', '22 rival', '4'],
    ]);
  });

  it('renders the zone selector as four large horizontal field sectors', () => {
    expect(tagPopupCss).toMatch(/\.tag-popup-field-grid\s*{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s);
    expect(tagPopupCss).toMatch(/\.tag-popup-field-grid::before\s*{[^}]*linear-gradient\(90deg,/s);
    expect(tagPopupCss).toMatch(/\.tag-popup-zone-cell\s*{[^}]*z-index:\s*1;/s);
  });

  it('keeps keyboard selection on number keys 1 through 4 when the field is open', () => {
    const host = {
      querySelector: () => ({
        querySelector: selector => ({
          dataset: {
            zoneValue: selector.includes('"4"') ? 'opp_22' : 'own_22',
          },
        }),
      }),
    };

    expect(getPopupZoneByNumber(host, '4')).toBe('opp_22');
  });
});

describe('tag popup accessibility and focus', () => {
  it('uses the stable side-panel popup width and dialog labelling', () => {
    const host = createHost();
    const state = openTagPopup(createTaggerState(), 'R', 18);

    renderTagPopup(host, state, {}, {}, { speech: { status: 'idle', errorMessage: '' } });

    expect(tagPopupCss).toMatch(/\.tag-popup\s*{[^}]*width:\s*min\(420px,\s*100%\);/s);
    expect(host.innerHTML).toContain('role="dialog"');
    expect(host.innerHTML).toContain('aria-modal="true"');
    expect(host.innerHTML).toContain('aria-labelledby="tag-popup-title"');
    expect(host.innerHTML).toContain('id="tag-popup-title"');
  });

  it('focuses the first popup control and traps Tab inside the popup', () => {
    const first = { disabled: false, focus: vi.fn(), offsetParent: {} };
    const last = { disabled: false, focus: vi.fn(), offsetParent: {} };
    const root = {
      querySelectorAll: () => [first, last],
    };
    const forwardEvent = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() };
    const backwardEvent = { key: 'Tab', shiftKey: true, preventDefault: vi.fn() };

    expect(typeof tagPopup.focusFirstPopupControl).toBe('function');
    expect(typeof tagPopup.trapFocusInPopup).toBe('function');
    expect(tagPopup.focusFirstPopupControl(root)).toBe(true);
    expect(first.focus).toHaveBeenCalledTimes(1);
    expect(tagPopup.trapFocusInPopup(root, forwardEvent, last)).toBe(true);
    expect(forwardEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(first.focus).toHaveBeenCalledTimes(2);
    expect(tagPopup.trapFocusInPopup(root, backwardEvent, first)).toBe(true);
    expect(backwardEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(last.focus).toHaveBeenCalledTimes(1);
  });

  it('focuses the note textarea first for note-only popups', () => {
    const noteInput = { disabled: false, focus: vi.fn(), offsetParent: {} };
    const saveButton = { disabled: false, focus: vi.fn(), offsetParent: {} };
    const root = {
      querySelector: (selector) => {
        if (selector.includes('[data-popup-note]')) return noteInput;
        if (selector.includes('[data-popup-complete]')) return saveButton;
        return null;
      },
      querySelectorAll: () => [noteInput, saveButton],
    };

    expect(tagPopup.focusFirstPopupControl(root)).toBe(true);
    expect(noteInput.focus).toHaveBeenCalledTimes(1);
    expect(saveButton.focus).not.toHaveBeenCalled();
  });
});

describe('tag popup voice dictation control', () => {
  it('renders a compact microphone icon without the dead Mic text label', () => {
    const host = createHost();
    const state = openTagPopup(createTaggerState(), 'N', 18);

    renderTagPopup(host, state, {}, {}, { speech: { status: 'idle', errorMessage: '' } });

    expect(host.innerHTML).toContain('data-popup-mic');
    expect(host.innerHTML).toContain('<svg');
    expect(host.innerHTML).toContain('data-mic-icon');
    expect(host.innerHTML).toContain('title="Dictar nota (Ctrl+M)"');
    expect(host.innerHTML).not.toContain('>Mic<');
  });

  it('exposes listening state and inline speech errors inside the popup', () => {
    const host = createHost();
    const state = openTagPopup(createTaggerState(), 'N', 18);

    renderTagPopup(host, state, {}, {}, {
      speech: {
        status: 'listening',
        errorMessage: 'Permiso de microfono denegado.',
      },
    });

    expect(host.innerHTML).toContain('aria-pressed="true"');
    expect(host.innerHTML).toContain('is-listening');
    expect(host.innerHTML).toContain('title="Escuchando..."');
    expect(host.innerHTML).toContain('tag-popup-speech-error');
    expect(host.innerHTML).toContain('Permiso de microfono denegado.');
  });
});
