import { describe, expect, it } from 'vitest';

import * as tagger from '../tagger.js';
import {
  EVENT_DEFINITIONS,
  advancePossession,
  buildEventPayload,
  calculatePossessionPercentages,
  closePopup,
  completePopup,
  createTaggerState,
  closeActivePossession,
  finishSequence,
  enrichSequenceFromEvents,
  getPossessionTimelineSegments,
  openTagPopup,
  resetPossession,
  selectPopupOption,
  selectPopupZone,
  shouldAutoClosePopup,
  startSequence,
  togglePossession,
  updatePopupNote,
} from '../tagger.js';

const { buildEventDefinitions, buildSpeechNoteValue, sanitizeNoteText } = tagger;

describe('tagger engine', () => {
  it('defines the 11 phase 2 event hotkeys with their first popup step', () => {
    expect(Object.keys(EVENT_DEFINITIONS).sort()).toEqual(['A', 'B', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V']);
    expect(EVENT_DEFINITIONS.R.steps[0].options.map(option => option.value)).toEqual(['ganado', 'perdido', 'ganado-sucio']);
    expect(EVENT_DEFINITIONS.P.steps[0].options.map(option => option.value)).toEqual(['ataque', 'defensa']);
    expect(EVENT_DEFINITIONS.N.noteOnly).toBe(true);
  });

  it('opens one popup at the captured timestamp and blocks other event hotkeys while active', () => {
    const state = createTaggerState({ autoCloseMs: 8000 });
    const opened = openTagPopup(state, 'R', 123.42);
    const blocked = openTagPopup(opened, 'S', 130);

    expect(opened.activePopup.hotkey).toBe('R');
    expect(opened.activePopup.timestamp).toBe(123.42);
    expect(blocked.activePopup.hotkey).toBe('R');
    expect(blocked.blockedHotkey).toBe('S');
  });

  it('remaps built-in event hotkeys without changing their stored event type', () => {
    expect(buildEventDefinitions).toBeTypeOf('function');
    const definitions = buildEventDefinitions({
      hotkeys: { ruck: 'H' },
    });
    const state = createTaggerState({ eventDefinitions: definitions });
    const opened = openTagPopup(state, 'H', 12);
    const missingOriginal = openTagPopup(state, 'R', 12);
    const selected = selectPopupOption(opened, 'ganado');
    const completed = selectPopupOption(selected.state, 'home');

    expect(definitions.H).toEqual(expect.objectContaining({
      hotkey: 'H',
      defaultHotkey: 'R',
      type: 'ruck',
      label: 'Ruck',
    }));
    expect(definitions.R).toBeUndefined();
    expect(opened.activePopup.hotkey).toBe('H');
    expect(missingOriginal.activePopup).toBeNull();
    expect(selected.completed).toBe(false);
    expect(completed.event).toEqual(expect.objectContaining({
      type: 'ruck',
      team: 'home',
      result: 'ganado',
    }));
  });

  it('adds custom hotkeys as custom event definitions with configured result data', () => {
    expect(buildEventDefinitions).toBeTypeOf('function');
    const definitions = buildEventDefinitions({
      customHotkeys: [
        { id: 'line-speed', hotkey: 'J', label: 'Salida rapida', resultOptions: ['buena', 'mala'] },
      ],
    });
    const opened = openTagPopup(createTaggerState({ eventDefinitions: definitions }), 'J', 33);
    const selected = selectPopupOption(opened, 'buena');

    expect(definitions.J).toEqual(expect.objectContaining({
      custom: true,
      type: 'custom:line-speed',
      label: 'Salida rapida',
      hotkey: 'J',
    }));
    expect(definitions.J.steps[0].options).toEqual([
      { label: 'buena', value: 'buena' },
      { label: 'mala', value: 'mala' },
    ]);
    expect(selected.event).toEqual(expect.objectContaining({
      type: 'custom:line-speed',
      result: 'buena',
      team: null,
      timestamp: 33,
    }));
  });

  it('builds a single-step event payload with note, selected sector id and label', () => {
    const opened = openTagPopup(createTaggerState(), 'R', 15.5);
    const withZone = selectPopupZone(updatePopupNote(opened, 'dominante'), 'own_22');
    const selected = selectPopupOption(withZone, 'ganado');

    expect(selected.completed).toBe(false);
    expect(selected.state.activePopup.stepIndex).toBe(1);
    expect(selected.state.activePopup.zoneLabel).toBe('22 propia');

    const withTeam = selectPopupOption(selected.state, 'home');
    expect(withTeam.completed).toBe(true);
    expect(withTeam.event).toEqual(expect.objectContaining({
      timestamp: 15.5,
      type: 'ruck',
      team: 'home',
      result: 'ganado',
      note: 'dominante',
      zone: 'own_22',
      zoneId: 'own_22',
      zoneLabel: '22 propia',
    }));
    expect(withTeam.state.activePopup).toBeNull();
  });

  it('maps a legacy popup zone to a four-sector payload without losing the original zone', () => {
    const opened = openTagPopup(createTaggerState(), 'R', 15.5);
    const withLegacyZone = selectPopupZone(opened, 'Z13');
    const selected = selectPopupOption(withLegacyZone, 'ganado');
    const completed = selectPopupOption(selected.state, 'home');

    expect(completed.event).toEqual(expect.objectContaining({
      zone: 'opp_22',
      zoneId: 'opp_22',
      zoneLabel: '22 rival',
      legacyZone: 'Z13',
    }));
  });

  it('infers the event team from active possession without adding a team step', () => {
    const possession = togglePossession(createTaggerState(), 'away', 0);
    const opened = openTagPopup(possession, 'T', 15.5);
    const selected = selectPopupOption(opened, 'try');

    expect(selected.completed).toBe(true);
    expect(selected.event).toEqual(expect.objectContaining({
      timestamp: 15.5,
      type: 'points',
      team: 'away',
      result: 'try',
    }));
    expect(selected.state.activePopup).toBeNull();
  });

  it('does not default direct event payloads to home when team is absent', () => {
    expect(buildEventPayload({ type: 'points', result: 'try', timestamp: 4 })).toEqual(expect.objectContaining({
      type: 'points',
      team: null,
      result: 'try',
      timestamp: 4,
    }));
  });

  it('keeps multi-step popups open until the final team step is selected', () => {
    const opened = openTagPopup(createTaggerState(), 'P', 44);
    const firstStep = selectPopupOption(opened, 'defensa');
    const secondStep = selectPopupOption(firstStep.state, 'offside');
    const teamStep = selectPopupOption(secondStep.state, 'away');

    expect(firstStep.completed).toBe(false);
    expect(firstStep.state.activePopup.stepIndex).toBe(1);
    expect(firstStep.state.activePopup.values.phase).toBe('defensa');
    expect(secondStep.completed).toBe(false);
    expect(secondStep.state.activePopup.stepIndex).toBe(2);
    expect(teamStep.completed).toBe(true);
    expect(teamStep.event).toEqual(expect.objectContaining({
      type: 'penal',
      team: 'away',
      result: 'defensa',
      subtype: 'offside',
    }));
  });

  it('closes with Escape semantics without producing an event', () => {
    const opened = openTagPopup(createTaggerState(), 'R', 10);
    const closed = closePopup(opened);

    expect(closed.activePopup).toBeNull();
    expect(closed.discardedPopup.hotkey).toBe('R');
  });

  it('saves free notes with Enter without requiring options', () => {
    const opened = updatePopupNote(openTagPopup(createTaggerState(), 'N', 72), 'Cambio defensivo');
    const completed = completePopup(opened);

    expect(completed.completed).toBe(true);
    expect(completed.event).toEqual(expect.objectContaining({
      type: 'note',
      note: 'Cambio defensivo',
      timestamp: 72,
    }));
  });

  it('opens consecutive free notes with fresh state and distinct payloads', () => {
    const initial = createTaggerState({ autoCloseMs: 8000 });
    const firstOpened = updatePopupNote(openTagPopup(initial, 'N', 72), 'Primera nota');
    const firstCompleted = completePopup(firstOpened);
    const secondOpened = openTagPopup(firstCompleted.state, 'N', 95);
    const secondUpdated = updatePopupNote(secondOpened, 'Segunda nota');
    const secondCompleted = completePopup(secondUpdated);

    expect(secondOpened.activePopup).toEqual(expect.objectContaining({
      hotkey: 'N',
      type: 'note',
      timestamp: 95,
      note: '',
      zone: null,
      values: {},
    }));
    expect(firstCompleted.event).toEqual(expect.objectContaining({ note: 'Primera nota' }));
    expect(secondCompleted.event).toEqual(expect.objectContaining({ note: 'Segunda nota' }));
  });

  it('does not auto-close while the popup note input is being edited', () => {
    const opened = openTagPopup(createTaggerState({ autoCloseMs: 8000 }), 'N', 72);
    const stalePopup = {
      ...opened,
      activePopup: {
        ...opened.activePopup,
        lastInteractionAt: 1_000,
      },
    };

    expect(shouldAutoClosePopup(stalePopup, 9_500)).toBe(true);
    expect(shouldAutoClosePopup(stalePopup, 9_500, { isInteracting: true })).toBe(false);
  });

  it('registers possession intervals and calculates live percentages', () => {
    const first = togglePossession(createTaggerState(), 'home', 0);
    const second = togglePossession(first, 'away', 30);
    const closed = togglePossession(second, 'away', 50);
    const percentages = calculatePossessionPercentages(closed.possession, 50);

    expect(closed.possession.intervals).toEqual([
      { team: 'home', start: 0, end: 30 },
      { team: 'away', start: 30, end: 50 },
    ]);
    expect(percentages).toEqual({ home: 60, away: 40 });
  });

  it('hydrates persisted possession intervals and active state', () => {
    expect(createTaggerState({
      possession: [{ team: 'home', start: 0, end: 20 }],
    }).possession).toEqual({
      activeTeam: null,
      activeStart: null,
      activeEnd: null,
      intervals: [{ team: 'home', start: 0, end: 20 }],
    });

    expect(createTaggerState({
      possession: {
        activeTeam: 'away',
        activeStart: 40,
        activeEnd: 42,
        intervals: [{ team: 'home', start: 0, end: 40 }],
      },
    }).possession).toEqual({
      activeTeam: 'away',
      activeStart: 40,
      activeEnd: 42,
      intervals: [{ team: 'home', start: 0, end: 40 }],
    });
  });

  it('resets possession intervals and active marker explicitly', () => {
    const state = createTaggerState({
      possession: {
        activeTeam: 'home',
        activeStart: 12,
        activeEnd: 18,
        intervals: [{ team: 'away', start: 0, end: 12 }],
      },
    });

    expect(resetPossession(state).possession).toEqual({
      activeTeam: null,
      activeStart: null,
      activeEnd: null,
      intervals: [],
    });
  });

  it('advances active possession during normal playback without auto-closing on large gaps', () => {
    const homeStarted = togglePossession(createTaggerState(), 'home', 0);
    const homeObserved = advancePossession(homeStarted, 120, 180);
    const awayStarted = togglePossession(homeObserved, 'away', 120);
    const awayObserved = advancePossession(awayStarted, 300, 180);
    const skippedAhead = advancePossession(awayObserved, 600);

    expect(calculatePossessionPercentages(awayObserved.possession, 300)).toEqual({ home: 40, away: 60 });
    expect(skippedAhead.possession.activeTeam).toBe('away');
    expect(skippedAhead.possession.activeEnd).toBe(600);
    expect(calculatePossessionPercentages(skippedAhead.possession, 600)).toEqual({ home: 20, away: 80 });
  });

  it('closes active possession explicitly for cleanup or controlled transitions', () => {
    const state = togglePossession(createTaggerState(), 'home', 10);
    const observed = advancePossession(state, 25, 180);
    const closed = closeActivePossession(observed, 40);

    expect(closed.possession).toEqual({
      activeTeam: null,
      activeStart: null,
      activeEnd: null,
      intervals: [{ team: 'home', start: 10, end: 40 }],
    });
  });

  it('exposes finite possession timeline segments without no-one gaps', () => {
    const possession = {
      activeTeam: 'away',
      activeStart: 120,
      activeEnd: 300,
      intervals: [{ team: 'home', start: 0, end: 120 }],
    };

    expect(getPossessionTimelineSegments(possession, 600)).toEqual([
      { team: 'home', start: 0, end: 120 },
      { team: 'away', start: 120, end: 300 },
    ]);
  });

  it('overwrites only the observed possession fragment when tagging again after rewinding video', () => {
    const state = createTaggerState({
      possession: {
        activeTeam: null,
        activeStart: null,
        activeEnd: null,
        intervals: [
          { team: 'home', start: 0, end: 100 },
          { team: 'away', start: 100, end: 200 },
        ],
      },
    });
    const rewound = togglePossession(state, 'home', 50);
    const observed = advancePossession(rewound, 120, 180);
    const closed = togglePossession(observed, 'home', 120);

    expect(getPossessionTimelineSegments(observed.possession, 200)).toEqual([
      { team: 'home', start: 0, end: 120 },
      { team: 'away', start: 120, end: 200 },
    ]);
    expect(closed.possession.intervals).toEqual([
      { team: 'home', start: 0, end: 120 },
      { team: 'away', start: 120, end: 200 },
    ]);
  });

  it('resolves overlapping persisted possession segments before rendering the timeline', () => {
    const possession = {
      activeTeam: null,
      activeStart: null,
      activeEnd: null,
      intervals: [
        { team: 'home', start: 0, end: 100 },
        { team: 'away', start: 50, end: 120 },
        { team: 'home', start: 110, end: 140 },
      ],
    };

    expect(getPossessionTimelineSegments(possession, 200)).toEqual([
      { team: 'home', start: 0, end: 50 },
      { team: 'away', start: 50, end: 110 },
      { team: 'home', start: 110, end: 140 },
    ]);
  });

  it('records sequence duration and result', () => {
    const active = startSequence(createTaggerState(), 12);
    const finished = finishSequence(active, 31.5, 'try', { zoneStart: 'Z1', zoneEnd: 'Z6', requireZones: true });

    expect(finished.sequence).toEqual(expect.objectContaining({
      start: 12,
      end: 31.5,
      duration: 19.5,
      result: 'try',
      zoneStart: 'Z1',
      zoneEnd: 'Z6',
    }));
    expect(finished.state.sequence.active).toBeNull();
  });

  it('rejects sequences with non-positive duration and keeps them active', () => {
    const active = startSequence(createTaggerState(), 42);
    const finished = finishSequence(active, 41, 'turnover', { zoneStart: 'Z1', zoneEnd: 'Z2', requireZones: true });

    expect(finished.sequence).toBeNull();
    expect(finished.error).toContain('posterior');
    expect(finished.state.sequence.active).toEqual(active.sequence.active);
  });

  it('rejects sequences that require missing start or end zones', () => {
    const active = startSequence(createTaggerState(), 12);
    const finished = finishSequence(active, 24, 'penal', { zoneStart: 'Z1', requireZones: true });

    expect(finished.sequence).toBeNull();
    expect(finished.error).toContain('zona');
    expect(finished.state.sequence.active).toEqual(active.sequence.active);
  });

  it('enriches sequences with phase count and first/last tagged zones', () => {
    const sequence = { start: 10, end: 40, duration: 30, result: 'try', phases: 0 };
    const enriched = enrichSequenceFromEvents(sequence, [
      { timestamp: 12, type: 'ruck', zone: 'Z2' },
      { timestamp: 20, type: 'kick', zone: 'Z4' },
      { timestamp: 32, type: 'ruck', zone: 'Z8' },
      { timestamp: 50, type: 'ruck', zone: 'Z9' },
    ]);

    expect(enriched).toEqual(expect.objectContaining({
      phases: 2,
      zoneStart: 'Z2',
      zoneEnd: 'Z8',
    }));
  });

  it('exposes an explicit payload builder for the active popup', () => {
    const state = selectPopupZone(updatePopupNote(openTagPopup(createTaggerState(), 'T', 80), 'pegado a la bandera'), 'opp_22');
    const afterResult = selectPopupOption(state, 'try');
    const payload = buildEventPayload(selectPopupOption(afterResult.state, 'away').event);

    expect(payload).toEqual(expect.objectContaining({
      type: 'points',
      team: 'away',
      result: 'try',
      note: 'pegado a la bandera',
      zone: 'opp_22',
      zoneId: 'opp_22',
      zoneLabel: '22 rival',
    }));
  });

  it('composes speech dictation without duplicating interim text when it becomes final', () => {
    expect(buildSpeechNoteValue).toBeTypeOf('function');
    expect(buildSpeechNoteValue('Ruck dominante', 'salida rapida', 'por derecha')).toBe('Ruck dominante salida r\u00e1pida por derecha');
    expect(buildSpeechNoteValue('Ruck dominante salida rapida', 'salida rapida', '')).toBe('Ruck dominante salida r\u00e1pida');
    expect(buildSpeechNoteValue('', 'presion alta', '')).toBe('presión alta');
  });

  it('preserves valid Spanish accents in notes and removes corrupted replacement glyphs', () => {
    expect(sanitizeNoteText).toBeTypeOf('function');
    expect(sanitizeNoteText('presión, recepción, línea, ñandú, pingüino')).toBe('presión, recepción, línea, ñandú, pingüino');
    expect(sanitizeNoteText('presi�n alta')).toBe('presin alta');
  });

  it('adds accents to common Spanish rugby speech terms', () => {
    expect(buildSpeechNoteValue('', 'posesion despues de conversion en linea de veintidos', '')).toBe(
      'posesión después de conversión en línea de veintidós',
    );
  });
});
