import { describe, expect, it } from 'vitest';

import {
  PDF_BLOCK_REGISTRY,
  PDF_BLOCK_TYPES,
  getPdfBlockMetadata,
} from '../pdf-block-registry.js';

const expectedLabels = {
  'match-header': 'Encabezado del partido',
  score: 'Marcador',
  'kpi-row': 'Indicadores principales',
  'possession-chart': 'Posesión',
  'set-pieces-chart': 'Formaciones fijas',
  'rucks-chart': 'Rucks',
  'penalties-chart': 'Penales',
  'break-lines-chart': 'Quiebres de línea',
  'kicks-chart': 'Kicks',
  'bip-sequences-chart': 'Secuencias de juego',
  heatmap: 'Mapa de zonas',
  'ai-summary': 'Resumen IA',
  'ai-key-findings': 'Hallazgos clave',
  'ai-strengths': 'Fortalezas',
  'ai-weaknesses': 'Debilidades',
  'ai-training-recommendations': 'Recomendaciones de entrenamiento',
  'coach-notes': 'Notas del entrenador',
  'events-table': 'Tabla de eventos',
  'section-title': 'Título de sección',
  'text-block': 'Texto libre',
};

describe('PDF block registry', () => {
  it('defines user-facing Spanish metadata for every supported block type', () => {
    expect(PDF_BLOCK_TYPES).toEqual(Object.keys(expectedLabels));

    PDF_BLOCK_TYPES.forEach((type) => {
      const metadata = getPdfBlockMetadata(type);

      expect(metadata).toMatchObject({
        type,
        label: expectedLabels[type],
        subtitle: type,
      });
      expect(metadata.description).toBeTruthy();
      expect(metadata.description).not.toBe(type);
      expect(['General', 'Métricas', 'Gráficos', 'Inteligencia artificial', 'Notas', 'Eventos', 'Diseño']).toContain(metadata.category);
    });
  });

  it('does not use technical types as primary labels', () => {
    Object.values(PDF_BLOCK_REGISTRY).forEach((metadata) => {
      expect(metadata.label).not.toBe(metadata.type);
    });
  });

  it('returns a safe unknown-block label without breaking old templates', () => {
    expect(getPdfBlockMetadata('legacy-custom-block')).toEqual({
      type: 'legacy-custom-block',
      label: 'Bloque desconocido',
      subtitle: 'legacy-custom-block',
      description: 'Este bloque viene de una plantilla anterior o no compatible.',
      category: 'Diseño',
      unknown: true,
    });
  });
});
