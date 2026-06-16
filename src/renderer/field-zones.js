// @ts-check

export const FOUR_SECTOR_FIELD_ZONES = Object.freeze([
  { id: 'own_22', label: '22 propia', key: '1', legacyZones: ['Z1', 'Z2', 'Z3'] },
  { id: 'own_half', label: 'Campo propio', key: '2', legacyZones: ['Z4', 'Z5', 'Z6'] },
  { id: 'opp_half', label: 'Campo rival', key: '3', legacyZones: ['Z7', 'Z8', 'Z9', 'Z10', 'Z11', 'Z12'] },
  { id: 'opp_22', label: '22 rival', key: '4', legacyZones: ['Z13', 'Z14', 'Z15'] },
]);

const SECTOR_BY_ID = new Map(FOUR_SECTOR_FIELD_ZONES.map(zone => [zone.id, zone]));
const LEGACY_ZONE_TO_SECTOR = new Map(
  FOUR_SECTOR_FIELD_ZONES.flatMap(zone => zone.legacyZones.map(legacyZone => [legacyZone, zone]))
);

/**
 * @param {unknown} zone
 * @returns {string}
 */
function readZoneValue(zone) {
  if (zone && typeof zone === 'object') {
    const explicitZone = String(zone.zoneId || zone.zone || zone.value || '').trim();
    if (explicitZone) return explicitZone;
    const looksLikeEvent = 'type' in zone || 'timestamp' in zone || 'team' in zone || 'result' in zone || 'subtype' in zone || 'note' in zone;
    return looksLikeEvent ? '' : String(zone.id || '').trim();
  }
  return String(zone || '').trim();
}

/**
 * @param {string|null|undefined} zone
 * @returns {object|null}
 */
export function mapLegacyZoneToFourSector(zone) {
  const raw = String(zone || '').trim();
  const sector = LEGACY_ZONE_TO_SECTOR.get(raw.toUpperCase());
  return sector ? { ...sector, originalZone: raw, legacy: true } : null;
}

/**
 * @param {unknown} zone
 * @returns {{id: string, zoneId: string, label: string, zoneLabel: string, key?: string, originalZone?: string, legacy: boolean}|null}
 */
export function normalizeFieldZone(zone) {
  const raw = readZoneValue(zone);
  if (!raw) return null;

  const direct = SECTOR_BY_ID.get(raw);
  if (direct) {
    return {
      id: direct.id,
      zoneId: direct.id,
      label: direct.label,
      zoneLabel: direct.label,
      key: direct.key,
      legacy: false,
    };
  }

  const legacy = mapLegacyZoneToFourSector(raw);
  if (legacy) {
    return {
      id: legacy.id,
      zoneId: legacy.id,
      label: legacy.label,
      zoneLabel: legacy.label,
      key: legacy.key,
      originalZone: legacy.originalZone,
      legacy: true,
    };
  }

  return {
    id: raw,
    zoneId: raw,
    label: 'Zona legacy',
    zoneLabel: 'Zona legacy',
    originalZone: raw,
    legacy: true,
  };
}
