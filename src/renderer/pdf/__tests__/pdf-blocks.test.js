import { describe, expect, it } from 'vitest';

import {
  GRID_COLUMNS,
  getPdfBlockGridStyle,
  renderPdfTemplatePages,
  validateTemplateLayout,
} from '../pdf-blocks.js';

const baseStats = {
  match: {
    homeTeam: 'Bigua',
    awayTeam: 'Rival',
    competition: 'Test',
    date: '2026-06-16',
  },
  score: {
    home: { total: 21 },
    away: { total: 17 },
    source: 'events',
  },
  teams: {
    biguaTeam: 'home',
    rivalTeam: 'away',
    home: { name: 'Bigua' },
    away: { name: 'Rival' },
  },
  rucks: { home: { wonPct: 66 }, away: { wonPct: 40 } },
  discipline: {
    home: { penalties: { total: 8, attack: 3, defense: 5, byType: { ruck: 4, scrum: 1, 'off-side': 1, maul: 0, inconducta: 1, otro: 1 } }, cards: { amarilla: 1, roja: 0 } },
    away: { penalties: { total: 10, attack: 4, defense: 6, byType: { ruck: 2, scrum: 3, 'off-side': 2, maul: 1, inconducta: 0, otro: 2 } }, cards: { amarilla: 0, roja: 0 } },
  },
  setPieces: {
    lineouts: { home: { total: 6, won: 4, lost: 1, dirty: 1, wonPct: 75 }, away: { total: 8, won: 6, lost: 1, dirty: 1, wonPct: 70 } },
    scrums: { home: { total: 5, won: 3, lost: 1, dirty: 1, wonPct: 80 }, away: { total: 6, won: 3, lost: 2, dirty: 1, wonPct: 50 } },
  },
  breakLines: { home: { total: 4, killerInstinctPct: 50, byResult: { try: 1, juego: 1, turnover: 1, palos: 1 } }, away: { total: 2, killerInstinctPct: 25, byResult: { try: 0, juego: 0, turnover: 2, palos: 0 } } },
  totals: { home: { turnovers: 7 }, away: { turnovers: 9 } },
  kicks: { home: { total: 12, favorablePct: 58 }, away: { total: 8, favorablePct: 50 } },
  possession: { percentages: { home: 55 } },
  territory: { available: true, percentages: { home: 60 } },
  sequences: { total: 5, averagePhases: 6, longest: [], byResult: { try: { count: 1 }, turnover: { count: 2 } } },
  bip: { bands: [{ label: '0-20', count: 27 }, { label: '20-40', count: 16 }, { label: '40-60', count: 14 }, { label: '60-80', count: 6 }, { label: '+80', count: 1 }] },
  alerts: [],
};

