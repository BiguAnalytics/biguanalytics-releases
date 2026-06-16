// @ts-check
import { interpolateFrame } from './frame-interpolation.js';

const DEFAULT_STEP_DURATION_SECONDS = 3;
const MIN_STEP_DURATION_SECONDS = 0.5;
const MAX_STEP_DURATION_SECONDS = 10;

/**
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function normalizeStepDuration(value, fallback = DEFAULT_STEP_DURATION_SECONDS) {
  const numeric = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : DEFAULT_STEP_DURATION_SECONDS;
  const base = Number.isFinite(numeric) ? numeric : safeFallback;
  return Math.max(
    MIN_STEP_DURATION_SECONDS,
    Math.min(MAX_STEP_DURATION_SECONDS, Math.round(base * 10) / 10)
  );
}

/**
 * @param {Array<object>} value
 * @returns {Array<object>}
 */
function cloneStrokes(value = []) {
  return JSON.parse(JSON.stringify(Array.isArray(value) ? value : []));
}

/**
 * @param {object} frame
 * @returns {Array<object>}
 */
function getFrameElements(frame = {}) {
  if (Array.isArray(frame.elements)) return frame.elements;
  if (Array.isArray(frame.strokes)) return frame.strokes;
  return [];
}

/**
 * @param {Array<object>} frames
 * @returns {string}
 */
