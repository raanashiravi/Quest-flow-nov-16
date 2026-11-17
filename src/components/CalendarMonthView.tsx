import React, { useMemo } from 'react';
import { QuestMeeting, QuestSettings } from '../types';
import { calculateTravelLeg } from '../utils/travelCalculator';
import { ChevronLeft, ChevronRight, Plus, Footprints, AlertCircle, Building2 } from 'lucide-react';

interface CalendarMonthViewProps {
  currentDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  onNavigateToDay: (date: string) => void;
  allMeetings: QuestMeeting[]; // All meetings across dates or sample week
  weekMeetings: Record<string, QuestMeeting[]>;
  settings: QuestSettings;
  onOpenAddModal: (date?: string) => void;
}

export const CalendarMonthView: React.FC<CalendarMonthViewProps> = ({
  currentDate,
  onSelectDate,
  onNavigateToDay,
  allMeetings,
  weekMeetings,
  settings,
  onOpenAddModal,
}) => {
  // Parse year and month from currentDate
  const { year, month } = useMemo(() => {
    const parts = currentDate.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { year: parts[0], month: parts[1] - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [currentDate]);

  // Month navigation
  const handleChangeMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    const newY = d.getFullYear();
    const newM = (d.getMonth() + 1).toString().padStart(2, '0');
    onSelectDate(`${newY}-${newM}-01`);
  };

  const handleSetToday = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    onSelectDate(`${y}-${m}-${d}`);
  };

  // Month title e.g. "November 2026"
  const monthTitle = useMemo(() => {
    const d = new Date(year, month, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [year, month]);

  // Combine meetings map by date:
  const meetingsByDate = useMemo(() => {
    const map: Record<string, QuestMeeting[]> = { ...weekMeetings };
    // Also include any current meetings
    for (const m of allMeetings) {
      if (!m.date) continue;
      if (!map[m.date]) map[m.date] = [];
      if (!map[m.date].some((existing) => existing.id === m.id)) {
        map[m.date].push(m);
      }
    }
    return map;
  }, [allMeetings, weekMeetings]);

  // Generate 35-42 calendar cells
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: {
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      meetings: QuestMeeting[];
      hasLate: boolean;
      totalWalkMin: number;
    }[] = [];

    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${(todayObj.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-${todayObj.getDate().toString().padStart(2, '0')}`;

    // Previous month filler days
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const dNum = daysInPrevMonth - i;
      const prevDateObj = new Date(year, month - 1, dNum);
      const prevDateStr = `${prevDateObj.getFullYear()}-${(prevDateObj.getMonth() + 1)
        .toString()
        .padStart(2, '0')}-${dNum.toString().padStart(2, '0')}`;

      cells.push({
        dateStr: prevDateStr,
        dayNumber: dNum,
        isCurrentMonth: false,
        isToday: prevDateStr === todayStr,
        isSelected: prevDateStr === currentDate,
        meetings: meetingsByDate[prevDateStr] || [],
        hasLate: false,
        totalWalkMin: 0,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d
        .toString()
        .padStart(2, '0')}`;

      const dayEvents = (meetingsByDate[dateStr] || []).slice().sort((a, b) =>
        a.startTime.localeCompare(b.startTime)
      );

      // Compute travel status
      let hasLate = false;
      let totalWalkMin = 0;
      if (dayEvents.length >= 2) {
        for (let i = 0; i < dayEvents.length - 1; i++) {
          const leg = calculateTravelLeg(dayEvents[i], dayEvents[i + 1], settings);
          if (!leg.isOnline) {
            totalWalkMin += leg.questFlowTravelMinutes;
            if (leg.status === 'LATE') hasLate = true;
          }
        }
      }

      cells.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === currentDate,
        meetings: dayEvents,
        hasLate,
        totalWalkMin,
      });
    }

    // Next month filler days to complete grid
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDateObj = new Date(year, month + 1, i);
      const nextDateStr = `${nextDateObj.getFullYear()}-${(nextDateObj.getMonth() + 1)
        .toString()
        .padStart(2, '0')}-${i.toString().padStart(2, '0')}`;

      cells.push({
        dateStr: nextDateStr,
        dayNumber: i,
        isCurrentMonth: false,
        isToday: nextDateStr === todayStr,
        isSelected: nextDateStr === currentDate,
        meetings: meetingsByDate[nextDateStr] || [],
        hasLate: false,
        totalWalkMin: 0,
      });
    }

    return cells;
  }, [year, month, currentDate, meetingsByDate, settings]);

  const selectedDayData = useMemo(() => {
    return calendarCells.find((c) => c.dateStr === currentDate) || null;
  }, [calendarCells, currentDate]);

  return (
    <div className="w-full flex-1 flex flex-col bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
      {/* Month Header Bar */}
      <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-3 bg-neutral-50/60 dark:bg-neutral-800/40">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleChangeMonth(-1)}
              className="p-1 rounded-lg hover:bg-neutral-200/70 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 transition-colors"
              title="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleChangeMonth(1)}
              className="p-1 rounded-lg hover:bg-neutral-200/70 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 transition-colors"
              title="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="font-bold text-base text-neutral-900 dark:text-neutral-100">
            {monthTitle}
          </span>
          <button
            onClick={handleSetToday}
            className="px-2 py-0.5 rounded-md text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            Today
          </button>
        </div>

        {/* Selected date quick action */}
        {selectedDayData && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 hidden sm:inline">
              Selected: <span className="font-bold text-neutral-800 dark:text-neutral-200">{selectedDayData.dateStr}</span> ({selectedDayData.meetings.length} event{selectedDayData.meetings.length === 1 ? '' : 's'})
            </span>
            <button
              onClick={() => onNavigateToDay(selectedDayData.dateStr)}
              className="px-3 py-1 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-xs transition-all"
            >
              Open Day View
            </button>
          </div>
        )}
      </div>

      {/* Days of week row */}
      <div className="grid grid-cols-7 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-800/30 text-center text-[11px] font-bold text-neutral-500 py-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Month Days Grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-5 sm:grid-rows-6 divide-x divide-y divide-neutral-100 dark:divide-neutral-800/80 bg-neutral-100/30 dark:bg-neutral-900/20 overflow-y-auto">
        {calendarCells.map((cell) => {
          const hasEvents = cell.meetings.length > 0;

          return (
            <div
              key={cell.dateStr}
              onClick={() => onSelectDate(cell.dateStr)}
              onDoubleClick={() => onNavigateToDay(cell.dateStr)}
              className={`min-h-[75px] sm:min-h-[100px] p-1.5 sm:p-2 transition-all flex flex-col justify-between cursor-pointer select-none relative group ${
                cell.isCurrentMonth
                  ? 'bg-white dark:bg-[#1E1E1E]'
                  : 'bg-neutral-50/50 dark:bg-[#181818]/60 text-neutral-400 dark:text-neutral-600'
              } ${
                cell.isSelected
                  ? 'ring-2 ring-inset ring-purple-600 dark:ring-purple-500 z-10'
                  : 'hover:bg-neutral-50/80 dark:hover:bg-neutral-800/50'
              }`}
            >
              {/* Day Header: Day Number + Add (+) icon on hover */}
              <div className="flex items-center justify-between">
                <span
                  className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                    cell.isToday
                      ? 'bg-purple-600 text-white font-extrabold shadow-xs'
                      : cell.isSelected
                      ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                      : cell.isCurrentMonth
                      ? 'text-neutral-800 dark:text-neutral-200'
                      : 'text-neutral-400 dark:text-neutral-600'
                  }`}
                >
                  {cell.dayNumber}
                </span>

                <div className="flex items-center gap-1">
                  {cell.hasLate && (
                    <span
                      title="Tight walking travel detected"
                      className="w-2 h-2 rounded-full bg-red-500 animate-pulse"
                    />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAddModal(cell.dateStr);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-neutral-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 transition-opacity"
                    title="Add slot on this day"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Event chips */}
              <div className="mt-1 space-y-1 overflow-hidden flex-1">
                {cell.meetings.slice(0, 3).map((m) => (
                  <div
                    key={m.id}
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium truncate flex items-center justify-between gap-1 ${
                      m.isOnline
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40'
                        : m.source === 'new'
                        ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/40'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200/70 dark:border-neutral-700'
                    }`}
                    title={`${m.startTime}–${m.endTime}: ${m.title} (${m.rawLocation})`}
                  >
                    <span className="truncate">{m.title}</span>
                    <span className="font-mono text-[9px] text-neutral-400 shrink-0">
                      {m.startTime}
                    </span>
                  </div>
                ))}

                {cell.meetings.length > 3 && (
                  <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 block px-1">
                    +{cell.meetings.length - 3} more
                  </span>
                )}
              </div>

              {/* Bottom walking indicator */}
              {cell.totalWalkMin > 0 && (
                <div className="mt-auto pt-1 flex items-center justify-between text-[9.5px] text-neutral-400 font-mono">
                  <span className="flex items-center gap-0.5">
                    <Footprints className="w-2.5 h-2.5 text-neutral-400" />
                    <span>{cell.totalWalkMin}m walk</span>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
