// @ts-check

export const BIGU_LOGO_SRC = new URL('./assets/bigu-logo.svg', import.meta.url).href;

/**
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function escapeAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * @param {{className?: string, alt?: string, ariaHidden?: boolean}} [options]
 * @returns {string}
 */
export function renderBiguLogo(options = {}) {
  const className = options.className || 'access-brand-mark';
  const alt = options.alt || '';
  const ariaHidden = options.ariaHidden === true ? ' aria-hidden="true"' : '';
  return `<img class="${escapeAttribute(className)}" src="${escapeAttribute(BIGU_LOGO_SRC)}" alt="${escapeAttribute(alt)}"${ariaHidden} data-bigu-logo decoding="async">`;
}

/**
 * @param {ParentNode|null|undefined} root
 */
export function wireBiguLogoFallback(root = document) {
  root?.querySelectorAll?.('img[data-bigu-logo]').forEach((image) => {
    const hideBrokenLogo = () => {
      image.hidden = true;
      image.setAttribute('aria-hidden', 'true');
    };
    image.addEventListener('error', hideBrokenLogo, { once: true });
    if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement && image.complete && image.naturalWidth === 0) {
      hideBrokenLogo();
    }
  });
}
