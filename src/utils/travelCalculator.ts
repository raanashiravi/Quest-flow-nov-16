import {
  CampusMeeting,
  CampusSettings,
  TravelBreakdown,
  TravelLeg,
  TravelStatus,
} from '../types';
import { getOutdoorWalkEstimate } from '../data/uwaterlooCampus';

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
  const isOnline = meeting.format === 'online' || Boolean(meeting.isOnline);
  if (isOnline || !meeting.buildingCode || meeting.buildingCode === 'ONLINE') {
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

  const bufferMinutes = settings.arrivalBufferMinutes ?? 5;
  const startMin = parseTimeToMinutes(meeting.startTime);
  const office = settings.office?.buildingCode ? settings.office : null;

  const hasValidPrev = Boolean(
    previousMeeting &&
      previousMeeting.format !== 'online' &&
      !previousMeeting.isOnline &&
      previousMeeting.buildingCode &&
      previousMeeting.buildingCode !== 'ONLINE'
  );

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
  settings: CampusSettings
): TravelLeg {
  const id = `leg-${fromMeeting.id}-${toMeeting.id}`;

  const fromEndMin = parseTimeToMinutes(fromMeeting.endTime);
  const toStartMin = parseTimeToMinutes(toMeeting.startTime);
  const gapMinutes = toStartMin - fromEndMin;
  const gapSeconds = gapMinutes * 60;
  const bufferMinutes = settings.arrivalBufferMinutes ?? 5;

  // Check if purely online
  const isFromOnline = fromMeeting.format === 'online';
  const isToOnline = toMeeting.format === 'online';
  const isNoPhysicalTravel = isFromOnline && isToOnline;

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
      isOnline: true,
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
