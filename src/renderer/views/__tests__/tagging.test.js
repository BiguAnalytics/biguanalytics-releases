import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import * as tagging from '../tagging.js';

const {
  createTaggingHistorySnapshot,
  formatVideoReadout,
  getHistoryRestorePayload,
  getInitialTimelineDuration,
  getTaggingMatchSelectionItems,
  getOptimisticPlaybackTime,
  getScrubberSeekTime,
  getScrubberState,
  getScoreDeltaForEvent,
  getToggledZone,
  getUpdatedScore,
  normalizeEventResultInput,
} = tagging;

describe('tagging video controls', () => {
  it('does not display a fake duration before video metadata is available', () => {
    expect(formatVideoReadout(0, null)).toBe('0:00 / --:--');
  });

  it('disables the scrubber until a real duration is known', () => {
    expect(getScrubberState(0, null)).toEqual({
      max: 1,
      value: 0,
      disabled: true,
    });
  });

  it('uses the real video duration when metadata is available', () => {
    expect(formatVideoReadout(15, 3720)).toBe('0:15 / 62:00');
    expect(getScrubberState(15, 3720)).toEqual({
      max: 3720,
      value: 15,
      disabled: false,
    });
  });

  it('keeps seek UI optimistic while YouTube catches up', () => {
    const pending = { time: 315, until: 1_000 };

    expect(getOptimisticPlaybackTime?.(120, 120, pending, 200)).toBe(315);
    expect(getOptimisticPlaybackTime?.(314.6, 120, pending, 200)).toBe(314.6);
    expect(getOptimisticPlaybackTime?.(120, 120, pending, 1_200)).toBe(120);
  });

  it('maps direct scrubber clicks to an immediate seek time', () => {
    expect(getScrubberSeekTime?.({ left: 100, width: 500 }, 350, 600)).toBe(300);
    expect(getScrubberSeekTime?.({ left: 100, width: 500 }, 25, 600)).toBe(0);
    expect(getScrubberSeekTime?.({ left: 100, width: 500 }, 700, 600)).toBe(600);
  });
});

describe('tagging phase 5 polish', () => {
  const taggingSource = readFileSync(new URL('../tagging.js', import.meta.url), 'utf8');

  it('shows a non-blocking missing-video notice with a change route action for stale MP4 paths', () => {
    expect(taggingSource).toContain('showMissingLocalVideoNotice');
    expect(taggingSource).toContain('video-missing-notice');
    expect(taggingSource).toContain('Cambiar ruta');
    expect(taggingSource).toContain('window.api.media.localVideoExists');
  });

  it('shows the first-launch hotkeys overlay and dismisses the firstLaunch flag', () => {
    expect(taggingSource).toContain('renderFirstLaunchHotkeysOverlay');
    expect(taggingSource).toContain('tagging-hotkeys-overlay');
    expect(taggingSource).toContain('Tabla de hotkeys');
    expect(taggingSource).toContain('firstLaunch: false');
  });

  it('ignores tag hotkeys when focus is in editable fields or system modifiers are pressed', () => {
    expect(taggingSource).toContain('document.activeElement');
    expect(taggingSource).toContain('hasSystemModifier');
    expect(taggingSource).toContain('if (isEditableTarget(document.activeElement)) return;');
    expect(taggingSource).toContain('if (hasSystemModifier(event)) return;');
  });
});

