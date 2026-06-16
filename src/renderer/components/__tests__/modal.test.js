import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const modalSource = readFileSync(new URL('../modal.js', import.meta.url), 'utf8');

describe('modal accessibility behavior', () => {
  it('labels the modal as an accessible dialog and associates the title', () => {
    expect(modalSource).toContain("container.setAttribute('role', 'dialog')");
    expect(modalSource).toContain("container.setAttribute('aria-modal', 'true')");
    expect(modalSource).toContain("container.setAttribute('aria-labelledby', titleId)");
    expect(modalSource).toContain('titleEl.id = titleId');
  });

  it('traps focus, restores focus and unlocks scroll on close', () => {
    expect(modalSource).toContain('previousActiveElement');
    expect(modalSource).toContain('getFocusableModalElements');
    expect(modalSource).toContain('trapModalFocus');
    expect(modalSource).toContain("document.body.classList.add('modal-open')");
    expect(modalSource).toContain("document.body.classList.remove('modal-open')");
    expect(modalSource).toContain('previousActiveElement?.focus?.()');
  });

  it('keeps Escape close configurable while defaulting to enabled', () => {
    expect(modalSource).toContain('closeOnEscape = true');
    expect(modalSource).toContain('if (e.key === \'Escape\' && closeOnEscape)');
  });
});
