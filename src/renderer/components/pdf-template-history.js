// @ts-check

const DEFAULT_HISTORY_LIMIT = 80;

/**
 * @param {object} value
 * @returns {object}
 */
function cloneSnapshot(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function sameSnapshot(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

/**
 * @param {object} initialState
 * @param {{limit?: number}} [options]
 * @returns {{current: function(): object, push: function(object): object, undo: function(): object, redo: function(): object, canUndo: function(): boolean, canRedo: function(): boolean}}
 */
export function createPdfTemplateHistory(initialState = {}, options = {}) {
  const limit = Math.max(2, Math.round(Number(options.limit) || DEFAULT_HISTORY_LIMIT));
  let stack = [cloneSnapshot(initialState)];
  let index = 0;

  return {
    current() {
      return cloneSnapshot(stack[index]);
    },
    push(nextState) {
      const snapshot = cloneSnapshot(nextState);
      if (sameSnapshot(stack[index], snapshot)) return cloneSnapshot(stack[index]);
      stack = stack.slice(0, index + 1);
      stack.push(snapshot);
      if (stack.length > limit) {
        stack = stack.slice(stack.length - limit);
      }
      index = stack.length - 1;
      return cloneSnapshot(stack[index]);
    },
    undo() {
      if (index > 0) index -= 1;
      return cloneSnapshot(stack[index]);
    },
    redo() {
      if (index < stack.length - 1) index += 1;
      return cloneSnapshot(stack[index]);
    },
    canUndo() {
      return index > 0;
    },
    canRedo() {
      return index < stack.length - 1;
    },
  };
}