describe('tagging YouTube iframe player', () => {
  const taggingSource = readFileSync(new URL('../tagging.js', import.meta.url), 'utf8');

  it('builds an official YouTube embed URL for the IFrame Player API', () => {
    const src = tagging.buildYouTubeEmbedUrl?.({
      type: 'youtube',
      videoId: 'lp5DkHR97_w',
      url: 'https://youtu.be/lp5DkHR97_w',
    });

    expect(src).toContain('https://www.youtube.com/embed/lp5DkHR97_w?');
    expect(src).toContain('enablejsapi=1');
    expect(src).toContain('controls=0');
    expect(src).toContain('disablekb=1');
    expect(src).toContain('fs=0');
    expect(src).toContain('iv_load_policy=3');
    expect(src).toContain('rel=0');
    expect(src).toContain('playsinline=1');
    expect(src).toContain('autoplay=1');
    expect(src).not.toContain('/watch?');
    expect(src).not.toContain('youtube-player.html');
  });

  it('extracts an embed URL from a shared YouTube URL', () => {
    const src = tagging.buildYouTubeEmbedUrl?.('https://youtu.be/lp5DkHR97_w');

    expect(src).toContain('https://www.youtube.com/embed/lp5DkHR97_w?');
    expect(src).toContain('enablejsapi=1');
  });

  it('renders a normal iframe instead of an Electron webview', () => {
    const markup = tagging.buildYouTubeIframeMarkup?.({
      type: 'youtube',
      videoId: 'lp5DkHR97_w',
    });

    expect(markup).toContain('<iframe');
    expect(markup).toContain('class="youtube-player-frame"');
    expect(markup).toContain('id="youtube-player-frame"');
    expect(markup).toContain('title="Reproductor de YouTube"');
    expect(markup).toContain('allow="autoplay; encrypted-media"');
    expect(markup).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(markup).toContain('src="https://www.youtube.com/embed/lp5DkHR97_w?');
    expect(markup).toContain('enablejsapi=1');
    expect(markup).toContain('controls=0');
    expect(markup).toContain('disablekb=1');
    expect(markup).toContain('youtube-loading-state');
    expect(markup).toContain('youtube-error-state');
    expect(markup).not.toContain('<webview');
    expect(markup).not.toContain('youtube-interaction-shield');
    expect(markup).not.toContain('/watch?');
  });

  it('loads the official IFrame API and sizes the player in pixels', () => {
    expect(taggingSource).toContain('https://www.youtube.com/iframe_api');
    expect(taggingSource).toContain('new window.YT.Player');
    expect(taggingSource).toContain('player.setSize(width, height)');
    expect(taggingSource).toContain('getBoundingClientRect()');
    expect(taggingSource).toContain('new ResizeObserver');
    expect(taggingSource).not.toContain('youtubeWebview');
    expect(taggingSource).not.toContain('insertCSS');
    expect(taggingSource).not.toContain('executeJavaScript');
  });

  it('uses the IFrame API for HUD playback controls and readout', () => {
    expect(taggingSource).toContain('youtubePlayer.playVideo()');
    expect(taggingSource).toContain('youtubePlayer.pauseVideo()');
    expect(taggingSource).toContain('youtubePlayer.seekTo(currentTime, true)');
    expect(taggingSource).toContain('youtubePlayer.setPlaybackRate(rate)');
    expect(taggingSource).toContain('youtubePlayer.getCurrentTime()');
    expect(taggingSource).toContain('youtubePlayer.getDuration()');
    expect(taggingSource).toContain('youtubePlayer.getPlayerState()');
    expect(taggingSource).not.toContain("document.querySelector('video')");
    expect(taggingSource).not.toContain('window.biguaYoutubePlayer');
    expect(taggingSource).not.toContain('postMessage');
  });

  it('maps YouTube player errors to clear user-facing messages', () => {
    expect(tagging.getYouTubeErrorMessage?.(101)).toContain('no permite reproduccion embebida');
    expect(tagging.getYouTubeErrorMessage?.(150)).toContain('no permite reproduccion embebida');
    expect(tagging.getYouTubeErrorMessage?.(153)).toContain('identificacion');
    expect(tagging.getYouTubeErrorMessage?.(2)).toContain('URL de YouTube');
  });

  it('keeps the renderer aligned with the report constraints', () => {
    const src = tagging.buildYouTubeEmbedUrl?.({ videoId: 'lp5DkHR97_w' });

    expect(src).toContain('controls=0');
    expect(src).toContain('disablekb=1');
    expect(src).toContain('fs=0');
    expect(src).toContain('iv_load_policy=3');
    expect(taggingSource).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(taggingSource).not.toContain('buildYouTubeWatchCss');
    expect(taggingSource).not.toContain('buildYouTubeWatchUrl');
    expect(taggingSource).not.toContain('buildYouTubeWebviewMarkup');
  });
});

