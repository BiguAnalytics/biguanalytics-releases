import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as clipEvents from '../../clips/clip-events.js';
import * as clipPlayer from '../clip-player.js';

const clipPlayerSource = readFileSync(new URL('../clip-player.js', import.meta.url), 'utf8');
const clipPlayerCss = readFileSync(new URL('../../../styles/components/clip-player.css', import.meta.url), 'utf8');

const {
  buildClipPlayerState,
  calculateClipPlayerRange,
  getClipExportProgressMessage,
  getClipQueuePageWindow,
  getSelectedClipIdsForExport,
} = clipPlayer;

const BASE_MATCH = {
  id: 'match-1',
  homeTeam: 'Old Boys',
  awayTeam: 'Bigua Rugby',
  video: {
    type: 'youtube',
    videoId: 'yt-123',
    duration: 100,
  },
  events: [
    {
      id: 'scrum-importado',
      eventType: 'Scrum',
      teamName: 'Bigua Rugby',
      result: 'ganado',
      timestamp: 42,
      note: '5m defensivo',
    },
    {
      id: 'scrum-sin-tiempo',
      type: 'scrum',
      team: 'away',
      result: 'perdido',
      timestamp: null,
    },
    {
      id: 'ruck-perdido',
      type: 'ruck',
      teamId: 'away',
      result: 'perdido',
      timestamp: 55,
    },
    {
      id: 'penal-rival',
      type: 'penal',
      team: 'home',
      result: 'defensa',
      subtype: 'scrum',
      timestamp: 70,
    },
  ],
};

describe('clip player queue generation', () => {
  it('uses the clips default window of 5 seconds before and 8 after', () => {
    expect(calculateClipPlayerRange(42, 100, {})).toEqual({
      start: 37,
      end: 50,
      duration: 13,
    });
  });

  it('builds playable clips for Scrums Bigua using imported team and type fields', () => {
    const state = buildClipPlayerState?.(BASE_MATCH, {}, {
      clipType: 'scrum',
      clipTeam: 'bigua',
    });

    expect(state).toEqual(expect.objectContaining({
      status: 'ready',
      warning: 'Hay eventos sin timestamp. No pueden convertirse en clips.',
    }));
    expect(state?.clips).toEqual([
      expect.objectContaining({
        id: 'scrum-importado',
        start: 37,
        end: 50,
        title: 'Scrum / Ganado',
        typeLabel: 'Scrum',
        resultLabel: 'Ganado',
        teamLabel: 'Bigua Rugby',
        note: '5m defensivo',
      }),
    ]);
  });

  it('defaults an empty custom time range to the full local video duration', () => {
    const state = buildClipPlayerState?.({
      ...BASE_MATCH,
      video: {
        type: 'local',
        path: 'C:\\Partidos\\fecha-3.mp4',
        duration: 100,
      },
    }, { clipOutputModeDefault: 'combined' }, {
      clipPeriod: 'custom',
      clipFrom: '',
      clipTo: '',
    });

    expect(state?.request).toEqual(expect.objectContaining({
      period: 'custom',
      fromSeconds: 0,
      toSeconds: 100,
    }));
    expect(state?.outputMode).toBe('combined');
  });

  it('returns the real no-video cause before evaluating clip filters', () => {
    const state = buildClipPlayerState?.({
      ...BASE_MATCH,
      video: null,
    }, {}, { clipType: 'scrum', clipTeam: 'bigua' });

    expect(state?.message).toBe('No hay video asociado.');
    expect(state?.message).not.toMatch(/no hay clips/i);
    expect(state?.clips).toEqual([
      expect.objectContaining({
        id: 'scrum-importado',
        timestamp: 42,
      }),
    ]);
  });

  it('does not report no clips when an imported local video reference has no playable path', () => {
    const state = buildClipPlayerState?.({
      ...BASE_MATCH,
      video: {
        type: 'local',
        sourceType: 'local_mp4',
        name: 'fecha-7.mp4',
        needsLocalFile: true,
      },
    }, {}, { clipType: 'scrum', clipTeam: 'bigua' });

    expect(state?.message).toBe('Video local no asociado en esta PC.');
    expect(state?.message).not.toMatch(/no hay clips/i);
  });

  it('returns exact empty causes for filtered timestamped events', () => {
    const state = buildClipPlayerState?.(BASE_MATCH, {}, {
      clipType: 'scrum',
      clipTeam: 'rival',
    });

    expect(state?.message).toBe('No hay eventos del tipo Scrum para Rival.');
  });

  it('maps all quick filters required by the Clips screen to real event aliases', () => {
    [
      'all',
      'scrum',
      'ruck',
      'penal',
      'kick',
      'points',
      'break-line',
      'note',
      'turnover',
      'lineout',
      'maul',
    ].forEach((type) => {
      expect(clipEvents.eventMatchesClipFilters({
        type: type === 'all' ? 'scrum' : type,
        timestamp: 12,
      }, { type }, BASE_MATCH)).toBe(true);
    });
  });

  it('distinguishes a valid video with no matching events from missing timestamps', () => {
    const noEvents = buildClipPlayerState?.(BASE_MATCH, {}, {
      clipType: 'kick',
      clipTeam: 'bigua',
    });
    const untimed = buildClipPlayerState?.({
      ...BASE_MATCH,
      events: [{ id: 'scrum-sin-tiempo', type: 'scrum', team: 'away', timestamp: null }],
    }, {}, { clipType: 'scrum', clipTeam: 'bigua' });

    expect(noEvents?.message).toBe('No hay eventos para este filtro.');
    expect(untimed?.message).toBe('Hay eventos sin timestamp. No pueden convertirse en clips.');
  });

  it('paginates the clip queue in fixed groups of ten items', () => {
    expect(getClipQueuePageWindow?.(24, 0)).toEqual({
      pageIndex: 0,
      pageSize: 10,
      totalPages: 3,
      start: 0,
      end: 10,
      hasPrevious: false,
      hasNext: true,
    });
    expect(getClipQueuePageWindow?.(24, 2)).toEqual({
      pageIndex: 2,
      pageSize: 10,
      totalPages: 3,
      start: 20,
      end: 24,
      hasPrevious: true,
      hasNext: false,
    });
    expect(getClipQueuePageWindow?.(24, 8)).toEqual(expect.objectContaining({
      pageIndex: 2,
      start: 20,
      end: 24,
    }));
  });

  it('exports selected clips from the full carousel queue instead of only the visible page', () => {
    expect(getSelectedClipIdsForExport?.([
      { id: 'clip-01' },
      { id: 'clip-02' },
      { id: 'clip-11' },
    ], new Set(['clip-02', 'clip-11', 'clip-missing']))).toEqual(['clip-02', 'clip-11']);
  });

  it('formats export progress as an obvious file-saving state', () => {
    expect(getClipExportProgressMessage?.({
      current: 1,
      total: 3,
      message: 'Exportando 1/3 clips',
    })).toBe('Guardando archivo - Exportando 1/3 clips');

    expect(getClipExportProgressMessage?.({
      message: 'Armando video final...',
    })).toBe('Guardando archivo - Armando video final...');
  });
});

