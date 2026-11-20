import { UW_BUILDINGS } from '../data/uwaterlooCampus';

export type GoogleMapsTravelMode = 'walking' | 'driving' | 'transit';

/**
 * Returns the readable Google Maps place string for a UW building code
 * (e.g. "Engineering 7, University of Waterloo, Waterloo, ON"),
 * falling back to coordinates only if a building has no name.
 */
export function getBuildingMapsQuery(buildingCode?: string): string {
  const code = buildingCode?.trim().toUpperCase();
  if (!code || code === 'ONLINE') return '';

  const bldg = UW_BUILDINGS[code];
  if (bldg) {
    const cleanFullName = (bldg.fullName || bldg.name || '')
      .replace(/\s*\([^)]*\)\s*/g, '')
      .trim();
    if (cleanFullName) {
      return `${cleanFullName}, University of Waterloo, Waterloo, ON`;
    }
    return `${bldg.lat},${bldg.lng}`;
  }

  return `${code}, University of Waterloo, Waterloo, ON`;
}

/**
 * Generates an external Google Maps search/place URL for a single UW campus building
 * using its full name + "University of Waterloo, Waterloo, ON".
 */
export function getGoogleMapsBuildingUrl(buildingCode?: string): string {
  const query = getBuildingMapsQuery(buildingCode);
  if (query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    'University of Waterloo, Waterloo, ON'
  )}`;
}

/**
 * Generates an external Google Maps URL for walking/driving/transit directions
 * between two UW campus buildings using readable building names, or a search URL
 * when only a destination building is known (or origin === destination).
 */
export function getGoogleMapsDirectionsUrl(
  fromBuildingCode?: string,
  toBuildingCode?: string,
  travelMode: GoogleMapsTravelMode = 'walking'
): string {
  const fromCode = fromBuildingCode?.trim().toUpperCase();
  const toCode = toBuildingCode?.trim().toUpperCase();

  const hasFrom = Boolean(fromCode && fromCode !== 'ONLINE');
  const hasTo = Boolean(toCode && toCode !== 'ONLINE');

  if (hasFrom && hasTo && fromCode !== toCode) {
    const origin = getBuildingMapsQuery(fromCode);
    const destination = getBuildingMapsQuery(toCode);
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      origin
    )}&destination=${encodeURIComponent(destination)}&travelmode=${travelMode}`;
  }

  if (hasTo) {
    const query = getBuildingMapsQuery(toCode);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    'University of Waterloo, Waterloo, ON'
  )}`;
}
