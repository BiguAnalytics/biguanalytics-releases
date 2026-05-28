import { describe, expect, it } from 'vitest';

import {
  EVENT_DEFINITIONS,
  advancePossession,
  buildEventPayload,
  calculatePossessionPercentages,
  closePopup,
  completePopup,
  createTaggerState,
  finishSequence,
  enrichSequenceFromEvents,
  getPossessionTimelineSegments,
  openTagPopup,
  resetPossession,
  selectPopupOption,
  selectPopupZone,
  startSequence,
  togglePossession,
  updatePopupNote,
} from '../tagger.js';

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

  it('builds a single-step event payload with note and selected zone', () => {
    const opened = openTagPopup(createTaggerState(), 'R', 15.5);
    const withZone = selectPopupZone(updatePopupNote(opened, 'dominante'), 'C4');
    const selected = selectPopupOption(withZone, 'ganado');

    expect(selected.completed).toBe(true);
    expect(selected.event).toEqual(expect.objectContaining({
      timestamp: 15.5,
      type: 'ruck',
      team: 'home',
      result: 'ganado',
      note: 'dominante',
      zone: 'C4',
    }));
    expect(selected.state.activePopup).toBeNull();
  });

  it('keeps two-step popups open until the final step is selected', () => {
    const opened = openTagPopup(createTaggerState(), 'P', 44);
    const firstStep = selectPopupOption(opened, 'defensa');
    const secondStep = selectPopupOption(firstStep.state, 'offside');

    expect(firstStep.completed).toBe(false);
    expect(firstStep.state.activePopup.stepIndex).toBe(1);
    expect(firstStep.state.activePopup.values.phase).toBe('defensa');
    expect(secondStep.completed).toBe(true);
    expect(secondStep.event).toEqual(expect.objectContaining({
      type: 'penal',
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

  it('counts only observed possession time and ignores skipped no-one time', () => {
    const homeStarted = togglePossession(createTaggerState(), 'home', 0);
    const homeObserved = advancePossession(homeStarted, 120, 180);
    const awayStarted = togglePossession(homeObserved, 'away', 120);
    const awayObserved = advancePossession(awayStarted, 300, 180);
    const skippedAhead = advancePossession(awayObserved, 600);

    expect(calculatePossessionPercentages(awayObserved.possession, 300)).toEqual({ home: 40, away: 60 });
    expect(calculatePossessionPercentages(awayObserved.possession, 600)).toEqual({ home: 40, away: 60 });
    expect(skippedAhead.possession.activeTeam).toBeNull();
    expect(calculatePossessionPercentages(skippedAhead.possession, 600)).toEqual({ home: 40, away: 60 });
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
    const finished = finishSequence(active, 31.5, 'try');

    expect(finished.sequence).toEqual(expect.objectContaining({
      start: 12,
      end: 31.5,
      duration: 19.5,
      result: 'try',
    }));
    expect(finished.state.sequence.active).toBeNull();
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
    const state = selectPopupZone(updatePopupNote(openTagPopup(createTaggerState(), 'T', 80), 'pegado a la bandera'), 'R5');
    const payload = buildEventPayload(selectPopupOption(state, 'try').event);

    expect(payload).toEqual(expect.objectContaining({
      type: 'points',
      result: 'try',
      note: 'pegado a la bandera',
      zone: 'R5',
    }));
  });
});
