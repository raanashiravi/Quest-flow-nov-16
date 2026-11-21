import { CampusMeeting } from '../types';
import { getTodayLocalDateString, getTodayTorontoDateString } from '../utils/icsParser';

export function getSampleDayMeetings(overrideDate?: string): CampusMeeting[] {
  const today = overrideDate || getTodayLocalDateString();

  return [
    {
      id: 'sample-1',
      title: 'Team sync',
      date: today,
      startTime: '10:00',
      endTime: '10:45',
      format: 'in_person',
      buildingCode: 'MC',
      roomNumber: '5479',
      floor: 5,
      rawLocation: 'MC 5479',
      source: 'sample',
      organizer: 'Prof. Sarah Chen (Associate Dean)',
      notes: 'Weekly faculty alignment on curriculum and lab space allocations.',
    },
    {
      id: 'sample-2',
      title: 'Budget review',
      date: today,
      startTime: '13:45',
      endTime: '14:30',
      format: 'in_person',
      buildingCode: 'NH',
      roomNumber: '3001',
      floor: 3,
      rawLocation: 'NH 3001',
      source: 'sample',
      organizer: 'Marcus Vance (Finance & Staffing)',
      notes: 'Quarterly administrative budget and operating grants review in Needles Hall.',
    },
    {
      id: 'sample-3',
      title: 'IT check-in',
      date: today,
      startTime: '14:30',
      endTime: '15:00',
      format: 'in_person',
      buildingCode: 'DC',
      roomNumber: '1302',
      floor: 1,
      rawLocation: 'DC 1302',
      source: 'sample',
      organizer: 'David Kim (IST Infrastructure)',
      notes: 'Campus network hardware upgrade and high-performance computing cluster update.',
    },
    {
      id: 'sample-4',
      title: 'Curriculum committee',
      date: today,
      startTime: '15:10',
      endTime: '15:40',
      format: 'hybrid',
      buildingCode: 'E7',
      roomNumber: '2409',
      floor: 2,
      rawLocation: 'E7 2409 / Microsoft Teams',
      onlineLink: 'https://teams.microsoft.com/l/meetup-join/uwaterloo-grad-committee',
      source: 'sample',
      organizer: 'Dr. Priya Patel (Graduate Studies)',
      notes: 'Hybrid session. In-person discussion in E7 2409 with Teams broadcast for remote fellows.',
    },
    {
      id: 'sample-5',
      title: 'Vendor call',
      date: today,
      startTime: '16:00',
      endTime: '16:30',
      format: 'online',
      buildingCode: 'ONLINE',
      roomNumber: '',
      floor: 1,
      rawLocation: 'Microsoft Teams',
      onlineLink: 'https://teams.microsoft.com/l/meetup-join/uwaterloo-toronto-consortium',
      source: 'sample',
      organizer: 'Elena Rostova (Consortium Director)',
      notes: 'Virtual partnership sync between UWaterloo and research affiliates.',
    },
  ];
}

