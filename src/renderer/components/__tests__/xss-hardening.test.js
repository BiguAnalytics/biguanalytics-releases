import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const confirmDialogSource = fs.readFileSync(new URL('../confirm-dialog.js', import.meta.url), 'utf8');
const modalSource = fs.readFileSync(new URL('../modal.js', import.meta.url), 'utf8');
const homeSource = fs.readFileSync(new URL('../../views/home.js', import.meta.url), 'utf8');

describe('renderer XSS hardening', () => {
  it('does not pass raw confirmation messages as HTML', () => {
    expect(confirmDialogSource).not.toContain('${message}');
    expect(confirmDialogSource).not.toContain('${warning');
    expect(confirmDialogSource).toContain('textContent');
  });

  it('does not render modal titles or DOM bodies as raw user HTML', () => {
    expect(modalSource).not.toContain('<h2 class="modal-title">${title}</h2>');
    expect(modalSource).toContain('titleEl.textContent');
    expect(modalSource).toContain('bodyEl.textContent = body');
  });

  it('does not interpolate match names or error messages into Home HTML', () => {
    expect(homeSource).not.toContain('<strong>${m.homeTeam} vs ${m.awayTeam}</strong>');
    expect(homeSource).not.toContain('${error.message ||');
    expect(homeSource).toContain('createErrorState');
    expect(homeSource).toContain('createDeleteMatchMessage');
  });
});
