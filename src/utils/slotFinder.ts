import { QuestMeeting, QuestSettings } from '../types';
import { getOutdoorWalkEstimate } from '../data/uwaterlooCampus';
import { parseTimeToMinutes, calculateFloorChangeSeconds } from './travelCalculator';

export interface SuggestedSlot {
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  startMinutes: number;
  endMinutes: number;
  reason: string;
  travelBeforeMinutes: number;
  travelAfterMinutes: number;
  prevMeeting?: QuestMeeting;
  nextMeeting?: QuestMeeting;
}

export function formatMinutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function calculateDeterministicTravelMinutes(
  fromBuilding: string,
  fromFloor: number,
  toBuilding: string,
  toFloor: number,
  settings: QuestSettings,
  isSafeTime = true
): number {
  if (!fromBuilding || !toBuilding || fromBuilding === 'ONLINE' || toBuilding === 'ONLINE') {
    return 0;
  }

  // Same building: floor change + 60s find room only
  if (fromBuilding.toUpperCase() === toBuilding.toUpperCase()) {
    const floorDelta = Math.abs((fromFloor || 1) - (toFloor || 1));
    const floorChange = calculateFloorChangeSeconds(floorDelta, settings);
    const totalSec = floorChange.seconds + settings.findRoomSeconds;
    const baseMin = Math.ceil(totalSec / 60);
    return isSafeTime ? Math.ceil((totalSec * settings.safeTimeMultiplier) / 60) : baseMin;
  }

  // Cross-building travel
  const exitSec = settings.exitRoomSeconds;
  const originDownFloors = Math.max(0, (fromFloor || 1) - 1);
  const originDown = calculateFloorChangeSeconds(originDownFloors, settings);

  const outdoor = getOutdoorWalkEstimate(fromBuilding, toBuilding);
  const walkSec = outdoor.minutes * 60;

  const destUpFloors = Math.max(0, (toFloor || 1) - 1);
  const destUp = calculateFloorChangeSeconds(destUpFloors, settings);

  const findSec = settings.findRoomSeconds;

  const totalSec = exitSec + originDown.seconds + walkSec + destUp.seconds + findSec;
  const baseMin = Math.ceil(totalSec / 60);

  return isSafeTime ? Math.ceil((totalSec * settings.safeTimeMultiplier) / 60) : baseMin;
}

/**
 * Finds valid slots for scheduling a new meeting such that:
 * free gap >= safe travel from previous event + duration + safe travel to next event
 */
