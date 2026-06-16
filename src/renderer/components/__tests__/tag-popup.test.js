import { readFileSync } from 'node:fs';
import { vi } from 'vitest';

import { describe, expect, it } from 'vitest';

import { createTaggerState, openTagPopup } from '../../tagging/tagger.js';
import * as tagPopup from '../tag-popup.js';

const { getZones, renderTagPopup } = tagPopup;

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
  it('orders the 15 field zones vertically by column', () => {
    expect(getZones().map(zone => zone.label)).toEqual([
      '1', '4', '7', '10', '13',
      '2', '5', '8', '11', '14',
      '3', '6', '9', '12', '15',
    ]);
  });

  it('renders the zone selector as a rugby field graphic', () => {
    expect(tagPopupCss).toMatch(/\.tag-popup-field-grid\s*{[^}]*grid-template-columns:\s*repeat\(5,\s*1fr\);/s);
    expect(tagPopupCss).toMatch(/\.tag-popup-field-grid::before\s*{[^}]*linear-gradient\(90deg,/s);
    expect(tagPopupCss).toMatch(/\.tag-popup-zone-cell\s*{[^}]*z-index:\s*1;/s);
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
