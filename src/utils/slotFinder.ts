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

  const buffer = settings.arrivalBufferMinutes ?? 5;

  // Same building: floor change + 60s find room only
  if (fromBuilding.toUpperCase() === toBuilding.toUpperCase()) {
    const floorDelta = Math.abs((fromFloor || 1) - (toFloor || 1));
    const floorChange = calculateFloorChangeSeconds(floorDelta, settings);
    const totalSec = floorChange.seconds + settings.findRoomSeconds;
    const baseMin = Math.ceil(totalSec / 60);
    return isSafeTime
      ? Math.max(Math.ceil((totalSec * settings.safeTimeMultiplier) / 60), baseMin + buffer)
      : baseMin;
  }

  // Cross-building travel
  const exitSec = settings.exitRoomSeconds;
  const originDownFloors = Math.max(0, (fromFloor || 1) - 1);
  const originDown = calculateFloorChangeSeconds(originDownFloors, settings);

  const outdoor = getOutdoorWalkEstimate(fromBuilding, toBuilding, settings.walkingSpeed);
  const walkSec = outdoor.minutes * 60;

  const destUpFloors = Math.max(0, (toFloor || 1) - 1);
  const destUp = calculateFloorChangeSeconds(destUpFloors, settings);

  const findSec = settings.findRoomSeconds;

  const totalSec = exitSec + originDown.seconds + walkSec + destUp.seconds + findSec;
  const baseMin = Math.ceil(totalSec / 60);

  return isSafeTime
    ? Math.max(Math.ceil((totalSec * settings.safeTimeMultiplier) / 60), baseMin + buffer)
    : baseMin;
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
  preferredStartTime?: string,
  targetDate?: string
): SuggestedSlot[] {
  const minMin = parseTimeToMinutes(minSearchTime);
  const maxMin = parseTimeToMinutes(maxSearchTime);
  const preferredMin = preferredStartTime ? parseTimeToMinutes(preferredStartTime) : minMin;

  // For today's date, only return start times at least 10 minutes from now
  // rounded up to the next :00/:15/:30/:45
  const now = new Date();
  const todayLocalStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(now.getDate()).padStart(2, '0')}`;
  const effectiveDate = targetDate || existingEvents[0]?.date;
  const isToday = effectiveDate === todayLocalStr;
  const nowPlus10Quarter = isToday
    ? Math.ceil((now.getHours() * 60 + now.getMinutes() + 10) / 15) * 15
    : 0;

  const sorted = [...existingEvents].sort(
    (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
  );

  const allValidSlots: SuggestedSlot[] = [];

  // Search in 5-minute increments across the window
  for (
    let start = Math.max(minMin, preferredMin, nowPlus10Quarter);
    start <= maxMin - target.durationMinutes;
    start += 5
  ) {
    const end = start + target.durationMinutes;

    // Check if slot overlaps any existing event (in-person, hybrid, or online)
    const overlaps = sorted.some((e) => {
      const eStart = parseTimeToMinutes(e.startTime);
      const eEnd = parseTimeToMinutes(e.endTime);
      return !(eEnd <= start || eStart >= end);
    });

    if (overlaps) continue;

    // Preceding side:
    // - prevAnyEvt: whichever meeting (in-person, hybrid, or online) ends last before `start`
    // - prevPhysicalEvt: nearest preceding in-person/hybrid meeting ending before `start`
    let prevAnyEvt: QuestMeeting | undefined;
    let prevPhysicalEvt: QuestMeeting | undefined;
    for (const e of sorted) {
      const eEnd = parseTimeToMinutes(e.endTime);
      if (eEnd <= start) {
        if (!prevAnyEvt || eEnd >= parseTimeToMinutes(prevAnyEvt.endTime)) {
          prevAnyEvt = e;
        }
        const isOnline = e.format === 'online' || Boolean(e.isOnline);
        if (!isOnline) {
          if (!prevPhysicalEvt || eEnd >= parseTimeToMinutes(prevPhysicalEvt.endTime)) {
            prevPhysicalEvt = e;
          }
        }
      }
    }

    // Following side:
    // - nextAnyEvt: whichever meeting (in-person, hybrid, or online) starts first after `end`
    // - nextPhysicalEvt: nearest following in-person/hybrid meeting starting after `end`
    let nextAnyEvt: QuestMeeting | undefined;
    let nextPhysicalEvt: QuestMeeting | undefined;
    for (const e of sorted) {
      const eStart = parseTimeToMinutes(e.startTime);
      if (eStart >= end) {
        if (!nextAnyEvt || eStart < parseTimeToMinutes(nextAnyEvt.startTime)) {
          nextAnyEvt = e;
        }
        const isOnline = e.format === 'online' || Boolean(e.isOnline);
        if (!isOnline) {
          if (!nextPhysicalEvt || eStart < parseTimeToMinutes(nextPhysicalEvt.startTime)) {
            nextPhysicalEvt = e;
          }
        }
      }
    }

    // Travel from preceding physical building, starting after the last preceding meeting of any kind ends
    let travelBeforeMin = 0;
    if (prevPhysicalEvt && prevAnyEvt && !target.isOnline) {
      travelBeforeMin = calculateDeterministicTravelMinutes(
        prevPhysicalEvt.buildingCode,
        prevPhysicalEvt.floor,
        target.buildingCode,
        target.floor,
        settings,
        true // safe time
      );
      const gapBefore = start - parseTimeToMinutes(prevAnyEvt.endTime);
      if (gapBefore < travelBeforeMin) continue;
    }

    // Travel toward following physical building, finishing before the next meeting of any kind starts
    let travelAfterMin = 0;
    if (nextPhysicalEvt && nextAnyEvt && !target.isOnline) {
      travelAfterMin = calculateDeterministicTravelMinutes(
        target.buildingCode,
        target.floor,
        nextPhysicalEvt.buildingCode,
        nextPhysicalEvt.floor,
        settings,
        true // safe time
      );
      const gapAfter = parseTimeToMinutes(nextAnyEvt.startTime) - end;
      if (gapAfter < travelAfterMin) continue;
    }

    // Generate descriptive reason
    let reason = `${formatMinutesToTime(start)}`;
    if (prevPhysicalEvt && prevAnyEvt) {
      const gapBefore = start - parseTimeToMinutes(prevAnyEvt.endTime);
      reason = `${formatMinutesToTime(start)} — leaves ${gapBefore} min to walk from ${prevPhysicalEvt.buildingCode}`;
    } else if (nextPhysicalEvt && nextAnyEvt) {
      const gapAfter = parseTimeToMinutes(nextAnyEvt.startTime) - end;
      reason = `${formatMinutesToTime(start)} — leaves ${gapAfter} min travel to ${nextPhysicalEvt.buildingCode}`;
    } else {
      reason = `${formatMinutesToTime(start)} — open calendar window`;
    }

    allValidSlots.push({
      startTime: formatMinutesToTime(start),
      endTime: formatMinutesToTime(end),
      startMinutes: start,
      endMinutes: end,
      reason,
      travelBeforeMinutes: travelBeforeMin,
      travelAfterMinutes: travelAfterMin,
      prevMeeting: prevPhysicalEvt || prevAnyEvt,
      nextMeeting: nextPhysicalEvt || nextAnyEvt,
    });
  }

  if (allValidSlots.length === 0) {
    return [];
  }

  // Group contiguous 5-minute valid slots into separate free windows of the day
  const windows: SuggestedSlot[][] = [];
  for (const slot of allValidSlots) {
    const lastWin = windows[windows.length - 1];
    if (!lastWin || slot.startMinutes - lastWin[lastWin.length - 1].startMinutes > 5) {
      windows.push([slot]);
    } else {
      lastWin.push(slot);
    }
  }

  const pickEarliestInWindow = (win: SuggestedSlot[]): SuggestedSlot =>
    win.find((s) => s.startMinutes % 15 === 0) || win[0];

  const pickLatestInWindow = (win: SuggestedSlot[]): SuggestedSlot =>
    [...win].reverse().find((s) => s.startMinutes % 15 === 0) || win[win.length - 1];

  // 1. Pick the earliest valid start in each separate free window of the day, in time order, up to 3 chips
  const chosen: SuggestedSlot[] = windows.slice(0, 3).map(pickEarliestInWindow);

  // 2. If fewer than 3 windows exist, add the latest valid start of the largest window,
  //    provided it is at least 30 min from the other chips
  if (windows.length < 3 && chosen.length < 3) {
    const windowsBySize = [...windows].sort((a, b) => b.length - a.length);
    for (const win of windowsBySize) {
      if (chosen.length >= 3) break;
      const latest = pickLatestInWindow(win);
      const isAtLeast30MinAway = chosen.every(
        (c) => Math.abs(c.startMinutes - latest.startMinutes) >= 30
      );
      if (isAtLeast30MinAway) {
        chosen.push(latest);
      }
    }
  }

  chosen.sort((a, b) => a.startMinutes - b.startMinutes);
  return chosen.slice(0, 3);
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

  let prevAnyEvt: QuestMeeting | undefined;
  let prevPhysicalEvt: QuestMeeting | undefined;
  for (const e of sorted) {
    const eEnd = parseTimeToMinutes(e.endTime);
    if (eEnd <= startMin) {
      if (!prevAnyEvt || eEnd >= parseTimeToMinutes(prevAnyEvt.endTime)) {
        prevAnyEvt = e;
      }
      const isOnline = e.format === 'online' || Boolean(e.isOnline);
      if (!isOnline) {
        if (!prevPhysicalEvt || eEnd >= parseTimeToMinutes(prevPhysicalEvt.endTime)) {
          prevPhysicalEvt = e;
        }
      }
    }
  }

  let nextAnyEvt: QuestMeeting | undefined;
  let nextPhysicalEvt: QuestMeeting | undefined;
  for (const e of sorted) {
    const eStart = parseTimeToMinutes(e.startTime);
    if (eStart >= endMin) {
      if (!nextAnyEvt || eStart < parseTimeToMinutes(nextAnyEvt.startTime)) {
        nextAnyEvt = e;
      }
      const isOnline = e.format === 'online' || Boolean(e.isOnline);
      if (!isOnline) {
        if (!nextPhysicalEvt || eStart < parseTimeToMinutes(nextPhysicalEvt.startTime)) {
          nextPhysicalEvt = e;
        }
      }
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

  // Check travel from previous physical event (starting after last preceding event of any kind ends)
  if (prevPhysicalEvt && prevAnyEvt && !target.isOnline) {
    const safeTravelBefore = calculateDeterministicTravelMinutes(
      prevPhysicalEvt.buildingCode,
      prevPhysicalEvt.floor,
      target.buildingCode,
      target.floor,
      settings,
      true
    );
    const gapBefore = startMin - parseTimeToMinutes(prevAnyEvt.endTime);

    if (gapBefore < safeTravelBefore) {
      const earliestMin = Math.ceil((parseTimeToMinutes(prevAnyEvt.endTime) + safeTravelBefore) / 5) * 5;
      const earliest = formatMinutesToTime(earliestMin);
      return {
        isValid: false,
        earliestValidTime: earliest,
        reason: `Not enough time to walk from ${prevPhysicalEvt.buildingCode} — earliest that works: ${earliest}`,
      };
    }
  }

  // Check travel to next physical event (finishing before next event of any kind starts)
  if (nextPhysicalEvt && nextAnyEvt && !target.isOnline) {
    const safeTravelAfter = calculateDeterministicTravelMinutes(
      target.buildingCode,
      target.floor,
      nextPhysicalEvt.buildingCode,
      nextPhysicalEvt.floor,
      settings,
      true
    );
    const gapAfter = parseTimeToMinutes(nextAnyEvt.startTime) - endMin;

    if (gapAfter < safeTravelAfter) {
      const suggestions = findAvailableSlots(
        existingEvents,
        { ...target, durationMinutes },
        settings,
        '08:00',
        '18:00',
        nextAnyEvt.endTime
      );
      const earliest = suggestions[0]?.startTime || '12:00';
      return {
        isValid: false,
        earliestValidTime: earliest,
        reason: `Not enough time to walk to next meeting in ${nextPhysicalEvt.buildingCode} (${safeTravelAfter} min needed) — next slot that works: ${earliest}`,
      };
    }
  }

  return { isValid: true };
}