export function findAvailableSlots(
  existingEvents: QuestMeeting[],
  target: {
    buildingCode: string;
    floor: number;
    isOnline: boolean;
    durationMinutes: number;
  },
  settings: QuestSettings,
  minSearchTime = '08:00',
  maxSearchTime = '18:00',
  preferredStartTime?: string
): SuggestedSlot[] {
  const minMin = parseTimeToMinutes(minSearchTime);
  const maxMin = parseTimeToMinutes(maxSearchTime);
  const preferredMin = preferredStartTime ? parseTimeToMinutes(preferredStartTime) : minMin;

  const sorted = [...existingEvents].sort(
    (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
  );

  const validSlots: SuggestedSlot[] = [];

  // Search in 5-minute increments
  for (let start = Math.max(minMin, preferredMin); start <= maxMin - target.durationMinutes; start += 5) {
    const end = start + target.durationMinutes;

    // Check if slot overlaps any existing event
    const overlaps = sorted.some((e) => {
      const eStart = parseTimeToMinutes(e.startTime);
      const eEnd = parseTimeToMinutes(e.endTime);
      return !(eEnd <= start || eStart >= end);
    });

    if (overlaps) continue;

    // Find previous event
    let prevEvt: QuestMeeting | undefined;
    for (const e of sorted) {
      if (parseTimeToMinutes(e.endTime) <= start) {
        prevEvt = e;
      }
    }

    // Find next event
    let nextEvt: QuestMeeting | undefined;
    for (const e of sorted) {
      if (parseTimeToMinutes(e.startTime) >= end) {
        nextEvt = e;
        break;
      }
    }

    // Travel from prev event
    let travelBeforeMin = 0;
    if (prevEvt && !prevEvt.isOnline && !target.isOnline) {
      travelBeforeMin = calculateDeterministicTravelMinutes(
        prevEvt.buildingCode,
        prevEvt.floor,
        target.buildingCode,
        target.floor,
        settings,
        true // safe time
      );
      const gapBefore = start - parseTimeToMinutes(prevEvt.endTime);
      if (gapBefore < travelBeforeMin) continue;
    }

    // Travel to next event
    let travelAfterMin = 0;
    if (nextEvt && !nextEvt.isOnline && !target.isOnline) {
      travelAfterMin = calculateDeterministicTravelMinutes(
        target.buildingCode,
        target.floor,
        nextEvt.buildingCode,
        nextEvt.floor,
        settings,
        true // safe time
      );
      const gapAfter = parseTimeToMinutes(nextEvt.startTime) - end;
      if (gapAfter < travelAfterMin) continue;
    }

    // Generate descriptive reason
    let reason = `${formatMinutesToTime(start)}`;
    if (prevEvt && !prevEvt.isOnline) {
      const gapBefore = start - parseTimeToMinutes(prevEvt.endTime);
      reason = `${formatMinutesToTime(start)} — leaves ${gapBefore} min to walk from ${prevEvt.buildingCode}`;
    } else if (nextEvt && !nextEvt.isOnline) {
      const gapAfter = parseTimeToMinutes(nextEvt.startTime) - end;
      reason = `${formatMinutesToTime(start)} — leaves ${gapAfter} min travel to ${nextEvt.buildingCode}`;
    } else {
      reason = `${formatMinutesToTime(start)} — open calendar window`;
    }

    validSlots.push({
      startTime: formatMinutesToTime(start),
      endTime: formatMinutesToTime(end),
      startMinutes: start,
      endMinutes: end,
      reason,
      travelBeforeMinutes: travelBeforeMin,
      travelAfterMinutes: travelAfterMin,
      prevMeeting: prevEvt,
      nextMeeting: nextEvt,
    });

    if (validSlots.length >= 3) {
      break;
    }
  }

  return validSlots;
}

/**
 * Validates whether a specific time can be safely scheduled.
 * If invalid, returns the earliest valid time and the exact reason.
 */
export function validateSlotOrFindEarliest(
  startMin: number,
  durationMinutes: number,
  target: { buildingCode: string; floor: number; isOnline: boolean },
  existingEvents: QuestMeeting[],
  settings: QuestSettings
): {
  isValid: boolean;
  earliestValidTime?: string;
  reason?: string;
} {
  const endMin = startMin + durationMinutes;
  const sorted = [...existingEvents].sort(
    (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
  );

  let prevEvt: QuestMeeting | undefined;
  for (const e of sorted) {
    if (parseTimeToMinutes(e.endTime) <= startMin) {
      prevEvt = e;
    }
  }

  let nextEvt: QuestMeeting | undefined;
  for (const e of sorted) {
    if (parseTimeToMinutes(e.startTime) >= endMin) {
      nextEvt = e;
      break;
    }
  }

  // Check overlap
  const overlappingEvt = sorted.find((e) => {
    const eStart = parseTimeToMinutes(e.startTime);
    const eEnd = parseTimeToMinutes(e.endTime);
    return !(eEnd <= startMin || eStart >= endMin);
  });

  if (overlappingEvt) {
    const suggestions = findAvailableSlots(
      existingEvents,
      { ...target, durationMinutes },
      settings,
      '08:00',
      '18:00',
      overlappingEvt.endTime
    );
    const earliest = suggestions[0]?.startTime || '12:00';
    return {
      isValid: false,
      earliestValidTime: earliest,
      reason: `Overlaps with "${overlappingEvt.title}" (${overlappingEvt.startTime}–${overlappingEvt.endTime}) — earliest that works: ${earliest}`,
    };
  }

  // Check travel from previous event
  if (prevEvt && !prevEvt.isOnline && !target.isOnline) {
    const safeTravelBefore = calculateDeterministicTravelMinutes(
      prevEvt.buildingCode,
      prevEvt.floor,
      target.buildingCode,
      target.floor,
      settings,
      true
    );
    const gapBefore = startMin - parseTimeToMinutes(prevEvt.endTime);

    if (gapBefore < safeTravelBefore) {
      const earliestMin = Math.ceil((parseTimeToMinutes(prevEvt.endTime) + safeTravelBefore) / 5) * 5;
      const earliest = formatMinutesToTime(earliestMin);
      return {
        isValid: false,
        earliestValidTime: earliest,
        reason: `Not enough time to walk from ${prevEvt.buildingCode} — earliest that works: ${earliest}`,
      };
    }
  }

  // Check travel to next event
  if (nextEvt && !nextEvt.isOnline && !target.isOnline) {
    const safeTravelAfter = calculateDeterministicTravelMinutes(
      target.buildingCode,
      target.floor,
      nextEvt.buildingCode,
      nextEvt.floor,
      settings,
      true
    );
    const gapAfter = parseTimeToMinutes(nextEvt.startTime) - endMin;

    if (gapAfter < safeTravelAfter) {
      const suggestions = findAvailableSlots(
        existingEvents,
        { ...target, durationMinutes },
        settings,
        '08:00',
        '18:00',
        nextEvt.endTime
      );
      const earliest = suggestions[0]?.startTime || '12:00';
      return {
        isValid: false,
        earliestValidTime: earliest,
        reason: `Not enough time to walk to next meeting in ${nextEvt.buildingCode} (${safeTravelAfter} min needed) — next slot that works: ${earliest}`,
      };
    }
  }

  return { isValid: true };
}
