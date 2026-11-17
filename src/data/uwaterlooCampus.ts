import { CampusBuilding, WalkingSpeed } from '../types';

export const UW_BUILDINGS: Record<string, CampusBuilding> = {
  MC: {
    code: 'MC',
    name: 'Mathematics & Computer',
    fullName: 'Mathematics & Computer Building',
    lat: 43.47214,
    lng: -80.54395,
    floors: 6,
    hasElevator: true,
    accessibleEntrance: 'Ground floor west entrance facing SLC courtyard',
  },
  NH: {
    code: 'NH',
    name: 'Needles Hall',
    fullName: 'Ira G. Needles Hall (Administration & Registrar)',
    lat: 43.46895,
    lng: -80.54415,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'Main ground floor north entrance with ramp and automatic doors',
  },
  DC: {
    code: 'DC',
    name: 'Davis Centre',
    fullName: 'William G. Davis Computer Research Centre',
    lat: 43.47285,
    lng: -80.54225,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'Concourse west entrance adjacent to MC walkway',
  },
  E7: {
    code: 'E7',
    name: 'Engineering 7',
    fullName: 'Engineering 7 (Robotics & IDEAs Clinic)',
    lat: 43.47310,
    lng: -80.53970,
    floors: 7,
    hasElevator: true,
    accessibleEntrance: 'Level 1 atrium entrance on University Avenue North',
  },
  E5: {
    code: 'E5',
    name: 'Engineering 5',
    fullName: 'Engineering 5 (Student Design Centre)',
    lat: 43.47290,
    lng: -80.54080,
    floors: 6,
    hasElevator: true,
    accessibleEntrance: 'Sedra Student Design Centre ground entrance',
  },
  TC: {
    code: 'TC',
    name: 'Tatham Centre',
    fullName: 'William M. Tatham Centre (Co-operative Education)',
    lat: 43.46825,
    lng: -80.54295,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'Main entrance with ramp facing South Campus Hall',
  },
  SCH: {
    code: 'SCH',
    name: 'South Campus Hall',
    fullName: 'South Campus Hall (Visitor Centre & Bookstore)',
    lat: 43.46740,
    lng: -80.54190,
    floors: 2,
    hasElevator: true,
    accessibleEntrance: 'University Avenue south entrance at bus terminal loop',
  },
  STC: {
    code: 'STC',
    name: 'Science Teaching Complex',
    fullName: 'Science Teaching Complex',
    lat: 43.47095,
    lng: -80.54260,
    floors: 4,
    hasElevator: true,
    accessibleEntrance: 'Main concourse automatic sliding glass doors',
  },
  SLC: {
    code: 'SLC',
    name: 'Student Life Centre',
    fullName: 'Student Life Centre & PAC Athletic Complex',
    lat: 43.47160,
    lng: -80.54530,
    floors: 4,
    hasElevator: true,
    accessibleEntrance: 'SLC great hall ground entrance with automatic power doors',
  },
  EV1: {
    code: 'EV1',
    name: 'Environment 1',
    fullName: 'Environment 1 Building',
    lat: 43.46950,
    lng: -80.54480,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'East courtyard entrance with ground ramp',
  },
  EV2: {
    code: 'EV2',
    name: 'Environment 2',
    fullName: 'Environment 2 Building',
    lat: 43.46930,
    lng: -80.54450,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'Connecting tunnel from EV1/EV3 ground level',
  },
  EV3: {
    code: 'EV3',
    name: 'Environment 3',
    fullName: 'Environment 3 (LEED Platinum Living Wall)',
    lat: 43.46910,
    lng: -80.54510,
    floors: 4,
    hasElevator: true,
    accessibleEntrance: 'Southwest atrium main entrance',
  },
  HH: {
    code: 'HH',
    name: 'Hagey Hall',
    fullName: 'J.G. Hagey Hall of the Humanities',
    lat: 43.46780,
    lng: -80.54340,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'Hub atrium east entrance with level paving',
  },
  BMH: {
    code: 'BMH',
    name: 'Matthews Hall',
    fullName: 'B.C. Matthews Hall (Faculty of Health)',
    lat: 43.47460,
    lng: -80.54510,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'North Health Quad main entrance with ramp',
  },
  QNC: {
    code: 'QNC',
    name: 'Quantum-Nano Centre',
    fullName: 'Mike & Ophelia Lazaridis Quantum-Nano Centre',
    lat: 43.47145,
    lng: -80.54425,
    floors: 5,
    hasElevator: true,
    accessibleEntrance: 'Level 1 ground floor entrance facing MC courtyard',
  },
  EC5: {
    code: 'EC5',
    name: 'East Campus 5',
    fullName: 'East Campus 5 Administrative Centre',
    lat: 43.47545,
    lng: -80.53645,
    floors: 4,
    hasElevator: true,
    accessibleEntrance: 'Phillip Street west main entrance',
  },
  GSC: {
    code: 'GSC',
    name: 'General Services Complex',
    fullName: 'General Services Complex (Plant Operations)',
    lat: 43.47420,
    lng: -80.54160,
    floors: 2,
    hasElevator: true,
    accessibleEntrance: 'Columbia Street south ground entrance',
  },
  B1: {
    code: 'B1',
    name: 'Biology 1',
    fullName: 'Biology 1 Building',
    lat: 43.47040,
    lng: -80.54370,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'Science quad walkway ground entrance',
  },
  B2: {
    code: 'B2',
    name: 'Biology 2',
    fullName: 'Biology 2 Building',
    lat: 43.47090,
    lng: -80.54450,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'Central courtyard ground level ramp',
  },
  PHYS: {
    code: 'PHYS',
    name: 'Physics',
    fullName: 'Physics Building',
    lat: 43.47010,
    lng: -80.54280,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'Main ground level south entrance',
  },
  CPH: {
    code: 'CPH',
    name: 'Carl A. Pollock Hall',
    fullName: 'Carl A. Pollock Hall (CPH)',
    lat: 43.47180,
    lng: -80.54150,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'Engineering quad entrance',
  },
  DWE: {
    code: 'DWE',
    name: 'Douglas Wright Engineering',
    fullName: 'Douglas Wright Engineering Building',
    lat: 43.47120,
    lng: -80.54070,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'East ramp entrance facing Ring Road',
  },
  RCH: {
    code: 'RCH',
    name: 'J.R. Coutts Hall',
    fullName: 'J.R. Coutts Hall (RCH Lecture Theatres)',
    lat: 43.47050,
    lng: -80.54120,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'Underground pedestrian tunnel from DWE and ground ramp',
  },
  AL: {
    code: 'AL',
    name: 'Arts Lecture Hall',
    fullName: 'Arts Lecture Hall',
    lat: 43.46870,
    lng: -80.54270,
    floors: 2,
    hasElevator: true,
    accessibleEntrance: 'Main Arts quad north ground entrance',
  },
  ML: {
    code: 'ML',
    name: 'Modern Languages',
    fullName: 'Modern Languages Building & Theatre',
    lat: 43.46930,
    lng: -80.54320,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'Theatre courtyard west entrance with power doors',
  },
  PAS: {
    code: 'PAS',
    name: 'Psychology, Anthro & Sociology',
    fullName: 'PAS Building',
    lat: 43.46820,
    lng: -80.54580,
    floors: 3,
    hasElevator: true,
    accessibleEntrance: 'West ground level entrance facing Village 1 green',
  },
};