describe('tagging side inspector layout', () => {
  const taggingSource = readFileSync(new URL('../tagging.js', import.meta.url), 'utf8');

  it('moves operational status into the right inspector instead of below the video', () => {
    expect(taggingSource).toContain('class="tagging-side-panel"');
    expect(taggingSource).toContain('id="tagging-status-panel"');
    expect(taggingSource).toContain('id="possession-split"');
    expect(taggingSource).toContain('id="manual-timestamp"');
    expect(taggingSource).not.toContain('class="tagging-stats-strip"');
  });

  it('uses the right inspector as the popup replacement surface', () => {
    const panelIndex = taggingSource.indexOf('class="tagging-side-panel"');
    const statusIndex = taggingSource.indexOf('id="tagging-status-panel"');
    const popupIndex = taggingSource.indexOf('id="tag-popup-host"');
    const sequencePopupIndex = taggingSource.indexOf('id="sequence-popup-host"');

    expect(panelIndex).toBeGreaterThan(-1);
    expect(statusIndex).toBeGreaterThan(panelIndex);
    expect(popupIndex).toBeGreaterThan(statusIndex);
    expect(sequencePopupIndex).toBeGreaterThan(popupIndex);
    expect(taggingSource).toContain('function syncSidePanelMode()');
    expect(taggingSource).toContain('has-active-popup');
  });

  it('adds a simplified manual scoreboard without duplicated score readouts', () => {
    expect(taggingSource).toContain('status-score-card');
    expect(taggingSource).toContain('scoreboard-compact');
    expect(taggingSource).toContain('scoreline');
    expect(taggingSource).toContain('id="score-home"');
    expect(taggingSource).toContain('id="score-away"');
    expect(taggingSource).toContain('data-score-team="home"');
    expect(taggingSource).toContain('data-score-delta="1"');
    expect(taggingSource).toContain('data-score-delta="-1"');
    expect(taggingSource).not.toContain('id="score-split"');
    expect(taggingSource).toContain('function renderScoreboard()');
    expect(taggingSource).toContain('async function updateScore(team, delta)');
    expect(getUpdatedScore?.({ homeScore: 2, awayScore: 1 }, 'home', -5)).toEqual({ homeScore: 0, awayScore: 1 });
    expect(getUpdatedScore?.({ homeScore: 2, awayScore: 1 }, 'away', 3)).toEqual({ homeScore: 2, awayScore: 4 });
  });

  it('maps point milestones to automatic scoreboard deltas', () => {
    expect(getScoreDeltaForEvent?.({ type: 'points', result: 'try' })).toBe(5);
    expect(getScoreDeltaForEvent?.({ type: 'points', result: 'conversion' })).toBe(2);
    expect(getScoreDeltaForEvent?.({ type: 'points', result: 'pk-goal' })).toBe(3);
    expect(getScoreDeltaForEvent?.({ type: 'points', result: 'drop' })).toBe(3);
    expect(getScoreDeltaForEvent?.({ type: 'points', result: 'try-penal' })).toBe(7);
    expect(getScoreDeltaForEvent?.({ type: 'ruck', result: 'try' })).toBe(0);
  });

  it('adds point milestone scores after saving the event', () => {
    expect(taggingSource).toContain('const eventPayload = buildEventPayload(event)');
    expect(taggingSource).toContain('const pointsDelta = getScoreDeltaForEvent(eventPayload)');
    expect(taggingSource).toContain("...getUpdatedScore(match, eventPayload.team === 'away' ? 'away' : 'home', pointsDelta)");
    expect(taggingSource).toContain("status: match.status === 'created' ? 'tagging' : match.status");
  });

  it('keeps possession as one compact readout and moves history to the timeline', () => {
    expect(taggingSource).toContain('id="possession-split"');
    expect(taggingSource).toContain("`${homeTeam} ${percentages.home}% - ${percentages.away}% ${awayTeam}`");
    expect(taggingSource).toContain('possessionSegments: getPossessionTimelineSegments(state.possession, getTimelinePossessionScaleEnd())');
    expect(taggingSource).not.toContain('id="possession-home">');
    expect(taggingSource).not.toContain('id="possession-away">');
    expect(taggingSource).not.toContain('class="possession-lines"');
    expect(taggingSource).not.toContain('id="possession-history-strip"');
  });

  it('persists and can reset possession with a confirmation warning', () => {
    expect(taggingSource).toContain('possession: match?.possession');
    expect(taggingSource).toContain('possession: state.possession');
    expect(taggingSource).not.toContain('possession: state.possession.intervals');
    expect(taggingSource).toContain('advancePossession');
    expect(taggingSource).toContain('function syncPossessionProgress(timestamp)');
    expect(taggingSource).toContain('POSSESSION_SAVE_INTERVAL_MS');
    expect(taggingSource).toContain('data-possession-reset');
    expect(taggingSource).toContain('window.confirm');
    expect(taggingSource).toContain('resetPossession(state)');
  });
});

