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
  getScoreParts,
  getToggledZone,
  getUpdatedScore,
  buildVideoDurationPatch,
  normalizeSeekParam,
  normalizeEventResultInput,
  parseManualTimestampInput,
  validateManualTimestampInput,
  calculateVirtualClipRange,
  getSpeechErrorMessage,
  getBestSpeechTranscript,
  shouldAcceptSpeechResult,
  getPossessionPersistenceFingerprint,
  shouldSavePossessionSnapshot,
  isPopupInputFocused,
  shouldCompletePopupFromKeydown,
} = tagging;

describe('tagging video controls', () => {
  it('assigns local video URLs through the DOM property instead of HTML interpolation', () => {
    const taggingSource = readFileSync(new URL('../tagging.js', import.meta.url), 'utf8');

    expect(taggingSource).toContain("const videoElement = document.createElement('video');");
    expect(taggingSource).toContain('videoElement.src = fileUrl;');
    expect(taggingSource).not.toContain('<video class="tagging-video" id="tagging-video" src="${fileUrl}"');
  });

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

  it('persists loaded MP4 metadata as available duration state', () => {
    expect(buildVideoDurationPatch({
      type: 'local',
      path: 'D:\\Partidos\\bigua.mp4',
      durationStatus: 'pending',
    }, 93.4)).toEqual({
      type: 'local',
      path: 'D:\\Partidos\\bigua.mp4',
      duration: 93.4,
      durationStatus: 'available',
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

  it('calculates virtual YouTube clip windows with the same configurable pre/post roll', () => {
    expect(calculateVirtualClipRange?.(64, 100, { clipPreRollSeconds: 3, clipPostRollSeconds: 10 })).toEqual({
      start: 61,
      end: 74,
      duration: 13,
    });
    expect(calculateVirtualClipRange?.(2, 100, { clipPreRollSeconds: 3, clipPostRollSeconds: 10 })).toEqual({
      start: 0,
      end: 12,
      duration: 12,
    });
    expect(calculateVirtualClipRange?.(95, 100, { clipPreRollSeconds: 3, clipPostRollSeconds: 10 })).toEqual({
      start: 92,
      end: 100,
      duration: 8,
    });
  });

  it('fingerprints only relevant possession fields for write de-duplication', () => {
    const first = getPossessionPersistenceFingerprint?.({
      activeTeam: 'home',
      activeStart: 12,
      activeEnd: 18,
      intervals: [{ team: 'away', start: 1, end: 7, ignored: true }],
      uiOnly: 'transient',
    });
    const sameRelevantState = getPossessionPersistenceFingerprint?.({
      activeTeam: 'home',
      activeStart: 12,
      activeEnd: 18,
      intervals: [{ team: 'away', start: 1, end: 7 }],
    });
    const changed = getPossessionPersistenceFingerprint?.({
      activeTeam: 'home',
      activeStart: 12,
      activeEnd: 21,
      intervals: [{ team: 'away', start: 1, end: 7 }],
    });

    expect(first).toBe(sameRelevantState);
    expect(changed).not.toBe(first);
  });

  it('throttles possession saves unless forced or changed past the interval', () => {
    expect(shouldSavePossessionSnapshot?.({
      changed: false,
      force: false,
      now: 2_000,
      lastSaveAt: 0,
      intervalMs: 1_000,
    })).toBe(false);
    expect(shouldSavePossessionSnapshot?.({
      changed: true,
      force: false,
      now: 500,
      lastSaveAt: 0,
      intervalMs: 1_000,
    })).toBe(false);
    expect(shouldSavePossessionSnapshot?.({
      changed: true,
      force: false,
      now: 1_500,
      lastSaveAt: 0,
      intervalMs: 1_000,
    })).toBe(true);
    expect(shouldSavePossessionSnapshot?.({
      changed: false,
      force: true,
      now: 500,
      lastSaveAt: 500,
      intervalMs: 1_000,
    })).toBe(true);
  });

  it('parses supported manual timestamp formats into seconds', () => {
    expect(parseManualTimestampInput?.('01:05')).toEqual(expect.objectContaining({ valid: true, seconds: 65, hasTimestamp: true }));
    expect(parseManualTimestampInput?.('1:02:03')).toEqual(expect.objectContaining({ valid: true, seconds: 3723, hasTimestamp: true }));
    expect(parseManualTimestampInput?.('75')).toEqual(expect.objectContaining({ valid: true, seconds: 75, hasTimestamp: true }));
  });

  it('rejects invalid manual timestamps before saving events', () => {
    expect(validateManualTimestampInput?.('1:99', { statsOnlyMode: true })).toEqual(expect.objectContaining({
      valid: false,
      message: expect.stringContaining('formato'),
    }));
    expect(validateManualTimestampInput?.('-5', { statsOnlyMode: true })).toEqual(expect.objectContaining({
      valid: false,
      message: expect.stringContaining('negativo'),
    }));
    expect(validateManualTimestampInput?.('90', { statsOnlyMode: true, duration: 80 })).toEqual(expect.objectContaining({
      valid: false,
      message: expect.stringContaining('duracion'),
    }));
  });

  it('allows empty manual timestamp only in stats-only mode as an untimed event', () => {
    expect(validateManualTimestampInput?.('', { statsOnlyMode: true })).toEqual({
      valid: true,
      seconds: null,
      hasTimestamp: false,
      message: '',
    });
    expect(validateManualTimestampInput?.('', { statsOnlyMode: false })).toEqual(expect.objectContaining({
      valid: false,
      message: expect.stringContaining('timestamp'),
    }));
  });

  it('normalizes dashboard seek params for one-shot Tagging seek', () => {
    expect(normalizeSeekParam?.('124.5')).toBe(124.5);
    expect(normalizeSeekParam?.('-1')).toBeNull();
    expect(normalizeSeekParam?.('abc')).toBeNull();
  });
});

describe('tagging phase 5 polish', () => {
  const taggingSource = readFileSync(new URL('../tagging.js', import.meta.url), 'utf8');

  it('uses cloud sync services for opening matches, events and local MP4 validation', () => {
    expect(taggingSource).toContain("import { cloudEventService } from '../cloud/cloud-event-service.js';");
    expect(taggingSource).toContain("import { cloudMatchService } from '../cloud/cloud-match-service.js';");
    expect(taggingSource).toContain("import { videoReferenceService } from '../cloud/video-reference-service.js';");
    expect(taggingSource).toContain("cloudMatchService.getMatchById(params.matchId, { localFirst: true })");
    expect(taggingSource).toContain('cloudEventService.addEvent(match.id, eventPayload)');
    expect(taggingSource).toContain('cloudEventService.updateEvent(match.id, selectedTimelineEventId');
    expect(taggingSource).toContain('cloudEventService.deleteEvent(match.id, selectedTimelineEventId)');
    expect(taggingSource).toContain('videoReferenceService.ensurePlayableLocalVideo(match.video)');
  });

  it('opens a selected match from any non-control area of the selection card', () => {
    expect(taggingSource).toContain('data-tagging-match-card-id');
    expect(taggingSource).toContain("card.addEventListener('click'");
    expect(taggingSource).toContain("target?.closest('button')");
    expect(taggingSource).toContain("const primaryAction = card.querySelector('[data-tagging-match-id]')");
    expect(taggingSource).toContain('primaryAction?.click()');
    expect(taggingSource).toContain("card.addEventListener('keydown'");
  });

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

  it('builds active hotkeys from settings for the bar, onboarding overlay and keydown handler', () => {
    expect(taggingSource).toContain('buildEventDefinitions(settings?.tagging)');
    expect(taggingSource).toContain('function getActiveEventDefinitions()');
    expect(taggingSource).toContain('Object.values(getActiveEventDefinitions())');
    expect(taggingSource).toContain('openTagPopup(state, key, getTagTimestamp())');
    expect(taggingSource).toContain('state.eventDefinitions');
  });

  it('passes popup behavior settings into the tagger and pauses playback only when configured', () => {
    expect(taggingSource).toContain('autoCloseEnabled: settings?.tagging?.autoCloseEnabled !== false');
    expect(taggingSource).toContain('pauseVideoOnPopup: settings?.tagging?.pauseVideoOnPopup === true');
    expect(taggingSource).toContain('pauseVideoForPopup();');
  });

  it('keeps popup focus inside Tagging and focuses the first popup control after render', () => {
    expect(taggingSource).toContain("import { renderTagPopup, getPopupOptionByNumber, getPopupZoneByNumber, getZones, focusFirstPopupControl, trapFocusInPopup } from '../components/tag-popup.js';");
    expect(taggingSource).toContain('focusFirstPopupControl(host);');
    expect(taggingSource).toContain('trapFocusInPopup(popupHost, event)');
  });

  it('only renders the manual timestamp field in stats-only mode', () => {
    const renderShellStart = taggingSource.indexOf('function renderShell');
    const renderShellEnd = taggingSource.indexOf("container.querySelector('#hotkey-toggle')", renderShellStart);
    const renderShellSource = taggingSource.slice(renderShellStart, renderShellEnd);

    expect(renderShellSource).toContain('statsOnlyMode ? `');
    expect(renderShellSource).toContain('id="manual-timestamp"');
    expect(renderShellSource).toContain(": ''}");
  });

  it('updates possession visuals during playback without full timeline renders or eager saves', () => {
    const syncStart = taggingSource.indexOf('function syncPossessionProgress');
    const syncEnd = taggingSource.indexOf('function renderControls', syncStart);
    const syncSource = taggingSource.slice(syncStart, syncEnd);

    expect(syncSource).toContain('renderPossession();');
    expect(syncSource).toContain('updateTimelinePossessionView();');
    expect(syncSource).toContain("queuePossessionSave('progress')");
    expect(syncSource).not.toContain('renderTimelineView({ preserveScroll: true });');
    expect(syncSource).not.toContain("savePossessionSafely('progress')");
  });

  it('validates manual timestamps and does not silently save invalid values', () => {
    expect(taggingSource).toContain('validateManualTimestampInput');
    expect(taggingSource).toContain('showTaggingFeedback(timestampValidation.message');
    expect(taggingSource).toContain('eventPayload.timestamp = timestampValidation.seconds');
  });

  it('consumes dashboard seek params after Tagging loads the requested match', () => {
    expect(taggingSource).toContain('const initialSeekSeconds = normalizeSeekParam(params.seekTo)');
    expect(taggingSource).toContain('consumeInitialSeekParam();');
    expect(taggingSource).toContain('seekTo(initialSeekSeconds);');
  });

  it('uses controlled possession pause for manual seek and safe cleanup on exit', () => {
    expect(taggingSource).toContain('pauseActivePossessionForControlledSeek');
    expect(taggingSource).toContain('closeActivePossession(state');
    expect(taggingSource).toContain('closeActivePossessionSafely');
    expect(taggingSource).toContain('try {');
    expect(taggingSource).toContain('No se pudo guardar el cierre de posesion');
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

  it('keeps operational status in the stable right-side panel', () => {
    expect(taggingSource).toContain('class="tagging-side-panel"');
    expect(taggingSource).toContain('<div class="tagging-status-panel" id="tagging-status-panel"');
    expect(taggingSource).toContain('class="status-panel-heading"');
    expect(taggingSource).toContain('class="status-card status-score-card"');
    expect(taggingSource).toContain('class="status-card status-possession-card"');
    expect(taggingSource).toContain('class="status-card status-sequence-card"');
    expect(taggingSource).toContain('id="possession-split"');
    expect(taggingSource).toContain('id="manual-timestamp"');
    expect(taggingSource).not.toContain('<details class="tagging-status-panel"');
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
    expect(taggingSource).toContain('data-panel-mode');
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
    expect(taggingSource).toContain('Eventos + ajuste manual');
    expect(taggingSource).toContain('Quitar ajuste');
    expect(getUpdatedScore?.({ homeScore: 2, awayScore: 1 }, 'home', -5)).toEqual({ homeScore: 0, awayScore: 1 });
    expect(getUpdatedScore?.({ homeScore: 2, awayScore: 1 }, 'away', 3)).toEqual({ homeScore: 2, awayScore: 4 });
  });

  it('combines event score with manual adjustments instead of replacing it', () => {
    const score = getScoreParts?.({
      events: [
        { type: 'points', team: 'home', result: 'try' },
        { type: 'points', team: 'away', result: 'pk-goal' },
      ],
      scoreAdjustment: {
        homeDelta: 2,
        awayDelta: 1,
      },
    });

    expect(score).toEqual({
      events: { homeScore: 5, awayScore: 3 },
      manual: { homeDelta: 2, awayDelta: 1 },
      total: { homeScore: 7, awayScore: 4 },
      hasManual: true,
    });
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
    expect(taggingSource).not.toContain("...getUpdatedScore(match, eventPayload.team === 'away' ? 'away' : 'home', pointsDelta)");
    expect(taggingSource).not.toContain('cloudMatchService.updateMatch(match.id, {\n        ...getUpdatedScore');
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
    expect(taggingSource).toContain('data-tagging-edit-match-id');
    expect(taggingSource).toContain('class="tagging-match-edit-button"');
    expect(taggingSource).toContain('aria-label="Editar partido');
    expect(taggingSource).not.toContain('data-tagging-edit-match-id="${escapeHtml(item.id)}">Editar</button>');
    expect(taggingSource).toContain("import { openEditMatchModal } from '../components/new-match-form.js';");
    expect(taggingSource).toContain('openEditMatchModal(matchToEdit, async () => {');
    expect(taggingSource).toContain("navigate('tagging', { matchId: selected.id })");
    expect(taggingSource).toContain('const matches = await cloudMatchService.listMatches({ localFirst: true, refreshInBackground: true });');
    expect(taggingSource).toContain('renderMatchSelection(container, matches);');
    expect(taggingSource).not.toContain('matches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].id');
  });

  it('keeps direct match entry loading the requested match instead of the selector', () => {
    expect(taggingSource).toContain('if (params.matchId) {');
    expect(taggingSource).toContain("cloudMatchService.getMatchById(params.matchId, { localFirst: true })");
    expect(taggingSource).toContain('initializeMatch(loadedMatch);');
  });
});

describe('tagging event inspector', () => {
  const taggingSource = readFileSync(new URL('../tagging.js', import.meta.url), 'utf8');
  const videoPlayerCss = readFileSync(new URL('../../../styles/components/video-player.css', import.meta.url), 'utf8');

  it('renders timeline event detail in the right inspector surface', () => {
    expect(taggingSource).toContain('id="event-inspector-host"');
    expect(taggingSource).toContain('function renderEventInspector()');
    expect(taggingSource).toContain('data-panel-surface="inspector"');
    expect(taggingSource).toContain('data-event-note-edit');
    expect(taggingSource).toContain('data-event-save');
    expect(taggingSource).toContain('data-event-delete');
  });

  it('updates and deletes the selected timeline event through cloud sync services', () => {
    expect(taggingSource).toContain('cloudEventService.updateEvent');
    expect(taggingSource).toContain('cloudEventService.deleteEvent');
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
    expect(taggingSource).toContain('cloudMatchService.updateMatch(match.id, {');
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

  it('renders live drawings over the video only during their configured duration', () => {
    expect(taggingSource).toContain("import { drawStrokes } from '../drawing/drawing-engine.js';");
    expect(taggingSource).toContain('let liveDrawings = []');
    expect(taggingSource).toContain('data-live-drawing-overlay');
    expect(taggingSource).toContain('function renderLiveDrawingOverlay()');
    expect(taggingSource).toContain('getActiveLiveDrawings(playbackTime)');
    expect(taggingSource).toContain('time < start + getLiveDrawingDuration(drawing)');
    expect(taggingSource).toContain('getLiveDrawingStrokesAtTime(drawing, getVisualCurrentTime())');
    expect(taggingSource).toContain('drawStrokes(ctx, getLiveDrawingStrokesAtTime');
    expect(taggingSource).toContain('window.api.drawings.getForMatch(match.id)');
  });

  it('uses a tagging-specific drawing editor layout instead of the centered modal shell', () => {
    expect(taggingSource).toContain("className: 'tagging-live-drawing-editor'");
    expect(taggingSource).toContain('const savedDrawing = await window.api.drawings.saveLive');
    expect(taggingSource).toContain('backgroundImage: await resolveLiveDrawingEditBackground');
    expect(taggingSource).toContain('upsertLiveDrawing(liveDrawings, savedDrawing)');
  });

  it('supports editing, moving and deleting live drawing timeline entries', () => {
    expect(taggingSource).toContain('let selectedTimelineDrawingId = null');
    expect(taggingSource).toContain('onDrawingMove: moveTimelineDrawing');
    expect(taggingSource).toContain('function openLiveDrawingEditModal(drawing)');
    expect(taggingSource).toContain('data-live-drawing-timestamp');
    expect(taggingSource).toContain('async function resolveLiveDrawingEditBackground(drawing)');
    expect(taggingSource).toContain('const backgroundImage = await resolveLiveDrawingEditBackground(editableDrawing);');
    expect(taggingSource).toContain('backgroundImage,');
    expect(taggingSource).toContain('strokes: editableDrawing.strokes');
    expect(taggingSource).toContain('durationSeconds: editableDrawing.durationSeconds');
    expect(taggingSource).toContain('window.api.drawings.updateLive(match.id, drawing.id');
    expect(taggingSource).toContain('async function deleteLiveDrawingWithFallback(drawingId)');
    expect(taggingSource).toContain('isMissingDrawingIpcHandlerError(error)');
    expect(taggingSource).toContain('window.api.drawings.deleteLive(match.id, drawingId)');
    expect(taggingSource).toContain('window.api.matches.update(match.id, { drawings: nextDrawings })');
    expect(taggingSource).toContain('async function moveTimelineDrawing(drawing, timestamp)');
    expect(taggingSource).toContain('deleteSelectedTimelineDrawing();');
    expect(taggingSource).toContain('selectedTimelineDrawingId || selectedTimelineEventId || selectedTimelineSequenceKey');
  });

  it('adds local MP4 clip export to the timeline context menu with clear blocked states', () => {
    expect(taggingSource).toContain('data-context-export-clip');
    expect(taggingSource).toContain('window.api.clips.exportSingle');
    expect(taggingSource).toContain('Exportando clip...');
    expect(taggingSource).toContain('Abrir carpeta');
    expect(taggingSource).toContain('La exportación de clips requiere tener cargado el archivo MP4 local del partido.');
    expect(taggingSource).toContain('No se encontró el video original. Volvé a cargar el MP4 del partido.');
  });

  it('sends YouTube clip playback to the dedicated clips screen instead of playing inside tagging', () => {
    expect(taggingSource).toContain('Reproducir clip');
    expect(taggingSource).toContain("navigate('clips', {");
    expect(taggingSource).toContain('eventId: timelineEvent.id');
    expect(taggingSource).not.toContain('startYouTubeVirtualClipQueue');
    expect(taggingSource).not.toContain('youtubePlayer.seekTo(clip.start, true)');
    expect(taggingSource).not.toContain('activeVirtualClip');
    expect(taggingSource).not.toContain('advanceYouTubeVirtualClipQueue');
    expect(taggingSource).not.toContain("clipMode !== 'youtube-clips'");
    expect(taggingSource).toContain('Este partido usa video de YouTube. Podés reproducir clips dentro de BiguAnalytics, pero para exportarlos como archivos MP4 necesitás asociar un video local.');
    expect(taggingSource).not.toContain('yt-dlp');
    expect(taggingSource).not.toContain('youtube-dl');
  });

  it('allows associating a local MP4 with the same match to enable real clip export', () => {
    expect(taggingSource).toContain('Asociar MP4 local');
    expect(taggingSource).toContain('associateLocalMp4WithMatch');
    expect(taggingSource).toContain('window.api.media.selectLocalVideo()');
    expect(taggingSource).toContain('cloudMatchService.updateMatch(match.id, { video: selected');
  });

  it('supports Ctrl+Z and Ctrl+Shift+Z for persisted tagging changes', () => {
    const snapshot = createTaggingHistorySnapshot?.({
      events: [{ id: 'e1', timestamp: 10 }],
      sequences: [{ id: 's1', start: 20, end: 30 }],
      possession: { intervals: [{ team: 'home', start: 0, end: 10 }] },
      homeScore: 7,
      awayScore: 3,
      scoreAdjustment: null,
      scoreOverride: null,
      status: 'tagging',
    });

    expect(snapshot.events).toEqual([{ id: 'e1', timestamp: 10 }]);
    expect(getHistoryRestorePayload?.(snapshot)).toEqual({
      events: [{ id: 'e1', timestamp: 10 }],
      sequences: [{ id: 's1', start: 20, end: 30 }],
      possession: { intervals: [{ team: 'home', start: 0, end: 10 }] },
      homeScore: 7,
      awayScore: 3,
      scoreAdjustment: null,
      scoreOverride: null,
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
    expect(taggingSource).toContain('cloudEventService.updateEvent(match.id, event.id, { timestamp })');
    expect(taggingSource).not.toContain('cloudEventService.updateEvent(match.id, event.id, { timestamp, type');
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

  it('toggles popup voice dictation with Ctrl+M or Alt+M and stops it on popup lifecycle exits', () => {
    expect(taggingSource).toContain('function isSpeechToggleHotkey(event)');
    expect(taggingSource).toContain("String(event.key || '').toLowerCase() === 'm'");
    expect(taggingSource).toContain('event.ctrlKey || event.altKey');
    expect(taggingSource).toContain('startNativeSpeechNote(noteInput)');
    expect(taggingSource).toContain('window.api.speech.start');
    expect(taggingSource).toContain('window.api.speech.stop');
    expect(taggingSource).toContain('window.api.speech.onResult');
    expect(taggingSource).toContain('toggleSpeechNote();');
    expect(taggingSource).toContain('stopSpeechNote();');
    expect(taggingSource).toContain('speechRecognition.stop()');
    expect(taggingSource).toContain('completeActivePopup');
    expect(taggingSource).toContain('closeActivePopupAnimated');
    expect(taggingSource).toContain('cleanup = () => {');
  });

  it('shows an actionable Electron Web Speech network failure message', () => {
    expect(getSpeechErrorMessage?.({ error: 'network' })).toBe(
      'El servicio de dictado de Chromium no inicio en Electron. Reinicia BiguAnalytics y proba de nuevo.',
    );
  });

  it('prefers the highest-confidence Web Speech alternative and rejects weak final native results', () => {
    expect(getBestSpeechTranscript?.([
      { transcript: 'ruido', confidence: 0.22 },
      { transcript: 'ruck ganado', confidence: 0.84 },
    ])).toBe('ruck ganado');
    expect(shouldAcceptSpeechResult?.({ transcript: 'ruido', isFinal: true, confidence: 0.22 })).toBe(false);
    expect(shouldAcceptSpeechResult?.({ transcript: 'ruck ganado', isFinal: true, confidence: 0.84 })).toBe(true);
    expect(shouldAcceptSpeechResult?.({ transcript: 'hipotesis', isFinal: false, confidence: 0 })).toBe(true);
    expect(taggingSource).toContain('recognition.maxAlternatives = 3');
  });

  it('keeps plain Enter inside popup textareas and saves multiline notes with Ctrl+Enter', () => {
    const textarea = { tagName: 'TEXTAREA', isContentEditable: false };
    const button = { tagName: 'BUTTON', isContentEditable: false };

    expect(shouldCompletePopupFromKeydown?.({ key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false }, textarea)).toBe(false);
    expect(shouldCompletePopupFromKeydown?.({ key: 'Enter', shiftKey: true, ctrlKey: false, metaKey: false }, textarea)).toBe(false);
    expect(shouldCompletePopupFromKeydown?.({ key: 'Enter', shiftKey: false, ctrlKey: true, metaKey: false }, textarea)).toBe(true);
    expect(shouldCompletePopupFromKeydown?.({ key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false }, button)).toBe(true);
  });

  it('detects focused popup inputs so auto-close does not close while writing', () => {
    const textarea = { tagName: 'TEXTAREA', isContentEditable: false };
    const outsideInput = { tagName: 'TEXTAREA', isContentEditable: false };
    const popupHost = { contains: target => target === textarea };

    expect(isPopupInputFocused?.(popupHost, textarea)).toBe(true);
    expect(isPopupInputFocused?.(popupHost, outsideInput)).toBe(false);
    expect(taggingSource).toContain('shouldAutoClosePopup(state, Date.now(), { isInteracting: isPopupInputFocused(popupHost) })');
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

  it('shows selected free-note content as a readable inspector preview', () => {
    expect(tagging.getTimelineEventNotePreview?.({ type: 'note', note: ' Ajustar presion\nsalida rival ' })).toBe('Ajustar presion\nsalida rival');
    expect(tagging.getTimelineEventNotePreview?.({ type: 'note', note: '   ' })).toBe('');
    expect(taggingSource).toContain('const selectedEventNotePreview = getTimelineEventNotePreview(selectedEvent);');
    expect(taggingSource).toContain('class="event-inspector-note-preview"');
    expect(videoPlayerCss).toMatch(/\.event-inspector-note-preview\s*{[^}]*white-space:\s*pre-wrap;[^}]*overflow-wrap:\s*anywhere;/s);
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
