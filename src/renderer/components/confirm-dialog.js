// @ts-check
import { openModal } from './modal.js';

/**
 * Opens a confirmation dialog for destructive actions.
 * @param {object} options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Confirmation message
 * @param {string} [options.warning] - Additional warning text
 * @param {string} [options.confirmLabel] - Confirm button label
 * @param {function} options.onConfirm - Called when confirmed
 * @param {function} [options.onCancel] - Called when cancelled
 */
export function openConfirmDialog({ title, message, warning = '', confirmLabel = 'Eliminar', onConfirm, onCancel }) {
  const bodyHtml = `
    <p class="confirm-dialog-message">${message}</p>
    ${warning ? `<p class="confirm-dialog-warning">${warning}</p>` : ''}
  `;

  const modal = openModal({
    title,
    body: bodyHtml,
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
