// @ts-check
import { openModal } from './modal.js';

/**
 * Opens a confirmation dialog for destructive actions.
 * @param {object} options
 * @param {string} options.title - Dialog title
 * @param {string|HTMLElement} options.message - Confirmation message
 * @param {string|HTMLElement} [options.warning] - Additional warning text
 * @param {string} [options.confirmLabel] - Confirm button label
 * @param {function} options.onConfirm - Called when confirmed
 * @param {function} [options.onCancel] - Called when cancelled
 */
export function openConfirmDialog({ title, message, warning = '', confirmLabel = 'Eliminar', onConfirm, onCancel }) {
  const body = document.createElement('div');
  const messageEl = document.createElement('p');
  messageEl.className = 'confirm-dialog-message';
  if (message instanceof HTMLElement) {
    messageEl.appendChild(message);
  } else {
    messageEl.textContent = message;
  }
  body.appendChild(messageEl);

  if (warning) {
    const warningEl = document.createElement('p');
    warningEl.className = 'confirm-dialog-warning';
    if (warning instanceof HTMLElement) {
      warningEl.appendChild(warning);
    } else {
      warningEl.textContent = warning;
    }
    body.appendChild(warningEl);
  }

  const modal = openModal({
    title,
    body,
    className: 'confirm-dialog',
    buttons: [
      {
        label: 'Cancelar',
        className: 'btn-secondary',
        onClick: () => {
          modal.close();
          if (onCancel) onCancel();
        },
      },
      {
        label: confirmLabel,
        className: 'btn-danger',
        id: 'confirm-action-btn',
        onClick: () => {
          modal.close();
          onConfirm();
        },
      },
    ],
  });

  return modal;
}
