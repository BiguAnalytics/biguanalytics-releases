import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  completePopup,
  createTaggerState,
  openTagPopup,
  selectPopupOption,
  selectPopupZone,
} from '../../tagging/tagger.js';
import { normalizeInspectorEventResult } from '../tagging.js';

const tagPopupCss = readFileSync(new URL('../../../styles/components/tag-popup.css', import.meta.url), 'utf8');
const tagPopupSource = readFileSync(new URL('../../components/tag-popup.js', import.meta.url), 'utf8');

describe('tagging Ruck/Scrum zone completion regressions', () => {
  it('keeps the empty result empty when the inspector displays its placeholder', () => {
    expect(normalizeInspectorEventResult('Sin dato', '')).toBe('');
    expect(normalizeInspectorEventResult('Ganado sucio', '')).toBe('ganado-sucio');
  });

  it.each(['R', 'S'])('completes %s after selecting opp_half and preserves the zone in the event payload', (hotkey) => {
    let state = openTagPopup(createTaggerState(), hotkey, 42.5);

    state = selectPopupZone(state, 'opp_half');
    const resultSelected = selectPopupOption(state, 'ganado');
    const teamSelected = selectPopupOption(resultSelected.state, 'home');

    expect(teamSelected.completed).toBe(true);
    expect(teamSelected.state.activePopup).toBeNull();
    expect(teamSelected.event).toEqual(expect.objectContaining({
      type: hotkey === 'S' ? 'scrum' : 'ruck',
      team: 'home',
      result: 'ganado',
      zone: 'opp_half',
      zoneId: 'opp_half',
    }));
  });

  it('keeps the opp_half zone button stable while it is being clicked', () => {
    expect(tagPopupCss).not.toMatch(
      /\.tag-popup-zone-cell:hover\s*\{[^}]*transform\s*:/s,
    );
    expect(tagPopupCss).toMatch(
      /\.tag-popup-zone-cell\s*\{[^}]*cursor:\s*pointer;/s,
    );
  });

  it('does not move the popup controls during the entrance animation', () => {
    const entranceStart = tagPopupCss.indexOf('@keyframes tag-popup-in');
    const entranceEnd = tagPopupCss.indexOf('@keyframes tag-popup-option-in', entranceStart);
    expect(tagPopupCss.slice(entranceStart, entranceEnd)).not.toContain('transform:');
  });

  it('keeps the expanded zone grid inside a scrollable popup surface', () => {
    const popupStart = tagPopupCss.indexOf('.tag-popup {');
    const popupEnd = tagPopupCss.indexOf('}', popupStart);
    const popupSource = tagPopupCss.slice(popupStart, popupEnd);

    expect(popupSource).toContain('max-height: 100%');
    expect(popupSource).toContain('overflow-y: auto');
  });

  it('controls zone disclosure explicitly instead of relying on native details toggling', () => {
    expect(tagPopupSource).toContain("host.querySelector('.tag-popup-zone summary')");
    expect(tagPopupSource).toContain('event.preventDefault()');
    expect(tagPopupSource).toContain('details.open = !details.open');
  });

  it('starts with the zone controls available for rapid tagging', () => {
    expect(tagPopupSource).toContain('<details class="tag-popup-zone" open>');
  });

  it.each(['R', 'S'])('does not treat a retry after zone selection as an already completed %s popup', (hotkey) => {
    let state = selectPopupZone(openTagPopup(createTaggerState(), hotkey, 42.5), 'opp_half');
    state = selectPopupOption(state, 'ganado').state;

    const firstCompletion = completePopup(state);
    const completed = selectPopupOption(firstCompletion.state, 'home');

    expect(firstCompletion.completed).toBe(false);
    expect(completed.completed).toBe(true);
    expect(completed.event).toEqual(expect.objectContaining({ zone: 'opp_half' }));
  });
});