describe('tagging match selection entrypoint', () => {
  const taggingSource = readFileSync(new URL('../tagging.js', import.meta.url), 'utf8');

  it('sorts selectable matches newest-first with stable card labels', () => {
    expect(getTaggingMatchSelectionItems?.([
      {
        id: 'old-match',
        homeTeam: 'Bigua',
        awayTeam: 'Old Boys',
        date: '2025-01-10',
        createdAt: '2025-01-10T12:00:00.000Z',
        status: 'created',
        homeScore: 12,
        awayScore: 8,
        video: { type: 'youtube', url: 'https://youtu.be/example' },
      },
      {
        id: 'new-match',
        homeTeam: 'Bigua',
        awayTeam: 'Carrasco',
        date: '2026-03-20',
        createdAt: '2026-03-20T12:00:00.000Z',
        status: 'tagging',
        homeScore: 0,
        awayScore: 0,
        video: { type: 'local', name: 'fecha-3.mp4' },
      },
    ])).toEqual([
      {
        id: 'new-match',
        title: 'Bigua vs Carrasco',
        statusLabel: 'Tagging',
        scoreLabel: '0 - 0',
        videoLabel: 'fecha-3.mp4',
        dateLabel: '20/3/2026',
      },
      {
        id: 'old-match',
        title: 'Bigua vs Old Boys',
        statusLabel: 'Pendiente',
        scoreLabel: '12 - 8',
        videoLabel: 'YouTube',
        dateLabel: '10/1/2025',
      },
    ]);
  });

  it('renders a selector when Tagging is opened without an explicit match id', () => {
    expect(taggingSource).toContain('function renderMatchSelection(host, matches)');
    expect(taggingSource).toContain('class="tagging-match-select-view view-enter"');
    expect(taggingSource).toContain('data-tagging-match-id');
    expect(taggingSource).toContain("navigate('tagging', { matchId: selected.id })");
    expect(taggingSource).toContain('const matches = await window.api.matches.getAll();');
    expect(taggingSource).toContain('renderMatchSelection(container, matches);');
    expect(taggingSource).not.toContain('matches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].id');
  });

  it('keeps direct match entry loading the requested match instead of the selector', () => {
    expect(taggingSource).toContain('if (params.matchId) {');
    expect(taggingSource).toContain('window.api.matches.getById(params.matchId)');
    expect(taggingSource).toContain('initializeMatch(loadedMatch);');
  });
});

