import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  AlertTriangle,
  CheckCircle2,
  Check,
  Copy,
  X,
  Loader2,
  MessageSquare,
  MoreHorizontal,
} from 'lucide-react';
import {
  CampusMeeting,
  CampusSettings,
  OfficeReturnThreshold,
  TravelLeg,
  UserOffice,
} from '../../types';
import {
  calculateTravelLeg,
  getDepartureForMeeting,
  MeetingDepartureInfo,
  parseTimeToMinutes,
  formatMinutesToTime,
  formatTime12h,
} from '../../utils/travelCalculator';
import { UW_BUILDINGS } from '../../data/uwaterlooCampus';
import { findAvailableSlots, SuggestedSlot } from '../../utils/slotFinder';
import { getTodayLocalDateString } from '../../utils/icsParser';
import {
  getGoogleMapsBuildingUrl,
  getGoogleMapsDirectionsUrl,
} from '../../utils/googleMapsLinks';

const PIXELS_PER_MIN = 2.2; // 132px per hour

function formatTimeCompact(timeStr: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  if (isNaN(h)) return timeStr;
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

interface ProblemPair {
  id: string;
  earlier: CampusMeeting;
  later: CampusMeeting;
  leg: TravelLeg;
  isOverlap: boolean;
  targetMeeting: CampusMeeting;
  otherMeeting: CampusMeeting;
  badgeText: string;
}

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
  onSaveMeeting?: (meeting: CampusMeeting) => void;
  onDeleteMeeting: (id: string) => void;
  onQuickToggleFormat: (id: string, format: 'in_person' | 'online' | 'hybrid') => void;
  onOpenNextMeeting: () => void;
  onBackToConnect: () => void;
  settings: CampusSettings;
  onUpdateOffice?: (office: UserOffice | null) => void;
}

