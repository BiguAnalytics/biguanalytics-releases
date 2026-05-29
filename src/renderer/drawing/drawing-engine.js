// @ts-check

const HISTORY_LIMIT = 20;

/**
 * @returns {string}
 */
function createId() {
  return globalThis.crypto?.randomUUID?.() || `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * @param {string} tool
 * @param {object} options
 * @returns {object}
 */
export function createStroke(tool, options = {}) {
  return {
    id: options.id || createId(),
    tool,
    color: options.color || '#FFFFFF',
    width: Math.max(1, Number(options.width) || 3),
    points: Array.isArray(options.points) ? options.points.map(point => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 })) : [],
    text: String(options.text || ''),
    fontSize: Math.max(12, Number(options.fontSize) || 24),
    createdAt: options.createdAt || new Date().toISOString(),
  };
}

/**
 * @param {Array<{x: number, y: number}>} points
 * @returns {Array<{x: number, y: number}>}
 */
export function smoothFreehandPoints(points = []) {
  if (points.length <= 2) return [...points];
  const smoothed = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    smoothed.push({
      x: (previous.x + current.x) / 2,
      y: (previous.y + current.y) / 2,
    });
    smoothed.push(current);
  }
  return smoothed;
}

/**
 * @param {{x: number, y: number}} point
 * @param {{x: number, y: number}} start
 * @param {{x: number, y: number}} end
 * @returns {number}
 */
function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/**
 * @param {{x: number, y: number}} point
 * @param {{x: number, y: number}} start
 * @param {{x: number, y: number}} end
 * @param {number} tolerance
 * @returns {boolean}
 */
function hitTestRectOutline(point, start, end, tolerance) {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const inExpandedBounds = point.x >= minX - tolerance
    && point.x <= maxX + tolerance
    && point.y >= minY - tolerance
    && point.y <= maxY + tolerance;
  const inInnerBounds = point.x > minX + tolerance
    && point.x < maxX - tolerance
    && point.y > minY + tolerance
    && point.y < maxY - tolerance;
  return inExpandedBounds && !inInnerBounds;
}

/**
 * @param {{x: number, y: number}} point
 * @param {{x: number, y: number}} start
 * @param {{x: number, y: number}} end
 * @param {number} tolerance
 * @returns {boolean}
 */
function hitTestEllipseOutline(point, start, end, tolerance) {
  const radiusX = Math.abs(end.x - start.x) / 2;
  const radiusY = Math.abs(end.y - start.y) / 2;
  if (radiusX <= 0 || radiusY <= 0) return distanceToSegment(point, start, end) <= tolerance;
  const centerX = Math.min(start.x, end.x) + radiusX;
  const centerY = Math.min(start.y, end.y) + radiusY;
  const normalized = Math.sqrt(((point.x - centerX) / radiusX) ** 2 + ((point.y - centerY) / radiusY) ** 2);
  return Math.abs(normalized - 1) * Math.min(radiusX, radiusY) <= tolerance;
}

/**
 * @param {object} stroke
 * @param {{x: number, y: number}} point
 * @param {number} tolerance
 * @returns {boolean}
 */
export function hitTestStroke(stroke, point, tolerance = 8) {
  const points = Array.isArray(stroke?.points) ? stroke.points : [];
  if (points.length === 0) return false;
  const hitTolerance = tolerance + (Number(stroke.width) || 1) / 2;

  if (stroke.tool === 'text') {
    const origin = points[0];
    const width = Math.max(40, String(stroke.text || '').length * (Number(stroke.fontSize) || 24) * 0.62);
    const height = Number(stroke.fontSize) || 24;
    return point.x >= origin.x && point.x <= origin.x + width && point.y >= origin.y - height && point.y <= origin.y + 6;
  }

  if (stroke.tool === 'rect' && points.length >= 2) {
    return hitTestRectOutline(point, points[0], points[1], hitTolerance);
  }

  if (stroke.tool === 'ellipse' && points.length >= 2) {
    return hitTestEllipseOutline(point, points[0], points[1], hitTolerance);
  }

  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(point, points[index - 1], points[index]) <= hitTolerance) return true;
  }
  return false;
}

/**
 * @param {Array<object>} strokes
 * @param {{x: number, y: number}} point
 * @param {number} tolerance
 * @returns {Array<object>}
 */
export function eraseStrokeAtPoint(strokes, point, tolerance = 8) {
  const index = [...strokes].reverse().findIndex(stroke => hitTestStroke(stroke, point, tolerance));
  if (index < 0) return strokes;
  const removeIndex = strokes.length - 1 - index;
  return strokes.filter((_, strokeIndex) => strokeIndex !== removeIndex);
}

/**
 * @param {Array<object>} strokes
 * @returns {Array<object>}
 */
function cloneStrokes(strokes = []) {
  return JSON.parse(JSON.stringify(strokes));
}

/**
 * @param {{undo: Array<Array<object>>, redo: Array<Array<object>>}} history
 * @param {Array<object>} strokes
 * @returns {{undo: Array<Array<object>>, redo: Array<Array<object>>}}
 */
export function pushHistory(history, strokes) {
  return {
    undo: [...(history.undo || []), cloneStrokes(strokes)].slice(-HISTORY_LIMIT),
    redo: [],
  };
}

/**
 * @param {{undo: Array<Array<object>>, redo: Array<Array<object>>}} history
 * @param {Array<object>} strokes
 * @returns {{history: {undo: Array<Array<object>>, redo: Array<Array<object>>}, strokes: Array<object>}}
 */
export function undoHistory(history, strokes) {
  if (!history.undo?.length) return { history, strokes };
  const undo = [...history.undo];
  const previous = undo.pop();
  return {
    strokes: cloneStrokes(previous),
    history: {
      undo,
      redo: [cloneStrokes(strokes), ...(history.redo || [])].slice(0, HISTORY_LIMIT),
    },
  };
}

/**
 * @param {{undo: Array<Array<object>>, redo: Array<Array<object>>}} history
 * @param {Array<object>} strokes
 * @returns {{history: {undo: Array<Array<object>>, redo: Array<Array<object>>}, strokes: Array<object>}}
 */
export function redoHistory(history, strokes) {
  if (!history.redo?.length) return { history, strokes };
  const redo = [...history.redo];
  const next = redo.shift();
  return {
    strokes: cloneStrokes(next),
    history: {
      undo: [...(history.undo || []), cloneStrokes(strokes)].slice(-HISTORY_LIMIT),
      redo,
    },
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} stroke
 */
function drawArrowHead(ctx, stroke) {
  const points = stroke.points || [];
  if (points.length < 2) return;
  const end = points[points.length - 1];
  const start = points[points.length - 2];
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const length = Math.max(12, (Number(stroke.width) || 3) * 5);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - length * Math.cos(angle - Math.PI / 6), end.y - length * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - length * Math.cos(angle + Math.PI / 6), end.y - length * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} stroke
 */
export function drawStroke(ctx, stroke) {
  const points = stroke.points || [];
  if (points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = stroke.color || '#FFFFFF';
  ctx.fillStyle = stroke.color || '#FFFFFF';
  ctx.lineWidth = Math.max(1, Number(stroke.width) || 3);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'text') {
    ctx.font = `700 ${Number(stroke.fontSize) || 24}px Arial, sans-serif`;
    ctx.fillText(stroke.text || '', points[0].x, points[0].y);
    ctx.restore();
    return;
  }

  if ((stroke.tool === 'line' || stroke.tool === 'arrow') && points.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();
    if (stroke.tool === 'arrow') drawArrowHead(ctx, stroke);
    ctx.restore();
    return;
  }

  if (stroke.tool === 'freehand' && points.length >= 2) {
    const smoothed = smoothFreehandPoints(points);
    ctx.beginPath();
    ctx.moveTo(smoothed[0].x, smoothed[0].y);
    smoothed.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
    ctx.stroke();
    ctx.restore();
    return;
  }

  if ((stroke.tool === 'rect' || stroke.tool === 'ellipse') && points.length >= 2) {
    const [start, end] = points;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    ctx.beginPath();
    if (stroke.tool === 'rect') ctx.rect(x, y, width, height);
    else ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<object>} strokes
 */
export function drawStrokes(ctx, strokes = []) {
  strokes.forEach(stroke => drawStroke(ctx, stroke));
}

/**
 * @param {Array<object>} strokes
 * @param {{width?: number, height?: number}} canvas
 * @returns {object}
 */
export function serializeDrawing(strokes, canvas = {}) {
  return {
    canvas: {
      width: Number(canvas.width) || 0,
      height: Number(canvas.height) || 0,
    },
    strokes: cloneStrokes(strokes),
  };
}
