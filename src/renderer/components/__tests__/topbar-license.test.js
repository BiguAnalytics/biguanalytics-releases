import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const topbarSource = readFileSync(new URL('../topbar.js', import.meta.url), 'utf8');
const topbarCss = readFileSync(new URL('../../../styles/components/topbar.css', import.meta.url), 'utf8');

describe('topbar license badge', () => {
  it('renders a discreet license badge for online, offline grace and expired states', () => {
    expect(topbarSource).toContain('LicenseBadge');
    expect(topbarSource).toContain('Online verificado');
    expect(topbarSource).toContain('Offline disponible hasta');
    expect(topbarSource).toContain('Offline vencido');
    expect(topbarCss).toContain('.topbar-license');
  });

  it('supports every startup license verification badge state', () => {
    [
      'LOCAL VERIFICADO',
      'VERIFICANDO ONLINE',
      'ONLINE VERIFICADO',
      'MODO OFFLINE',
      'SESIÓN EXPIRADA',
      'LICENCIA VENCIDA',
    ].forEach((label) => {
      expect(topbarSource).toContain(label);
    });
  });
});