describe('PDF template block rendering', () => {
  it('maps grid coordinates to 12-column CSS placement', () => {
    expect(GRID_COLUMNS).toBe(12);
    expect(getPdfBlockGridStyle({ x: 3, y: 2, w: 6, h: 4 })).toContain('grid-column: 4 / span 6');
    expect(getPdfBlockGridStyle({ x: 3, y: 2, w: 6, h: 4 })).toContain('grid-row: 3 / span 4');
  });

  it('renders template pages with positioned blocks', () => {
    const html = renderPdfTemplatePages({
      stats: baseStats,
      chartImages: { rucks: 'data:image/png;base64,abc' },
      notesHtml: '<p>Nota</p>',
    }, {
      id: 'custom',
      name: 'Custom',
      version: 1,
      pageSize: 'A4',
      orientation: 'landscape',
      pages: [{
        id: 'page-1',
        title: 'Página 1',
        blocks: [
          { id: 'score-1', type: 'score', x: 0, y: 0, w: 4, h: 3 },
          { id: 'rucks-1', type: 'rucks-chart', x: 4, y: 0, w: 8, h: 8 },
          { id: 'notes-1', type: 'coach-notes', x: 0, y: 8, w: 12, h: 4 },
        ],
      }],
    });

    expect(html).toContain('print-template-page');
    expect(html).toContain('data-pdf-block-id="score-1"');
    expect(html).toContain('21 - 17');
    expect(html).toContain('data-pdf-block-id="rucks-1"');
    expect(html).toContain('data:image/png;base64,abc');
    expect(html).toContain('<p>Nota</p>');
  });

  it('renders chart data fallbacks inside PDF cards when chart images are unavailable', () => {
    const html = renderPdfTemplatePages({
      stats: baseStats,
      chartImages: {},
    }, {
      id: 'custom',
      name: 'Custom',
      version: 1,
      pageSize: 'A4',
      orientation: 'landscape',
      pages: [{
        id: 'page-1',
        title: 'Pagina 1',
        blocks: [
          { id: 'rucks-1', type: 'rucks-chart', x: 0, y: 0, w: 6, h: 12 },
          { id: 'kicks-1', type: 'kicks-chart', x: 6, y: 0, w: 6, h: 12 },
        ],
      }],
    });

    expect(html).not.toContain('Grafico no disponible.');
    expect(html).toContain('print-template-chart-summary');
    expect(html).toContain('Rucks ganados');
    expect(html).toContain('66%');
    expect(html).toContain('Kicks efectivos');
    expect(html).toContain('58%');
  });

  it('uses configured event labels in PDF summaries and event tables', () => {
    const html = renderPdfTemplatePages({
      stats: baseStats,
      taggingLabels: { ruck: 'Pepe' },
      match: { events: [{ type: 'ruck', team: 'home', result: 'ganado', timestamp: 12 }] },
    }, {
      id: 'custom',
      name: 'Custom',
      version: 1,
      pageSize: 'A4',
      orientation: 'landscape',
      pages: [{
        id: 'page-1',
        title: 'Eventos',
        blocks: [
          { id: 'events-1', type: 'events-table', x: 0, y: 0, w: 12, h: 12 },
        ],
      }],
    });

    expect(html).toContain('Pepe');
    expect(html).not.toContain('>Ruck<');
  });

  it('renders large report-style chart panels with metric text even when chart images exist', () => {
    const html = renderPdfTemplatePages({
      stats: baseStats,
      chartImages: { possession: 'data:image/png;base64,possession' },
    }, {
      id: 'custom',
      name: 'Custom',
      version: 1,
      pageSize: 'A4',
      orientation: 'landscape',
      pages: [{
        id: 'page-1',
        title: 'Pagina 1',
        blocks: [
          { id: 'general-1', type: 'possession-chart', x: 0, y: 0, w: 12, h: 12 },
          { id: 'penalties-1', type: 'penalties-chart', x: 0, y: 12, w: 12, h: 12 },
        ],
      }],
    });

    expect(html).toContain('print-template-watermark');
    expect(html).toContain('print-template-rugby-panel');
    expect(html).toContain('print-template-chart-visual');
    expect(html).toContain('data:image/png;base64,possession');
    expect(html).toContain('GENERALES');
    expect(html).toContain('PENALES / FREE KICK');
    expect(html).toContain('POSESION');
    expect(html).toContain('TURNOVERS');
    expect(html).toContain('PENALES EN ATAQUE');
    expect(html).toContain('PENALES EN DEFENSA');
    expect(html).toContain('print-template-balance-bars');
  });

  it('renders the events block as an aggregated summary instead of a short raw table', () => {
    const events = Array.from({ length: 200 }, (_, index) => ({
      timestamp: 521.954 + index,
      type: index % 2 === 0 ? 'break-line' : 'ruck',
      team: index % 3 === 0 ? 'bigua' : 'rival',
      result: index % 4 === 0 ? 'ganada' : 'perdida',
    }));
    const html = renderPdfTemplatePages({
      stats: baseStats,
      match: { events },
    }, {
      id: 'custom',
      name: 'Custom',
      version: 1,
      pageSize: 'A4',
      orientation: 'landscape',
      pages: [{
        id: 'page-1',
        title: 'Eventos',
        blocks: [
          { id: 'events-1', type: 'events-table', x: 0, y: 0, w: 12, h: 12, settings: { maxRows: 12 } },
        ],
      }],
    });

    expect(html).toContain('print-template-events-summary');
    expect(html).toContain('200 eventos registrados');
    expect(html).toContain('08:41');
    expect(html).toContain('Break Line');
    expect(html).toContain('Ruck');
    expect(html).toContain('Bigua');
    expect(html).toContain('Rival');
    expect(html).not.toContain('<tbody>');
    expect(html).not.toContain('521.954');
    expect(html).not.toContain('break-line');
    expect(html).not.toContain('ganada');
  });

  it('reports invalid blocks before export', () => {
    const report = validateTemplateLayout({
      id: 'bad',
      name: 'Bad',
      version: 1,
      pageSize: 'A4',
      orientation: 'landscape',
      pages: [{
        id: 'page-1',
        title: 'Página 1',
        blocks: [
          { id: 'a', type: 'score', x: 0, y: 0, w: 12, h: 4 },
          { id: 'b', type: 'text-block', x: 11, y: 0, w: 3, h: 4 },
        ],
      }],
    });

    expect(report.valid).toBe(false);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ blockId: 'b', code: 'out-of-page' }),
      expect.objectContaining({ blockId: 'b', code: 'overlap' }),
    ]));
  });
});