// Generate realistic week of UW staff meetings for Week Overview Grid
export function getSampleWeekMeetings(): Record<string, CampusMeeting[]> {
  const todayStr = getTodayTorontoDateString();
  const baseDate = new Date(todayStr + 'T12:00:00');
  const dayOfWeek = baseDate.getDay(); // 0 is Sunday, 1 is Monday...

  // Compute Monday date
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mondayDate = new Date(baseDate);
  mondayDate.setDate(baseDate.getDate() + mondayOffset);

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  const days: { label: string; date: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const cur = new Date(mondayDate);
    cur.setDate(mondayDate.getDate() + i);
    days.push({
      label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i],
      date: formatDate(cur),
    });
  }

  const result: Record<string, CampusMeeting[]> = {};

  // Monday
  result[days[0].date] = [
    {
      id: 'mon-1',
      title: 'Department Chairs Standup',
      date: days[0].date,
      startTime: '09:00',
      endTime: '09:45',
      format: 'in_person',
      buildingCode: 'MC',
      roomNumber: '2018',
      floor: 2,
      rawLocation: 'MC 2018',
      source: 'sample',
      organizer: 'Dean of Mathematics',
    },
    {
      id: 'mon-2',
      title: 'Robotics Lab Equipment Inspection',
      date: days[0].date,
      startTime: '10:15',
      endTime: '11:15',
      format: 'in_person',
      buildingCode: 'E7',
      roomNumber: '2409',
      floor: 2,
      rawLocation: 'E7 2409',
      source: 'sample',
      organizer: 'Engineering Safety Office',
    },
    {
      id: 'mon-3',
      title: 'Staff Faculty Council',
      date: days[0].date,
      startTime: '14:00',
      endTime: '15:15',
      format: 'hybrid',
      buildingCode: 'NH',
      roomNumber: '3001',
      floor: 3,
      rawLocation: 'NH 3001 / Teams',
      source: 'sample',
      organizer: 'Senate Secretariat',
    },
  ];

  // Tuesday
  result[days[1].date] = [
    {
      id: 'tue-1',
      title: 'Graduate Admissions Committee',
      date: days[1].date,
      startTime: '09:30',
      endTime: '10:30',
      format: 'in_person',
      buildingCode: 'NH',
      roomNumber: '1012',
      floor: 1,
      rawLocation: 'NH 1012',
      source: 'sample',
      organizer: 'Admissions Office',
    },
    {
      id: 'tue-2',
      title: 'Curriculum & Space Allocation',
      date: days[1].date,
      startTime: '10:40', // 10 min gap NH -> DC (cross-campus walk is ~12 min -> impossible back-to-back)
      endTime: '11:40',
      format: 'in_person',
      buildingCode: 'DC',
      roomNumber: '1302',
      floor: 1,
      rawLocation: 'DC 1302',
      source: 'sample',
      organizer: 'Registrar Scheduling',
    },
    {
      id: 'tue-3',
      title: 'Global Research Consortium',
      date: days[1].date,
      startTime: '13:30',
      endTime: '14:30',
      format: 'online',
      buildingCode: 'ONLINE',
      roomNumber: '',
      floor: 1,
      rawLocation: 'Microsoft Teams',
      source: 'sample',
      organizer: 'International Research',
    },
  ];

  // Wednesday
  result[days[2].date] = [
    {
      id: 'wed-1',
      title: 'Quantum Computing Steering Committee',
      date: days[2].date,
      startTime: '10:00',
      endTime: '11:00',
      format: 'in_person',
      buildingCode: 'QNC',
      roomNumber: '2101',
      floor: 2,
      rawLocation: 'QNC 2101',
      source: 'sample',
      organizer: 'IQC Executive Office',
    },
    {
      id: 'wed-2',
      title: 'Lab Biosafety & Facilities Walkthrough',
      date: days[2].date,
      startTime: '11:30',
      endTime: '12:15',
      format: 'in_person',
      buildingCode: 'STC',
      roomNumber: '1012',
      floor: 1,
      rawLocation: 'STC 1012',
      source: 'sample',
      organizer: 'Environmental Safety',
    },
    {
      id: 'wed-3',
      title: 'Undergraduate Operations Review',
      date: days[2].date,
      startTime: '15:00',
      endTime: '16:00',
      format: 'hybrid',
      buildingCode: 'E5',
      roomNumber: '3102',
      floor: 3,
      rawLocation: 'E5 3102 / Teams',
      source: 'sample',
      organizer: 'Engineering Dean Office',
    },
  ];

  // Thursday (Standard Sample Day with MC 5479 -> NH 3001 LATE)
  result[days[3].date] = getSampleDayMeetings(days[3].date);

  // Friday
  result[days[4].date] = [
    {
      id: 'fri-1',
      title: 'Provost Executive Briefing',
      date: days[4].date,
      startTime: '09:00',
      endTime: '09:50',
      format: 'in_person',
      buildingCode: 'NH',
      roomNumber: '3001',
      floor: 3,
      rawLocation: 'NH 3001',
      source: 'sample',
      organizer: 'Office of the Provost',
    },
    {
      id: 'fri-2',
      title: 'Weekly Mathematics & CS Colloquium',
      date: days[4].date,
      startTime: '11:00',
      endTime: '12:00',
      format: 'in_person',
      buildingCode: 'MC',
      roomNumber: '2018',
      floor: 2,
      rawLocation: 'MC 2018',
      source: 'sample',
      organizer: 'Pure Math Department',
    },
    {
      id: 'fri-3',
      title: 'Virtual 1-on-1 Mentorship',
      date: days[4].date,
      startTime: '14:00',
      endTime: '14:45',
      format: 'online',
      buildingCode: 'ONLINE',
      roomNumber: '',
      floor: 1,
      rawLocation: 'Microsoft Teams',
      source: 'sample',
      organizer: 'Faculty Mentorship Circle',
    },
  ];

  return result;
}
