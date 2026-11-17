import ICAL from 'ical.js';
import { QuestMeeting } from '../types';
import { parseLocationString } from './locationParser';

export function getTodayLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayTorontoDateString(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function convertJsDateToToronto(date: Date): { dateStr: string; timeStr: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    timeStr: `${map.hour}:${map.minute}`,
  };
}

/**
 * Parses one or more ICS strings client-side with ical.js,
 * expands RRULE recurring events, handles EXDATE exceptions,
 * converts times to America/Toronto, filters to targetDateStr,
 * and skips all-day and TRANSP:TRANSPARENT events.
 */
export function parseIcsContents(
  icsTexts: string[],
  targetDateStr: string
): QuestMeeting[] {
  const meetings: QuestMeeting[] = [];
  const seenKeys = new Set<string>();

  for (let fileIndex = 0; fileIndex < icsTexts.length; fileIndex++) {
    const text = icsTexts[fileIndex];
    if (!text || !text.trim()) continue;

    try {
      const jcal = ICAL.parse(text);
      const comp = new ICAL.Component(jcal);
      const vevents = comp.getAllSubcomponents('vevent');

      // First pass: collect RECURRENCE-ID and EXDATE exceptions
      const recurrenceExceptions = new Map<string, Set<string>>(); // UID -> set of exception dateStrings
      const modifiedOccurrences = new Map<string, QuestMeeting>(); // UID_dateStr -> modified event

      for (const vevent of vevents) {
        const uid = String(vevent.getFirstPropertyValue('uid') || `evt-${Math.random()}`);
        const recurIdProp = vevent.getFirstProperty('recurrence-id');

        if (recurIdProp) {
          const recurTime = recurIdProp.getFirstValue() as any;
          if (recurTime && typeof recurTime.toJSDate === 'function') {
            const toronto = convertJsDateToToronto(recurTime.toJSDate());
            if (!recurrenceExceptions.has(uid)) {
              recurrenceExceptions.set(uid, new Set());
            }
            recurrenceExceptions.get(uid)!.add(toronto.dateStr);

            // If the modified occurrence is on our target date, store it
            if (toronto.dateStr === targetDateStr) {
              const eventObj = new ICAL.Event(vevent);
              const isTransparent = vevent.getFirstPropertyValue('transp') === 'TRANSPARENT';
              const isAllDay = eventObj.startDate.isDate;

              if (!isTransparent && !isAllDay) {
                const startToronto = convertJsDateToToronto(eventObj.startDate.toJSDate());
                const endToronto = convertJsDateToToronto(eventObj.endDate.toJSDate());
                const rawLoc = (vevent.getFirstPropertyValue('location') as string) || '';
                const parsedLoc = parseLocationString(rawLoc);

                modifiedOccurrences.set(`${uid}_${targetDateStr}`, {
                  id: `ics-${uid}-${targetDateStr}`,
                  title: (vevent.getFirstPropertyValue('summary') as string) || 'Untitled Meeting',
                  date: targetDateStr,
                  startTime: startToronto.timeStr,
                  endTime: endToronto.timeStr,
                  rawLocation: rawLoc,
                  buildingCode: parsedLoc.buildingCode,
                  roomNumber: parsedLoc.roomNumber,
                  floor: parsedLoc.floor,
                  isOnline: parsedLoc.isOnline,
                  isUnparseableLocation: parsedLoc.isUnparseableLocation,
                  organizer: (vevent.getFirstPropertyValue('organizer') as string) || undefined,
                  notes: (vevent.getFirstPropertyValue('description') as string) || undefined,
                  source: 'imported' as const,
                });
              }
            }
          }
        }

        // Collect EXDATE properties
        const exdateProps = vevent.getAllProperties('exdate');
        for (const exProp of exdateProps) {
          const exValues = exProp.getValues();
          for (const val of exValues) {
            if (val && typeof (val as any).toJSDate === 'function') {
              const exToronto = convertJsDateToToronto((val as any).toJSDate());
              if (!recurrenceExceptions.has(uid)) {
                recurrenceExceptions.set(uid, new Set());
              }
              recurrenceExceptions.get(uid)!.add(exToronto.dateStr);
            }
          }
        }
      }

      // Second pass: process base events and recurring expansions
      for (const vevent of vevents) {
        // Skip subcomponents that are pure recurrence overrides (processed above)
        if (vevent.getFirstProperty('recurrence-id')) continue;

        const uid = String(vevent.getFirstPropertyValue('uid') || `evt-${Math.random()}`);
        const event = new ICAL.Event(vevent);

        // Skip transparent / free events
        const isTransparent = vevent.getFirstPropertyValue('transp') === 'TRANSPARENT';
        if (isTransparent) continue;

        // Skip all-day events
        const isAllDay = event.startDate.isDate;
        if (isAllDay) continue;

        const rawLoc = (vevent.getFirstPropertyValue('location') as string) || '';
        const parsedLoc = parseLocationString(rawLoc);
        const title = (vevent.getFirstPropertyValue('summary') as string) || 'Untitled Meeting';
        const organizer = (vevent.getFirstPropertyValue('organizer') as string) || undefined;
        const notes = (vevent.getFirstPropertyValue('description') as string) || undefined;

        // Check if event is recurring
        if (event.isRecurring()) {
          const exceptions = recurrenceExceptions.get(uid);

          // If there's an explicit override for this target date, use it
          const overrideKey = `${uid}_${targetDateStr}`;
          if (modifiedOccurrences.has(overrideKey)) {
            const modEvt = modifiedOccurrences.get(overrideKey)!;
            const dedupeKey = `${modEvt.title}-${modEvt.startTime}-${modEvt.endTime}`;
            if (!seenKeys.has(dedupeKey)) {
              seenKeys.add(dedupeKey);
              meetings.push(modEvt);
            }
            continue;
          }

          // Otherwise expand iterator to find if an occurrence lands on targetDateStr
          const iter = event.iterator();
          let nextTime: any;
          let iterations = 0;
          const maxIterations = 500;

          while ((nextTime = iter.next()) && iterations < maxIterations) {
            iterations++;
            const occurrenceDate = nextTime.toJSDate();
            const toronto = convertJsDateToToronto(occurrenceDate);

            // If we've passed target date by more than 2 days in Toronto, break early
            if (toronto.dateStr > targetDateStr) {
              break;
            }

            if (toronto.dateStr === targetDateStr) {
              // Check if excluded by EXDATE or modified by recurrence-id
              if (exceptions && exceptions.has(targetDateStr)) {
                break;
              }

              // Compute end time using event duration
              const duration = event.duration;
              const endTime = nextTime.clone();
              endTime.addDuration(duration);
              const endToronto = convertJsDateToToronto(endTime.toJSDate());

              const dedupeKey = `${title}-${toronto.timeStr}-${endToronto.timeStr}`;
              if (!seenKeys.has(dedupeKey)) {
                seenKeys.add(dedupeKey);
                meetings.push({
                  id: `ics-${uid}-${targetDateStr}-${iterations}`,
                  title,
                  date: targetDateStr,
                  startTime: toronto.timeStr,
                  endTime: endToronto.timeStr,
                  rawLocation: rawLoc,
                  buildingCode: parsedLoc.buildingCode,
                  roomNumber: parsedLoc.roomNumber,
                  floor: parsedLoc.floor,
                  isOnline: parsedLoc.isOnline,
                  isUnparseableLocation: parsedLoc.isUnparseableLocation,
                  organizer,
                  notes,
                  source: 'imported' as const,
                });
              }
              break;
            }
          }
        } else {
          // Single (non-recurring) event
          const startToronto = convertJsDateToToronto(event.startDate.toJSDate());
          const endToronto = convertJsDateToToronto(event.endDate.toJSDate());

          if (startToronto.dateStr === targetDateStr) {
            const dedupeKey = `${title}-${startToronto.timeStr}-${endToronto.timeStr}`;
            if (!seenKeys.has(dedupeKey)) {
              seenKeys.add(dedupeKey);
              meetings.push({
                id: `ics-${uid}-${startToronto.timeStr}`,
                title,
                date: targetDateStr,
                startTime: startToronto.timeStr,
                endTime: endToronto.timeStr,
                rawLocation: rawLoc,
                buildingCode: parsedLoc.buildingCode,
                roomNumber: parsedLoc.roomNumber,
                floor: parsedLoc.floor,
                isOnline: parsedLoc.isOnline,
                isUnparseableLocation: parsedLoc.isUnparseableLocation,
                organizer,
                notes,
                source: 'imported' as const,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Error parsing ICS text file index ${fileIndex}:`, err);
    }
  }

  // Sort chronologically by start time
  return meetings.sort((a, b) => a.startTime.localeCompare(b.startTime));
}
