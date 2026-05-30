// @ts-check

/**
 * Opens a modal with the given content.
 * @param {object} options
 * @param {string} options.title - Modal title
 * @param {string|HTMLElement} options.body - Modal body content (HTML string or DOM element)
 * @param {Array<{label: string, className: string, onClick: function}>} [options.buttons] - Footer buttons
 * @param {function} [options.onClose] - Called when modal is closed
 * @param {string} [options.className] - Additional class for the overlay
 * @returns {{ close: function }} Controller object
 */
export function openModal({ title, body, buttons = [], onClose, className = '' }) {
  const overlay = document.createElement('div');
  overlay.className = `modal-overlay ${className}`.trim();
  overlay.id = 'modal-overlay';

  const container = document.createElement('div');
  container.className = 'modal-container';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `
    <h2 class="modal-title">${title}</h2>
    <button class="modal-close" id="modal-close-btn">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;

  // Body
  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  if (typeof body === 'string') {
    bodyEl.innerHTML = body;
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

  /** Closes the modal with exit animation */
  function close() {
    overlay.classList.add('closing');
    setTimeout(() => {
      overlay.remove();
      if (onClose) onClose();
    }, 150);
  }

  // Close on X button
  header.querySelector('#modal-close-btn').addEventListener('click', close);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Close on Escape
  function handleEscape(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', handleEscape);
    }
  }
  document.addEventListener('keydown', handleEscape);

  return { close };
}