describe('tagging event inspector', () => {
  const taggingSource = readFileSync(new URL('../tagging.js', import.meta.url), 'utf8');

  it('renders timeline event detail in the right inspector surface', () => {
    expect(taggingSource).toContain('id="event-inspector-host"');
    expect(taggingSource).toContain('function renderEventInspector()');
    expect(taggingSource).toContain('has-event-inspector');
    expect(taggingSource).toContain('data-event-note-edit');
    expect(taggingSource).toContain('data-event-save');
    expect(taggingSource).toContain('data-event-delete');
  });

  it('updates and deletes the selected timeline event through storage IPC', () => {
    expect(taggingSource).toContain('window.api.events.update');
    expect(taggingSource).toContain('window.api.events.delete');
    expect(taggingSource).toContain('onEventSelect: selectTimelineEvent');
  });

  it('renders editable fields for the selected timeline stamp', () => {
    expect(taggingSource).toContain('data-inspector-timestamp');
    expect(taggingSource).toContain('data-inspector-team');
    expect(taggingSource).toContain('data-inspector-result');
    expect(taggingSource).toContain('data-inspector-subtype');
    expect(taggingSource).toContain('data-inspector-zone');
    expect(taggingSource).toContain('readInspectorForm()');
  });

  it('uses the rugby field graphic for editing event and sequence zones', () => {
    expect(taggingSource).toContain('getZones');
    expect(taggingSource).toContain('function renderInspectorZonePicker');
    expect(taggingSource).toContain('data-zone-picker');
    expect(taggingSource).toContain("renderInspectorZonePicker('Zona', 'data-inspector-zone'");
    expect(taggingSource).toContain("renderInspectorZonePicker('Zona inicio', 'data-sequence-zone-start'");
    expect(taggingSource).toContain("renderInspectorZonePicker('Zona fin', 'data-sequence-zone-end'");
    expect(taggingSource).toContain('function wireInspectorZonePickers');
    expect(getToggledZone?.('Z4', 'Z4')).toBe('');
    expect(getToggledZone?.('Z4', 'Z5')).toBe('Z5');
  });

  it('keeps event edit controls hidden until the user enters edit mode', () => {
    expect(taggingSource).toContain('let isEventInspectorEditing = false');
    expect(taggingSource).toContain('data-event-edit');
    expect(taggingSource).toContain('isEventInspectorEditing ? `');
    expect(taggingSource).toContain('${!isEventInspectorEditing ? `\n        <div class="event-inspector-meta-grid">');
    expect(taggingSource).toContain('isEventInspectorEditing = true');
    expect(taggingSource).toContain('isEventInspectorEditing = false');
  });

  it('keeps save and delete actions at the same visual size', () => {
    expect(taggingSource).toContain('class="btn event-delete-btn btn-sm"');
    expect(taggingSource).toContain('class="btn btn-primary btn-sm"');
  });

  it('shows live sequence end time and recording indicator while a sequence is active', () => {
    expect(tagging.getDisplayedSequenceElapsed?.(313.8, 323.2)).toBe(10);
    expect(taggingSource).toContain('sequence-recording-dot');
    expect(taggingSource).toContain('Hasta ${formatClock(visualCurrentTime)} | Va ${formatClock(getDisplayedSequenceElapsed');
    expect(taggingSource).toContain('Secuencia activa desde ${formatClock(state.sequence.active.start)}');
  });

  it('passes persisted sequences to the timeline and supports sequence selection and deletion', () => {
    expect(taggingSource).toContain('sequences: match.sequences || []');
    expect(taggingSource).toContain('onSequenceSelect: selectTimelineSequence');
    expect(taggingSource).toContain('selectedTimelineSequenceKey');
    expect(taggingSource).toContain('deleteSelectedTimelineSequence');
    expect(taggingSource).toContain('window.api.matches.update(match.id, {');
  });

  it('supports editing selected sequence name and color', () => {
    expect(taggingSource).toContain('let isSequenceInspectorEditing = false');
    expect(taggingSource).toContain('data-sequence-edit');
    expect(taggingSource).toContain('${!isSequenceInspectorEditing ? `\n          <div class="sequence-inspector-time-grid">');
    expect(taggingSource).toContain('data-sequence-name');
    expect(taggingSource).toContain('data-sequence-color');
    expect(taggingSource).toContain('saveSelectedTimelineSequence');
    expect(taggingSource).toContain('readSequenceInspectorForm()');
  });

  it('supports editing all selected sequence fields with name first', () => {
    const formStart = taggingSource.indexOf('<div class="event-inspector-form sequence-inspector-form">');
    const nameIndex = taggingSource.indexOf('data-sequence-name', formStart);
    const startIndex = taggingSource.indexOf('data-sequence-start', formStart);
    const endIndex = taggingSource.indexOf('data-sequence-end', formStart);
    const resultIndex = taggingSource.indexOf('data-sequence-result-edit', formStart);
    const phasesIndex = taggingSource.indexOf('data-sequence-phases', formStart);
    const zoneStartIndex = taggingSource.indexOf('data-sequence-zone-start', formStart);
    const zoneEndIndex = taggingSource.indexOf('data-sequence-zone-end', formStart);
    const colorIndex = taggingSource.indexOf('data-sequence-color', formStart);

    expect(nameIndex).toBeGreaterThan(formStart);
    expect(startIndex).toBeGreaterThan(nameIndex);
    expect(endIndex).toBeGreaterThan(nameIndex);
    expect(resultIndex).toBeGreaterThan(nameIndex);
    expect(phasesIndex).toBeGreaterThan(nameIndex);
    expect(zoneStartIndex).toBeGreaterThan(nameIndex);
    expect(zoneEndIndex).toBeGreaterThan(nameIndex);
    expect(colorIndex).toBeGreaterThan(nameIndex);
    expect(taggingSource).toContain('duration: Number((normalizedEnd - normalizedStart).toFixed(2))');
  });

  it('defaults unnamed sequence labels to their result type', () => {
    expect(taggingSource).toContain("selectedSequence.name?.trim() || formatEventValue(selectedSequence.result)");
  });

  it('lays out selected sequence timing as compact two-column detail', () => {
    expect(taggingSource).toContain('sequence-inspector-time-grid');
    expect(taggingSource).toContain('sequence-inspector-meta-grid');
  });

  it('uses optimistic seek state for timeline and scrubber rendering', () => {
    expect(taggingSource).toContain('const SEEK_VISUAL_LOCK_MS');
    expect(taggingSource).toContain('let optimisticSeek = null');
    expect(taggingSource).toContain('getVisualCurrentTime()');
    expect(taggingSource).toContain('optimisticSeek = { time: currentTime, until: Date.now() + SEEK_VISUAL_LOCK_MS }');
  });

  it('moves only the timeline playhead during playback to preserve scrollbar drags', () => {
    expect(taggingSource).toContain('updateTimelinePlayback');
    expect(taggingSource).toContain('function updateTimelinePlaybackView()');
    expect(taggingSource).toContain('updateTimelinePlayback(host, getVisualCurrentTime())');
    expect(taggingSource).toContain('localVideo?.addEventListener(\'timeupdate\', () => {');
    expect(taggingSource).toContain('updateTimelinePlaybackView();');
    expect(taggingSource).toContain('renderTimelineView({ preserveScroll: true })');
  });

  it('supports Ctrl+Z and Ctrl+Shift+Z for persisted tagging changes', () => {
    const snapshot = createTaggingHistorySnapshot?.({
      events: [{ id: 'e1', timestamp: 10 }],
      sequences: [{ id: 's1', start: 20, end: 30 }],
      possession: { intervals: [{ team: 'home', start: 0, end: 10 }] },
      homeScore: 7,
      awayScore: 3,
      status: 'tagging',
    });

    expect(snapshot.events).toEqual([{ id: 'e1', timestamp: 10 }]);
    expect(getHistoryRestorePayload?.(snapshot)).toEqual({
      events: [{ id: 'e1', timestamp: 10 }],
      sequences: [{ id: 's1', start: 20, end: 30 }],
      possession: { intervals: [{ team: 'home', start: 0, end: 10 }] },
      homeScore: 7,
      awayScore: 3,
      status: 'tagging',
    });
    expect(taggingSource).toContain('let undoStack = []');
    expect(taggingSource).toContain('let redoStack = []');
    expect(taggingSource).toContain('function pushUndoSnapshot()');
    expect(taggingSource).toContain('async function undoLastChange()');
    expect(taggingSource).toContain('async function redoLastChange()');
    expect(taggingSource).toContain("event.key.toLowerCase() === 'z'");
    expect(taggingSource).toContain('event.shiftKey ? redoLastChange() : undoLastChange()');
  });

  it('persists event timestamp moves from timeline drag without changing the event channel', () => {
    expect(taggingSource).toContain('onEventMove: moveTimelineEvent');
    expect(taggingSource).toContain('async function moveTimelineEvent(event, timestamp)');
    expect(taggingSource).toContain('window.api.events.update(match.id, event.id, { timestamp })');
    expect(taggingSource).not.toContain('window.api.events.update(match.id, event.id, { timestamp, type');
  });

  it('uses loaded video duration to keep stats-only timeline timed instead of pending', () => {
    expect(getInitialTimelineDuration?.({ video: { duration: 5400 } }, true, null)).toBe(5400);
    expect(getInitialTimelineDuration?.({ video: { duration: 5400 } }, false, 120)).toBe(120);
    expect(getInitialTimelineDuration?.({ video: {} }, true, null)).toBeNull();
    expect(taggingSource).toContain('wireStatsOnlyMediaMetadata(mediaHost)');
    expect(taggingSource).toContain('metadataVideo.addEventListener(\'loadedmetadata\'');
    expect(taggingSource).toContain('persistVideoDuration(nextDuration)');
    expect(taggingSource).toContain('duration = getInitialTimelineDuration(match, statsOnlyMode, duration)');
  });

  it('moves the playhead when selecting a sequence but keeps the action single-click', () => {
    expect(taggingSource).toContain('seekTo(Number(sequence.start));');
  });

  it('deletes selected events or sequences from the keyboard with Backspace', () => {
    expect(taggingSource).toContain("event.key === 'Backspace'");
    expect(taggingSource).toContain('deleteSelectedTimelineSequence();');
    expect(taggingSource).toContain('deleteSelectedTimelineEvent();');
  });

  it('renders event and note details as framed stat cells', () => {
    expect(taggingSource).toContain('event-inspector-meta-grid');
    expect(taggingSource).toContain('event-inspector-stat');
  });

  it('renders selected tag values as capitalized display text', () => {
    expect(tagging.getTimelineEventDetails?.({ timestamp: 1, team: 'home', result: 'ganado' }, { homeTeam: 'Bigua' })).toContainEqual({
      label: 'Resultado',
      value: 'Ganado',
    });
  });

  it('shows capitalized result text while saving normalized event result values', () => {
    expect(taggingSource).toContain('value="${escapeHtml(formatEventValue(selectedEvent.result || \'\'))}"');
    expect(normalizeEventResultInput?.('Ganado Sucio')).toBe('ganado-sucio');
    expect(normalizeEventResultInput?.('Ganado')).toBe('ganado');
  });
});
