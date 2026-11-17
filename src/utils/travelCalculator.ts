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
  settings: CampusSettings
): {
  totalSeconds: number;
  totalMinutes: number;
  rawWalkMinutes: number;
} {
  const isSame =
    Boolean(fromBuildingCode) &&
    Boolean(toBuildingCode) &&
    fromBuildingCode.toUpperCase() === toBuildingCode.toUpperCase();

  if (isSame) {
    const floorDelta = Math.abs(fromFloor - toFloor);
    const floorChange = calculateFloorChangeSeconds(floorDelta, settings);
    const sec = floorChange.seconds + settings.findRoomSeconds;
    return {
      totalSeconds: sec,
      totalMinutes: Math.ceil(sec / 60),
      rawWalkMinutes: 0,
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
  const isSameBuilding =
    Boolean(fromMeeting.buildingCode) &&
    Boolean(toMeeting.buildingCode) &&
    fromMeeting.buildingCode.toUpperCase() === toMeeting.buildingCode.toUpperCase();

  let totalTravelSeconds = 0;
  let rawWalkMinutes = 0;
  let breakdown: TravelBreakdown;

  if (isSameBuilding) {
    const floorDelta = Math.abs((fromMeeting.floor || 1) - (toMeeting.floor || 1));
    const floorChange = calculateFloorChangeSeconds(floorDelta, settings);
    totalTravelSeconds = floorChange.seconds + settings.findRoomSeconds;
    rawWalkMinutes = 0;

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
      bufferMinutes,
      sameBuildingOnlySeconds: totalTravelSeconds,
      summaryLine,
    };
  } else {
    // Cross-building travel calculation:
    // 1. Exit room
    const exitRoomSeconds = settings.exitRoomSeconds;
    // 2. Floors down at origin
    const originFloorsDown = Math.max(0, (fromMeeting.floor || 1) - 1);
    const originFloorDown = calculateFloorChangeSeconds(originFloorsDown, settings);
    // 3. Outdoor walk between buildings
    const baseOutdoorEstimate = getOutdoorWalkEstimate(
      fromMeeting.buildingCode,
      toMeeting.buildingCode,
      settings.walkingSpeed
    );
    rawWalkMinutes = baseOutdoorEstimate.minutes;
    const rawWalkSeconds = rawWalkMinutes * 60;
    // 4. Floors up at destination
    const destFloorsUp = Math.max(0, (toMeeting.floor || 1) - 1);
    const destFloorUp = calculateFloorChangeSeconds(destFloorsUp, settings);
    // 5. Find room at destination
    const findRoomSeconds = settings.findRoomSeconds;

    totalTravelSeconds =
      exitRoomSeconds +
      originFloorDown.seconds +
      rawWalkSeconds +
      destFloorUp.seconds +
      findRoomSeconds;

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
      bufferMinutes,
      summaryLine: parts.join(' · '),
    };
  }

  const totalTravelMinutes = Math.ceil(totalTravelSeconds / 60);
  const neededMinutes = totalTravelMinutes + bufferMinutes;
  const safeTimeMinutes = Math.ceil(totalTravelMinutes * settings.safeTimeMultiplier);

  // Recommended Departure Time:
  // Must leave by: toMeeting.startTime - (totalTravelMinutes + bufferMinutes)
  const departureMinutesFromMidnight = toStartMin - neededMinutes;
  const departureTime = formatMinutesToTime(departureMinutesFromMidnight);

  // Expected Arrival Time:
  // If user leaves at fromMeeting.endTime: arrives at fromEndMin + totalTravelMinutes
  const expectedArrivalMin = fromEndMin + totalTravelMinutes;
  const arrivalTime = formatMinutesToTime(expectedArrivalMin);

  // Status Evaluation:
  // IMPOSSIBLE: gapMinutes < totalTravelMinutes (physically cannot arrive by startTime even with 0 buffer)
  // TIGHT: totalTravelMinutes <= gapMinutes < neededMinutes (will arrive before start, but eats into buffer)
  // ON_TIME: gapMinutes >= neededMinutes
  let status: TravelStatus = 'ON_TIME';
  let minutesLate = 0;

  if (gapMinutes < totalTravelMinutes) {
    status = 'IMPOSSIBLE';
    minutesLate = totalTravelMinutes - gapMinutes;
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
    bufferMinutes,
    safeTimeMinutes,
    status,
    minutesLate,
    isSameBuilding,
    isOnline: false,
    mapsWouldFit,
    breakdown,
  };
}
