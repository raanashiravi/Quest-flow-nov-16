import { UW_BUILDINGS } from '../data/uwaterlooCampus';

export type GoogleMapsTravelMode = 'walking' | 'driving' | 'transit';

/**
 * Generates an external Google Maps URL for walking/driving/transit directions
 * between two UW campus buildings, or a Google Maps location search URL
 * when only a destination building is known (or origin === destination).
 */
export function getGoogleMapsDirectionsUrl(
  fromBuildingCode?: string,
  toBuildingCode?: string,
  travelMode: GoogleMapsTravelMode = 'walking'
): string {
  const fromCode = fromBuildingCode?.trim().toUpperCase();
  const toCode = toBuildingCode?.trim().toUpperCase();

  const fromBldg = fromCode && fromCode !== 'ONLINE' ? UW_BUILDINGS[fromCode] : undefined;
  const toBldg = toCode && toCode !== 'ONLINE' ? UW_BUILDINGS[toCode] : undefined;

  if (fromBldg && toBldg && fromBldg.code !== toBldg.code) {
    return `https://www.google.com/maps/dir/?api=1&origin=${fromBldg.lat},${fromBldg.lng}&destination=${toBldg.lat},${toBldg.lng}&travelmode=${travelMode}&dir_action=navigate`;
  }

  if (toBldg) {
    return `https://www.google.com/maps/search/?api=1&query=${toBldg.lat},${toBldg.lng}`;
  }

  const query = toCode && toCode !== 'ONLINE'
    ? `${toCode} University of Waterloo`
    : 'University of Waterloo';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
