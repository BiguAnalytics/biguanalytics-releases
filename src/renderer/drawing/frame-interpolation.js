// @ts-check

const TOP_LEVEL_NUMERIC_KEYS = [
  'x',
  'y',
  'x2',
  'y2',
  'cx',
  'cy',
  'width',
  'height',
  'radius',
  'fontSize',
];

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function clampProgress(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
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
  return Math.round((start + (end - start) * progress) * 1000) / 1000;
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
 * @param {object} element
 * @returns {string}
 */
function getElementType(element = {}) {
  return String(element.type || element.tool || '');
}

/**
 * @param {object} from
 * @param {object} to
 * @returns {boolean}
 */
function canInterpolateElement(from = {}, to = {}) {
  if (!from.id || !to.id || String(from.id) !== String(to.id)) return false;
  if (getElementType(from) !== getElementType(to)) return false;
  const fromPoints = Array.isArray(from.points) ? from.points : null;
  const toPoints = Array.isArray(to.points) ? to.points : null;
  return !fromPoints || !toPoints || fromPoints.length === toPoints.length;
}

/**
 * @param {object|undefined} from
 * @param {object|undefined} to
 * @param {number} progress
 * @returns {object|undefined}
 */
function interpolateGeometry(from, to, progress) {
  if (!from || !to) return clone(from || to);
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  const next = clone(progress >= 1 ? to : from);
  keys.forEach((key) => {
    const value = interpolateNumber(from[key], to[key], progress);
    if (value !== undefined) next[key] = value;
  });
  return next;
}

/**
 * @param {Array<object>|undefined} from
 * @param {Array<object>|undefined} to
 * @param {number} progress
 * @returns {Array<object>|undefined}
 */
function interpolatePoints(from, to, progress) {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length !== to.length) return clone(from || to);
  return from.map((point, index) => ({
    ...clone(progress >= 1 ? to[index] : point),
    x: interpolateNumber(point.x, to[index]?.x, progress) ?? (Number(point.x) || 0),
    y: interpolateNumber(point.y, to[index]?.y, progress) ?? (Number(point.y) || 0),
  }));
}

/**
 * @param {object} from
 * @param {object} to
 * @param {number} progress
 * @returns {object}
 */
function interpolateElement(from, to, progress) {
  if (progress >= 1) return clone(to);
  const next = clone(from);
  TOP_LEVEL_NUMERIC_KEYS.forEach((key) => {
    const value = interpolateNumber(from[key], to[key], progress);
    if (value !== undefined) next[key] = value;
  });
  if (Array.isArray(from.points) && Array.isArray(to.points) && from.points.length === to.points.length) {
    next.points = interpolatePoints(from.points, to.points, progress);
  }
  if (from.geometry || to.geometry) {
    next.geometry = interpolateGeometry(from.geometry, to.geometry, progress);
  }
  return next;
}

/**
 * @param {object} fromFrame
 * @param {object} toFrame
 * @param {number} progress
 * @returns {object}
 */
export function interpolateFrame(fromFrame = {}, toFrame = {}, progress = 0) {
  const sourceFrame = fromFrame || {};
  const targetFrame = toFrame || {};
  const safeProgress = clampProgress(progress);
  const fromElements = getFrameElements(sourceFrame);
  const toElements = getFrameElements(targetFrame);
  const toById = new Map(toElements.map(element => [String(element.id), element]));
  const fromIds = new Set(fromElements.map(element => String(element.id)));
  const elements = [];

  fromElements.forEach((element) => {
    const target = toById.get(String(element.id));
    if (!target) {
      if (safeProgress < 1) elements.push(clone(element));
      return;
    }
    elements.push(canInterpolateElement(element, target)
      ? interpolateElement(element, target, safeProgress)
      : clone(safeProgress >= 1 ? target : element));
  });

  if (safeProgress >= 1) {
    toElements.forEach((element) => {
      if (!fromIds.has(String(element.id))) elements.push(clone(element));
    });
  }

  const result = {
    ...clone(safeProgress >= 1 ? targetFrame : sourceFrame),
    elements,
  };
  if (Array.isArray(sourceFrame.strokes) || Array.isArray(targetFrame.strokes)) result.strokes = clone(elements);
  return result;
}
