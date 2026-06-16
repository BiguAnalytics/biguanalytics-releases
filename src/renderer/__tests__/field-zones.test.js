import { describe, expect, it } from 'vitest';

import {
  FOUR_SECTOR_FIELD_ZONES,
  mapLegacyZoneToFourSector,
  normalizeFieldZone,
} from '../field-zones.js';

describe('renderer field zone normalization', () => {
  it('exposes the four tagging sectors with stable ids and labels', () => {
    expect(FOUR_SECTOR_FIELD_ZONES.map(zone => [zone.id, zone.label, zone.key])).toEqual([
      ['own_22', '22 propia', '1'],
      ['own_half', 'Campo propio', '2'],
      ['opp_half', 'Campo rival', '3'],
      ['opp_22', '22 rival', '4'],
    ]);
  });

  it('maps legacy Z1-Z15 zones into the four sectors', () => {
    expect(mapLegacyZoneToFourSector('Z1')).toMatchObject({ id: 'own_22', label: '22 propia' });
    expect(mapLegacyZoneToFourSector('Z6')).toMatchObject({ id: 'own_half', label: 'Campo propio' });
    expect(mapLegacyZoneToFourSector('Z9')).toMatchObject({ id: 'opp_half', label: 'Campo rival' });
    expect(mapLegacyZoneToFourSector('Z15')).toMatchObject({ id: 'opp_22', label: '22 rival' });
  });

  it('normalizes new, legacy, unknown legacy and empty zones without dropping old values', () => {
    expect(normalizeFieldZone('opp_22')).toMatchObject({
      id: 'opp_22',
      label: '22 rival',
      legacy: false,
    });
    expect(normalizeFieldZone('Z13')).toMatchObject({
      id: 'opp_22',
      label: '22 rival',
      originalZone: 'Z13',
      legacy: true,
    });
    expect(normalizeFieldZone('C3')).toMatchObject({
      id: 'C3',
      label: 'Zona legacy',
      originalZone: 'C3',
      legacy: true,
    });
    expect(normalizeFieldZone({ id: 'event-1', type: 'ruck' })).toBeNull();
    expect(normalizeFieldZone(null)).toBeNull();
  });
});