export const CalendarReviewPage: React.FC<CalendarReviewPageProps> = ({
  meetings,
  selectedDate,
  onSelectDate,
  onAddMeeting,
  onEditMeeting,
  onSaveMeeting,
  onDeleteMeeting,
  onQuickToggleFormat,
  onOpenNextMeeting,
  onBackToConnect,
  settings,
  onUpdateOffice,
}) => {
  const [filterFormat, setFilterFormat] = useState<'all' | 'in_person' | 'online' | 'hybrid'>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showPassedDropdown, setShowPassedDropdown] = useState<boolean>(false);
  const [openMenuMeetingId, setOpenMenuMeetingId] = useState<string | null>(null);

  // Office inline editor state
  const [isEditingOffice, setIsEditingOffice] = useState<boolean>(false);
  const [officeBuilding, setOfficeBuilding] = useState<string>(
    settings.office?.buildingCode || 'E7'
  );
  const [officeRoom, setOfficeRoom] = useState<string>(
    settings.office?.roomNumber || '2408'
  );
  const [officeReturnThreshold, setOfficeReturnThreshold] = useState<OfficeReturnThreshold>(
    settings.office?.returnMinGapMinutes ?? 45
  );

  const handleOpenOfficeEditor = () => {
    setOfficeBuilding(settings.office?.buildingCode || 'E7');
    setOfficeRoom(settings.office?.roomNumber ?? '2408');
    setOfficeReturnThreshold(settings.office?.returnMinGapMinutes ?? 45);
    setIsEditingOffice(true);
  };

  const handleSaveOffice = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedRoom = officeRoom.trim();
    const firstDigit = parseInt(trimmedRoom[0], 10);
    const floor = !isNaN(firstDigit) && firstDigit >= 1 && firstDigit <= 7 ? firstDigit : 1;
    onUpdateOffice?.({
      buildingCode: officeBuilding,
      roomNumber: trimmedRoom,
      floor,
      returnMinGapMinutes: officeReturnThreshold,
    });
    setIsEditingOffice(false);
  };

  const handleClearOffice = () => {
    onUpdateOffice?.(null);
    setIsEditingOffice(false);
  };

  // Measure schedule canvas width to detect narrow cards (< ~320px)
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(640);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setCanvasWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fix Sheet & Resolved Confirmation State
  const [activeFixProblem, setActiveFixProblem] = useState<ProblemPair | null>(null);
  const [fixDraftType, setFixDraftType] = useState<'later_start' | 'join_online' | null>(null);
  const [fixDraftText, setFixDraftText] = useState<string>('');
  const [isDraftingFix, setIsDraftingFix] = useState<boolean>(false);
  const [fixCopied, setFixCopied] = useState<boolean>(false);
  const [resolvedByMeetingId, setResolvedByMeetingId] = useState<Record<string, string>>({});
  const [fixedNotice, setFixedNotice] = useState<string | null>(null);
  const fixSheetRef = useRef<HTMLDivElement>(null);

  // Trap focus and close on Escape when the Fix sheet is open
  useEffect(() => {
    if (!activeFixProblem) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setActiveFixProblem(null);
      } else if (e.key === 'Tab' && fixSheetRef.current) {
        const focusable = fixSheetRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFixProblem]);

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

  // Build problem pairs & map each problem pair to the single meeting it targets
  const { impossibleLegs, problemLegs, problemPairs, problemByTargetId } = useMemo(() => {
    const orderedLegs: TravelLeg[] = [];
    const pairs: ProblemPair[] = [];
    const byTarget: Record<string, ProblemPair> = {};

    for (const m of dayMeetings) {
      const leg = travelLegs[m.id];
      if (!leg) continue;

      // On today's date, only count and offer fixes for transitions whose later meeting is still ahead
      if (isToday && parseTimeToMinutes(leg.toMeeting.startTime) <= currentMinutes) {
        continue;
      }

      orderedLegs.push(leg);

      if (leg.status === 'IMPOSSIBLE' || leg.status === 'LATE' || leg.status === 'TIGHT') {
        const earlier = leg.fromMeeting;
        const later = leg.toMeeting;
        const aIsUser = earlier.source === 'created' || earlier.source === 'new';
        const bIsUser = later.source === 'created' || later.source === 'new';

        // Target selection rule:
        // - If exactly one of A or B is user-created, target that one
        // - Otherwise target B
        const targetMeeting = aIsUser && !bIsUser ? earlier : later;
        const otherMeeting = targetMeeting.id === earlier.id ? later : earlier;
        const isOverlap = leg.gapMinutes < 0;

        const badgeText = isOverlap
          ? `Overlaps ${otherMeeting.title} (${formatTimeCompact(
              otherMeeting.startTime
            )}–${formatTimeCompact(otherMeeting.endTime)})`
          : `${leg.status === 'TIGHT' ? 'Tight' : 'Late'} · ${leg.questFlowTravelMinutes}m walk`;

        const pair: ProblemPair = {
          id: leg.id,
          earlier,
          later,
          leg,
          isOverlap,
          targetMeeting,
          otherMeeting,
          badgeText,
        };
        pairs.push(pair);
        if (!byTarget[targetMeeting.id]) {
          byTarget[targetMeeting.id] = pair;
        }
      }
    }

    return {
      impossibleLegs: orderedLegs.filter(
        (l) => l.status === 'IMPOSSIBLE' || l.status === 'LATE'
      ),
      problemLegs: orderedLegs.filter(
        (l) => l.status === 'IMPOSSIBLE' || l.status === 'LATE' || l.status === 'TIGHT'
      ),
      problemPairs: pairs,
      problemByTargetId: byTarget,
    };
  }, [dayMeetings, travelLegs, isToday, currentMinutes]);

  const handleOpenFixSheet = (problem: ProblemPair) => {
    setActiveFixProblem(problem);
    setFixDraftType(null);
    setFixDraftText('');
    setIsDraftingFix(false);
    setFixCopied(false);
  };

  const applyResolvedConfirmation = (meetingId: string, message: string) => {
    setResolvedByMeetingId((prev) => ({ ...prev, [meetingId]: message }));
    setFixedNotice(message);
    setActiveFixProblem(null);
  };

  const handleScrollToFirstProblem = () => {
    const firstPair = problemPairs[0];
    if (!firstPair) return;
    const targetId = firstPair.targetMeeting.id;
    const isInPassed = passedMeetings.some((m) => m.id === targetId);
    if (isInPassed && !showPassedDropdown) {
      setShowPassedDropdown(true);
    }
    setTimeout(() => {
      const el =
        document.getElementById(`transition-problem-${targetId}`) ||
        document.getElementById(`meeting-block-${targetId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  // Compute departure info for every meeting using the shared getDepartureForMeeting helper
  const departureByMeetingId = useMemo(() => {
    const map: Record<string, MeetingDepartureInfo> = {};
    let lastPhysicalMeeting: CampusMeeting | null = null;

    for (const m of dayMeetings) {
      map[m.id] = getDepartureForMeeting(m, lastPhysicalMeeting, settings);
      const isOnline = m.format === 'online' || m.isOnline;
      if (!isOnline && m.buildingCode && m.buildingCode !== 'ONLINE') {
        lastPhysicalMeeting = m;
      }
    }
    return map;
  }, [dayMeetings, settings]);

  // First in-person meeting of the day & walk from office (when office is set)
  const firstInPersonMeeting = useMemo(
    () =>
      dayMeetings.find(
        (m) => m.format !== 'online' && !m.isOnline && Boolean(m.buildingCode)
      ) || null,
    [dayMeetings]
  );

  const officeFirstWalk = useMemo(() => {
    if (!settings.office?.buildingCode || !firstInPersonMeeting) return null;
    const dep = departureByMeetingId[firstInPersonMeeting.id];
    if (!dep || !dep.hasOrigin || !dep.isViaOffice) return null;
    const bufferMinutes = settings.arrivalBufferMinutes ?? 5;
    const startMin = parseTimeToMinutes(firstInPersonMeeting.startTime);
    return {
      meetingId: firstInPersonMeeting.id,
      fromBuildingCode: settings.office.buildingCode,
      toBuildingCode: firstInPersonMeeting.buildingCode,
      walkMinutes: dep.walkMinutes,
      bufferMinutes,
      startMin,
      leaveByMin: dep.leaveByMinutes,
      leaveBy12h: dep.leaveByTime12h,
      label: `From office ${settings.office.buildingCode} → ${firstInPersonMeeting.buildingCode} · ${dep.walkMinutes}m walk · leave by ${dep.leaveByTime12h}`,
    };
  }, [settings, firstInPersonMeeting, departureByMeetingId]);

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

    const hasOfficeFirstInUpcoming = Boolean(
      officeFirstWalk &&
        upcomingMeetings.some((m) => m.id === officeFirstWalk.meetingId)
    );
    const officeRowTopMin =
      hasOfficeFirstInUpcoming && officeFirstWalk
        ? officeFirstWalk.startMin - Math.max(18, officeFirstWalk.walkMinutes + officeFirstWalk.bufferMinutes)
        : earliestStart;

    const minMinute = Math.min(
      includeNowInGrid ? Math.min(earliestStart, currentMinutes) : earliestStart,
      officeRowTopMin
    );
    const maxMinute = includeNowInGrid
      ? Math.max(latestEnd, currentMinutes + 20)
      : latestEnd;

    const startHour = Math.max(0, Math.floor(minMinute / 60));
    const endHour = Math.min(24, Math.max(startHour + 2, Math.ceil(maxMinute / 60)));

    const gridStartMin = startHour * 60;
    const gridEndMin = endHour * 60;

    const hours: number[] = [];
    for (let h = startHour; h <= endHour; h++) {
      hours.push(h);
    }

    // Build proportional travel blocks in gaps between consecutive upcoming meetings
    const gapLegs: {
      leg: TravelLeg;
      topMin: number;
      gapMin: number;
      isOfficeTrip: boolean;
      minVisualHeightPx: number;
    }[] = [];

    for (let i = 0; i < upcomingMeetings.length - 1; i++) {
      const cur = upcomingMeetings[i];
      const nxt = upcomingMeetings[i + 1];
      const leg = travelLegs[nxt.id];
      const nxtDep = departureByMeetingId[nxt.id];
      if (!leg) continue;

      const curEnd = parseTimeToMinutes(cur.endTime);
      const nxtStart = parseTimeToMinutes(nxt.startTime);
      const gapMin = nxtStart - curEnd;

      // Never draw a walk row when two meetings overlap in time
      if (gapMin < 0) continue;

      const isOfficeTrip = Boolean(
        nxtDep?.isOfficeReturnBetweenMeetings && settings.office?.buildingCode
      );
      if (leg.isSameBuilding && !isOfficeTrip) continue;

      const minVisualHeightPx = isOfficeTrip ? 96 : 30;
      gapLegs.push({
        leg,
        topMin: curEnd,
        gapMin,
        isOfficeTrip,
        minVisualHeightPx,
      });
    }

    // Monotonic push-down offset so walk rows and meeting cards never overlap
    const getOffsetAtMin = (min: number): number => {
      let offset = 0;
      for (const p of positioned) {
        const naturalCardPx = (p.endMin - p.startMin) * PIXELS_PER_MIN;
        const extraCardPx = Math.max(0, 54 - naturalCardPx);
        if (extraCardPx > 0) {
          if (min >= p.endMin) {
            offset += extraCardPx;
          } else if (min > p.startMin) {
            offset += extraCardPx * ((min - p.startMin) / Math.max(1, p.endMin - p.startMin));
          }
        }
      }
      for (const g of gapLegs) {
        const naturalGapPx = Math.max(0, g.gapMin) * PIXELS_PER_MIN;
        const extraGapPx = Math.max(0, g.minVisualHeightPx - naturalGapPx);
        if (extraGapPx > 0 && min > g.topMin) {
          if (g.gapMin <= 0 || min >= g.topMin + g.gapMin) {
            offset += extraGapPx;
          } else {
            offset += extraGapPx * ((min - g.topMin) / g.gapMin);
          }
        }
      }
      return offset;
    };

    const getTopPxForMin = (min: number): number =>
      (min - gridStartMin) * PIXELS_PER_MIN + 12 + getOffsetAtMin(min);

    const totalHeight =
      (gridEndMin - gridStartMin) * PIXELS_PER_MIN + getOffsetAtMin(gridEndMin);

    return {
      positioned,
      hours,
      startHour,
      endHour,
      gridStartMin,
      gridEndMin,
      totalHeight,
      gapLegs,
      hasOfficeFirstInUpcoming,
      getTopPxForMin,
    };
  }, [upcomingMeetings, isToday, currentMinutes, travelLegs, officeFirstWalk, departureByMeetingId, settings.office]);

  const writtenDate = formatWrittenDate(selectedDate);

  // Compact block renderer for Passed Meetings inside the collapsible dropdown
  const renderPassedBlock = (meeting: CampusMeeting) => {
    const format = meeting.format || (meeting.isOnline ? 'online' : 'in_person');
    const isOnline = format === 'online' || meeting.isOnline;
    const incomingLeg = travelLegs[meeting.id];
    const targetProblem = isToday ? undefined : problemByTargetId[meeting.id];
    const isResolved = Boolean(resolvedByMeetingId[meeting.id]);
    const isTight = targetProblem?.leg.status === 'TIGHT';
    const wasLateToday =
      isToday &&
      !isResolved &&
      Boolean(
        incomingLeg && (incomingLeg.status === 'IMPOSSIBLE' || incomingLeg.status === 'LATE')
      );

    const mapsUrl = !isOnline
      ? getGoogleMapsBuildingUrl(meeting.buildingCode)
      : '';

    const showOfficeWalkRow =
      officeFirstWalk && officeFirstWalk.meetingId === meeting.id;

    return (
      <div className="space-y-1.5" id={`meeting-block-${meeting.id}`}>
        {showOfficeWalkRow && officeFirstWalk && (
          <div className="px-3 py-1.5 rounded-lg border border-dashed border-blue-200 dark:border-blue-800/60 bg-blue-50/60 dark:bg-blue-950/25 text-blue-900 dark:text-blue-200 text-[11px] font-bold flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Footprints className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="truncate">{officeFirstWalk.label}</span>
            </div>
            <a
              href={getGoogleMapsDirectionsUrl(
                officeFirstWalk.fromBuildingCode,
                officeFirstWalk.toBuildingCode,
                'walking'
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white text-[10px] font-bold shadow-2xs transition-colors shrink-0"
              title="Open walking directions from office in Google Maps"
            >
              <Navigation className="w-2.5 h-2.5" />
              <span>Route</span>
              <ExternalLink className="w-2 h-2 opacity-75" />
            </a>
          </div>
        )}
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
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs sm:text-sm font-bold text-neutral-700 dark:text-neutral-300 truncate">
                {meeting.title}
              </p>
              {wasLateToday && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-[10px] font-semibold shrink-0">
                  <Clock className="w-2.5 h-2.5 shrink-0" />
                  <span>Was late</span>
                </span>
              )}
              {targetProblem && (
                <span
                  id={`transition-problem-${meeting.id}`}
                  className="inline-flex items-center gap-1 shrink-0"
                >
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                      targetProblem.isOverlap ? '' : 'uppercase'
                    } ${isTight ? 'bg-amber-500 text-amber-950' : 'bg-rose-600 text-white'}`}
                  >
                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                    <span>{targetProblem.badgeText}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenFixSheet(targetProblem)}
                    className={`px-2 py-0.5 rounded text-white text-[10px] font-extrabold shadow-2xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isTight
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-rose-700 hover:bg-rose-800'
                    }`}
                  >
                    Fix this
                  </button>
                </span>
              )}
              {!targetProblem && isResolved && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold uppercase shrink-0">
                  <Check className="w-2.5 h-2.5" />
                  <span>Fixed</span>
                </span>
              )}
            </div>
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
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              title={`Open ${meeting.buildingCode} in Google Maps`}
            >
              <Navigation className="w-3 h-3 shrink-0" />
              <span>Maps</span>
            </a>
          )}

          <button
            type="button"
            onClick={() => onEditMeeting(meeting)}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            title="Edit Meeting"
            aria-label="Edit meeting"
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
                className="px-2 py-0.5 text-xs font-bold text-white bg-rose-600 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
                aria-label="Confirm delete meeting"
              >
                Del
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-1.5 py-0.5 text-xs text-neutral-600 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                aria-label="Cancel delete"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDeleteConfirmId(meeting.id)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
              title="Delete Meeting"
              aria-label="Delete meeting"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
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
        <div className="flex items-center gap-3 flex-wrap">
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

          {dayMeetings.length > 0 && (
            impossibleLegs.length > 0 ? (
              <button
                type="button"
                onClick={handleScrollToFirstProblem}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-800 dark:text-rose-200 transition-colors cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>
                  {impossibleLegs.length} back-to-back{impossibleLegs.length === 1 ? '' : 's'} you can&apos;t make
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={problemLegs.length > 0 ? handleScrollToFirstProblem : undefined}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-200 transition-colors ${
                  problemLegs.length > 0 ? ' cursor-pointer hover:bg-emerald-100' : 'cursor-default'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>All meetings reachable</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Fixed Confirmation Notice */}
      {fixedNotice && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-2.5 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">Fixed · {fixedNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setFixedNotice(null)}
            className="p-1 rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
            aria-label="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Prominent Written-Out Date, Office Chip & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
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

          {!isEditingOffice ? (
            <button
              type="button"
              onClick={handleOpenOfficeEditor}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <span>
                {settings.office?.buildingCode
                  ? `🏢 Office: ${settings.office.buildingCode}${
                      settings.office.roomNumber ? ` ${settings.office.roomNumber}` : ''
                    } ✎`
                  : '🏢 Set your office'}
              </span>
            </button>
          ) : (
            <form
              onSubmit={handleSaveOffice}
              className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 shadow-xs text-xs"
            >
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">🏢</span>
              <select
                aria-label="Office building"
                value={officeBuilding}
                onChange={(e) => setOfficeBuilding(e.target.value)}
                className="px-2 py-1 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 font-bold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {Object.keys(UW_BUILDINGS).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label="Office room"
                value={officeRoom}
                onChange={(e) => setOfficeRoom(e.target.value)}
                placeholder="Room"
                className="w-16 px-2 py-1 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <label className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-300 font-medium">
                <span>Go back to my office when I have at least</span>
                <select
                  aria-label="Go back to my office when I have at least"
                  value={officeReturnThreshold}
                  onChange={(e) => {
                    const val = e.target.value;
                    setOfficeReturnThreshold(
                      val === 'never' ? 'never' : (Number(val) as OfficeReturnThreshold)
                    );
                  }}
                  className="px-1.5 py-1 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 font-bold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                  <option value="never">Never</option>
                </select>
                <span>free</span>
              </label>
              <button
                type="submit"
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleClearOffice}
                className="px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Clear
              </button>
            </form>
          )}
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
                  const topPx = timelineLayout.getTopPxForMin(hour * 60);
                  return (
                    <div
                      key={hour}
                      className="absolute right-2 -translate-y-1/2 text-[11px] font-bold text-neutral-500 dark:text-neutral-500 tabular-nums"
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
                      top: `${timelineLayout.getTopPxForMin(currentMinutes)}px`,
                    }}
                  >
                    {currentTimeLabel.replace(/\s?(AM|PM)/, '')}
                  </div>
                )}
              </div>

              {/* Right Schedule Canvas */}
              <div ref={canvasRef} className="flex-1 relative">
                {/* Hourly & Half-Hour Grid Lines */}
                {timelineLayout.hours.map((hour, idx) => {
                  const topPx = timelineLayout.getTopPxForMin(hour * 60);
                  const halfHourTopPx = timelineLayout.getTopPxForMin(hour * 60 + 30);
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
                          style={{ top: `${halfHourTopPx}px` }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Walk Row from Office to First In-Person Meeting of the Day */}
                {timelineLayout.hasOfficeFirstInUpcoming &&
                  officeFirstWalk &&
                  (() => {
                    const rowSpanMin = Math.max(
                      16,
                      officeFirstWalk.walkMinutes + officeFirstWalk.bufferMinutes
                    );
                    const topMin = officeFirstWalk.startMin - rowSpanMin;
                    const topPx = timelineLayout.getTopPxForMin(topMin);
                    const bottomPx = timelineLayout.getTopPxForMin(officeFirstWalk.startMin);
                    const heightPx = Math.max(26, bottomPx - topPx - 4);
                    return (
                      <div
                        className="absolute left-2.5 right-2.5 rounded-xl border border-dashed border-blue-200 dark:border-blue-800/60 bg-blue-50/60 dark:bg-blue-950/25 text-blue-900 dark:text-blue-200 px-3 flex items-center justify-between gap-2 z-10 text-xs"
                        style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Footprints className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                          <span className="font-bold truncate">{officeFirstWalk.label}</span>
                        </div>
                        <a
                          href={getGoogleMapsDirectionsUrl(
                            officeFirstWalk.fromBuildingCode,
                            officeFirstWalk.toBuildingCode,
                            'walking'
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white text-[11px] font-bold shadow-2xs transition-colors shrink-0"
                          title="Open walking directions from office in Google Maps"
                        >
                          <Navigation className="w-3 h-3" />
                          <span>Route</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-75" />
                        </a>
                      </div>
                    );
                  })()}

                {/* Travel / Walk Gap Blocks */}
                {timelineLayout.gapLegs.map(({ leg, topMin, gapMin, isOfficeTrip }) => {
                  const slotTopPx = timelineLayout.getTopPxForMin(topMin);
                  const slotBottomPx = timelineLayout.getTopPxForMin(topMin + gapMin);
                  const slotSpanPx = Math.max(28, slotBottomPx - slotTopPx);

                  const nxtDep = departureByMeetingId[leg.toMeeting.id];
                  if (isOfficeTrip && nxtDep && settings.office?.buildingCode) {
                    const officeCode = settings.office.buildingCode;
                    const topPx = slotTopPx + 1;
                    const heightPx = Math.max(92, slotSpanPx - 4);
                    return (
                      <div
                        key={leg.id}
                        className="absolute left-2.5 right-2.5 flex flex-col justify-between gap-1 z-10"
                        style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                      >
                        {/* 1. Walk to Office */}
                        <div className="rounded-lg border border-dashed border-blue-200 dark:border-blue-800/60 bg-blue-50/60 dark:bg-blue-950/25 text-blue-900 dark:text-blue-200 px-2.5 py-1 flex items-center justify-between gap-2 text-[11px] shrink-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Footprints className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                            <span className="font-bold truncate">
                              {leg.fromMeeting.buildingCode} → Office {officeCode} · {nxtDep.toOfficeWalkMinutes}m walk
                            </span>
                          </div>
                          <a
                            href={getGoogleMapsDirectionsUrl(
                              leg.fromMeeting.buildingCode,
                              officeCode,
                              'walking'
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white text-[10px] font-bold shadow-2xs transition-colors shrink-0"
                            title="Open walking directions to office in Google Maps"
                          >
                            <Navigation className="w-2.5 h-2.5" />
                            <span>Route</span>
                            <ExternalLink className="w-2 h-2 opacity-75" />
                          </a>
                        </div>

                        {/* 2. Grey At Your Office Block */}
                        <div className="flex-1 min-h-[24px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100/90 dark:bg-neutral-800/70 text-neutral-700 dark:text-neutral-200 px-2.5 py-1 flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-bold truncate">
                            🏢 At your office · {nxtDep.officeArrivalTime12h} – {nxtDep.leaveByTime12h}
                          </span>
                        </div>

                        {/* 3. Walk from Office to Next Meeting */}
                        <div className="rounded-lg border border-dashed border-blue-200 dark:border-blue-800/60 bg-blue-50/60 dark:bg-blue-950/25 text-blue-900 dark:text-blue-200 px-2.5 py-1 flex items-center justify-between gap-2 text-[11px] shrink-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Footprints className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                            <span className="font-bold truncate">
                              Office {officeCode} → {leg.toMeeting.buildingCode} · {nxtDep.walkMinutes}m walk · leave by {nxtDep.leaveByTime12h}
                            </span>
                          </div>
                          <a
                            href={getGoogleMapsDirectionsUrl(
                              officeCode,
                              leg.toMeeting.buildingCode,
                              'walking'
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white text-[10px] font-bold shadow-2xs transition-colors shrink-0"
                            title="Open walking directions from office in Google Maps"
                          >
                            <Navigation className="w-2.5 h-2.5" />
                            <span>Route</span>
                            <ExternalLink className="w-2 h-2 opacity-75" />
                          </a>
                        </div>
                      </div>
                    );
                  }

                  const isCompactGap = gapMin < 18;
                  const topPx = slotTopPx + (isCompactGap ? 1 : 2);
                  const heightPx = Math.max(isCompactGap ? 26 : 30, slotSpanPx - 4);
                  const isStillAhead =
                    !isToday || parseTimeToMinutes(leg.toMeeting.startTime) > currentMinutes;
                  const isLate =
                    isStillAhead && (leg.status === 'IMPOSSIBLE' || leg.status === 'LATE');
                  const isTight = isStillAhead && leg.status === 'TIGHT';
                  const isResolved =
                    !isLate &&
                    !isTight &&
                    (Boolean(resolvedByMeetingId[leg.toMeeting.id]) ||
                      Boolean(resolvedByMeetingId[leg.fromMeeting.id]));

                  if (isCompactGap) {
                    return (
                      <div
                        key={leg.id}
                        className={`absolute left-2.5 right-2.5 rounded-lg border border-dashed px-2.5 flex items-center justify-between gap-2 z-10 text-[11px] leading-none ${
                          isLate
                            ? 'bg-rose-50/90 border-rose-300 text-rose-900 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-200'
                            : isTight
                            ? 'bg-amber-50/90 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200'
                            : isResolved
                            ? 'bg-emerald-50/90 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-200'
                            : 'bg-blue-50/60 border-blue-200 text-blue-900 dark:bg-blue-950/25 dark:border-blue-800/60 dark:text-blue-200'
                        }`}
                        style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isResolved ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                          ) : (
                            <Footprints
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isLate
                                  ? 'text-rose-600'
                                  : isTight
                                  ? 'text-amber-600'
                                  : 'text-blue-600 dark:text-blue-400'
                              }`}
                            />
                          )}
                          <span className="font-bold truncate">
                            {leg.fromMeeting.buildingCode} → {leg.toMeeting.buildingCode} ·{' '}
                            {leg.questFlowTravelMinutes}m walk
                          </span>
                        </div>
                        <a
                          href={getGoogleMapsDirectionsUrl(
                            leg.fromMeeting.buildingCode,
                            leg.toMeeting.buildingCode,
                            'walking'
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white text-[10px] font-bold shadow-2xs transition-colors shrink-0"
                          title="Open walking directions in Google Maps"
                        >
                          <Navigation className="w-2.5 h-2.5" />
                          <span>Route</span>
                          <ExternalLink className="w-2 h-2 opacity-75" />
                        </a>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={leg.id}
                      className={`absolute left-2.5 right-2.5 rounded-xl border border-dashed px-3 flex flex-col justify-center gap-1 z-10 ${
                        isLate
                          ? 'bg-rose-50/90 border-rose-300 text-rose-900 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-200'
                          : isTight
                          ? 'bg-amber-50/90 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200'
                          : isResolved
                          ? 'bg-emerald-50/90 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-200'
                          : 'bg-blue-50/60 border-blue-200 text-blue-900 dark:bg-blue-950/25 dark:border-blue-800/60 dark:text-blue-200'
                      }`}
                      style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 text-xs">
                          {isResolved ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                          ) : (
                            <Footprints
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isLate
                                  ? 'text-rose-600'
                                  : isTight
                                  ? 'text-amber-600'
                                  : 'text-blue-600 dark:text-blue-400'
                              }`}
                            />
                          )}
                          <span className="font-bold truncate">
                            {leg.fromMeeting.buildingCode} → {leg.toMeeting.buildingCode} ·{' '}
                            {leg.questFlowTravelMinutes}m walk
                          </span>
                          {isLate && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold uppercase shrink-0">
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              <span>Late</span>
                            </span>
                          )}
                          {isTight && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500 text-amber-950 text-[10px] font-extrabold uppercase shrink-0">
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              <span>Tight</span>
                            </span>
                          )}
                          {isResolved && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold uppercase shrink-0">
                              <Check className="w-2.5 h-2.5 shrink-0" />
                              <span>Fixed</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
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
                      </div>
                    </div>
                  );
                })}

                {/* Positioned Meeting Time Blocks */}
                {timelineLayout.positioned.map(({ meeting, startMin, endMin, col, totalCols }) => {
                  const format = meeting.format || (meeting.isOnline ? 'online' : 'in_person');
                  const isOnline = format === 'online' || meeting.isOnline;
                  const durationMin = endMin - startMin;
                  const topPx = timelineLayout.getTopPxForMin(startMin);
                  const bottomPx = timelineLayout.getTopPxForMin(endMin);
                  const heightPx = Math.max(52, bottomPx - topPx - 2);
                  const isCompact = heightPx < 76;

                  const isInProgress =
                    isToday && startMin <= currentMinutes && currentMinutes < endMin;
                  const minsLeft = isInProgress ? endMin - currentMinutes : 0;

                  const targetProblem = problemByTargetId[meeting.id];
                  const isTightProblem = targetProblem?.leg.status === 'TIGHT';
                  const isInlineResolved =
                    !targetProblem && Boolean(resolvedByMeetingId[meeting.id]);

                  const mapsUrl = !isOnline
                    ? getGoogleMapsBuildingUrl(meeting.buildingCode)
                    : '';

                  const widthPct = 100 / totalCols;
                  const leftPct = col * widthPct;
                  const cardWidthPx = canvasWidth / totalCols - 16;
                  const isNarrowCard = totalCols > 1 || cardWidthPx < 320;
                  const isMenuOpen = openMenuMeetingId === meeting.id;

                  const locCompact = isOnline
                    ? 'Teams'
                    : `${meeting.buildingCode}${meeting.roomNumber ? ` ${meeting.roomNumber}` : ''}`;

                  return (
                    <div
                      key={meeting.id}
                      id={`meeting-block-${meeting.id}`}
                      onClick={() => onEditMeeting(meeting)}
                      className={`absolute rounded-xl border shadow-xs transition-all cursor-pointer flex flex-col justify-between ${
                        isMenuOpen ? 'overflow-visible z-30' : 'overflow-hidden z-10'
                      } ${
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
                      {isNarrowCard ? (
                        /* NARROW CARD (< ~320px): 2-line title, 1-line "STC 2018 · 9:30–10:30", status badge, and "⋯" menu */
                        <div className="px-2.5 py-1.5 flex items-start justify-between gap-1.5 h-full relative">
                          <div className="min-w-0 flex-1 flex flex-col justify-between h-full">
                            <div>
                              <h3 className="text-xs font-extrabold text-neutral-900 dark:text-white line-clamp-2 leading-tight">
                                {meeting.title}
                              </h3>
                              <p className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 truncate mt-0.5 tabular-nums">
                                {locCompact} · {formatTimeCompact(meeting.startTime)}–{formatTimeCompact(meeting.endTime)}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 flex-wrap mt-1">
                              {isInProgress && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-extrabold uppercase shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                  <span>{minsLeft}m left</span>
                                </span>
                              )}
                              {targetProblem && (
                                <span
                                  id={`transition-problem-${meeting.id}`}
                                  className="inline-flex items-center gap-1 flex-wrap"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold truncate max-w-[180px] ${
                                      targetProblem.isOverlap ? '' : 'uppercase'
                                    } ${isTightProblem ? 'bg-amber-500 text-amber-950' : 'bg-rose-600 text-white'}`}
                                    title={targetProblem.badgeText}
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                    <span className="truncate">{targetProblem.badgeText}</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenFixSheet(targetProblem)}
                                    className={`px-2 py-0.5 rounded text-white text-[10px] font-extrabold shadow-2xs transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                                      isTightProblem
                                        ? 'bg-amber-600 hover:bg-amber-700'
                                        : 'bg-rose-700 hover:bg-rose-800'
                                    }`}
                                  >
                                    Fix this
                                  </button>
                                </span>
                              )}
                              {isInlineResolved && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold uppercase shrink-0">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>Fixed</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Single "⋯" menu button */}
                          <div
                            className="relative shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setOpenMenuMeetingId(isMenuOpen ? null : meeting.id)
                              }
                              aria-label="More actions"
                              className="p-1 rounded-lg bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-white transition-colors cursor-pointer text-xs font-bold leading-none"
                            >
                              ⋯
                            </button>

                            {isMenuOpen && (
                              <div className="absolute right-0 top-7 w-40 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-xl py-1 z-40 text-xs font-semibold">
                                {!isOnline &&
                                  meeting.buildingCode &&
                                  meeting.buildingCode !== 'ONLINE' && (
                                    <a
                                      href={mapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={() => setOpenMenuMeetingId(null)}
                                      className="flex items-center gap-2 px-3 py-1.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                    >
                                      <Navigation className="w-3.5 h-3.5 text-blue-600" />
                                      <span>Open in Maps</span>
                                    </a>
                                  )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    onQuickToggleFormat(
                                      meeting.id,
                                      isOnline ? 'in_person' : 'online'
                                    );
                                    setOpenMenuMeetingId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                                >
                                  <Video className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>{isOnline ? 'Switch to Campus' : 'Switch to Teams'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuMeetingId(null);
                                    onEditMeeting(meeting);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-neutral-500" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuMeetingId(null);
                                    onDeleteMeeting(meeting.id);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* WIDE CARD (≥ 320px): Unchanged layout */
                        <div
                          className={`px-3 ${
                            isCompact
                              ? 'py-1.5 flex items-center justify-between gap-2 h-full'
                              : 'py-2 flex items-start justify-between gap-2'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="text-xs sm:text-sm font-extrabold text-neutral-900 dark:text-white truncate leading-tight">
                                {meeting.title}
                              </h3>
                              {isInProgress && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-extrabold uppercase shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                  <span>{minsLeft}m left</span>
                                </span>
                              )}
                              {targetProblem && (
                                <span
                                  id={`transition-problem-${meeting.id}`}
                                  className="inline-flex items-center gap-1 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                      targetProblem.isOverlap ? '' : 'uppercase'
                                    } ${isTightProblem ? 'bg-amber-500 text-amber-950' : 'bg-rose-600 text-white'}`}
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                    <span>{targetProblem.badgeText}</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenFixSheet(targetProblem)}
                                    className={`px-2 py-0.5 rounded text-white text-[10px] font-extrabold shadow-2xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                                      isTightProblem
                                        ? 'bg-amber-600 hover:bg-amber-700'
                                        : 'bg-rose-700 hover:bg-rose-800'
                                    }`}
                                  >
                                    Fix this
                                  </button>
                                </span>
                              )}
                              {isInlineResolved && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold uppercase shrink-0">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>Fixed</span>
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
                            {!isOnline &&
                              meeting.buildingCode &&
                              meeting.buildingCode !== 'ONLINE' && (
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
                              className="p-1 rounded-lg text-neutral-500 hover:text-blue-600 hover:bg-white/80 dark:hover:bg-neutral-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                              title="Edit Meeting"
                              aria-label="Edit meeting"
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
                                  className="px-1.5 py-0.5 text-[10px] font-bold text-white bg-rose-600 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
                                  aria-label="Confirm delete meeting"
                                >
                                  Del
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="px-1 py-0.5 text-[10px] text-neutral-600 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                  aria-label="Cancel delete"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(meeting.id)}
                                className="p-1 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-white/80 dark:hover:bg-neutral-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
                                title="Delete Meeting"
                                aria-label="Delete meeting"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Live Current-Time Horizontal Needle */}
                {showNowLine && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                    style={{
                      top: `${timelineLayout.getTopPxForMin(currentMinutes)}px`,
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

      {/* Fix Transition Sheet (Bottom sheet on phone, centered dialog on desktop) */}
      {activeFixProblem && (() => {
        const { earlier, later, leg, isOverlap, targetMeeting, otherMeeting } = activeFixProblem;
        const fromLoc = `${earlier.buildingCode}${earlier.roomNumber ? ` ${earlier.roomNumber}` : ''}`;
        const toLoc = `${later.buildingCode}${later.roomNumber ? ` ${later.roomNumber}` : ''}`;
        const targetLoc = `${targetMeeting.buildingCode}${targetMeeting.roomNumber ? ` ${targetMeeting.roomNumber}` : ''}`;
        const otherLoc = `${otherMeeting.buildingCode}${otherMeeting.roomNumber ? ` ${otherMeeting.roomNumber}` : ''}`;

        const targetIsUser =
          targetMeeting.source === 'created' || targetMeeting.source === 'new';
        const hasTargetStarted =
          isPastDate || (isToday && parseTimeToMinutes(targetMeeting.startTime) <= currentMinutes);
        const canDirectMove = targetIsUser && !hasTargetStarted;

        const targetStartMin = parseTimeToMinutes(targetMeeting.startTime);
        const targetEndMin = parseTimeToMinutes(targetMeeting.endTime);
        const targetDuration = Math.max(15, targetEndMin - targetStartMin);

        // Compute up to 3 valid slots using findAvailableSlots from src/utils/slotFinder.ts
        const otherEvents = dayMeetings.filter((m) => m.id !== targetMeeting.id);
        const slotTarget = {
          buildingCode: targetMeeting.buildingCode,
          floor: targetMeeting.floor || 1,
          isOnline: false,
          durationMinutes: targetDuration,
        };

        const baseMinNeeded = isOverlap
          ? parseTimeToMinutes(otherMeeting.endTime)
          : parseTimeToMinutes(earlier.endTime) +
            leg.questFlowTravelMinutes +
            (settings.arrivalBufferMinutes ?? 5);
        const preferredQuarter = formatMinutesToTime(Math.ceil(baseMinNeeded / 15) * 15);
        const preferredFive = formatMinutesToTime(Math.ceil(baseMinNeeded / 5) * 5);

        const afterConflictSlots = findAvailableSlots(
          otherEvents,
          slotTarget,
          settings,
          '08:00',
          '18:00',
          preferredFive,
          selectedDate
        );
        const distinctSlots: SuggestedSlot[] =
          afterConflictSlots.length >= 3
            ? afterConflictSlots
            : findAvailableSlots(
                otherEvents,
                slotTarget,
                settings,
                '08:00',
                '18:00',
                undefined,
                selectedDate
              );

        const earliestStart = distinctSlots[0]?.startTime || preferredQuarter;

        // Leave earlier meeting by time (for non-overlapping walking transitions)
        const laterStartMin = parseTimeToMinutes(later.startTime);
        const leaveEarlierBy = formatMinutesToTime(
          laterStartMin -
            (leg.status === 'TIGHT'
              ? leg.questFlowTravelMinutes + leg.bufferMinutes
              : leg.questFlowTravelMinutes)
        );

        const sheetTitle = isOverlap
          ? `${targetIsUser ? `Your meeting (${targetMeeting.title})` : targetMeeting.title} in ${targetLoc} overlaps ${otherMeeting.title} in ${otherLoc}`
          : `${fromLoc} → ${toLoc} needs ${leg.questFlowTravelMinutes} min. You have ${leg.gapMinutes}.`;

        const triggerDraft = async (type: 'later_start' | 'join_online') => {
          setFixDraftType(type);
          setIsDraftingFix(true);
          setFixCopied(false);

          const organizer = later.organizer || targetMeeting.organizer || 'there';
          const fallbackText =
            type === 'join_online'
              ? `Hi ${organizer},\n\nI have a back-to-back schedule across campus right around our session (${fromLoc} and ${toLoc}) and won't have enough travel time to make it in person.\n\nWould it be alright if I joined via Teams / virtually so we can start promptly? Let me know if that works!`
              : `Hi ${organizer},\n\nLooking forward to our meeting today. I have a prior commitment in ${fromLoc} ending at ${earlier.endTime}, and realistic room-to-room walking across campus takes ~${leg.questFlowTravelMinutes} minutes.\n\nCould we start a few minutes later at ${earliestStart} so I can get there without cutting into our discussion? Thank you!`;

          setFixDraftText(fallbackText);

          try {
            const minutesShift = Math.max(
              10,
              parseTimeToMinutes(earliestStart) - parseTimeToMinutes(later.startTime)
            );
            const res = await fetch('/api/gemini/draft-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type,
                fromMeeting: earlier,
                toMeeting: later,
                gapMinutes: leg.gapMinutes,
                travelMinutes: leg.questFlowTravelMinutes,
                minutesLate: minutesShift,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.message) setFixDraftText(data.message);
            }
          } catch {
            // Keep deterministic fallback text
          } finally {
            setIsDraftingFix(false);
          }
        };

        const handleCopyDraft = async () => {
          if (!fixDraftText) return;
          try {
            await navigator.clipboard.writeText(fixDraftText);
          } catch {}
          setFixCopied(true);
          setTimeout(() => setFixCopied(false), 2500);
        };

        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-950/55 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setActiveFixProblem(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              ref={fixSheetRef}
              className="relative w-full sm:max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-2xl border-t sm:border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile pull handle */}
              <div className="pt-2.5 pb-1 flex justify-center sm:hidden">
                <div className="w-10 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700" />
              </div>

              {/* Sheet Header */}
              <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold text-neutral-900 dark:text-white leading-snug">
                    {sheetTitle}
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {earlier.title} ({formatTimeCompact(earlier.startTime)}–{formatTimeCompact(earlier.endTime)}) ·{' '}
                    {later.title} ({formatTimeCompact(later.startTime)}–{formatTimeCompact(later.endTime)})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveFixProblem(null)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Options Body */}
              <div className="p-5 overflow-y-auto space-y-3">
                {/* 1. Primary Option: Move user-created meeting (if not already started) OR Ask to start at... */}
                {canDirectMove ? (
                  distinctSlots.length > 0 ? (
                    <div className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-200">
                        <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>Move {targetMeeting.title} to:</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {distinctSlots.map((slot) => (
                          <button
                            key={slot.startTime}
                            type="button"
                            onClick={() => {
                              onSaveMeeting?.({
                                ...targetMeeting,
                                startTime: slot.startTime,
                                endTime: slot.endTime,
                              });
                              applyResolvedConfirmation(
                                targetMeeting.id,
                                `Moved "${targetMeeting.title}" to ${slot.startTime}–${slot.endTime}`
                              );
                            }}
                            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold font-mono shadow-xs transition-all cursor-pointer active:scale-95"
                          >
                            {formatTimeCompact(slot.startTime)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : isToday ? (
                    <div className="p-3.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                      No times left today
                    </div>
                  ) : null
                ) : !targetIsUser ? (
                  <button
                    type="button"
                    onClick={() => triggerDraft('later_start')}
                    className="w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                  >
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span>Ask to start at {earliestStart}</span>
                  </button>
                ) : null}

                {/* 2. Secondary Options: Join online instead & Ask the organizer */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => triggerDraft('join_online')}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white border border-neutral-200 dark:border-neutral-700 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                  >
                    <Video className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Join online instead</span>
                  </button>

                  {targetIsUser && (
                    <button
                      type="button"
                      onClick={() => triggerDraft('later_start')}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white border border-neutral-200 dark:border-neutral-700 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>Ask the organizer</span>
                    </button>
                  )}
                </div>

                {/* Draft Box when "Ask to start at..." / "Ask the organizer" or "Join online instead" is clicked */}
                {fixDraftType && (
                  <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      <span>
                        {fixDraftType === 'later_start'
                          ? `Note proposing ${earliestStart} start`
                          : 'Note to join online'}
                      </span>
                      {isDraftingFix && (
                        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Drafting...</span>
                        </span>
                      )}
                    </div>

                    <textarea
                      rows={4}
                      value={fixDraftText}
                      onChange={(e) => setFixDraftText(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={handleCopyDraft}
                        className="flex-1 px-3 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 text-xs font-bold flex items-center justify-center gap-1.5 transition-opacity cursor-pointer"
                      >
                        {fixCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      {fixDraftType === 'join_online' && (
                        <button
                          type="button"
                          onClick={() => {
                            onQuickToggleFormat(targetMeeting.id, 'online');
                            applyResolvedConfirmation(
                              targetMeeting.id,
                              `Switched "${targetMeeting.title}" to Online (Teams)`
                            );
                          }}
                          className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Confirm Online</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. Leave earlier meeting by HH:MM (information only, when non-overlapping) */}
                {!isOverlap && (
                  <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 flex items-center gap-2.5 text-xs text-neutral-700 dark:text-neutral-300">
                    <Footprints className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="font-medium">
                      Leave the earlier meeting by{' '}
                      <strong className="font-bold text-neutral-900 dark:text-white">
                        {leaveEarlierBy}
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