function createNextCuadroId(frames = []) {
  const existingIds = new Set(frames.map(frame => String(frame.id || '')));
  const base = `cuadro-${frames.length + 1}`;
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/**
 * @param {object} sequence
 * @returns {object}
 */
export function createCuadroFromPrevious(sequence = {}) {
  const frames = (Array.isArray(sequence.frames) ? sequence.frames : [])
    .map((frame, index) => ({
      ...frame,
      order: Number.isFinite(Number(frame.order)) ? Number(frame.order) : index,
    }))
    .sort((a, b) => a.order - b.order);
  const previous = frames.at(-1) || null;
  const order = frames.length;
  const duration = normalizeStepDuration(previous?.durationSeconds ?? previous?.duration ?? 3);

  return {
    id: createNextCuadroId(frames),
    name: `Cuadro ${order + 1}`,
    order,
    duration,
    durationSeconds: duration,
    elements: cloneStrokes(getFrameElements(previous || {})),
    thumbnail: String(previous?.thumbnail || ''),
    thumbnailWidth: Number(previous?.thumbnailWidth) || 0,
    thumbnailHeight: Number(previous?.thumbnailHeight) || 0,
    thumbnailVersion: Number(previous?.thumbnailVersion) || 0,
  };
}

/**
 * @param {object} sequence
 * @returns {object}
 */
export function createFrameFromPrevious(sequence = {}) {
  return createCuadroFromPrevious(sequence);
}

/**
 * @param {number} value
 * @returns {number}
 */
function clampProgress(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

/**
 * @param {number} value
 * @returns {number}
 */
function easeInOut(value) {
  const progress = clampProgress(value);
  return progress < 0.5
    ? 2 * progress * progress
    : 1 - ((-2 * progress + 2) ** 2) / 2;
}

/**
 * @param {number} from
 * @param {number} to
 * @param {number} progress
 * @returns {number}
 */
function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

/**
 * @param {unknown} from
 * @param {unknown} to
 * @param {number} progress
 * @returns {number|undefined}
 */
function interpolateNumber(from, to, progress) {
  const start = Number(from);
  const end = Number(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return Math.round(lerp(start, end, progress) * 1000) / 1000;
}

/**
 * @param {object} start
 * @param {object|null|undefined} end
 * @returns {boolean}
 */
function canInterpolateStroke(start, end) {
  return Boolean(
    start?.id
      && end?.id
      && start.id === end.id
      && start.tool === end.tool
      && Array.isArray(start.points)
      && Array.isArray(end.points)
      && start.points.length > 0
      && start.points.length === end.points.length
  );
}

/**
 * @param {object} start
 * @param {object} end
 * @param {number} progress
 * @returns {object}
 */
function interpolateStroke(start, end, progress) {
  const eased = easeInOut(progress);
  const next = {
    ...start,
    points: start.points.map((point, index) => ({
      x: interpolateNumber(point.x, end.points[index]?.x, eased) ?? (Number(point.x) || 0),
      y: interpolateNumber(point.y, end.points[index]?.y, eased) ?? (Number(point.y) || 0),
    })),
  };
  const width = interpolateNumber(start.width, end.width, eased);
  const radius = interpolateNumber(start.radius, end.radius, eased);
  const fontSize = interpolateNumber(start.fontSize, end.fontSize, eased);
  if (width !== undefined) next.width = width;
  if (radius !== undefined) next.radius = radius;
  if (fontSize !== undefined) next.fontSize = fontSize;
  return next;
}

/**
 * @param {Array<object>} startStrokes
 * @param {Array<object>} endStrokes
 * @param {number} progress
 * @returns {Array<object>}
 */
function interpolateStrokes(startStrokes = [], endStrokes = [], progress = 0) {
  const endById = new Map(endStrokes.map(stroke => [stroke.id, stroke]));
  return startStrokes.map((stroke) => {
    const nextStroke = endById.get(stroke.id);
    return canInterpolateStroke(stroke, nextStroke)
      ? interpolateStroke(stroke, nextStroke, progress)
      : stroke;
  });
}

/**
 * @param {object} step
 * @param {number} index
 * @param {number} fallbackDuration
 * @returns {object}
 */
function normalizeStep(step = {}, index = 0, fallbackDuration = DEFAULT_STEP_DURATION_SECONDS) {
  return {
    id: String(step.id || `step-${index + 1}`),
    label: String(step.label || `Etapa ${index + 1}`).trim().slice(0, 40) || `Etapa ${index + 1}`,
    durationSeconds: normalizeStepDuration(step.durationSeconds, fallbackDuration),
    strokes: cloneStrokes(step.strokes),
  };
}

/**
 * @param {object} drawing
 * @returns {Array<object>}
 */
export function normalizeDrawingSequenceSteps(drawing = {}) {
  const sourceSteps = Array.isArray(drawing.steps)
    ? drawing.steps
    : Array.isArray(drawing.sequence?.steps)
      ? drawing.sequence.steps
      : [];

  if (sourceSteps.length) {
    return sourceSteps.map((step, index) => normalizeStep(step, index));
  }

  return [
    normalizeStep({
      id: 'step-1',
      label: 'Etapa 1',
      durationSeconds: drawing.durationSeconds,
      strokes: drawing.strokes,
    }, 0, Number.isFinite(Number(drawing.durationSeconds)) ? Number(drawing.durationSeconds) : 3),
  ];
}

/**
 * @param {object} drawing
 * @returns {number}
 */
export function getDrawingSequenceDuration(drawing = {}) {
  const steps = normalizeDrawingSequenceSteps(drawing);
  const timedSteps = steps.length > 1 ? steps.slice(0, -1) : steps;
  const total = timedSteps.reduce((sum, step) => sum + normalizeStepDuration(step.durationSeconds), 0);
  return Math.round(total * 10) / 10;
}

/**
 * @param {object} drawing
 * @param {number} elapsedSeconds
 * @returns {object|null}
 */
export function getDrawingSequenceStepAtTime(drawing = {}, elapsedSeconds = 0) {
  const steps = normalizeDrawingSequenceSteps(drawing);
  if (!steps.length) return null;
  if (steps.length === 1) return steps[0];
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  let cursor = 0;

  for (let index = 0; index < steps.length - 1; index += 1) {
    const step = steps[index];
    const end = cursor + normalizeStepDuration(step.durationSeconds);
    if (elapsed < end) return step;
    cursor = end;
  }

  return steps[steps.length - 1];
}

/**
 * @param {object} drawing
 * @param {number} elapsedSeconds
 * @returns {{from: object|null, to: object|null, progress: number}}
 */
function getDrawingSequenceTransitionAtTime(drawing = {}, elapsedSeconds = 0) {
  const steps = normalizeDrawingSequenceSteps(drawing);
  if (!steps.length) return { from: null, to: null, progress: 1 };
  if (steps.length === 1) return { from: steps[0], to: null, progress: 1 };

  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  let cursor = 0;
  for (let index = 0; index < steps.length - 1; index += 1) {
    const from = steps[index];
    const to = steps[index + 1];
    const durationSeconds = normalizeStepDuration(from.durationSeconds);
    const end = cursor + durationSeconds;
    if (elapsed < end) {
      return {
        from,
        to,
        progress: clampProgress((elapsed - cursor) / durationSeconds),
      };
    }
    cursor = end;
  }

  return { from: steps[steps.length - 1], to: null, progress: 1 };
}

/**
 * @param {object} drawing
 * @param {number} elapsedSeconds
 * @returns {Array<object>}
 */
export function getDrawingSequenceStrokesAtTime(drawing = {}, elapsedSeconds = 0) {
  const transition = getDrawingSequenceTransitionAtTime(drawing, elapsedSeconds);
  if (!transition.from) return [];
  if (!transition.to) return cloneStrokes(transition.from.strokes);
  return cloneStrokes(interpolateFrame(
    { strokes: transition.from.strokes },
    { strokes: transition.to.strokes },
    transition.progress
  ).strokes || []);
}
