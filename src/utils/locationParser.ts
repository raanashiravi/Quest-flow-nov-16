import { KNOWN_BUILDING_CODES, UW_BUILDINGS } from '../data/uwaterlooCampus';

export interface ParsedLocation {
  buildingCode: string;
  roomNumber: string;
  floor: number;
  isOnline: boolean;
  isUnparseableLocation: boolean;
  displayLocation: string;
}

export function parseLocationString(rawLocation: string | undefined | null): ParsedLocation {
  const loc = (rawLocation || '').trim();

  if (!loc) {
    return {
      buildingCode: '',
      roomNumber: '',
      floor: 1,
      isOnline: false,
      isUnparseableLocation: true,
      displayLocation: 'Unspecified location',
    };
  }

  const lower = loc.toLowerCase();

  // Check online meeting platforms
  const isOnline =
    lower.includes('teams') ||
    lower.includes('zoom') ||
    lower.includes('meet.google') ||
    lower.includes('webex') ||
    lower.includes('virtual') ||
    lower.includes('online') ||
    lower.includes('skype') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://');

  if (isOnline) {
    let name = 'Microsoft Teams';
    if (lower.includes('zoom')) name = 'Zoom Meeting';
    else if (lower.includes('google')) name = 'Google Meet';
    else if (lower.includes('webex')) name = 'Cisco Webex';
    else if (lower.includes('virtual') || lower.includes('online')) name = 'Virtual Meeting';

    return {
      buildingCode: 'ONLINE',
      roomNumber: '',
      floor: 1,
      isOnline: true,
      isUnparseableLocation: false,
      displayLocation: name,
    };
  }

  // Detect explicit floor mention (e.g. "NH 3rd floor", "Floor 4", "3rd fl")
  let detectedFloor: number | null = null;
  const floorMatch = loc.match(/(?:floor|fl\.?)\s*(\d+)/i) || loc.match(/(\d+)(?:st|nd|rd|th)\s*(?:floor|fl\.?)/i);
  if (floorMatch && floorMatch[1]) {
    const f = parseInt(floorMatch[1], 10);
    if (!isNaN(f) && f >= 1 && f <= 10) {
      detectedFloor = f;
    }
  }

  // Detect UW Building code
  let buildingCode = '';
  // Check exact building code token matches first (e.g. "MC", "NH", "DC")
  const tokens = loc.toUpperCase().split(/[^A-Z0-9]/).filter(Boolean);
  for (const token of tokens) {
    if (KNOWN_BUILDING_CODES.includes(token)) {
      buildingCode = token;
      break;
    }
  }

  // If not found in tokens, check full building names
  if (!buildingCode) {
    for (const [code, bldg] of Object.entries(UW_BUILDINGS)) {
      if (lower.includes(bldg.name.toLowerCase()) || lower.includes(bldg.fullName.toLowerCase())) {
        buildingCode = code;
        break;
      }
    }
  }

  // Detect room number (e.g., 2018, 3001, 1302, 5479, 373, A102)
  let roomNumber = '';
  const roomMatch = loc.match(/\b([A-Z]?\d{3,4}[A-Z]?)\b/i);
  if (roomMatch && roomMatch[1]) {
    roomNumber = roomMatch[1].toUpperCase();
  }

  // Compute floor from room number if not explicitly found
  let finalFloor = detectedFloor || 1;
  if (!detectedFloor && roomNumber) {
    // Extract first digit of room number
    const firstDigitMatch = roomNumber.match(/\d/);
    if (firstDigitMatch) {
      const f = parseInt(firstDigitMatch[0], 10);
      if (!isNaN(f) && f >= 1 && f <= 9) {
        finalFloor = f;
      }
    }
  }

  const isUnparseable = !buildingCode && !isOnline;

  const displayLocation = isUnparseable
    ? loc
    : roomNumber
    ? `${buildingCode} ${roomNumber}`
    : buildingCode
    ? `${buildingCode} (Floor ${finalFloor})`
    : loc;

  return {
    buildingCode,
    roomNumber,
    floor: finalFloor,
    isOnline: false,
    isUnparseableLocation: isUnparseable,
    displayLocation,
  };
}
