import {
  CampusMeeting,
  CampusSettings,
  MeetingFormat,
  TravelBreakdown,
  TravelLeg,
  TravelStatus,
} from '../types';
import { getOutdoorWalkEstimate, UW_BUILDINGS } from '../data/uwaterlooCampus';

export function hasKnownBuilding(buildingCode?: string | null): boolean {
  if (!buildingCode) return false;
  const normalized = buildingCode.trim().toUpperCase();
  if (!normalized || normalized === 'ONLINE') return false;
  return Boolean(UW_BUILDINGS[normalized]);
}

export function isMeetingOnline(
  meeting?: Pick<CampusMeeting, 'format' | 'isOnline' | 'buildingCode'> | null
): boolean {
  if (!meeting) return false;
  return (
    meeting.format === 'online' ||
    Boolean(meeting.isOnline) ||
    meeting.buildingCode?.trim().toUpperCase() === 'ONLINE'
  );
}

export function isMeetingLocationUnknown(
  meeting?: Pick<
    CampusMeeting,
    'format' | 'isOnline' | 'buildingCode' | 'isUnparseableLocation'
  > | null
): boolean {
  if (!meeting) return true;
  if (isMeetingOnline(meeting)) return false;
  return Boolean(meeting.isUnparseableLocation) || !hasKnownBuilding(meeting.buildingCode);
}

export function needsCampusTravel(
  meeting?: Pick<
    CampusMeeting,
    'format' | 'isOnline' | 'buildingCode' | 'isUnparseableLocation'
  > | null
): boolean {
  if (!meeting) return false;
  return !isMeetingOnline(meeting) && !isMeetingLocationUnknown(meeting);
}