describe('clip player playback wiring', () => {
  it('opens a clip match from any non-control area of its selection card', () => {
    expect(clipPlayerSource).toContain('data-clip-match-card-id');
    expect(clipPlayerSource).toContain("card.addEventListener('click'");
    expect(clipPlayerSource).toContain("const primaryAction = card.querySelector('[data-clip-match-id]')");
    expect(clipPlayerSource).toContain('primaryAction?.click()');
  });

  it('renders the dedicated Clips workspace controls and source states', () => {
    expect(clipPlayerSource).toContain('<h1>Clips</h1>');
    expect(clipPlayerSource).toContain('Reproducí segmentos del partido filtrados por evento.');
    expect(clipPlayerSource).toContain('Seleccioná un partido para ver clips.');
    expect(clipPlayerSource).toContain('data-clip-player-source');
    expect(clipPlayerSource).toContain('Fuente actual');
    expect(clipPlayerSource).toContain('MP4 local');
    expect(clipPlayerSource).toContain('YouTube');
    expect(clipPlayerSource).toContain('Sin video asociado');
    expect(clipPlayerSource).toContain('data-associate-local-mp4');
    expect(clipPlayerSource).toContain('Asociar MP4 local');
    expect(clipPlayerSource).toContain('data-clip-filter-type');
    expect(clipPlayerSource).toContain('data-clip-filter-team');
    expect(clipPlayerSource).toContain('data-clip-filter-result');
    expect(clipPlayerSource).toContain('data-clip-filter-period');
    expect(clipPlayerSource).toContain('data-clip-preroll-seconds');
    expect(clipPlayerSource).toContain('data-clip-postroll-seconds');
    expect(clipPlayerSource).toContain('data-clip-output-mode');
    expect(clipPlayerSource).toContain('\\u00danico MP4');
    expect(clipPlayerSource).toContain('Clips separados');
    expect(clipPlayerSource).toContain('data-clip-export-progress');
    expect(clipPlayerSource).toContain('data-clip-export-progress-label');
    expect(clipPlayerSource).toContain('aria-live="polite"');
    expect(clipPlayerSource).toContain('updateExportProgress');
    expect(clipPlayerSource).toContain('class="clip-player-meta-grid"');
    expect(clipPlayerSource).toContain('class="clip-player-meta-item"');
    expect(clipPlayerSource).toContain('data-clip-export-selected');
    expect(clipPlayerSource).toContain('Exportar video unico');
    expect(clipPlayerSource).toContain('outputMode: clipState.outputMode');
    expect(clipPlayerSource).toContain('clipPreRollSeconds: clipState.clipSettings.clipPreRollSeconds');
    expect(clipPlayerSource).toContain('clipPostRollSeconds: clipState.clipSettings.clipPostRollSeconds');
  });

  it('uses the YouTube seek API for YouTube clips', () => {
    expect(clipPlayerSource).toContain('youtubePlayer.seekTo(activeClip.start, true)');
  });

  it('keeps the media stage at video aspect ratio instead of stretching the player vertically', () => {
    expect(clipPlayerSource).toContain('class="clip-player-right"');
    expect(clipPlayerSource).toContain('<section class="clip-player-stage" data-clip-player-stage>');
    expect(clipPlayerCss).toContain('.clip-player-right');
    expect(clipPlayerCss).toContain('aspect-ratio: 16 / 9;');
    expect(clipPlayerCss).toContain('height: auto;');
    expect(clipPlayerCss).not.toContain('min-height: 540px;');
  });

  it('styles export progress as a prominent state outside the export button', () => {
    expect(clipPlayerCss).toContain('.clip-player-export-progress');
    expect(clipPlayerCss).toContain('data-export-visible="true"');
    expect(clipPlayerCss).toContain('box-shadow: 0 18px 42px');
  });

  it('renders the clips list as a full-width carousel below filters and player', () => {
    expect(clipPlayerSource).toContain('const CLIP_QUEUE_PAGE_SIZE = 10;');
    expect(clipPlayerSource).toContain('data-clip-page-prev');
    expect(clipPlayerSource).toContain('data-clip-page-next');
    expect(clipPlayerSource).toContain('data-clip-carousel-range');
    expect(clipPlayerSource).toContain('renderQueue(clips, activeIndex, Boolean(state.video), queuePageIndex)');
    expect(clipPlayerSource).toContain('selectedClipIds');
    expect(clipPlayerSource).toContain("container.querySelectorAll('[data-clip-select]')");
    expect(clipPlayerCss).toContain('.clip-player-queue {');
    expect(clipPlayerCss).toContain('grid-column: 1 / -1;');
    expect(clipPlayerCss).toContain('grid-template-columns: repeat(5, minmax(0, 1fr));');
  });

  it('renders a match selector when Clips is opened from the sidebar without a match id', () => {
    expect(clipPlayerSource).toContain('function renderClipMatchSelection(container, matches)');
    expect(clipPlayerSource).toContain('const matches = await cloudMatchService.listMatches({ localFirst: true, refreshInBackground: true });');
    expect(clipPlayerSource).toContain('renderClipMatchSelection(container, matches);');
    expect(clipPlayerSource).toContain('data-clip-match-id');
    expect(clipPlayerSource).toContain("navigate('clips', { matchId: button.dataset.clipMatchId })");
    expect(clipPlayerSource).toContain('Ver clips');
  });

  it('labels clip selection cards as Clips and keeps the sidebar collapsed', () => {
    expect(clipPlayerSource).toContain("const selectionModuleLabel = 'Clips';");
    expect(clipPlayerSource).toContain('${escapeHtml(selectionModuleLabel)}');
    expect(clipPlayerSource).toContain('setSidebarExpanded(false);');
    expect(clipPlayerSource).not.toContain('setSidebarExpanded(true);');
  });

  it('opens a cached match before optional cloud detail refresh for direct clips entry', () => {
    expect(clipPlayerSource).toContain("cloudMatchService.getMatchById(currentParams.matchId, { localFirst: true })");
  });

  it('uses HTML video currentTime for local MP4 clips', () => {
    expect(clipPlayerSource).toContain('localVideo.currentTime = activeClip.start');
  });
});
