import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  FOUR_SECTOR_FIELD_ZONES,
  mapLegacyZoneToFourSector,
  normalizeFieldZone,
} = require('../field-zones.js');

describe('main field zone normalization', () => {
  it('shares the four canonical sector ids used by analytics and PDF export', () => {
    expect(FOUR_SECTOR_FIELD_ZONES.map(zone => zone.id)).toEqual([
      'own_22',
      'own_half',
      'opp_half',
      'opp_22',
    ]);
  });

  it('maps persisted legacy 15-zone data into the four-sector model', () => {
    expect(mapLegacyZoneToFourSector('Z2')).toMatchObject({ id: 'own_22', label: '22 propia' });
    expect(mapLegacyZoneToFourSector('Z5')).toMatchObject({ id: 'own_half', label: 'Campo propio' });
    expect(mapLegacyZoneToFourSector('Z10')).toMatchObject({ id: 'opp_half', label: 'Campo rival' });
    expect(mapLegacyZoneToFourSector('Z14')).toMatchObject({ id: 'opp_22', label: '22 rival' });
  });

  it('keeps unknown legacy zone ids available with a legacy label', () => {
    expect(normalizeFieldZone({ zone: 'C3' })).toMatchObject({
      id: 'C3',
      label: 'Zona legacy',
      originalZone: 'C3',
      legacy: true,
    });
    expect(normalizeFieldZone({ id: 'event-1', type: 'ruck' })).toBeNull();
  });
});
