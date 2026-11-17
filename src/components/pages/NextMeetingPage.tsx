import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  MapPin,
  Clock,
  Footprints,
  Car,
  Bus,
  Navigation,
  Calendar,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Laptop,
} from 'lucide-react';
import { CampusMeeting, CampusSettings } from '../../types';
import {
  parseTimeToMinutes,
  formatMinutesToTime,
  formatTime12h,
  getDepartureForMeeting,
} from '../../utils/travelCalculator';
import { UW_BUILDINGS, getOutdoorWalkEstimate } from '../../data/uwaterlooCampus';
import { getGoogleMapsDirectionsUrl } from '../../utils/googleMapsLinks';

type TravelMode = 'walk' | 'drive' | 'transit';

interface NextMeetingPageProps {
  meetings: CampusMeeting[];
  selectedDate: string;
  settings: CampusSettings;
  onOpenCalendar: () => void;
  onConnectCalendar: () => void;
  onLoadSample: () => void;
  isModal?: boolean;
  isFromCalendar?: boolean;
  onClose?: () => void;
}

export const NextMeetingPage: React.FC<NextMeetingPageProps> = ({
  meetings,
  selectedDate,
  settings,
  onOpenCalendar,
  onConnectCalendar,
  onLoadSample,
  isModal = false,
  isFromCalendar = true,
  onClose,
}) => {
  const [travelMode, setTravelMode] = useState<TravelMode>('walk');
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  // Touch/swipe tracking for mobile & touch screens
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  const dayMeetings = useMemo(
    () =>
      meetings
        .filter((m) => m.date === selectedDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [meetings, selectedDate]
  );

  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Determine the default "next meeting" index based on current time of day
  const defaultIndex = useMemo(() => {
    if (dayMeetings.length === 0) return 0;

    // 1. Prefer the next upcoming or currently active meeting
    const upcomingIdx = dayMeetings.findIndex(
      (m) => parseTimeToMinutes(m.endTime) > nowMin
    );
    if (upcomingIdx !== -1) return upcomingIdx;

    // 2. If all meetings for today are earlier, pick the first cross-building transition or first meeting
    for (let i = 1; i < dayMeetings.length; i++) {
      const prev = dayMeetings[i - 1];
      const cur = dayMeetings[i];
      if (
        prev.format !== 'online' &&
        !prev.isOnline &&
        cur.format !== 'online' &&
        !cur.isOnline &&
        prev.buildingCode &&
        cur.buildingCode &&
        prev.buildingCode !== cur.buildingCode
      ) {
        return i;
      }
    }

    return 0;
  }, [dayMeetings, nowMin]);

  const activeIndex =
    manualIndex !== null && manualIndex >= 0 && manualIndex < dayMeetings.length
      ? manualIndex
      : defaultIndex;

  // Keyboard navigation (Left / Right arrow keys)
  useEffect(() => {
    if (dayMeetings.length <= 1) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft' && activeIndex > 0) {
        setManualIndex(activeIndex - 1);
      } else if (e.key === 'ArrowRight' && activeIndex < dayMeetings.length - 1) {
        setManualIndex(activeIndex + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, dayMeetings.length]);

  const goPrev = () => {
    if (activeIndex > 0) setManualIndex(activeIndex - 1);
  };

  const goNext = () => {
    if (activeIndex < dayMeetings.length - 1) setManualIndex(activeIndex + 1);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (dayMeetings.length <= 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      const atStartEdge = activeIndex === 0 && dx > 0;
      const atEndEdge = activeIndex === dayMeetings.length - 1 && dx < 0;
      setDragOffsetX(atStartEdge || atEndEdge ? dx * 0.25 : dx);
    }
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current) return;
    if (dragOffsetX < -55 && activeIndex < dayMeetings.length - 1) {
      goNext();
    } else if (dragOffsetX > 55 && activeIndex > 0) {
      goPrev();
    }
    touchStartRef.current = null;
    setDragOffsetX(0);
    setIsSwiping(false);
  };

  // Empty state if user tapped "Next Meeting (In a Rush)" before loading a schedule
  if (dayMeetings.length === 0) {
    return (
      <div
        className={
          isModal
            ? 'w-full'
            : 'max-w-xl mx-auto px-4 sm:px-6 min-h-[calc(100vh-5rem)] flex items-center justify-center py-10 animate-in fade-in duration-200'
        }
      >
        <div className="w-full bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm p-6 sm:p-8 text-center space-y-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white tracking-tight">
              No Meetings Loaded Yet
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Load your calendar or try the sample day to see your next meeting right away.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onLoadSample}
              className="flex-1 px-5 py-3.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-sm"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Try Sample Walkthrough</span>
            </button>
            <button
              type="button"
              onClick={onConnectCalendar}
              className="flex-1 px-5 py-3.5 rounded-xl text-sm font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Calendar className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>Input My Calendar</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const todayLocalStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const isToday = selectedDate === todayLocalStr;

  const gmTravelMode =
    travelMode === 'drive' ? 'driving' : travelMode === 'transit' ? 'transit' : 'walking';

  const activeModeLabel =
    travelMode === 'walk'
      ? 'walk'
      : travelMode === 'drive'
      ? 'drive'
      : 'transit';

  const renderMeetingCard = (targetMeeting: CampusMeeting, idx: number, isActiveCard: boolean) => {
    const previousPhysicalMeeting =
      idx > 0
        ? dayMeetings
            .slice(0, idx)
            .reverse()
            .find((m) => m.format !== 'online' && !m.isOnline && Boolean(m.buildingCode)) || null
        : null;
    const isOnline = targetMeeting.format === 'online' || targetMeeting.isOnline;
    const destCode = targetMeeting.buildingCode;
    const destBldg = destCode ? UW_BUILDINGS[destCode] : undefined;
    const destBuildingName = isOnline
      ? 'Online Meeting'
      : destBldg
      ? `${destBldg.fullName} (${destCode}${targetMeeting.roomNumber ? ` ${targetMeeting.roomNumber}` : ''})`
      : `${destCode || 'Campus'}${targetMeeting.roomNumber ? ` ${targetMeeting.roomNumber}` : ''}`;

    const departure = getDepartureForMeeting(targetMeeting, previousPhysicalMeeting, settings);
    const hasOrigin = departure.hasOrigin;
    const originCode = departure.originBuildingCode;
    const originLabel = departure.originLabel;
    const walkMinutes = departure.walkMinutes;

    const outdoorEstimate =
      originCode && destCode
        ? getOutdoorWalkEstimate(originCode, destCode, settings.walkingSpeed)
        : { minutes: 0, distanceMeters: 0 };
    const sameBuilding = !isOnline && Boolean(originCode) && originCode === destCode;

    const driveMinutes =
      isOnline || !hasOrigin
        ? 0
        : sameBuilding
        ? walkMinutes
        : Math.max(4, Math.round(outdoorEstimate.minutes * 0.4) + 3);

    const transitMinutes =
      isOnline || !hasOrigin
        ? 0
        : sameBuilding
        ? walkMinutes
        : Math.max(6, Math.round(outdoorEstimate.minutes * 0.6) + 4);

    const activeModeMinutes =
      travelMode === 'walk'
        ? walkMinutes
        : travelMode === 'drive'
        ? driveMinutes
        : transitMinutes;

    const bufferMin = settings.arrivalBufferMinutes ?? 5;
    const leaveByTime12h =
      !isOnline && hasOrigin
        ? travelMode === 'walk'
          ? departure.leaveByTime12h
          : formatTime12h(
              formatMinutesToTime(
                parseTimeToMinutes(targetMeeting.startTime) - (activeModeMinutes + bufferMin)
              )
            )
        : null;

    const googleMapsUrl = getGoogleMapsDirectionsUrl(originCode, destCode, gmTravelMode);

    const startMin = parseTimeToMinutes(targetMeeting.startTime);
    const endMin = parseTimeToMinutes(targetMeeting.endTime);
    const isInProgress = isToday && startMin <= nowMin && nowMin < endMin;
    const isPassed = isToday && endMin <= nowMin;
    const minsUntilStart = startMin - nowMin;

    return (
      <div
        className={`bg-white dark:bg-neutral-900 rounded-2xl border shadow-md overflow-hidden h-full min-h-[520px] sm:min-h-[470px] flex flex-col ${
          isActiveCard
            ? 'border-neutral-200 dark:border-neutral-700'
            : 'border-neutral-200/80 dark:border-neutral-800 pointer-events-none select-none'
        }`}
      >
        {/* Top Bar */}
        <div className="px-6 py-4 bg-neutral-50/80 dark:bg-neutral-800/40 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              {isInProgress ? 'In Progress' : isPassed ? 'Earlier Meeting' : 'Next Meeting'}
            </span>
            {isToday && !isPassed && !isInProgress && minsUntilStart > 0 && minsUntilStart <= 120 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 tabular-nums">
                in {minsUntilStart}m
              </span>
            )}
            {isInProgress && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 tabular-nums">
                {endMin - nowMin}m left
              </span>
            )}
          </div>

          <span className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 tabular-nums">
            {formatTime12h(targetMeeting.startTime)} – {formatTime12h(targetMeeting.endTime)}
          </span>
        </div>

        <div className="p-6 sm:p-8 flex-1 flex flex-col gap-5">
          {/* 1. Meeting Name & Building Name */}
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white tracking-tight leading-snug">
              {targetMeeting.title}
            </h1>

            <div className="flex items-center gap-2 text-base font-bold text-neutral-700 dark:text-neutral-200">
              {isOnline ? (
                <Laptop className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              ) : (
                <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              )}
              <span>{destBuildingName}</span>
            </div>
          </div>

          {/* 2. Time to Reach By & Estimated Travel Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                <Clock className="w-3.5 h-3.5" />
                <span>Reach By</span>
              </div>
              <p className="mt-1 text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white tabular-nums">
                {formatTime12h(targetMeeting.startTime)}
              </p>
              {leaveByTime12h && (
                <p className="mt-1 text-xs font-semibold text-blue-800 dark:text-blue-300">
                  Leave by {leaveByTime12h}
                </p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/80">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {travelMode === 'walk' && <Footprints className="w-3.5 h-3.5 text-blue-600" />}
                {travelMode === 'drive' && <Car className="w-3.5 h-3.5 text-blue-600" />}
                {travelMode === 'transit' && <Bus className="w-3.5 h-3.5 text-blue-600" />}
                <span>Estimated Travel</span>
              </div>

              {isOnline ? (
                <>
                  <p className="mt-1 text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white">
                    0 min
                  </p>
                  <p className="mt-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Remote · Join online
                  </p>
                </>
              ) : !hasOrigin ? (
                <>
                  <p className="mt-1 text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white">
                    First meeting
                  </p>
                  <p className="mt-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    No prior campus meeting today
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white tabular-nums">
                    ~{activeModeMinutes} min {activeModeLabel}
                  </p>
                  <p className="mt-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 truncate">
                    From {originLabel} → {destCode}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* 3. Mode Selector (Walk / Drive / Transit) or Remote Indicator */}
          {!isOnline && hasOrigin ? (
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800">
              <button
                type="button"
                onClick={() => setTravelMode('walk')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  travelMode === 'walk'
                    ? 'bg-white dark:bg-neutral-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Footprints className="w-3.5 h-3.5" />
                <span>Walk ({walkMinutes}m)</span>
              </button>
              <button
                type="button"
                onClick={() => setTravelMode('drive')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  travelMode === 'drive'
                    ? 'bg-white dark:bg-neutral-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Car className="w-3.5 h-3.5" />
                <span>Drive ({driveMinutes}m)</span>
              </button>
              <button
                type="button"
                onClick={() => setTravelMode('transit')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  travelMode === 'transit'
                    ? 'bg-white dark:bg-neutral-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Bus className="w-3.5 h-3.5" />
                <span>Transit ({transitMinutes}m)</span>
              </button>
            </div>
          ) : isOnline ? (
            <div className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <Laptop className="w-3.5 h-3.5 shrink-0" />
              <span>Virtual session · No campus travel needed</span>
            </div>
          ) : null}

          {/* 4. Primary & Secondary Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1 mt-auto">
            {!isOnline && (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-5 py-3.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Navigation className="w-4 h-4 shrink-0" />
                <span>Open in Google Maps</span>
                <ExternalLink className="w-4 h-4 shrink-0 opacity-85" />
              </a>
            )}

            <button
              type="button"
              onClick={isModal && isFromCalendar ? onClose || onOpenCalendar : onOpenCalendar}
              className={`flex-1 px-5 py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isOnline
                  ? 'font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md'
                  : 'font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700'
              }`}
            >
              <Calendar className={`w-4 h-4 shrink-0 ${isOnline ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
              <span>{isModal && isFromCalendar ? 'Back to Calendar' : 'View Full Calendar'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={
        isModal
          ? 'w-full'
          : 'w-full overflow-x-hidden min-h-[calc(100vh-5rem)] flex flex-col items-center justify-start pt-8 sm:pt-14 pb-10 px-4 sm:px-10 animate-in fade-in duration-200'
      }
    >
      <div className="w-full max-w-xl mx-auto space-y-5">
        {/* Stacked Carousel Slider Stage */}
        <div
          className="relative touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Left Side Navigation Arrow (fixed vertical position) */}
          {dayMeetings.length > 1 && (
            <button
              type="button"
              onClick={goPrev}
              disabled={activeIndex === 0}
              aria-label="Previous meeting"
              className={`hidden sm:flex items-center justify-center w-11 h-11 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-lg text-neutral-700 dark:text-neutral-200 hover:text-blue-600 hover:border-blue-300 dark:hover:border-blue-600 absolute top-[235px] -translate-y-1/2 -left-14 z-40 transition-all cursor-pointer active:scale-95 ${
                activeIndex === 0 ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Right Side Navigation Arrow (fixed vertical position) */}
          {dayMeetings.length > 1 && (
            <button
              type="button"
              onClick={goNext}
              disabled={activeIndex === dayMeetings.length - 1}
              aria-label="Next meeting"
              className={`hidden sm:flex items-center justify-center w-11 h-11 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-lg text-neutral-700 dark:text-neutral-200 hover:text-blue-600 hover:border-blue-300 dark:hover:border-blue-600 absolute top-[235px] -translate-y-1/2 -right-14 z-40 transition-all cursor-pointer active:scale-95 ${
                activeIndex === dayMeetings.length - 1 ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100'
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Stacked Cards */}
          <div className="relative">
            {dayMeetings.map((meeting, idx) => {
              const offset = idx - activeIndex;
              if (Math.abs(offset) > 2) return null;

              const isActive = offset === 0;
              const isImmediateSide = Math.abs(offset) === 1;

              let translateXPct = offset * 6.5;
              if (Math.abs(offset) === 2) translateXPct = offset * 5.5;
              const scale = isActive ? 1 : isImmediateSide ? 0.94 : 0.88;
              const opacity = isActive ? 1 : isImmediateSide ? 0.65 : 0.25;
              const zIndex = isActive ? 30 : isImmediateSide ? 20 : 10;

              const dragShift = isActive
                ? dragOffsetX
                : dragOffsetX * (isImmediateSide ? 0.45 : 0.2);

              return (
                <div
                  key={meeting.id}
                  onClick={isImmediateSide ? () => setManualIndex(idx) : undefined}
                  className={`${
                    isActive
                      ? 'relative'
                      : `absolute inset-0 ${isImmediateSide ? 'cursor-pointer' : 'pointer-events-none'}`
                  } ${isSwiping ? '' : 'transition-all duration-300 ease-out'}`}
                  style={{
                    zIndex,
                    opacity,
                    transform: `translateX(calc(${translateXPct}% + ${dragShift}px)) scale(${scale})`,
                  }}
                >
                  {renderMeetingCard(meeting, idx, isActive)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Carousel Dot Indicators + Mobile Tap Controls */}
        {dayMeetings.length > 1 && (
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={goPrev}
              disabled={activeIndex === 0}
              aria-label="Previous meeting"
              className="sm:hidden p-2 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 disabled:opacity-25 shadow-xs cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5" role="tablist" aria-label="Meetings">
              {dayMeetings.map((m, idx) => {
                const isActiveDot = idx === activeIndex;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={isActiveDot}
                    aria-label={`Jump to ${m.title}`}
                    onClick={() => setManualIndex(idx)}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      isActiveDot
                        ? 'w-6 bg-blue-600'
                        : 'w-2 bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400'
                    }`}
                  />
                );
              })}
            </div>

            <button
              type="button"
              onClick={goNext}
              disabled={activeIndex === dayMeetings.length - 1}
              aria-label="Next meeting"
              className="sm:hidden p-2 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 disabled:opacity-25 shadow-xs cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