export function formatBuildingRoomLabel(
  buildingCode?: string | null,
  roomNumber?: string | null
): string {
  const b = (buildingCode || '').trim().toUpperCase();
  if (!hasKnownBuilding(b)) return '';
  const r = (roomNumber || '').trim();
  return r ? `${b} ${r}` : b;
}

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  return h * 60 + m;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function formatTime12h(timeStr: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function formatSecondsShort(sec: number): string {
  const rounded = Math.round(sec);
  if (rounded <= 0) return '0 s';
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  if (m === 0) return `${s} s`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} s`;
}

export function calculateFloorChangeSeconds(
  floors: number,
  settings: CampusSettings
): { seconds: number; method: 'stairs' | 'elevator' | 'none' } {
  if (floors <= 0) {
    return { seconds: 0, method: 'none' };
  }

  // Accessibility toggle: always elevator
  if (settings.accessibilityAlwaysElevator) {
    const sec = settings.elevatorWaitSeconds + floors * settings.elevatorSecondsPerFloor;
    return { seconds: sec, method: 'elevator' };
  }

  // Stairs if 2 floors or fewer; otherwise elevator
  if (floors <= 2) {
    const sec = floors * settings.stairsSecondsPerFloor;
    return { seconds: sec, method: 'stairs' };
  } else {
    const sec = settings.elevatorWaitSeconds + floors * settings.elevatorSecondsPerFloor;
    return { seconds: sec, method: 'elevator' };
  }
}

export function calculateBuildingToBuildingSeconds(
  fromBuildingCode: string,
  fromFloor: number,
  toBuildingCode: string,
  toFloor: number,
  settings: CampusSettings,
  fromRoomNumber?: string,
  toRoomNumber?: string
): {
  totalSeconds: number;
  totalMinutes: number;
  rawWalkMinutes: number;
  isSameBuilding: boolean;
  isSameRoom: boolean;
  bufferMinutes: number;
} {
  if (!hasKnownBuilding(fromBuildingCode) || !hasKnownBuilding(toBuildingCode)) {
    return {
      totalSeconds: 0,
      totalMinutes: 0,
      rawWalkMinutes: 0,
      isSameBuilding: false,
      isSameRoom: false,
      bufferMinutes: 0,
    };
  }

  const isSame =
    Boolean(fromBuildingCode) &&
    Boolean(toBuildingCode) &&
    fromBuildingCode.trim().toUpperCase() === toBuildingCode.trim().toUpperCase();

  if (isSame) {
    const cleanFromRoom = (fromRoomNumber || '').trim().toUpperCase();
    const cleanToRoom = (toRoomNumber || '').trim().toUpperCase();
    const isSameRoom =
      Boolean(cleanFromRoom) &&
      Boolean(cleanToRoom) &&
      cleanFromRoom === cleanToRoom;

    if (isSameRoom) {
      return {
        totalSeconds: 0,
        totalMinutes: 0,
        rawWalkMinutes: 0,
        isSameBuilding: true,
        isSameRoom: true,
        bufferMinutes: 0,
      };
    }

    const floorDelta = Math.abs(fromFloor - toFloor);
    const floorChange = calculateFloorChangeSeconds(floorDelta, settings);
    const sec = floorChange.seconds + settings.findRoomSeconds;
    return {
      totalSeconds: sec,
      totalMinutes: Math.ceil(sec / 60),
      rawWalkMinutes: 0,
      isSameBuilding: true,
      isSameRoom: false,
      bufferMinutes: 0,
    };
  }

  const exitRoomSeconds = settings.exitRoomSeconds;
  const originFloorsDown = Math.max(0, fromFloor - 1);
  const originFloorDown = calculateFloorChangeSeconds(originFloorsDown, settings);

  const baseOutdoorEstimate = getOutdoorWalkEstimate(
    fromBuildingCode,
    toBuildingCode,
    settings.walkingSpeed
  );
  const rawWalkMinutes = baseOutdoorEstimate.minutes;
  const rawWalkSeconds = rawWalkMinutes * 60;

  const destFloorsUp = Math.max(0, toFloor - 1);
  const destFloorUp = calculateFloorChangeSeconds(destFloorsUp, settings);
  const findRoomSeconds = settings.findRoomSeconds;

  const totalSeconds =
    exitRoomSeconds +
    originFloorDown.seconds +
    rawWalkSeconds +
    destFloorUp.seconds +
    findRoomSeconds;

  return {
    totalSeconds,
    totalMinutes: Math.ceil(totalSeconds / 60),
    rawWalkMinutes,
    isSameBuilding: false,
    isSameRoom: false,
    bufferMinutes: settings.arrivalBufferMinutes ?? 5,
  };
}

export interface MeetingDepartureInfo {
  hasOrigin: boolean;
  originBuildingCode?: string;
  originRoomNumber?: string;
  originLabel: string;
  walkMinutes: number;
  leaveByMinutes: number;
  leaveByTime: string;
  leaveByTime12h: string;
  isViaOffice: boolean;
  isOfficeReturnBetweenMeetings: boolean;
  toOfficeWalkMinutes: number;
  officeArrivalMinutes: number;
  officeArrivalTime: string;
  officeArrivalTime12h: string;
}

/**
 * Single helper that decides whether a meeting's walk originates from the previous
 * meeting or from the user's office (either as the first in-person meeting of the day
 * or after returning to the office during a gap >= returnMinGapMinutes), and computes
 * the origin building, walk minutes, and leave-by time.
 */
export function getDepartureForMeeting(
  meeting: CampusMeeting,
  previousMeeting: CampusMeeting | null | undefined,
  settings: CampusSettings
): MeetingDepartureInfo {
  if (!needsCampusTravel(meeting)) {
    return {
      hasOrigin: false,
      originLabel: '',
      walkMinutes: 0,
      leaveByMinutes: parseTimeToMinutes(meeting.startTime),
      leaveByTime: meeting.startTime,
      leaveByTime12h: formatTime12h(meeting.startTime),
      isViaOffice: false,
      isOfficeReturnBetweenMeetings: false,
      toOfficeWalkMinutes: 0,
      officeArrivalMinutes: 0,
      officeArrivalTime: '',
      officeArrivalTime12h: '',
    };
  }

  const startMin = parseTimeToMinutes(meeting.startTime);
  const office =
    settings.office?.buildingCode && hasKnownBuilding(settings.office.buildingCode)
      ? settings.office
      : null;

  const hasValidPrev = needsCampusTravel(previousMeeting);

  // Case 1: First in-person meeting of the day
  if (!hasValidPrev || !previousMeeting) {
    if (!office) {
      return {
        hasOrigin: false,
        originLabel: '',
        walkMinutes: 0,
        leaveByMinutes: startMin,
        leaveByTime: meeting.startTime,
        leaveByTime12h: formatTime12h(meeting.startTime),
        isViaOffice: false,
        isOfficeReturnBetweenMeetings: false,
        toOfficeWalkMinutes: 0,
        officeArrivalMinutes: 0,
        officeArrivalTime: '',
        officeArrivalTime12h: '',
      };
    }

    const fromOfficeCalc = calculateBuildingToBuildingSeconds(
      office.buildingCode,
      office.floor || 1,
      meeting.buildingCode,
      meeting.floor || 1,
      settings,
      office.roomNumber,
      meeting.roomNumber
    );
    const walkMinutes = fromOfficeCalc.totalMinutes;
    const effectiveBuffer = fromOfficeCalc.bufferMinutes;

    const leaveByMinutes = startMin - (walkMinutes + effectiveBuffer);
    const leaveByTime = formatMinutesToTime(leaveByMinutes);

    return {
      hasOrigin: true,
      originBuildingCode: office.buildingCode,
      originRoomNumber: office.roomNumber,
      originLabel: `office ${office.buildingCode}${
        office.roomNumber ? ` ${office.roomNumber}` : ''
      }`,
      walkMinutes,
      leaveByMinutes,
      leaveByTime,
      leaveByTime12h: formatTime12h(leaveByTime),
      isViaOffice: true,
      isOfficeReturnBetweenMeetings: false,
      toOfficeWalkMinutes: 0,
      officeArrivalMinutes: 0,
      officeArrivalTime: '',
      officeArrivalTime12h: '',
    };
  }

  // Case 2: Has a preceding in-person meeting
  const prevEndMin = parseTimeToMinutes(previousMeeting.endTime);
  const gapMinutes = startMin - prevEndMin;
  const rawThreshold = office ? (office.returnMinGapMinutes ?? 60) : 'never';
  const threshold =
    rawThreshold !== 'never' && Number(rawThreshold) === 30 ? 45 : rawThreshold;

  if (office && threshold !== 'never' && gapMinutes >= threshold) {
    const toOfficeWalkMinutes = calculateBuildingToBuildingSeconds(
      previousMeeting.buildingCode,
      previousMeeting.floor || 1,
      office.buildingCode,
      office.floor || 1,
      settings,
      previousMeeting.roomNumber,
      office.roomNumber
    ).totalMinutes;

    const fromOfficeCalc = calculateBuildingToBuildingSeconds(
      office.buildingCode,
      office.floor || 1,
      meeting.buildingCode,
      meeting.floor || 1,
      settings,
      office.roomNumber,
      meeting.roomNumber
    );
    const walkMinutes = fromOfficeCalc.totalMinutes;
    const effectiveBuffer = fromOfficeCalc.bufferMinutes;

    // Only plan an office trip if the time at the office is at least 15 minutes:
    // gap >= walk to office + walk from office + arrival buffer + 15
    const minGapForOfficeStay =
      toOfficeWalkMinutes + walkMinutes + effectiveBuffer + 15;

    if (gapMinutes >= minGapForOfficeStay) {
      const officeArrivalMinutes = prevEndMin + toOfficeWalkMinutes;
      const officeArrivalTime = formatMinutesToTime(officeArrivalMinutes);
      const leaveByMinutes = startMin - (walkMinutes + effectiveBuffer);
      const leaveByTime = formatMinutesToTime(leaveByMinutes);

      return {
        hasOrigin: true,
        originBuildingCode: office.buildingCode,
        originRoomNumber: office.roomNumber,
        originLabel: `office ${office.buildingCode}${
          office.roomNumber ? ` ${office.roomNumber}` : ''
        }`,
        walkMinutes,
        leaveByMinutes,
        leaveByTime,
        leaveByTime12h: formatTime12h(leaveByTime),
        isViaOffice: true,
        isOfficeReturnBetweenMeetings: true,
        toOfficeWalkMinutes,
        officeArrivalMinutes,
        officeArrivalTime,
        officeArrivalTime12h: formatTime12h(officeArrivalTime),
      };
    }
  }

  // Direct walk from previousMeeting to meeting
  const directCalc = calculateBuildingToBuildingSeconds(
    previousMeeting.buildingCode,
    previousMeeting.floor || 1,
    meeting.buildingCode,
    meeting.floor || 1,
    settings,
    previousMeeting.roomNumber,
    meeting.roomNumber
  );
  const walkMinutes = directCalc.totalMinutes;
  const effectiveBuffer = directCalc.bufferMinutes;

  const leaveByMinutes = startMin - (walkMinutes + effectiveBuffer);
  const leaveByTime = formatMinutesToTime(leaveByMinutes);

  return {
    hasOrigin: true,
    originBuildingCode: previousMeeting.buildingCode,
    originRoomNumber: previousMeeting.roomNumber,
    originLabel: `${previousMeeting.buildingCode}${
      previousMeeting.roomNumber ? ` ${previousMeeting.roomNumber}` : ''
    }`,
    walkMinutes,
    leaveByMinutes,
    leaveByTime,
    leaveByTime12h: formatTime12h(leaveByTime),
    isViaOffice: false,
    isOfficeReturnBetweenMeetings: false,
    toOfficeWalkMinutes: 0,
    officeArrivalMinutes: 0,
    officeArrivalTime: '',
    officeArrivalTime12h: '',
  };
}

/**
 * Calculates deterministic travel leg between two consecutive meetings.
 * Integrates:
 * - Room exit & floor egress
 * - Outdoor campus walk adjusted by walking speed
 * - Floor ingress & room finding
 * - Arrival buffer
 * - Recommended departure time
 * - Impossible back-to-back detection
 */
export function calculateTravelLeg(
  fromMeeting: CampusMeeting,
  toMeeting: CampusMeeting,
  settings: CampusSettings,
  departAfterTime?: string
): TravelLeg {
  const id = `leg-${fromMeeting.id}-${toMeeting.id}`;

  const fromEndMin = parseTimeToMinutes(departAfterTime || fromMeeting.endTime);
  const toStartMin = parseTimeToMinutes(toMeeting.startTime);
  const gapMinutes = toStartMin - fromEndMin;
  const gapSeconds = gapMinutes * 60;
  const bufferMinutes = settings.arrivalBufferMinutes ?? 5;

  // Check if either meeting is online or has an unknown location (no recognized building)
  const isNoPhysicalTravel = !needsCampusTravel(fromMeeting) || !needsCampusTravel(toMeeting);

  if (isNoPhysicalTravel) {
    const emptyBreakdown: TravelBreakdown = {
      exitRoomSeconds: 0,
      originFloorsDown: 0,
      originFloorDownSeconds: 0,
      originMethod: 'none',
      outdoorWalkRawMinutes: 0,
      outdoorWalkRawSeconds: 0,
      outdoorWalkAdjustedSeconds: 0,
      destFloorsUp: 0,
      destFloorUpSeconds: 0,
      destMethod: 'none',
      findRoomSeconds: 0,
      bufferMinutes: 0,
      summaryLine: 'Online meetings — no campus travel required',
    };

    return {
      id,
      fromMeeting,
      toMeeting,
      gapMinutes,
      gapSeconds,
      googleMapsWalkMinutes: 0,
      questFlowTravelSeconds: 0,
      questFlowTravelMinutes: 0,
      departureTime: toMeeting.startTime,
      arrivalTime: toMeeting.startTime,
      bufferMinutes: 0,
      safeTimeMinutes: 0,
      status: 'NO_TRAVEL',
      minutesLate: 0,
      mapsWouldFit: false,
      isSameBuilding: false,
      isOnline: isMeetingOnline(fromMeeting) || isMeetingOnline(toMeeting),
      breakdown: emptyBreakdown,
    };
  }

  // Cross-location calculation
  const b2b = calculateBuildingToBuildingSeconds(
    fromMeeting.buildingCode,
    fromMeeting.floor || 1,
    toMeeting.buildingCode,
    toMeeting.floor || 1,
    settings,
    fromMeeting.roomNumber,
    toMeeting.roomNumber
  );
  const isSameBuilding = b2b.isSameBuilding;
  const isSameRoom = b2b.isSameRoom;
  const totalTravelSeconds = b2b.totalSeconds;
  const totalTravelMinutes = b2b.totalMinutes;
  const rawWalkMinutes = b2b.rawWalkMinutes;
  const effectiveBufferMinutes = b2b.bufferMinutes;
  let breakdown: TravelBreakdown;

  if (isSameBuilding) {
    if (isSameRoom) {
      breakdown = {
        exitRoomSeconds: 0,
        originFloorsDown: 0,
        originFloorDownSeconds: 0,
        originMethod: 'none',
        outdoorWalkRawMinutes: 0,
        outdoorWalkRawSeconds: 0,
        outdoorWalkAdjustedSeconds: 0,
        destFloorsUp: 0,
        destFloorUpSeconds: 0,
        destMethod: 'none',
        findRoomSeconds: 0,
        bufferMinutes: 0,
        sameBuildingOnlySeconds: 0,
        summaryLine: `Same room (${fromMeeting.buildingCode} ${fromMeeting.roomNumber}) — no walk required`,
      };
    } else {
      const floorDelta = Math.abs((fromMeeting.floor || 1) - (toMeeting.floor || 1));
      const floorChange = calculateFloorChangeSeconds(floorDelta, settings);

      const summaryLine =
        floorDelta > 0
          ? `Same building (${fromMeeting.buildingCode}) · ${
              floorChange.method === 'elevator' ? 'elevator' : 'stairs'
            } ${floorDelta} floor${floorDelta > 1 ? 's' : ''} ${formatSecondsShort(
              floorChange.seconds
            )} · room transition ${formatSecondsShort(settings.findRoomSeconds)}`
          : `Same building (${fromMeeting.buildingCode}) · room transition ${formatSecondsShort(
              settings.findRoomSeconds
            )}`;

      breakdown = {
        exitRoomSeconds: 0,
        originFloorsDown: floorDelta,
        originFloorDownSeconds: floorChange.seconds,
        originMethod: floorChange.method,
        outdoorWalkRawMinutes: 0,
        outdoorWalkRawSeconds: 0,
        outdoorWalkAdjustedSeconds: 0,
        destFloorsUp: 0,
        destFloorUpSeconds: 0,
        destMethod: 'none',
        findRoomSeconds: settings.findRoomSeconds,
        bufferMinutes: 0,
        sameBuildingOnlySeconds: totalTravelSeconds,
        summaryLine,
      };
    }
  } else {
    const exitRoomSeconds = settings.exitRoomSeconds;
    const originFloorsDown = Math.max(0, (fromMeeting.floor || 1) - 1);
    const originFloorDown = calculateFloorChangeSeconds(originFloorsDown, settings);
    const rawWalkSeconds = rawWalkMinutes * 60;
    const destFloorsUp = Math.max(0, (toMeeting.floor || 1) - 1);
    const destFloorUp = calculateFloorChangeSeconds(destFloorsUp, settings);
    const findRoomSeconds = settings.findRoomSeconds;

    const parts: string[] = [];
    parts.push(`Exit ${formatSecondsShort(exitRoomSeconds)}`);
    if (originFloorsDown > 0) {
      parts.push(
        `down ${originFloorsDown} fl (${originFloorDown.method === 'elevator' ? 'elv' : 'stairs'} ${formatSecondsShort(originFloorDown.seconds)})`
      );
    }
    parts.push(`walk ${rawWalkMinutes}m`);
    if (destFloorsUp > 0) {
      parts.push(
        `up ${destFloorsUp} fl (${destFloorUp.method === 'elevator' ? 'elv' : 'stairs'} ${formatSecondsShort(destFloorUp.seconds)})`
      );
    }
    parts.push(`find room ${formatSecondsShort(findRoomSeconds)}`);

    breakdown = {
      exitRoomSeconds,
      originFloorsDown,
      originFloorDownSeconds: originFloorDown.seconds,
      originMethod: originFloorDown.method,
      outdoorWalkRawMinutes: rawWalkMinutes,
      outdoorWalkRawSeconds: rawWalkSeconds,
      outdoorWalkAdjustedSeconds: rawWalkSeconds,
      destFloorsUp,
      destFloorUpSeconds: destFloorUp.seconds,
      destMethod: destFloorUp.method,
      findRoomSeconds,
      bufferMinutes: effectiveBufferMinutes,
      summaryLine: parts.join(' · '),
    };
  }

  const neededMinutes = totalTravelMinutes + effectiveBufferMinutes;
  const safeTimeMinutes = isSameBuilding
    ? totalTravelMinutes
    : Math.ceil(totalTravelMinutes * settings.safeTimeMultiplier);

  // Recommended Departure Time:
  // Must leave by: toMeeting.startTime - (totalTravelMinutes + effectiveBufferMinutes)
  const departureMinutesFromMidnight = toStartMin - neededMinutes;
  const departureTime = formatMinutesToTime(departureMinutesFromMidnight);

  // Expected Arrival Time:
  // If user leaves at fromMeeting.endTime: arrives at fromEndMin + totalTravelMinutes
  const expectedArrivalMin = fromEndMin + totalTravelMinutes;
  const arrivalTime = formatMinutesToTime(expectedArrivalMin);

  // Status Evaluation:
  // Same room: always ON_TIME unless overlapping (gapMinutes < 0)
  // IMPOSSIBLE: gapMinutes < totalTravelMinutes (or gapMinutes < 0)
  // TIGHT: totalTravelMinutes <= gapMinutes < neededMinutes (will arrive before start, but eats into buffer)
  // ON_TIME: gapMinutes >= neededMinutes
  let status: TravelStatus = 'ON_TIME';
  let minutesLate = 0;

  if (gapMinutes < 0 || gapMinutes < totalTravelMinutes) {
    status = 'IMPOSSIBLE';
    minutesLate = Math.max(0, totalTravelMinutes - gapMinutes);
  } else if (gapMinutes < neededMinutes) {
    status = 'TIGHT';
    minutesLate = 0;
  }

  const mapsWouldFit = gapMinutes >= rawWalkMinutes && status === 'IMPOSSIBLE';

  return {
    id,
    fromMeeting,
    toMeeting,
    gapMinutes,
    gapSeconds,
    googleMapsWalkMinutes: rawWalkMinutes,
    questFlowTravelSeconds: totalTravelSeconds,
    questFlowTravelMinutes: totalTravelMinutes,
    departureTime,
    arrivalTime,
    bufferMinutes: effectiveBufferMinutes,
    safeTimeMinutes,
    status,
    minutesLate,
    isSameBuilding,
    isOnline: false,
    mapsWouldFit,
    breakdown,
  };
}

export interface CandidateTravelEvaluation {
  warning: string | null;
  isImpossible: boolean;
  needsWorkingSlots: boolean;
}

/**
 * Shared validation for the Add/Edit Meeting form:
 * - Online and location-unknown meetings still block their own time against overlaps.
 * - Online and location-unknown meetings never need a walk to or from them.
 * - When an online meeting sits between two in-person meetings in different buildings,
 *   the walk is measured from the earlier in-person building, starts after the online
 *   meeting ends, and must finish before the next meeting of any kind starts.
 * - Warning sentences are never built with an empty building or room.
 */
export function evaluateMeetingTravelWarnings(
  candidate: {
    startTime: string;
    endTime: string;
    format: MeetingFormat;
    buildingCode: string;
    roomNumber: string;
    floor: number;
  },
  sameDayMeetings: CampusMeeting[],
  settings: CampusSettings
): CandidateTravelEvaluation {
  const startMin = parseTimeToMinutes(candidate.startTime);
  const endMin = parseTimeToMinutes(candidate.endTime);

  if (endMin <= startMin) {
    return {
      warning: 'End time must be after start time.',
      isImpossible: false,
      needsWorkingSlots: false,
    };
  }

  // 1. Overlap check against all meetings (in-person, hybrid, online, and location-unknown)
  const overlapping = sameDayMeetings.find((m) => {
    const s = parseTimeToMinutes(m.startTime);
    const e = parseTimeToMinutes(m.endTime);
    return startMin < e && endMin > s;
  });

  if (overlapping) {
    return {
      warning: `Time overlaps with "${overlapping.title}" (${formatTime12h(
        overlapping.startTime
      )}–${formatTime12h(overlapping.endTime)}).`,
      isImpossible: true,
      needsWorkingSlots: true,
    };
  }

  // 2. Online or location-unknown candidate never needs a walk to or from it
  if (candidate.format === 'online' || !hasKnownBuilding(candidate.buildingCode)) {
    return {
      warning: null,
      isImpossible: false,
      needsWorkingSlots: false,
    };
  }

  const currentLocLabel = formatBuildingRoomLabel(
    candidate.buildingCode,
    candidate.roomNumber
  );
  if (!currentLocLabel) {
    return {
      warning: null,
      isImpossible: false,
      needsWorkingSlots: false,
    };
  }

  const sorted = [...sameDayMeetings].sort(
    (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
  );

  // Find nearest preceding physical meeting and last preceding meeting of any kind
  let prevAnyEvt: CampusMeeting | undefined;
  let prevPhysicalEvt: CampusMeeting | undefined;
  for (const e of sorted) {
    const eEnd = parseTimeToMinutes(e.endTime);
    if (eEnd <= startMin) {
      if (!prevAnyEvt || eEnd >= parseTimeToMinutes(prevAnyEvt.endTime)) {
        prevAnyEvt = e;
      }
      if (isMeetingLocationUnknown(e)) {
        prevPhysicalEvt = undefined;
      } else if (needsCampusTravel(e)) {
        if (!prevPhysicalEvt || eEnd >= parseTimeToMinutes(prevPhysicalEvt.endTime)) {
          prevPhysicalEvt = e;
        }
      }
    }
  }

  // Find nearest following physical meeting and earliest following meeting of any kind
  let nextAnyEvt: CampusMeeting | undefined;
  let nextPhysicalEvt: CampusMeeting | undefined;
  for (const e of sorted) {
    const eStart = parseTimeToMinutes(e.startTime);
    if (eStart >= endMin) {
      if (!nextAnyEvt || eStart < parseTimeToMinutes(nextAnyEvt.startTime)) {
        nextAnyEvt = e;
      }
      if (!nextPhysicalEvt) {
        if (isMeetingLocationUnknown(e)) {
          break;
        }
        if (needsCampusTravel(e)) {
          nextPhysicalEvt = e;
        }
      }
    }
  }

  const articleFor = (n: number) => (n === 8 || n === 11 || n === 18 ? 'an' : 'a');
  let impossibleMsg: string | null = null;
  let tightMsg: string | null = null;

  // Check transition from preceding in-person meeting (walk starts after prevAnyEvt ends)
  if (prevPhysicalEvt && prevAnyEvt) {
    const priorLocLabel = formatBuildingRoomLabel(
      prevPhysicalEvt.buildingCode,
      prevPhysicalEvt.roomNumber
    );
    if (priorLocLabel) {
      const priorEnd = parseTimeToMinutes(prevAnyEvt.endTime);
      const gap = startMin - priorEnd;
      const calc = calculateBuildingToBuildingSeconds(
        prevPhysicalEvt.buildingCode,
        prevPhysicalEvt.floor || 1,
        candidate.buildingCode,
        candidate.floor,
        settings,
        prevPhysicalEvt.roomNumber,
        candidate.roomNumber.trim()
      );
      const neededTravel = calc.totalMinutes;
      const effectiveBuffer = calc.bufferMinutes;

      if (!calc.isSameRoom && neededTravel > 0) {
        if (gap < neededTravel) {
          impossibleMsg = `You can't get from ${priorLocLabel} to ${currentLocLabel} by ${formatTime12h(
            candidate.startTime
          )} — it's ${articleFor(neededTravel)} ${neededTravel} min walk and you have ${gap}.`;
        } else if (gap < neededTravel + effectiveBuffer) {
          tightMsg = `You can't comfortably get from ${priorLocLabel} to ${currentLocLabel} by ${formatTime12h(
            candidate.startTime
          )} — it's ${articleFor(
            neededTravel
          )} ${neededTravel} min walk (+${effectiveBuffer} min buffer) and you have ${gap}.`;
        }
      }
    }
  }

  // Check transition to following in-person meeting (walk must finish before nextAnyEvt starts)
  if (nextPhysicalEvt && nextAnyEvt) {
    const nextLocLabel = formatBuildingRoomLabel(
      nextPhysicalEvt.buildingCode,
      nextPhysicalEvt.roomNumber
    );
    if (nextLocLabel) {
      const nextStart = parseTimeToMinutes(nextAnyEvt.startTime);
      const gap = nextStart - endMin;
      const calc = calculateBuildingToBuildingSeconds(
        candidate.buildingCode,
        candidate.floor,
        nextPhysicalEvt.buildingCode,
        nextPhysicalEvt.floor || 1,
        settings,
        candidate.roomNumber.trim(),
        nextPhysicalEvt.roomNumber
      );
      const neededTravel = calc.totalMinutes;
      const effectiveBuffer = calc.bufferMinutes;

      if (!calc.isSameRoom && neededTravel > 0) {
        if (gap < neededTravel && !impossibleMsg) {
          impossibleMsg = `You can't get from ${currentLocLabel} to ${nextLocLabel} by ${formatTime12h(
            nextAnyEvt.startTime
          )} — it's ${articleFor(neededTravel)} ${neededTravel} min walk and you have ${gap}.`;
        } else if (gap < neededTravel + effectiveBuffer && !impossibleMsg && !tightMsg) {
          tightMsg = `You can't comfortably get from ${currentLocLabel} to ${nextLocLabel} by ${formatTime12h(
            nextAnyEvt.startTime
          )} — it's ${articleFor(
            neededTravel
          )} ${neededTravel} min walk (+${effectiveBuffer} min buffer) and you have ${gap}.`;
        }
      }
    }
  }

  if (impossibleMsg) {
    return {
      warning: impossibleMsg,
      isImpossible: true,
      needsWorkingSlots: true,
    };
  }

  if (tightMsg) {
    return {
      warning: tightMsg,
      isImpossible: false,
      needsWorkingSlots: true,
    };
  }

  return {
    warning: null,
    isImpossible: false,
    needsWorkingSlots: false,
  };
}
