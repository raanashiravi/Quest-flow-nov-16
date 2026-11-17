import { QuestMeeting, TravelLeg } from '../types';

function formatIcsDateTime(dateStr: string, timeStr: string): string {
  // dateStr: 'YYYY-MM-DD', timeStr: 'HH:MM'
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = timeStr.replace(/:/g, '') + '00';
  return `${cleanDate}T${cleanTime}`;
}

export function downloadTravelBlockIcs(leg: TravelLeg): void {
  const from = leg.fromMeeting;
  const to = leg.toMeeting;
  const dateStr = to.date || from.date;

  const durationMin = leg.questFlowTravelMinutes;
  const departureTime = from.endTime;

  // Compute end time of travel block
  const [h, m] = departureTime.split(':').map(Number);
  const totalMin = h * 60 + m + durationMin;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  const arrivalTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

  const summary = `Campus Walk: ${from.buildingCode} ${from.roomNumber || ''} → ${to.buildingCode} ${to.roomNumber || ''}`;
  const location = `${from.buildingCode} to ${to.buildingCode}`;
  const description = `QuestFlow Real Travel Time Buffer (${durationMin} min)\\n\\nBreakdown:\\n${leg.breakdown.summaryLine}\\n\\nOrigin: ${from.title} (${from.buildingCode} ${from.roomNumber || ''})\\nDestination: ${to.title} (${to.buildingCode} ${to.roomNumber || ''})`;

  const dtStart = formatIcsDateTime(dateStr, departureTime);
  const dtEnd = formatIcsDateTime(dateStr, arrivalTime);
  const uid = `questflow-travel-${Date.now()}@uwaterloo.ca`;
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QuestFlow//UW Room-to-Room Travel//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;TZID=America/Toronto:${dtStart}`,
    `DTEND;TZID=America/Toronto:${dtEnd}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'TRIGGER:-PT5M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Time to start walking to next meeting',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const icsContent = icsLines.join('\r\n');
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `QuestFlow_Travel_${from.buildingCode}_to_${to.buildingCode}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Section 9: "Export to Outlook" downloads an .ics containing ONLY new events
 * and their travel blocks (never re-exports imported ones).
 */
export function exportNewEventsAndTravelToOutlook(
  newMeetings: QuestMeeting[],
  allTravelLegs: TravelLeg[]
): void {
  const newMeetingIds = new Set(newMeetings.map((m) => m.id));

  // Travel blocks connected to new meetings
  const relevantLegs = allTravelLegs.filter(
    (leg) =>
      !leg.isOnline &&
      (newMeetingIds.has(leg.fromMeeting.id) || newMeetingIds.has(leg.toMeeting.id))
  );

  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const icsEvents: string[] = [];

  // Export each new meeting
  for (const m of newMeetings) {
    const dtStart = formatIcsDateTime(m.date, m.startTime);
    const dtEnd = formatIcsDateTime(m.date, m.endTime);
    const location = m.isOnline ? 'Microsoft Teams' : `${m.buildingCode} ${m.roomNumber || ''}`;

    icsEvents.push(
      [
        'BEGIN:VEVENT',
        `UID:questflow-event-${m.id}@uwaterloo.ca`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;TZID=America/Toronto:${dtStart}`,
        `DTEND;TZID=America/Toronto:${dtEnd}`,
        `SUMMARY:${m.title}`,
        `LOCATION:${location}`,
        `DESCRIPTION:Scheduled with QuestFlow smart walking buffer`,
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'END:VEVENT',
      ].join('\r\n')
    );
  }

  // Export connected travel blocks
  for (const leg of relevantLegs) {
    const from = leg.fromMeeting;
    const to = leg.toMeeting;
    const dateStr = to.date || from.date;
    const dtStart = formatIcsDateTime(dateStr, from.endTime);

    const [h, min] = from.endTime.split(':').map(Number);
    const totalMin = h * 60 + min + leg.questFlowTravelMinutes;
    const endH = Math.floor(totalMin / 60) % 24;
    const endM = totalMin % 60;
    const arrivalTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
    const dtEnd = formatIcsDateTime(dateStr, arrivalTime);

    icsEvents.push(
      [
        'BEGIN:VEVENT',
        `UID:questflow-travel-${leg.id}@uwaterloo.ca`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;TZID=America/Toronto:${dtStart}`,
        `DTEND;TZID=America/Toronto:${dtEnd}`,
        `SUMMARY:🚶 Travel: ${from.buildingCode} → ${to.buildingCode} (${leg.questFlowTravelMinutes} min)`,
        `LOCATION:${from.buildingCode} to ${to.buildingCode}`,
        `DESCRIPTION:${leg.breakdown.summaryLine}`,
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'BEGIN:VALARM',
        'TRIGGER:-PT5M',
        'ACTION:DISPLAY',
        'DESCRIPTION:Time to start walking to next meeting',
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n')
    );
  }

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QuestFlow//UW Smart Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...icsEvents,
    'END:VCALENDAR',
  ];

  const icsContent = icsLines.join('\r\n');
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `QuestFlow_New_Events_${Date.now()}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
