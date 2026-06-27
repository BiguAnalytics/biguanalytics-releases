// @ts-check

export const PDF_BLOCK_CATEGORIES = [
  'General',
  'Métricas',
  'Gráficos',
  'Inteligencia artificial',
  'Notas',
  'Eventos',
  'Diseño',
];

export const PDF_BLOCK_REGISTRY = Object.freeze({
  'match-header': {
    type: 'match-header',
    label: 'Encabezado del partido',
    subtitle: 'match-header',
    description: 'Muestra equipos, fecha, competencia y contexto general del partido.',
    category: 'General',
  },
  score: {
    type: 'score',
    label: 'Marcador',
    subtitle: 'score',
    description: 'Muestra el resultado final del partido con los equipos.',
    category: 'General',
  },
  'kpi-row': {
    type: 'kpi-row',
    label: 'Indicadores principales',
    subtitle: 'kpi-row',
    description: 'Agrupa las métricas clave que resumen el rendimiento del partido.',
    category: 'Métricas',
  },
  'possession-chart': {
    type: 'possession-chart',
    label: 'Posesión',
    subtitle: 'possession-chart',
    description: 'Gráfico de posesión para comparar dominio del juego.',
    category: 'Gráficos',
  },
  'set-pieces-chart': {
    type: 'set-pieces-chart',
    label: 'Formaciones fijas',
    subtitle: 'set-pieces-chart',
    description: 'Resume scrums, line outs y otras formaciones fijas.',
    category: 'Gráficos',
  },
  'rucks-chart': {
    type: 'rucks-chart',
    label: 'Rucks',
    subtitle: 'rucks-chart',
    description: 'Muestra eficiencia, volumen y resultado de rucks.',
    category: 'Gráficos',
  },
  'penalties-chart': {
    type: 'penalties-chart',
    label: 'Penales',
    subtitle: 'penalties-chart',
    description: 'Visualiza penales, disciplina y tarjetas del partido.',
    category: 'Gráficos',
  },
  'break-lines-chart': {
    type: 'break-lines-chart',
    label: 'Quiebres de línea',
    subtitle: 'break-lines-chart',
    description: 'Destaca quiebres propios y concedidos para leer impacto ofensivo y defensivo.',
    category: 'Gráficos',
  },
  'kicks-chart': {
    type: 'kicks-chart',
    label: 'Kicks',
    subtitle: 'kicks-chart',
    description: 'Resume uso y efectividad del juego con el pie.',
    category: 'Gráficos',
  },
  'bip-sequences-chart': {
    type: 'bip-sequences-chart',
    label: 'Secuencias de juego',
    subtitle: 'bip-sequences-chart',
    description: 'Muestra ball in play y secuencias relevantes del partido.',
    category: 'Gráficos',
  },
  heatmap: {
    type: 'heatmap',
    label: 'Mapa de zonas',
    subtitle: 'heatmap',
    description: 'Ubica eventos y zonas de mayor actividad dentro de la cancha.',
    category: 'Gráficos',
  },
  'ai-summary': {
    type: 'ai-summary',
    label: 'Resumen IA',
    subtitle: 'ai-summary',
    description: 'Síntesis automática del partido generada por IA.',
    category: 'Inteligencia artificial',
  },
  'ai-key-findings': {
    type: 'ai-key-findings',
    label: 'Hallazgos clave',
    subtitle: 'ai-key-findings',
    description: 'Lista los puntos más importantes detectados por IA.',
    category: 'Inteligencia artificial',
  },
  'ai-strengths': {
    type: 'ai-strengths',
    label: 'Fortalezas',
    subtitle: 'ai-strengths',
    description: 'Resume aspectos positivos del rendimiento del equipo.',
    category: 'Inteligencia artificial',
  },
  'ai-weaknesses': {
    type: 'ai-weaknesses',
    label: 'Debilidades',
    subtitle: 'ai-weaknesses',
    description: 'Señala problemas o patrones a corregir.',
    category: 'Inteligencia artificial',
  },
  'ai-training-recommendations': {
    type: 'ai-training-recommendations',
    label: 'Recomendaciones de entrenamiento',
    subtitle: 'ai-training-recommendations',
    description: 'Propone focos de entrenamiento a partir del análisis del partido.',
    category: 'Inteligencia artificial',
  },
  'coach-notes': {
    type: 'coach-notes',
    label: 'Notas del entrenador',
    subtitle: 'coach-notes',
    description: 'Incluye observaciones y conclusiones cargadas manualmente.',
    category: 'Notas',
  },
  'events-table': {
    type: 'events-table',
    label: 'Tabla de eventos',
    subtitle: 'events-table',
    description: 'Lista eventos del partido con columnas configurables.',
    category: 'Eventos',
  },
  'section-title': {
    type: 'section-title',
    label: 'Título de sección',
    subtitle: 'section-title',
    description: 'Agrega un título visual para separar partes del informe.',
    category: 'Diseño',
  },
  'text-block': {
    type: 'text-block',
    label: 'Texto libre',
    subtitle: 'text-block',
    description: 'Bloque editable para instrucciones, contexto o comentarios.',
    category: 'Diseño',
  },
});

export const PDF_BLOCK_TYPES = Object.keys(PDF_BLOCK_REGISTRY);

/**
 * @param {string|null|undefined} type
 * @returns {{type: string, label: string, subtitle: string, description: string, category: string, unknown?: boolean}}
 */
export function getPdfBlockMetadata(type) {
  const normalizedType = String(type || '').trim();
  if (PDF_BLOCK_REGISTRY[normalizedType]) return PDF_BLOCK_REGISTRY[normalizedType];
  return {
    type: normalizedType,
    label: 'Bloque desconocido',
    subtitle: normalizedType,
    description: 'Este bloque viene de una plantilla anterior o no compatible.',
    category: 'Diseño',
    unknown: true,
  };
}
