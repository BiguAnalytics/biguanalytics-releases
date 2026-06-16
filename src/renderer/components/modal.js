// @ts-check

let modalIdCounter = 0;

const MODAL_FOCUS_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * @param {Element} element
 * @returns {boolean}
 */
function isFocusableModalElement(element) {
  if (!element || element.getAttribute?.('aria-hidden') === 'true') return false;
  if (element.hasAttribute?.('hidden')) return false;
  if ('disabled' in element && element.disabled) return false;
  if ('offsetParent' in element && element.offsetParent === null) return false;
  return typeof element.focus === 'function';
}

/**
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
function getFocusableModalElements(container) {
  return Array.from(container.querySelectorAll(MODAL_FOCUS_SELECTOR))
    .filter(isFocusableModalElement);
}

/**
 * @param {HTMLElement} container
 */
function focusInitialModalElement(container) {
  const preferred = container.querySelector('[autofocus], [data-modal-initial-focus]');
  const target = isFocusableModalElement(preferred)
    ? preferred
    : getFocusableModalElements(container)[0] || container;
  target.focus?.({ preventScroll: true });
}

/**
 * @param {HTMLElement} container
 * @param {KeyboardEvent} event
 */
function trapModalFocus(container, event) {
  if (event.key !== 'Tab') return;
  const focusable = getFocusableModalElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
    return;
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
    return;
  }

  if (!focusable.includes(/** @type {HTMLElement} */ (active))) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

/**
 * Opens a modal with the given content.
 * @param {object} options
 * @param {string} options.title - Modal title
 * @param {string|HTMLElement} options.body - Modal body content (plain text string or DOM element)
 * @param {Array<{label: string, className: string, onClick: function}>} [options.buttons] - Footer buttons
 * @param {function} [options.onClose] - Called when modal is closed
 * @param {string} [options.className] - Additional class for the overlay
 * @param {boolean} [options.allowHtml] - Allows static, controlled HTML body content
 * @param {boolean} [options.closeOnEscape] - Allows closing with Escape
 * @returns {{ close: function }} Controller object
 */
export function openModal({ title, body, buttons = [], onClose, className = '', allowHtml = false, closeOnEscape = true }) {
  const previousActiveElement = /** @type {HTMLElement|null} */ (document.activeElement);
  const titleId = `modal-title-${++modalIdCounter}`;
  const overlay = document.createElement('div');
  overlay.className = `modal-overlay ${className}`.trim();
  overlay.id = 'modal-overlay';

  const container = document.createElement('div');
  container.className = 'modal-container';
  container.tabIndex = -1;
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', titleId);

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  const titleEl = document.createElement('h2');
  titleEl.id = titleId;
  titleEl.className = 'modal-title';
  titleEl.textContent = title;
  const closeButton = document.createElement('button');
  closeButton.className = 'modal-close';
  closeButton.id = 'modal-close-btn';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Cerrar');
  closeButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  header.appendChild(titleEl);
  header.appendChild(closeButton);

  // Body
  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  if (typeof body === 'string') {
    if (allowHtml) {
      bodyEl.innerHTML = body;
    } else {
      bodyEl.textContent = body;
    }
  } else {
    bodyEl.appendChild(body);
  }

  // Footer
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  buttons.forEach(btn => {
    const button = document.createElement('button');
    button.className = `btn ${btn.className}`;
    button.textContent = btn.label;
    button.addEventListener('click', btn.onClick);
    if (btn.id) button.id = btn.id;
    footer.appendChild(button);
  });

  container.appendChild(header);
  container.appendChild(bodyEl);
  if (buttons.length > 0) {
    container.appendChild(footer);
  }
  overlay.appendChild(container);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  window.requestAnimationFrame?.(() => focusInitialModalElement(container));
  if (!window.requestAnimationFrame) focusInitialModalElement(container);

  function handleKeydown(e) {
    trapModalFocus(container, e);
    if (e.key === 'Escape' && closeOnEscape) {
      e.preventDefault();
      close();
    }
  }
  document.addEventListener('keydown', handleKeydown);

  let closed = false;

  /** Closes the modal with exit animation */
  function close() {
    if (closed) return;
    closed = true;
    overlay.classList.add('closing');
    document.removeEventListener('keydown', handleKeydown);
    setTimeout(() => {
      overlay.remove();
      document.body.classList.remove('modal-open');
      previousActiveElement?.focus?.();
      if (onClose) onClose();
    }, 150);
  }

  // Close on X button
  header.querySelector('#modal-close-btn').addEventListener('click', close);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  return { close };
}
