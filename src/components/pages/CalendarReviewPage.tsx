import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  MapPin,
  Plus,
  Trash2,
  Edit3,
  Video,
  ArrowRight,
  Navigation,
  ChevronDown,
  Footprints,
  Link2,
  Clock,
  History,
  ExternalLink,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { CampusMeeting, CampusSettings, TravelLeg } from '../../types';
import {
  calculateTravelLeg,
  parseTimeToMinutes,
  formatTime12h,
} from '../../utils/travelCalculator';
import { getTodayLocalDateString } from '../../utils/icsParser';
import { getGoogleMapsDirectionsUrl } from '../../utils/googleMapsLinks';

const PIXELS_PER_MIN = 2.2; // 132px per hour

function formatWrittenDate(dateStr: string): string {
  if (!dateStr) return '';
  const parsed = new Date(`${dateStr}T12:00:00`);
  if (isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function formatHourAxis(hour24: number): string {
  const normalized = ((hour24 % 24) + 24) % 24;
  if (normalized === 0) return '12 AM';
  if (normalized < 12) return `${normalized} AM`;
  if (normalized === 12) return '12 PM';
  return `${normalized - 12} PM`;
}

function formatDurationBadge(minutes: number): string {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface PositionedMeeting {
  meeting: CampusMeeting;
  startMin: number;
  endMin: number;
  col: number;
  totalCols: number;
}

function layoutOverlappingMeetings(list: CampusMeeting[]): PositionedMeeting[] {
  if (list.length === 0) return [];

  const sorted = [...list]
    .map((meeting) => {
      const startMin = parseTimeToMinutes(meeting.startTime);
      const rawEnd = parseTimeToMinutes(meeting.endTime);
      const endMin = Math.max(startMin + 15, rawEnd);
      return { meeting, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Group into overlap clusters
  const clusters: { items: typeof sorted; maxEnd: number }[] = [];
  for (const item of sorted) {
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster || item.startMin >= lastCluster.maxEnd) {
      clusters.push({ items: [item], maxEnd: item.endMin });
    } else {
      lastCluster.items.push(item);
      lastCluster.maxEnd = Math.max(lastCluster.maxEnd, item.endMin);
    }
  }

  const result: PositionedMeeting[] = [];
  for (const cluster of clusters) {
    const colEndTimes: number[] = [];
    const assigned: { item: (typeof sorted)[number]; col: number }[] = [];

    for (const item of cluster.items) {
      let colIdx = colEndTimes.findIndex((end) => end <= item.startMin);
      if (colIdx === -1) {
        colIdx = colEndTimes.length;
        colEndTimes.push(item.endMin);
      } else {
        colEndTimes[colIdx] = item.endMin;
      }
      assigned.push({ item, col: colIdx });
    }

    const totalCols = Math.max(1, colEndTimes.length);
    for (const entry of assigned) {
      result.push({
        meeting: entry.item.meeting,
        startMin: entry.item.startMin,
        endMin: entry.item.endMin,
        col: entry.col,
        totalCols,
      });
    }
  }

  return result;
}

interface CalendarReviewPageProps {
  meetings: CampusMeeting[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onAddMeeting: () => void;
  onEditMeeting: (meeting: CampusMeeting) => void;
  onDeleteMeeting: (id: string) => void;
  onQuickToggleFormat: (id: string, format: 'in_person' | 'online' | 'hybrid') => void;
  onOpenNextMeeting: () => void;
  onBackToConnect: () => void;
  settings: CampusSettings;
}

export const CalendarReviewPage: React.FC<CalendarReviewPageProps> = ({
  meetings,
  selectedDate,
  onSelectDate,
  onAddMeeting,
  onEditMeeting,
  onDeleteMeeting,
  onQuickToggleFormat,
  onOpenNextMeeting,
  onBackToConnect,
  settings,
}) => {
  const [filterFormat, setFilterFormat] = useState<'all' | 'in_person' | 'online' | 'hybrid'>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showPassedDropdown, setShowPassedDropdown] = useState<boolean>(false);

  // Live time-of-day clock (updates every 15s)
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = getTodayLocalDateString(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeLabel = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(now);

  const isToday = selectedDate === todayStr;
  const isPastDate = selectedDate < todayStr;

  // Filter & sort all meetings for the selected date
  const dayMeetings = useMemo(
    () =>
      meetings
        .filter((m) => m.date === selectedDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [meetings, selectedDate]
  );

  // Compute travel legs between consecutive physical/hybrid meetings across the full day
  const travelLegs = useMemo(() => {
    const legs: { [nextMeetingId: string]: TravelLeg } = {};
    for (let i = 0; i < dayMeetings.length - 1; i++) {
      const current = dayMeetings[i];
      const next = dayMeetings[i + 1];

      const currentNeedsTravel = current.format !== 'online' && !current.isOnline;
      const nextNeedsTravel = next.format !== 'online' && !next.isOnline;

      if (currentNeedsTravel && nextNeedsTravel && current.buildingCode && next.buildingCode) {
        legs[next.id] = calculateTravelLeg(current, next, settings);
      }
    }
    return legs;
  }, [dayMeetings, settings]);

  // Track previous physical building for every meeting (for direct Google Maps links)
  const prevPhysicalBuildingById = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    let lastPhysical: string | undefined =
      settings.mainOffice?.enabled && settings.mainOffice.buildingCode
        ? settings.mainOffice.buildingCode
        : undefined;

    for (const m of dayMeetings) {
      const isOnline = m.format === 'online' || m.isOnline;
      map[m.id] = lastPhysical;
      if (!isOnline && m.buildingCode && m.buildingCode !== 'ONLINE') {
        lastPhysical = m.buildingCode;
      }
    }
    return map;
  }, [dayMeetings, settings.mainOffice]);

  const filteredMeetings = useMemo(
    () =>
      dayMeetings.filter((m) => {
        if (filterFormat === 'all') return true;
        const format = m.format || (m.isOnline ? 'online' : 'in_person');
        return format === filterFormat;
      }),
    [dayMeetings, filterFormat]
  );

  // Split into passed vs active/upcoming based on time of day
  const { passedMeetings, upcomingMeetings } = useMemo(() => {
    if (isPastDate) {
      return { passedMeetings: filteredMeetings, upcomingMeetings: [] as CampusMeeting[] };
    }
    if (!isToday) {
      return { passedMeetings: [] as CampusMeeting[], upcomingMeetings: filteredMeetings };
    }
    const passed: CampusMeeting[] = [];
    const upcoming: CampusMeeting[] = [];
    for (const m of filteredMeetings) {
      if (parseTimeToMinutes(m.endTime) <= currentMinutes) {
        passed.push(m);
      } else {
        upcoming.push(m);
      }
    }
    return { passedMeetings: passed, upcomingMeetings: upcoming };
  }, [filteredMeetings, isPastDate, isToday, currentMinutes]);

  // Live status summary for the time-of-day bar
  const liveStatusText = useMemo(() => {
    if (!isToday) return null;
    const inProgress = dayMeetings.find((m) => {
      const s = parseTimeToMinutes(m.startTime);
      const e = parseTimeToMinutes(m.endTime);
      return s <= currentMinutes && currentMinutes < e;
    });
    if (inProgress) {
      const left = parseTimeToMinutes(inProgress.endTime) - currentMinutes;
      return `In progress: ${inProgress.title} (${formatDurationBadge(left)} left)`;
    }
    const nextUp = dayMeetings.find((m) => parseTimeToMinutes(m.startTime) > currentMinutes);
    if (nextUp) {
      const until = parseTimeToMinutes(nextUp.startTime) - currentMinutes;
      return `Next: ${nextUp.title} at ${formatTime12h(nextUp.startTime)} (in ${formatDurationBadge(until)})`;
    }
    if (dayMeetings.length > 0) {
      return 'All meetings for today have ended';
    }
    return 'No meetings scheduled today';
  }, [isToday, dayMeetings, currentMinutes]);

  // Compute grid hours & positioned blocks for upcoming meetings
  const timelineLayout = useMemo(() => {
    if (upcomingMeetings.length === 0) return null;

    const positioned = layoutOverlappingMeetings(upcomingMeetings);
    const earliestStart = Math.min(...positioned.map((p) => p.startMin));
    const latestEnd = Math.max(...positioned.map((p) => p.endMin));

    const includeNowInGrid =
      isToday &&
      currentMinutes >= earliestStart - 120 &&
      currentMinutes <= latestEnd + 60;

    const minMinute = includeNowInGrid
      ? Math.min(earliestStart, currentMinutes)
      : earliestStart;
    const maxMinute = includeNowInGrid
      ? Math.max(latestEnd, currentMinutes + 20)
      : latestEnd;

    const startHour = Math.max(0, Math.floor(minMinute / 60));
    const endHour = Math.min(24, Math.max(startHour + 2, Math.ceil(maxMinute / 60)));

    const gridStartMin = startHour * 60;
    const gridEndMin = endHour * 60;
    const totalHeight = (gridEndMin - gridStartMin) * PIXELS_PER_MIN;

    const hours: number[] = [];
    for (let h = startHour; h <= endHour; h++) {
      hours.push(h);
    }

    // Build proportional travel blocks in gaps between consecutive upcoming meetings
    const gapLegs: {
      leg: TravelLeg;
      topMin: number;
      gapMin: number;
    }[] = [];

    for (let i = 0; i < upcomingMeetings.length - 1; i++) {
      const cur = upcomingMeetings[i];
      const nxt = upcomingMeetings[i + 1];
      const leg = travelLegs[nxt.id];
      if (!leg) continue;

      const curEnd = parseTimeToMinutes(cur.endTime);
      const nxtStart = parseTimeToMinutes(nxt.startTime);
      const gapMin = nxtStart - curEnd;

      if (gapMin >= 18) {
        gapLegs.push({
          leg,
          topMin: curEnd,
          gapMin,
        });
      }
    }

    return {
      positioned,
      hours,
      startHour,
      endHour,
      gridStartMin,
      gridEndMin,
      totalHeight,
      gapLegs,
    };
  }, [upcomingMeetings, isToday, currentMinutes, travelLegs]);

  const writtenDate = formatWrittenDate(selectedDate);

  // Compact block renderer for Passed Meetings inside the collapsible dropdown
  const renderPassedBlock = (meeting: CampusMeeting) => {
    const format = meeting.format || (meeting.isOnline ? 'online' : 'in_person');
    const isOnline = format === 'online' || meeting.isOnline;
    const mapsUrl = !isOnline
      ? getGoogleMapsDirectionsUrl(
          prevPhysicalBuildingById[meeting.id],
          meeting.buildingCode,
          'walking'
        )
      : '';

    return (
      <div
        className={`px-3.5 py-2.5 rounded-xl border bg-white/80 dark:bg-neutral-900/70 border-neutral-200/80 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 opacity-80 ${
          format === 'online'
            ? 'border-l-4 border-l-emerald-500'
            : format === 'hybrid'
            ? 'border-l-4 border-l-indigo-500'
            : 'border-l-4 border-l-blue-600'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-xs font-bold text-neutral-500 dark:text-neutral-400 tabular-nums shrink-0 w-32">
            {formatTime12h(meeting.startTime)} – {formatTime12h(meeting.endTime)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-bold text-neutral-700 dark:text-neutral-300 truncate">
              {meeting.title}
            </p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
              {!isOnline && meeting.buildingCode ? (
                <>
                  <MapPin className="w-3 h-3 text-blue-600 shrink-0" />
                  <span>
                    {meeting.buildingCode}
                    {meeting.roomNumber ? ` ${meeting.roomNumber}` : ''}
                    {format === 'hybrid' ? ' / Teams' : ''}
                  </span>
                </>
              ) : (
                <>
                  <Video className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>Teams</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
          {!isOnline && meeting.buildingCode && meeting.buildingCode !== 'ONLINE' && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white text-[11px] font-bold transition-colors"
              title={`Open ${meeting.buildingCode} in Google Maps`}
            >
              <Navigation className="w-3 h-3 shrink-0" />
              <span>Maps</span>
            </a>
          )}

          <button
            type="button"
            onClick={() => onEditMeeting(meeting)}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Edit Meeting"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>

          {deleteConfirmId === meeting.id ? (
            <div className="flex items-center gap-1 bg-rose-50 p-0.5 rounded-lg border border-rose-200">
              <button
                type="button"
                onClick={() => {
                  onDeleteMeeting(meeting.id);
                  setDeleteConfirmId(null);
                }}
                className="px-2 py-0.5 text-xs font-bold text-white bg-rose-600 rounded cursor-pointer"
              >
                Del
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-1.5 py-0.5 text-xs text-neutral-600 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDeleteConfirmId(meeting.id)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Delete Meeting"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const showNowLine =
    isToday &&
    timelineLayout &&
    currentMinutes >= timelineLayout.gridStartMin &&
    currentMinutes <= timelineLayout.gridEndMin;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            Your Calendar
          </h1>
          {isToday ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300 tabular-nums">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>{currentTimeLabel}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onSelectDate(todayStr)}
              className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:text-blue-600 transition-colors cursor-pointer"
            >
              Jump to Today
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onAddMeeting}
          className="inline-flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl text-sm sm:text-base font-extrabold bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95 shrink-0"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>Add Meeting</span>
        </button>
      </div>

      {/* Prominent Written-Out Date & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative inline-flex items-center gap-2.5 group w-fit">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg sm:text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {writtenDate}
            </span>
            <ChevronDown className="w-4 h-4 text-neutral-400 group-hover:text-blue-600 transition-colors shrink-0" />
          </div>
          <input
            type="date"
            aria-label="Select date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) onSelectDate(e.target.value);
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl text-xs font-semibold self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilterFormat('all')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              filterFormat === 'all'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            All ({dayMeetings.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterFormat('in_person')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              filterFormat === 'in_person'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            Campus ({dayMeetings.filter((m) => m.format === 'in_person' || (!m.format && !m.isOnline)).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterFormat('online')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              filterFormat === 'online'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            Online ({dayMeetings.filter((m) => m.format === 'online' || (!m.format && m.isOnline)).length})
          </button>
        </div>
      </div>

      {/* Collapsible Dropdown Menu for Passed Time Blocks */}
      {passedMeetings.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPassedDropdown((prev) => !prev)}
            aria-expanded={showPassedDropdown}
            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-neutral-100/80 dark:hover:bg-neutral-800/60 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-neutral-200/80 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center shrink-0">
                <History className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-bold text-neutral-800 dark:text-neutral-200">
                    {isToday ? 'Earlier Today' : 'Passed Meetings'} ({passedMeetings.length})
                  </span>
                  <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 tabular-nums hidden sm:inline">
                    {formatTime12h(passedMeetings[0].startTime)} –{' '}
                    {formatTime12h(passedMeetings[passedMeetings.length - 1].endTime)}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                  {showPassedDropdown
                    ? 'Click to hide completed time blocks'
                    : 'Hidden because their time blocks have passed — click to view'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 shrink-0">
              <span>{showPassedDropdown ? 'Hide' : 'Show'}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  showPassedDropdown ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>

          {showPassedDropdown && (
            <div className="px-3 pb-3 pt-1.5 border-t border-neutral-200/80 dark:border-neutral-800 space-y-2">
              {passedMeetings.map((meeting) => (
                <div key={meeting.id}>{renderPassedBlock(meeting)}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clickable Blue Current-Time / Next-Up Strip */}
      {dayMeetings.length > 0 && (
        <button
          type="button"
          onClick={onOpenNextMeeting}
          className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-blue-50/85 hover:bg-blue-100/80 dark:bg-blue-950/40 dark:hover:bg-blue-950/60 border border-blue-200 dark:border-blue-800/70 text-xs transition-colors cursor-pointer group text-left shadow-2xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 font-bold text-blue-700 dark:text-blue-300 shrink-0 tabular-nums">
              <Clock className="w-3.5 h-3.5" />
              <span>{isToday ? `Now · ${currentTimeLabel}` : 'Schedule'}</span>
            </div>
            <span className="text-blue-300 dark:text-blue-700 shrink-0">·</span>
            <span className="font-semibold text-neutral-700 dark:text-neutral-200 truncate">
              {isToday && liveStatusText
                ? liveStatusText
                : `${dayMeetings.length} meeting${dayMeetings.length === 1 ? '' : 's'} scheduled`}
            </span>
          </div>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 group-hover:bg-blue-700 text-white text-[11px] font-extrabold shrink-0 shadow-2xs transition-colors">
            <Zap className="w-3 h-3" />
            <span>Next Up</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </button>
      )}

      {/* Proportional Time-Block Calendar Grid */}
      <div>
        {filteredMeetings.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-2xl border-2 border-dashed border-neutral-200 dark:border-neutral-800">
            <CalendarIcon className="w-9 h-9 mx-auto text-neutral-300 dark:text-neutral-600 mb-2" />
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              No meetings on {writtenDate}
            </h3>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={onAddMeeting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extrabold bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Meeting</span>
              </button>
              <button
                type="button"
                onClick={onBackToConnect}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                Connect Calendar
              </button>
            </div>
          </div>
        ) : upcomingMeetings.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <Clock className="w-8 h-8 mx-auto text-neutral-300 dark:text-neutral-600 mb-2" />
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              All meetings for {isToday ? 'today' : writtenDate} have passed
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Use the dropdown above to review earlier meetings, or schedule a new one.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              {!showPassedDropdown && passedMeetings.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPassedDropdown(true)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  View Passed ({passedMeetings.length})
                </button>
              )}
              <button
                type="button"
                onClick={onAddMeeting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extrabold bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Meeting</span>
              </button>
            </div>
          </div>
        ) : timelineLayout ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs overflow-hidden">
            <div className="flex relative" style={{ height: `${timelineLayout.totalHeight + 24}px` }}>
              {/* Left Hour Axis */}
              <div className="w-14 sm:w-16 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/80 relative select-none">
                {timelineLayout.hours.map((hour) => {
                  const topPx = (hour * 60 - timelineLayout.gridStartMin) * PIXELS_PER_MIN + 12;
                  return (
                    <div
                      key={hour}
                      className="absolute right-2 -translate-y-1/2 text-[11px] font-bold text-neutral-400 dark:text-neutral-500 tabular-nums"
                      style={{ top: `${topPx}px` }}
                    >
                      {formatHourAxis(hour)}
                    </div>
                  );
                })}

                {/* Current time pill on axis */}
                {showNowLine && (
                  <div
                    className="absolute right-1 -translate-y-1/2 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold tabular-nums shadow-xs z-20"
                    style={{
                      top: `${(currentMinutes - timelineLayout.gridStartMin) * PIXELS_PER_MIN + 12}px`,
                    }}
                  >
                    {currentTimeLabel.replace(/\s?(AM|PM)/, '')}
                  </div>
                )}
              </div>

              {/* Right Schedule Canvas */}
              <div className="flex-1 relative">
                {/* Hourly & Half-Hour Grid Lines */}
                {timelineLayout.hours.map((hour, idx) => {
                  const topPx = (hour * 60 - timelineLayout.gridStartMin) * PIXELS_PER_MIN + 12;
                  const isLast = idx === timelineLayout.hours.length - 1;
                  return (
                    <React.Fragment key={hour}>
                      <div
                        className="absolute left-0 right-0 border-t border-neutral-200/80 dark:border-neutral-800"
                        style={{ top: `${topPx}px` }}
                      />
                      {!isLast && (
                        <div
                          className="absolute left-0 right-0 border-t border-dashed border-neutral-100 dark:border-neutral-800/50"
                          style={{ top: `${topPx + 30 * PIXELS_PER_MIN}px` }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Travel / Walk Gap Blocks */}
                {timelineLayout.gapLegs.map(({ leg, topMin, gapMin }) => {
                  const topPx = (topMin - timelineLayout.gridStartMin) * PIXELS_PER_MIN + 14;
                  const heightPx = Math.max(30, gapMin * PIXELS_PER_MIN - 4);
                  const isLate = leg.status === 'IMPOSSIBLE' || leg.status === 'LATE';
                  const isTight = leg.status === 'TIGHT';

                  return (
                    <div
                      key={leg.id}
                      className={`absolute left-2.5 right-2.5 rounded-xl border border-dashed px-3 flex items-center justify-between gap-2 z-10 ${
                        isLate
                          ? 'bg-rose-50/90 border-rose-300 text-rose-900 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-200'
                          : isTight
                          ? 'bg-amber-50/90 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200'
                          : 'bg-blue-50/60 border-blue-200 text-blue-900 dark:bg-blue-950/25 dark:border-blue-800/60 dark:text-blue-200'
                      }`}
                      style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                    >
                      <div className="flex items-center gap-2 min-w-0 text-xs">
                        <Footprints
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isLate
                              ? 'text-rose-600'
                              : isTight
                              ? 'text-amber-600'
                              : 'text-blue-600 dark:text-blue-400'
                          }`}
                        />
                        <span className="font-bold truncate">
                          {leg.fromMeeting.buildingCode} → {leg.toMeeting.buildingCode} ·{' '}
                          {leg.questFlowTravelMinutes}m walk
                        </span>
                        {isLate && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold uppercase shrink-0">
                            Late
                          </span>
                        )}
                        {isTight && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-extrabold uppercase shrink-0">
                            Tight
                          </span>
                        )}
                      </div>

                      <a
                        href={getGoogleMapsDirectionsUrl(
                          leg.fromMeeting.buildingCode,
                          leg.toMeeting.buildingCode,
                          'walking'
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white text-[11px] font-bold shadow-2xs transition-colors shrink-0"
                        title="Open walking directions in Google Maps"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>Route</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-75" />
                      </a>
                    </div>
                  );
                })}

                {/* Positioned Meeting Time Blocks */}
                {timelineLayout.positioned.map(({ meeting, startMin, endMin, col, totalCols }) => {
                  const format = meeting.format || (meeting.isOnline ? 'online' : 'in_person');
                  const isOnline = format === 'online' || meeting.isOnline;
                  const durationMin = endMin - startMin;
                  const topPx = (startMin - timelineLayout.gridStartMin) * PIXELS_PER_MIN + 12;
                  const heightPx = Math.max(52, durationMin * PIXELS_PER_MIN - 2);
                  const isCompact = heightPx < 76;

                  const isInProgress =
                    isToday && startMin <= currentMinutes && currentMinutes < endMin;
                  const minsLeft = isInProgress ? endMin - currentMinutes : 0;

                  const incomingLeg = travelLegs[meeting.id];
                  const showInlineTransitWarning =
                    incomingLeg &&
                    incomingLeg.gapMinutes < 18 &&
                    (incomingLeg.status === 'IMPOSSIBLE' ||
                      incomingLeg.status === 'LATE' ||
                      incomingLeg.status === 'TIGHT');

                  const mapsUrl = !isOnline
                    ? getGoogleMapsDirectionsUrl(
                        prevPhysicalBuildingById[meeting.id],
                        meeting.buildingCode,
                        'walking'
                      )
                    : '';

                  const widthPct = 100 / totalCols;
                  const leftPct = col * widthPct;

                  return (
                    <div
                      key={meeting.id}
                      onClick={() => onEditMeeting(meeting)}
                      className={`absolute rounded-xl border shadow-xs transition-all cursor-pointer overflow-hidden flex flex-col justify-between z-10 ${
                        isInProgress
                          ? 'ring-2 ring-blue-500/30 border-blue-500 dark:border-blue-400'
                          : 'hover:shadow-md'
                      } ${
                        format === 'online'
                          ? 'bg-emerald-50/95 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 border-l-4 border-l-emerald-600'
                          : format === 'hybrid'
                          ? 'bg-indigo-50/95 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800 border-l-4 border-l-indigo-600'
                          : 'bg-blue-50/95 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 border-l-4 border-l-blue-600'
                      }`}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        left: `calc(${leftPct}% + 8px)`,
                        width: `calc(${widthPct}% - 16px)`,
                      }}
                    >
                      <div
                        className={`px-3 ${
                          isCompact ? 'py-1.5 flex items-center justify-between gap-2 h-full' : 'py-2 flex items-start justify-between gap-2'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-xs sm:text-sm font-extrabold text-neutral-900 dark:text-white truncate leading-tight">
                              {meeting.title}
                            </h3>
                            {isInProgress && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-extrabold uppercase shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                <span>{minsLeft}m left</span>
                              </span>
                            )}
                            {showInlineTransitWarning && incomingLeg && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-white text-[10px] font-extrabold uppercase shrink-0 ${
                                  incomingLeg.status === 'TIGHT' ? 'bg-amber-500' : 'bg-rose-600'
                                }`}
                              >
                                {incomingLeg.status === 'TIGHT' ? 'Tight' : 'Late'} ·{' '}
                                {incomingLeg.questFlowTravelMinutes}m walk
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                            {!isOnline && meeting.buildingCode ? (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                                <span>
                                  {meeting.buildingCode}
                                  {meeting.roomNumber ? ` ${meeting.roomNumber}` : ''}
                                  {format === 'hybrid' ? ' / Teams' : ''}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                <Video className="w-3 h-3 shrink-0" />
                                <span>Teams</span>
                              </span>
                            )}
                            <span className="text-neutral-400 dark:text-neutral-500">·</span>
                            <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
                              {formatDurationBadge(durationMin)} ({formatTime12h(meeting.startTime)} –{' '}
                              {formatTime12h(meeting.endTime)})
                            </span>
                          </div>
                        </div>

                        {/* Block Action Buttons (stopPropagation so clicking them doesn't trigger block edit) */}
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!isOnline && meeting.buildingCode && meeting.buildingCode !== 'ONLINE' && (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white text-[11px] font-bold shadow-2xs transition-colors"
                              title={`Open ${meeting.buildingCode} in Google Maps`}
                            >
                              <Navigation className="w-3 h-3 shrink-0" />
                              <span className="hidden sm:inline">Maps</span>
                            </a>
                          )}

                          {!isCompact && (
                            <div className="hidden sm:inline-flex rounded-lg border border-neutral-200/80 dark:border-neutral-700 p-0.5 bg-white/80 dark:bg-neutral-900/80 text-[11px] font-semibold">
                              <button
                                type="button"
                                onClick={() => onQuickToggleFormat(meeting.id, 'in_person')}
                                className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                                  format === 'in_person' || format === 'hybrid'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                                }`}
                              >
                                Campus
                              </button>
                              <button
                                type="button"
                                onClick={() => onQuickToggleFormat(meeting.id, 'online')}
                                className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                                  format === 'online'
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                                }`}
                              >
                                Teams
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => onEditMeeting(meeting)}
                            className="p-1 rounded-lg text-neutral-500 hover:text-blue-600 hover:bg-white/80 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                            title="Edit Meeting"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {deleteConfirmId === meeting.id ? (
                            <div className="flex items-center gap-0.5 bg-rose-50 p-0.5 rounded-lg border border-rose-200">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteMeeting(meeting.id);
                                  setDeleteConfirmId(null);
                                }}
                                className="px-1.5 py-0.5 text-[10px] font-bold text-white bg-rose-600 rounded cursor-pointer"
                              >
                                Del
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-1 py-0.5 text-[10px] text-neutral-600 rounded cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(meeting.id)}
                              className="p-1 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-white/80 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                              title="Delete Meeting"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Live Current-Time Horizontal Needle */}
                {showNowLine && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                    style={{
                      top: `${(currentMinutes - timelineLayout.gridStartMin) * PIXELS_PER_MIN + 12}px`,
                    }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-600 -ml-1.5 ring-2 ring-white dark:ring-neutral-900" />
                    <div className="flex-1 h-0.5 bg-rose-500" />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer Suggestion & Navigation: Sync Calendar or Next Meeting */}
      <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
        <div className="p-4 sm:p-5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-neutral-900 dark:text-white">
              Sync your own calendar
            </p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Import your Outlook or .ICS schedule, or jump straight to your next meeting with Google Maps directions.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onBackToConnect}
              className="px-4 py-2.5 text-xs sm:text-sm font-bold text-blue-700 dark:text-blue-300 bg-white dark:bg-neutral-900 hover:bg-blue-50 dark:hover:bg-neutral-800 border border-blue-200 dark:border-blue-700 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Link2 className="w-4 h-4 shrink-0" />
              <span>Sync My Calendar</span>
            </button>

            <button
              type="button"
              onClick={onOpenNextMeeting}
              className="px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
            >
              <span>Next Meeting</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
