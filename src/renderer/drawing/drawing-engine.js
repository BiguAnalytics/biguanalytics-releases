// @ts-check

const HISTORY_LIMIT = 20;
const MARKER_TOOLS = new Set(['player', 'ball', 'cone', 'pad']);

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
  const stroke = {
    id: options.id || createId(),
    tool,
    color: options.color || '#FFFFFF',
    width: Math.max(1, Number(options.width) || 3),
    points: Array.isArray(options.points) ? options.points.map(point => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 })) : [],
    text: String(options.text || ''),
    fontSize: Math.max(12, Number(options.fontSize) || 24),
    createdAt: options.createdAt || new Date().toISOString(),
  };
  if (MARKER_TOOLS.has(tool)) stroke.radius = Math.max(12, Number(options.radius) || 18);
  return stroke;
}

/**
 * @param {object} stroke
 * @returns {{x: number, y: number, width: number, height: number}|null}
 */
export function getStrokeBounds(stroke) {
  const points = Array.isArray(stroke?.points) ? stroke.points : [];
  if (!points.length) return null;
  if (MARKER_TOOLS.has(stroke.tool)) {
    const radius = Math.max(12, Number(stroke.radius) || 18);
    return {
      x: points[0].x - radius,
      y: points[0].y - radius,
      width: radius * 2,
      height: radius * 2,
    };
  }
  if (stroke.tool === 'text') {
    const fontSize = Number(stroke.fontSize) || 24;
    return {
      x: points[0].x,
      y: points[0].y - fontSize,
      width: Math.max(40, String(stroke.text || '').length * fontSize * 0.62),
      height: fontSize + 6,
    };
  }
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
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

  if (MARKER_TOOLS.has(stroke.tool)) {
    const radius = Math.max(12, Number(stroke.radius) || 18);
    return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= radius + hitTolerance;
  }

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
 * @returns {object|null}
 */
export function findStrokeAtPoint(strokes, point, tolerance = 8) {
  const index = [...strokes].reverse().findIndex(stroke => hitTestStroke(stroke, point, tolerance));
  return index < 0 ? null : strokes[strokes.length - 1 - index];
}

/**
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function normalizeRect(rect) {
  const x = Math.min(Number(rect.x) || 0, (Number(rect.x) || 0) + (Number(rect.width) || 0));
  const y = Math.min(Number(rect.y) || 0, (Number(rect.y) || 0) + (Number(rect.height) || 0));
  return {
    x,
    y,
    width: Math.abs(Number(rect.width) || 0),
    height: Math.abs(Number(rect.height) || 0),
  };
}

/**
 * @param {{x: number, y: number, width: number, height: number}} bounds
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {boolean}
 */
function boundsInsideRect(bounds, rect) {
  return bounds.x >= rect.x
    && bounds.y >= rect.y
    && bounds.x + bounds.width <= rect.x + rect.width
    && bounds.y + bounds.height <= rect.y + rect.height;
}

/**
 * @param {Array<object>} strokes
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {Array<object>}
 */
export function findStrokesInRect(strokes, rect) {
  const normalized = normalizeRect(rect);
  return strokes.filter((stroke) => {
    const bounds = getStrokeBounds(stroke);
    return bounds ? boundsInsideRect(bounds, normalized) : false;
  });
}

/**
 * @param {object} stroke
 * @param {number} dx
 * @param {number} dy
 * @returns {object}
 */
export function moveStroke(stroke, dx, dy) {
  return {
    ...stroke,
    points: (stroke.points || []).map(point => ({
      x: point.x + dx,
      y: point.y + dy,
    })),
  };
}

/**
 * @param {Array<object>} strokes
 * @param {Array<string>} ids
 * @param {number} dx
 * @param {number} dy
 * @returns {Array<object>}
 */
export function moveStrokes(strokes, ids, dx, dy) {
  const selected = new Set(ids);
  return strokes.map(stroke => (selected.has(stroke.id) ? moveStroke(stroke, dx, dy) : stroke));
}

/**
 * @param {Array<object>} strokes
 * @param {Array<string>} ids
 * @returns {Array<object>}
 */
export function removeStrokesByIds(strokes, ids) {
  const selected = new Set(ids);
  return strokes.filter(stroke => !selected.has(stroke.id));
}

/**
 * @param {object} stroke
 * @returns {{x: number, y: number}}
 */
function getStrokeCenter(stroke) {
  const points = Array.isArray(stroke?.points) ? stroke.points : [];
  if (!points.length) return { x: 0, y: 0 };
  if (MARKER_TOOLS.has(stroke.tool) || stroke.tool === 'text') return { ...points[0] };
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

/**
 * @param {object} stroke
 * @param {number} factor
 * @returns {object}
 */
function scaleStroke(stroke, factor) {
  const scale = Math.max(0.25, Math.min(4, Number(factor) || 1));
  const center = getStrokeCenter(stroke);
  const next = {
    ...stroke,
    width: Math.max(1, (Number(stroke.width) || 1) * scale),
    points: (stroke.points || []).map(point => ({
      x: center.x + (point.x - center.x) * scale,
      y: center.y + (point.y - center.y) * scale,
    })),
  };
  if (MARKER_TOOLS.has(stroke.tool)) next.radius = Math.max(8, (Number(stroke.radius) || 18) * scale);
  if (stroke.tool === 'text') next.fontSize = Math.max(10, (Number(stroke.fontSize) || 24) * scale);
  return next;
}

/**
 * @param {Array<object>} strokes
 * @param {Array<string>} ids
 * @param {number} factor
 * @returns {Array<object>}
 */
export function scaleStrokes(strokes, ids, factor) {
  const selected = new Set(ids);
  if (!selected.size) return strokes;
  return strokes.map(stroke => (selected.has(stroke.id) ? scaleStroke(stroke, factor) : stroke));
}

/**
 * @param {Array<object>} strokes
 * @param {{x: number, y: number}} point
 * @param {number} tolerance
 * @returns {Array<object>}
 */
export function eraseStrokeAtPoint(strokes, point, tolerance = 8) {
  const selected = findStrokeAtPoint(strokes, point, tolerance);
  if (!selected) return strokes;
  const removeIndex = strokes.findIndex(stroke => stroke.id === selected.id);
  return strokes.filter((_, strokeIndex) => strokeIndex !== removeIndex);
}

/**
 * @param {Array<object>} strokes
 * @param {Array<{x: number, y: number}>} points
 * @param {number} tolerance
 * @returns {Array<object>}
 */
export function eraseStrokesAlongPath(strokes, points = [], tolerance = 8) {
  if (!Array.isArray(points) || points.length === 0) return strokes;
  const sampleDistance = Math.max(4, tolerance);
  const removeIds = new Set();

  strokes.forEach((stroke) => {
    if (points.some(point => hitTestStroke(stroke, point, tolerance))) {
      removeIds.add(stroke.id);
      return;
    }

    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      const samples = Math.max(1, Math.ceil(distance / sampleDistance));

      for (let step = 1; step <= samples; step += 1) {
        const t = step / samples;
        const point = {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        };
        if (hitTestStroke(stroke, point, tolerance)) {
          removeIds.add(stroke.id);
          return;
        }
      }
    }
  });

  return removeIds.size ? strokes.filter(stroke => !removeIds.has(stroke.id)) : strokes;
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
 * @param {string} color
 * @returns {string}
 */
function readableTextColor(color) {
  const hex = String(color || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#050917';
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 150 ? '#050917' : '#FFFFFF';
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} stroke
 */
function drawBall(ctx, stroke) {
  const point = stroke.points[0];
  const radius = Math.max(12, Number(stroke.radius) || 18);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(-0.35);
  ctx.fillStyle = '#B9794B';
  ctx.strokeStyle = 'rgba(255,255,255,0.86)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.95, radius * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-radius * 0.35, 0);
  ctx.lineTo(radius * 0.35, 0);
  ctx.stroke();
  [-0.18, 0, 0.18].forEach(offset => {
    ctx.beginPath();
    ctx.moveTo(offset * radius, -radius * 0.22);
    ctx.lineTo(offset * radius, radius * 0.22);
    ctx.stroke();
  });
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} stroke
 */
function drawCone(ctx, stroke) {
  const point = stroke.points[0];
  const radius = Math.max(12, Number(stroke.radius) || 18);
  ctx.fillStyle = '#F5B63D';
  ctx.strokeStyle = 'rgba(5,9,17,0.42)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(point.x, point.y - radius);
  ctx.lineTo(point.x + radius * 0.82, point.y + radius);
  ctx.lineTo(point.x - radius * 0.82, point.y + radius);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(point.x - radius * 0.42, point.y + radius * 0.2, radius * 0.84, radius * 0.18);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} stroke
 */
function drawPad(ctx, stroke) {
  const point = stroke.points[0];
  const radius = Math.max(12, Number(stroke.radius) || 18);
  const x = point.x - radius;
  const y = point.y - radius;
  const size = radius * 2;
  ctx.fillStyle = '#4D7CFE';
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect?.(x, y, size, size, radius * 0.28);
  if (!ctx.roundRect) ctx.rect(x, y, size, size);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(5,9,17,0.42)';
  ctx.beginPath();
  ctx.moveTo(point.x - radius * 0.48, point.y);
  ctx.lineTo(point.x + radius * 0.48, point.y);
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

  if (stroke.tool === 'player') {
    const radius = Math.max(12, Number(stroke.radius) || 18);
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, (Number(stroke.width) || 3) * 0.8);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.stroke();
    ctx.fillStyle = readableTextColor(stroke.color || '#FFFFFF');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.max(13, radius * 0.9)}px Arial, sans-serif`;
    ctx.fillText(String(stroke.text || ''), points[0].x, points[0].y + 0.5);
    ctx.restore();
    return;
  }

  if (stroke.tool === 'ball') {
    drawBall(ctx, stroke);
    ctx.restore();
    return;
  }

  if (stroke.tool === 'cone') {
    drawCone(ctx, stroke);
    ctx.restore();
    return;
  }

  if (stroke.tool === 'pad') {
    drawPad(ctx, stroke);
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
