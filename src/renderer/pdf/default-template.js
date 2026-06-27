// @ts-check

export const SYSTEM_TEMPLATE_ID = 'system-default';
export const DEFAULT_PDF_TEMPLATE = Object.freeze({
  id: SYSTEM_TEMPLATE_ID,
  name: 'Default BiguAnalytics',
  version: 1,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  pageSize: 'A4',
  orientation: 'landscape',
  pages: [
    {
      id: 'page-cover',
      title: 'Resumen',
      blocks: [
        { id: 'match-header', type: 'match-header', x: 0, y: 0, w: 12, h: 12 },
        { id: 'score', type: 'score', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-general',
      title: 'Generales',
      blocks: [
        { id: 'kpis', type: 'kpi-row', x: 0, y: 0, w: 12, h: 8 },
        { id: 'possession', type: 'possession-chart', x: 0, y: 8, w: 12, h: 16 },
      ],
    },
    {
      id: 'page-discipline-rucks',
      title: 'Disciplina y rucks',
      blocks: [
        { id: 'penalties', type: 'penalties-chart', x: 0, y: 0, w: 12, h: 12 },
        { id: 'rucks', type: 'rucks-chart', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-set-pieces-kicks',
      title: 'Formaciones y salidas',
      blocks: [
        { id: 'set-pieces', type: 'set-pieces-chart', x: 0, y: 0, w: 12, h: 12 },
        { id: 'kicks', type: 'kicks-chart', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-break-lines',
      title: 'Quiebres y secuencias',
      blocks: [
        { id: 'break-lines', type: 'break-lines-chart', x: 0, y: 0, w: 12, h: 12 },
        { id: 'bip', type: 'bip-sequences-chart', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-field-events',
      title: 'Campo y eventos',
      blocks: [
        { id: 'heatmap', type: 'heatmap', x: 0, y: 0, w: 12, h: 12 },
        { id: 'events-table', type: 'events-table', x: 0, y: 12, w: 12, h: 12, settings: { maxRows: 12 } },
      ],
    },
    {
      id: 'page-notes-summary',
      title: 'Notas y resumen',
      blocks: [
        { id: 'coach-notes', type: 'coach-notes', x: 0, y: 0, w: 12, h: 12 },
        { id: 'ai-summary', type: 'ai-summary', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-ai',
      title: 'Analisis IA',
      blocks: [
        { id: 'ai-key-findings', type: 'ai-key-findings', x: 0, y: 0, w: 12, h: 12 },
        { id: 'ai-strengths', type: 'ai-strengths', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-ai-action',
      title: 'Correcciones',
      blocks: [
        { id: 'ai-weaknesses', type: 'ai-weaknesses', x: 0, y: 0, w: 12, h: 12 },
        { id: 'ai-training', type: 'ai-training-recommendations', x: 0, y: 12, w: 12, h: 12 },
      ],
    },
    {
      id: 'page-action-plan',
      title: 'Plan de accion',
      blocks: [
        { id: 'section-title', type: 'section-title', x: 0, y: 0, w: 12, h: 12, settings: { text: 'Plan de accion' } },
        {
          id: 'report-focus',
          type: 'text-block',
          x: 0,
          y: 12,
          w: 12,
          h: 12,
          settings: {
            title: 'Foco del informe',
            text: 'Resumen operativo para revisar rendimiento, disciplina, territorio y oportunidades de entrenamiento.',
          },
        },
      ],
    },
  ],
});