export const KNOWN_BUILDING_CODES = Object.keys(UW_BUILDINGS);

// Realistic base walking minutes lookup for common UW cross-campus routes at moderate pace (~75m/min)
const KNOWN_WALK_MINUTES: Record<string, number> = {
  'MC-NH': 7,
  'NH-MC': 7,
  'NH-DC': 8,
  'DC-NH': 8,
  'MC-DC': 6,
  'DC-MC': 6,
  'MC-E7': 11,
  'E7-MC': 11,
  'NH-E7': 12,
  'E7-NH': 12,
  'DC-E7': 4,
  'E7-DC': 4,
  'E5-E7': 2,
  'E7-E5': 2,
  'NH-TC': 2,
  'TC-NH': 2,
  'MC-TC': 7,
  'TC-MC': 7,
  'MC-SLC': 3,
  'SLC-MC': 3,
  'NH-SCH': 3,
  'SCH-NH': 3,
  'MC-EC5': 15,
  'EC5-MC': 15,
  'DC-EC5': 13,
  'EC5-DC': 13,
  'MC-QNC': 3,
  'QNC-MC': 3,
  'STC-MC': 4,
  'MC-STC': 4,
  'STC-NH': 5,
  'NH-STC': 5,
  'HH-NH': 3,
  'NH-HH': 3,
  'EV3-NH': 4,
  'NH-EV3': 4,
  'EV3-MC': 6,
  'MC-EV3': 6,
};

export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Returns outdoor walking estimate (in minutes and distance in meters), adjusted by speed.
 */
export function getOutdoorWalkEstimate(
  fromCode: string,
  toCode: string,
  speed: WalkingSpeed = 'moderate'
): { minutes: number; distanceMeters: number } {
  if (!fromCode || !toCode || fromCode === toCode) {
    return { minutes: 0, distanceMeters: 0 };
  }

  // Speed multiplier: brisk = 0.83, moderate = 1.0, relaxed = 1.25
  const speedFactor = speed === 'brisk' ? 0.83 : speed === 'relaxed' ? 1.25 : 1.0;

  const key = `${fromCode}-${toCode}`;
  if (KNOWN_WALK_MINUTES[key] !== undefined) {
    const baseMinutes = KNOWN_WALK_MINUTES[key];
    const adjustedMin = Math.max(1, Math.round(baseMinutes * speedFactor));
    return { minutes: adjustedMin, distanceMeters: baseMinutes * 75 };
  }

  const fromBldg = UW_BUILDINGS[fromCode];
  const toBldg = UW_BUILDINGS[toCode];

  if (fromBldg && toBldg) {
    const rawMeters = calculateDistanceMeters(fromBldg.lat, fromBldg.lng, toBldg.lat, toBldg.lng);
    // Real pedestrian paths wind ~1.25x direct distance at ~75m/min
    const pathMeters = Math.round(rawMeters * 1.25);
    const speedMetersPerMin = speed === 'brisk' ? 90 : speed === 'relaxed' ? 60 : 75;
    const calculatedMinutes = Math.max(2, Math.round(pathMeters / speedMetersPerMin));
    return { minutes: calculatedMinutes, distanceMeters: pathMeters };
  }

  // Fallback for unknown buildings
  return { minutes: Math.round(6 * speedFactor), distanceMeters: 450 };
}

export const WEATHER_FACTOR = 1.0;
