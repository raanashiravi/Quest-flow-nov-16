import React, { useState, useEffect, useMemo } from 'react';
import {
  CampusMeeting,
  CampusSettings,
  TravelLeg,
} from '../types';
import { UW_BUILDINGS } from '../data/uwaterlooCampus';
import {
  parseTimeToMinutes,
  formatTime12h,
  calculateTravelLeg,
  calculateMeetingDeparture,
} from '../utils/travelCalculator';
import { playDepartureChime } from '../utils/audioChime';
import {
  Navigation,
  Clock,
  AlertTriangle,
  Building2,
  Video,
  Users,
  CheckCircle2,
  Bell,
  ArrowRight,
  Briefcase,
  Volume2,
} from 'lucide-react';

interface HomeSectionProps {
  meetings: CampusMeeting[];
  selectedDate: string;
  settings: CampusSettings;
  onNavigateToExplore: (meetingId?: string) => void;
  onEditMeeting: (meeting: CampusMeeting) => void;
  onSwitchToOnline: (meetingId: string) => void;
  onOpenNewMeeting: () => void;
}

export const HomeSection: React.FC<HomeSectionProps> = ({
  meetings,
  selectedDate,
  settings,
  onNavigateToExplore,
  onEditMeeting,
  onSwitchToOnline,
  onOpenNewMeeting,
}) => {
  // Current time in Waterloo (simulated or live)
  const [currentMinutes, setCurrentMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const [alertDismissed, setAlertDismissed] = useState(false);
  const [chimeTriggered, setChimeTriggered] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setCurrentMinutes(d.getHours() * 60 + d.getMinutes());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Sorted meetings for current date
  const todayMeetings = useMemo(() => {
    return [...meetings]
      .filter((m) => m.date === selectedDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [meetings, selectedDate]);

  // Travel legs between consecutive meetings
  const travelLegs = useMemo<TravelLeg[]>(() => {
    const legs: TravelLeg[] = [];
    for (let i = 0; i < todayMeetings.length - 1; i++) {
      legs.push(calculateTravelLeg(todayMeetings[i], todayMeetings[i + 1], settings));
    }
    return legs;
  }, [todayMeetings, settings]);

  // Find next upcoming meeting based on current time
  const { nextMeeting, priorMeeting, incomingLeg } = useMemo(() => {
    if (todayMeetings.length === 0) {
      return { nextMeeting: null, priorMeeting: null, incomingLeg: null };
    }

    // Default to the first meeting that hasn't completed, or the first meeting of the day
    let next = todayMeetings.find((m) => {
      const endMin = parseTimeToMinutes(m.endTime);
      return endMin > currentMinutes;
    });

    if (!next) {
      // If all finished or outside hours, focus on the most representative in-person meeting (e.g. Budget review or Team sync)
      next = todayMeetings[1] || todayMeetings[0];
    }

    const nextIndex = todayMeetings.findIndex((m) => m.id === next?.id);
    const prior = nextIndex > 0 ? todayMeetings[nextIndex - 1] : null;
    const leg = nextIndex > 0 ? travelLegs[nextIndex - 1] : null;

    return { nextMeeting: next, priorMeeting: prior, incomingLeg: leg };
  }, [todayMeetings, currentMinutes, travelLegs]);

  // Departure details for the prioritized next meeting
  const departureInfo = useMemo(() => {
    if (!nextMeeting) return null;

    const office = settings.mainOffice;
    const originBldg = priorMeeting
      ? priorMeeting.buildingCode
      : office?.enabled && office?.buildingCode
      ? office.buildingCode
      : 'E7';

    const originFloor = priorMeeting ? priorMeeting.floor || 1 : office?.floor || 2;
    const originLocationLabel = priorMeeting
      ? `Prior meeting in ${priorMeeting.buildingCode} ${priorMeeting.roomNumber || ''}`
      : `Main Office (${originBldg} ${office?.roomNumber || '2408'})`;

    if (incomingLeg) {
      return {
        departureTime: incomingLeg.departureTime,
        travelMinutes: incomingLeg.questFlowTravelMinutes,
        bufferMinutes: incomingLeg.bufferMinutes,
        status: incomingLeg.status,
        minutesLate: incomingLeg.minutesLate,
        originLocationLabel,
        breakdownText: incomingLeg.breakdown.summaryLine,
      };
    }

    const dep = calculateMeetingDeparture(nextMeeting, originBldg, originFloor, settings);
    return {
      departureTime: dep.departureTime,
      travelMinutes: dep.travelMinutes,
      bufferMinutes: dep.bufferMinutes,
      status: 'ON_TIME' as const,
      minutesLate: 0,
      originLocationLabel,
      breakdownText: dep.summary,
    };
  }, [nextMeeting, priorMeeting, incomingLeg, settings]);

  // Countdown in minutes to recommended departure
  const departureCountdown = useMemo(() => {
    if (!departureInfo) return null;
    const depMin = parseTimeToMinutes(departureInfo.departureTime);
    const diff = depMin - currentMinutes;

    if (diff < -60) return 'Passed';
    if (diff < 0) return 'Depart now';
    if (diff === 0) return 'Depart now';
    return `In ${diff} min`;
  }, [departureInfo, currentMinutes]);

  // KPI Metrics
  const totalWalkMinutes = useMemo(() => {
    return travelLegs.reduce((sum, l) => sum + (l.isOnline ? 0 : l.questFlowTravelMinutes), 0);
  }, [travelLegs]);

  const impossibleCount = useMemo(() => {
    return travelLegs.filter((l) => l.status === 'IMPOSSIBLE').length;
  }, [travelLegs]);

  const inPersonCount = useMemo(() => {
    return todayMeetings.filter((m) => m.format === 'in_person').length;
  }, [todayMeetings]);

  const hybridOrOnlineCount = useMemo(() => {
    return todayMeetings.filter((m) => m.format !== 'in_person').length;
  }, [todayMeetings]);

  const handleTestChime = () => {
    playDepartureChime();
    setChimeTriggered(true);
    setTimeout(() => setChimeTriggered(false), 3000);
  };

  const getFormatBadge = (fmt: string) => {
    switch (fmt) {
      case 'online':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-700">
            <Video className="w-3 h-3 text-sky-600" />
            <span>Online</span>
          </span>
        );
      case 'hybrid':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700">
            <Users className="w-3 h-3 text-indigo-600" />
            <span>Hybrid</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
            <Building2 className="w-3 h-3 text-slate-600" />
            <span>In-Person</span>
          </span>
        );
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* =================================================================== */}
      {/* HERO SECTION: PRIORITIZED NEXT MEETING & DEPARTURE INSTRUCTIONS   */}
      {/* =================================================================== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Campus Departure Assistant
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Accurate room-to-room walking times and timely departure reminders for Waterloo staff.
            </p>
          </div>

          <button
            type="button"
            onClick={handleTestChime}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            title="Test audio departure notification"
          >
            <Volume2 className="w-3.5 h-3.5 text-slate-600" />
            <span>{chimeTriggered ? 'Chime Playing...' : 'Test Departure Alert'}</span>
          </button>
        </div>

        {nextMeeting && departureInfo ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Top Bar: Departure Priority Callout */}
            <div className="p-6 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold font-mono">
                    Next Departure
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="text-xs font-mono text-blue-300 font-medium">
                    {departureCountdown}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white">
                    {formatTime12h(departureInfo.departureTime)}
                  </span>
                  <span className="text-xs sm:text-sm text-slate-300">
                    recommended departure
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigateToExplore(nextMeeting.id)}
                  className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg shadow-xs transition-colors flex items-center gap-2 whitespace-nowrap active:scale-[0.98]"
                >
                  <Navigation className="w-4 h-4 text-blue-600" />
                  <span>View Route on Map</span>
                </button>
              </div>
            </div>

            {/* Departure Card Details */}
            <div className="p-6 space-y-5">
              {/* Meeting Info */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">
                      {nextMeeting.title}
                    </h2>
                    {getFormatBadge(nextMeeting.format || (nextMeeting.isOnline ? 'online' : 'in_person'))}
                  </div>
                  <p className="text-sm text-slate-600">
                    <span className="font-semibold text-slate-800">
                      {formatTime12h(nextMeeting.startTime)} – {formatTime12h(nextMeeting.endTime)}
                    </span>
                    <span className="mx-2 text-slate-300">·</span>
                    <span>
                      {nextMeeting.format === 'online'
                        ? 'Microsoft Teams'
                        : `${UW_BUILDINGS[nextMeeting.buildingCode]?.fullName || nextMeeting.buildingCode} (${nextMeeting.buildingCode} ${nextMeeting.roomNumber || ''})`}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {nextMeeting.format !== 'online' && (
                    <button
                      type="button"
                      onClick={() => onSwitchToOnline(nextMeeting.id)}
                      className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                    >
                      Switch to Online
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEditMeeting(nextMeeting)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Adjust Meeting
                  </button>
                </div>
              </div>

              {/* Impossible or Tight Back-to-Back Warning Banner */}
              {departureInfo.status === 'IMPOSSIBLE' && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-red-900 space-y-1">
                    <p className="font-bold text-sm text-red-950">
                      Impossible Back-to-Back Transition Flagged
                    </p>
                    <p className="text-red-800 leading-relaxed">
                      Your prior meeting in {priorMeeting?.buildingCode} ends at {formatTime12h(priorMeeting?.endTime || '')}, leaving only an {incomingLeg?.gapMinutes}m gap. Room-to-room walking to {nextMeeting.buildingCode} requires ~{departureInfo.travelMinutes} minutes. You will arrive at {incomingLeg?.arrivalTime} (~{departureInfo.minutesLate} minutes late).
                    </p>
                    <p className="pt-1 text-red-900 font-medium">
                      Recommendation: Join virtually via Teams or request a 10-minute delayed start.
                    </p>
                  </div>
                </div>
              )}

              {departureInfo.status === 'TIGHT' && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 space-y-0.5">
                    <p className="font-bold text-sm text-amber-950">
                      Tight Transition ({incomingLeg?.gapMinutes}m gap)
                    </p>
                    <p className="text-amber-800">
                      Travel requires ~{departureInfo.travelMinutes} minutes. You will arrive on time, but will consume most of your {settings.arrivalBufferMinutes}m arrival buffer.
                    </p>
                  </div>
                </div>
              )}

              {departureInfo.status === 'ON_TIME' && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    On schedule. Leaving at {formatTime12h(departureInfo.departureTime)} ensures arrival with your {settings.arrivalBufferMinutes} min buffer.
                  </span>
                </div>
              )}

              {/* Transit Breakdown Matrix */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-500 font-medium">Origin</span>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    {departureInfo.originLocationLabel}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-500 font-medium">Room-to-Room Transit</span>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    ~{departureInfo.travelMinutes} minutes
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Includes stairs/elevator & doors
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-500 font-medium">Arrival Buffer</span>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    +{departureInfo.bufferMinutes} min early
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Configurable in Settings
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 space-y-2">
            <p className="text-base font-semibold text-slate-800">
              No meetings scheduled for this date
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Add your faculty and staff meetings to receive automated travel calculations and departure reminders.
            </p>
            <button
              type="button"
              onClick={onOpenNewMeeting}
              className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <span>+ Add First Meeting</span>
            </button>
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* DAILY OVERVIEW KPI STRIP (Restrained, clear typography)             */}
      {/* =================================================================== */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Total Meetings</span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {todayMeetings.length}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            For {selectedDate}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-medium text-slate-500">In-Person / Hybrid</span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {inPersonCount} <span className="text-base font-normal text-slate-400">/ {hybridOrOnlineCount}</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            Require campus transit
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Campus Walking</span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {totalWalkMinutes} <span className="text-sm font-normal text-slate-500">min</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            Between buildings
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Travel Warnings</span>
          <div className={`text-2xl font-bold font-mono mt-1 ${impossibleCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {impossibleCount > 0 ? `${impossibleCount} Impossible` : '0 Alerts'}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            {impossibleCount > 0 ? 'Back-to-back conflicts' : 'All reachable on time'}
          </span>
        </div>
      </section>

      {/* =================================================================== */}
      {/* UPCOMING MEETINGS & DEPARTURE SCHEDULE                             */}
      {/* =================================================================== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            Today's Meeting Schedule
          </h2>
          <span className="text-xs text-slate-500 font-mono">
            {todayMeetings.length} commitments
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden divide-y divide-slate-100">
          {todayMeetings.map((meeting, idx) => {
            const legBefore = travelLegs.find((l) => l.toMeeting.id === meeting.id);
            const isLate = legBefore?.status === 'IMPOSSIBLE';

            return (
              <div
                key={meeting.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Time block */}
                  <div className="w-24 shrink-0 text-left font-mono">
                    <span className="text-sm font-bold text-slate-900 block">
                      {formatTime12h(meeting.startTime)}
                    </span>
                    <span className="text-xs text-slate-500 block">
                      to {formatTime12h(meeting.endTime)}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-900">
                        {meeting.title}
                      </span>
                      {getFormatBadge(meeting.format || (meeting.isOnline ? 'online' : 'in_person'))}
                      {isLate && (
                        <span className="text-xs font-semibold text-red-600">
                          · Flagged ~{legBefore?.minutesLate}m late
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>
                        {meeting.format === 'online'
                          ? 'Microsoft Teams'
                          : `${meeting.buildingCode} ${meeting.roomNumber || ''}`}
                      </span>
                      {meeting.organizer && (
                        <>
                          <span>·</span>
                          <span>{meeting.organizer}</span>
                        </>
                      )}
                      {legBefore && !legBefore.isOnline && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-slate-600">
                            Leave at {formatTime12h(legBefore.departureTime)} ({legBefore.questFlowTravelMinutes}m walk)
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {meeting.format !== 'online' && (
                    <button
                      type="button"
                      onClick={() => onNavigateToExplore(meeting.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Route</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEditMeeting(meeting)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* =================================================================== */}
      {/* CAMPUS WORKSPACE & REMINDERS ADVISORY                               */}
      {/* =================================================================== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Office Desk Opportunity */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
            <Briefcase className="w-4 h-4 text-blue-600" />
            <span>Main Office Desk Return</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Between your Budget review in NH 3001 (ends 11:00 AM) and IT check-in in DC 1302 (starts 1:00 PM), you have a 120-minute gap. Walking back to your office in {settings.mainOffice?.buildingCode || 'E7'} {settings.mainOffice?.roomNumber || '2408'} takes 14m, allowing ~1h 30m of desk work before you depart at 12:45 PM.
          </p>
        </div>

        {/* Campus Weather & Walking Notes */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span>Indoor Bridge & Tunnel Access</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Indoor pedestrian tunnels and sky bridges are available between MC–DC–M3 and CPH–DWE–RCH. Use these during inclement Waterloo weather to stay warm without altering your room-to-room walking estimate.
          </p>
        </div>
      </section>
    </div>
  );
};
