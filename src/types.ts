export interface CampusBuilding {
  code: string;
  name: string;
  fullName: string;
  lat: number;
  lng: number;
  floors?: number;
  accessibleEntrance?: string;
  hasElevator?: boolean;
}

export type MeetingFormat = 'in_person' | 'online' | 'hybrid';
export type MeetingSource = 'sample' | 'created' | 'imported' | 'new';

export interface CampusMeeting {
  id: string;
  title: string;
  date: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:MM' (24-hour)
  endTime: string; // 'HH:MM'
  format?: MeetingFormat; // 'in_person' | 'online' | 'hybrid'
  buildingCode: string; // e.g. 'MC', 'NH', 'DC', 'E7'
  roomNumber: string; // e.g. '5479', '3001'
  floor: number; // e.g. 5, 3
  onlineLink?: string; // e.g. 'Microsoft Teams' or Zoom URL
  organizer?: string;
  notes?: string;
  source: MeetingSource;
  rawLocation?: string;
  isOnline?: boolean;
  isUnparseableLocation?: boolean;
}

// Backward-compatible alias
export type QuestMeeting = CampusMeeting;

export type TravelStatus = 'ON_TIME' | 'TIGHT' | 'IMPOSSIBLE' | 'NO_TRAVEL' | 'LATE';

export interface TravelBreakdown {
  exitRoomSeconds: number;
  originFloorsDown: number;
  originFloorDownSeconds: number;
  originMethod: 'stairs' | 'elevator' | 'none';
  outdoorWalkRawMinutes: number;
  outdoorWalkRawSeconds: number;
  outdoorWalkAdjustedSeconds: number;
  destFloorsUp: number;
  destFloorUpSeconds: number;
  destMethod: 'stairs' | 'elevator' | 'none';
  findRoomSeconds: number;
  bufferMinutes: number;
  sameBuildingOnlySeconds?: number;
  summaryLine: string;
}

export interface TravelLeg {
  id: string;
  fromMeeting: CampusMeeting;
  toMeeting: CampusMeeting;
  gapMinutes: number;
  gapSeconds: number;
  googleMapsWalkMinutes: number;
  questFlowTravelSeconds: number;
  questFlowTravelMinutes: number;
  departureTime: string; // Recommended departure time e.g. "10:14"
  arrivalTime: string; // Expected arrival time at destination room
  bufferMinutes: number; // User-selected arrival buffer (e.g. 5 min)
  safeTimeMinutes: number;
  status: TravelStatus;
  minutesLate: number; // > 0 if IMPOSSIBLE / LATE
  isSameBuilding: boolean;
  isOnline: boolean;
  mapsWouldFit: boolean;
  breakdown: TravelBreakdown;
}

export type WalkingSpeed = 'brisk' | 'moderate' | 'relaxed';

export interface NotificationSettings {
  enabled: boolean;
  leadTimeMinutes: number; // e.g. 5 or 10 min before recommended departure
  soundAlert: boolean;
}

export type OfficeReturnThreshold = 30 | 45 | 60 | 'never';

export interface UserOffice {
  buildingCode: string; // e.g. 'E7'
  roomNumber: string; // e.g. '2408'
  floor: number; // e.g. 2
  returnMinGapMinutes?: OfficeReturnThreshold; // default: 45
}

export const SAMPLE_DEFAULT_OFFICE: UserOffice = {
  buildingCode: 'E7',
  roomNumber: '2408',
  floor: 2,
  returnMinGapMinutes: 45,
};

export interface CampusSettings {
  walkingSpeed: WalkingSpeed; // default 'moderate' (75 m/min)
  arrivalBufferMinutes: number; // default: 5 min before start
  exitRoomSeconds: number; // default: 60
  findRoomSeconds: number; // default: 60
  stairsSecondsPerFloor: number; // default: 20
  elevatorWaitSeconds: number; // default: 60
  elevatorSecondsPerFloor: number; // default: 5
  safeTimeMultiplier: number; // default: 1.2
  accessibilityAlwaysElevator: boolean; // default: false
  notifications: NotificationSettings;
  office?: UserOffice | null;
}

// Backward-compatible alias
export type QuestSettings = CampusSettings;

export const DEFAULT_CAMPUS_SETTINGS: CampusSettings = {
  walkingSpeed: 'moderate',
  arrivalBufferMinutes: 5,
  exitRoomSeconds: 60,
  findRoomSeconds: 60,
  stairsSecondsPerFloor: 20,
  elevatorWaitSeconds: 60,
  elevatorSecondsPerFloor: 5,
  safeTimeMultiplier: 1.2,
  accessibilityAlwaysElevator: false,
  notifications: {
    enabled: true,
    leadTimeMinutes: 5,
    soundAlert: true,
  },
  office: null,
};

export const DEFAULT_QUEST_SETTINGS = DEFAULT_CAMPUS_SETTINGS;

export { WEATHER_FACTOR } from './data/uwaterlooCampus';
