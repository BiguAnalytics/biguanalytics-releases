import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { getZones } from '../tag-popup.js';

const tagPopupCss = readFileSync(new URL('../../../styles/components/tag-popup.css', import.meta.url), 'utf8');

describe('tag popup field zones', () => {
  it('orders the 15 field zones vertically by column', () => {
    expect(getZones().map(zone => zone.label)).toEqual([
      '1', '4', '7', '10', '13',
      '2', '5', '8', '11', '14',
      '3', '6', '9', '12', '15',
    ]);
  });

  it('renders the zone selector as a rugby field graphic', () => {
    expect(tagPopupCss).toMatch(/\.tag-popup-field-grid\s*{[^}]*grid-template-columns:\s*repeat\(5,\s*1fr\);/s);
    expect(tagPopupCss).toMatch(/\.tag-popup-field-grid::before\s*{[^}]*linear-gradient\(90deg,/s);
    expect(tagPopupCss).toMatch(/\.tag-popup-zone-cell\s*{[^}]*z-index:\s*1;/s);
  });
});
