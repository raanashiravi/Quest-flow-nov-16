import React, { useState, useEffect, useRef } from 'react';
import {
  CampusMeeting,
  CampusSettings,
  MeetingFormat,
} from '../types';
import { UW_BUILDINGS } from '../data/uwaterlooCampus';
import {
  parseTimeToMinutes,
  calculateBuildingToBuildingSeconds,
  formatMinutesToTime,
  formatTime12h,
} from '../utils/travelCalculator';
import { findAvailableSlots, SuggestedSlot } from '../utils/slotFinder';
import { X, Trash2, AlertTriangle, Check, Building2, Video, Users } from 'lucide-react';

interface MeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingToEdit: CampusMeeting | null;
  selectedDate: string;
  existingMeetings: CampusMeeting[];
  settings: CampusSettings;
  onSaveMeeting: (meeting: CampusMeeting) => void;
  onDeleteMeeting?: (id: string) => void;
}

export const MeetingModal: React.FC<MeetingModalProps> = ({
  isOpen,
  onClose,
  meetingToEdit,
  selectedDate,
  existingMeetings,
  settings,
  onSaveMeeting,
  onDeleteMeeting,
}) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState('11:00');
  const [endTime, setEndTime] = useState('11:30');
  const [format, setFormat] = useState<MeetingFormat>('in_person');
  const [buildingCode, setBuildingCode] = useState('MC');
  const [roomNumber, setRoomNumber] = useState('2018');
  const [floor, setFloor] = useState(2);
  const [onlineLink, setOnlineLink] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [notes, setNotes] = useState('');

  // Conflict / travel validation warning
  const [travelWarning, setTravelWarning] = useState<string | null>(null);
  const [isImpossible, setIsImpossible] = useState<boolean>(false);
  const [workingSlots, setWorkingSlots] = useState<SuggestedSlot[]>([]);
  const [jumpedToTomorrow, setJumpedToTomorrow] = useState<boolean>(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape and trap focus inside modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    if (meetingToEdit) {
      setTitle(meetingToEdit.title);
      setDate(meetingToEdit.date);
      setStartTime(meetingToEdit.startTime);
      setEndTime(meetingToEdit.endTime);
      setFormat(meetingToEdit.format || (meetingToEdit.isOnline ? 'online' : 'in_person'));
      setBuildingCode(meetingToEdit.buildingCode || 'MC');
      setRoomNumber(meetingToEdit.roomNumber || '2018');
      setFloor(meetingToEdit.floor || 2);
      setOnlineLink(meetingToEdit.onlineLink || '');
      setOrganizer(meetingToEdit.organizer || '');
      setNotes(meetingToEdit.notes || '');
      setJumpedToTomorrow(false);
    } else {
      const defaultBldg = 'MC';
      const defaultRoom = '2018';
      const defaultFloor = 2;
      const defaultDuration = 30;
      const now = new Date();
      const todayLocalStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(now.getDate()).padStart(2, '0')}`;

      const sameDayEvents = existingMeetings.filter((m) => m.date === selectedDate);
      const initialSlots = findAvailableSlots(
        sameDayEvents,
        {
          buildingCode: defaultBldg,
          roomNumber: defaultRoom,
          floor: defaultFloor,
          isOnline: false,
          durationMinutes: defaultDuration,
        },
        settings,
        '08:00',
        '18:00',
        undefined,
        selectedDate
      );

      let targetFormDate = selectedDate;
      let prefillStart = initialSlots[0]?.startTime || '08:00';
      let prefillEnd = initialSlots[0]?.endTime || '08:30';
      let didJump = false;

      if (initialSlots.length === 0 && selectedDate === todayLocalStr) {
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(
          tomorrow.getMonth() + 1
        ).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        targetFormDate = tomorrowStr;
        didJump = true;

        const tomorrowEvents = existingMeetings.filter((m) => m.date === tomorrowStr);
        const tomorrowSlots = findAvailableSlots(
          tomorrowEvents,
          {
            buildingCode: defaultBldg,
            roomNumber: defaultRoom,
            floor: defaultFloor,
            isOnline: false,
            durationMinutes: defaultDuration,
          },
          settings,
          '08:00',
          '18:00',
          undefined,
          tomorrowStr
        );
        prefillStart = tomorrowSlots[0]?.startTime || '08:00';
        prefillEnd = tomorrowSlots[0]?.endTime || '08:30';
      }

      setTitle('');
      setDate(targetFormDate);
      setStartTime(prefillStart);
      setEndTime(prefillEnd);
      setFormat('in_person');
      setBuildingCode(defaultBldg);
      setRoomNumber(defaultRoom);
      setFloor(defaultFloor);
      setOnlineLink('');
      setOrganizer('');
      setNotes('');
      setJumpedToTomorrow(didJump);
    }
    setTravelWarning(null);
    setIsImpossible(false);
    setWorkingSlots([]);
  }, [meetingToEdit, selectedDate, isOpen, existingMeetings, settings]);

  // Live travel validation (from previous AND to next meeting) + slot suggestions
  useEffect(() => {
    if (!isOpen) return;

    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);

    if (endMin <= startMin) {
      setTravelWarning('End time must be after start time.');
      setIsImpossible(false);
      setWorkingSlots([]);
      return;
    }

    const durationMinutes = Math.max(15, endMin - startMin);
    const sameDay = existingMeetings.filter(
      (m) => m.date === date && (!meetingToEdit || m.id !== meetingToEdit.id)
    );

    const computeWorkingSlots = () => {
      const target = {
        buildingCode: format === 'online' ? 'ONLINE' : buildingCode,
        roomNumber: format === 'online' ? '' : roomNumber.trim(),
        floor,
        isOnline: format === 'online',
        durationMinutes,
      };
      return findAvailableSlots(sameDay, target, settings, '08:00', '18:00', undefined, date);
    };

    // Check overlap
    const overlapping = sameDay.find((m) => {
      const s = parseTimeToMinutes(m.startTime);
      const e = parseTimeToMinutes(m.endTime);
      return startMin < e && endMin > s;
    });

    if (overlapping) {
      setTravelWarning(
        `Time overlaps with "${overlapping.title}" (${formatTime12h(
          overlapping.startTime
        )}–${formatTime12h(overlapping.endTime)}).`
      );
      setIsImpossible(true);
      setWorkingSlots(computeWorkingSlots());
      return;
    }

    if (format === 'online') {
      setTravelWarning(null);
      setIsImpossible(false);
      setWorkingSlots([]);
      return;
    }

    const sorted = [...sameDay].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const prior = [...sorted].reverse().find((m) => parseTimeToMinutes(m.endTime) <= startMin);
    const next = sorted.find((m) => parseTimeToMinutes(m.startTime) >= endMin);

    const currentLocLabel = `${buildingCode}${roomNumber.trim() ? ` ${roomNumber.trim()}` : ''}`;
    const articleFor = (n: number) => (n === 8 || n === 11 || n === 18 ? 'an' : 'a');

    let impossibleMsg: string | null = null;
    let tightMsg: string | null = null;

    // 1. Check transition from preceding meeting
    if (prior && prior.format !== 'online' && !prior.isOnline) {
      const priorEnd = parseTimeToMinutes(prior.endTime);
      const gap = startMin - priorEnd;
      const calc = calculateBuildingToBuildingSeconds(
        prior.buildingCode,
        prior.floor || 1,
        buildingCode,
        floor,
        settings,
        prior.roomNumber,
        roomNumber.trim()
      );
      const neededTravel = calc.totalMinutes;
      const effectiveBuffer = calc.bufferMinutes;
      const priorLocLabel = `${prior.buildingCode}${prior.roomNumber ? ` ${prior.roomNumber}` : ''}`;

      if (!calc.isSameRoom) {
        if (gap < neededTravel) {
          impossibleMsg = `You can't get from ${priorLocLabel} to ${currentLocLabel} by ${formatTime12h(
            startTime
          )} — it's ${articleFor(neededTravel)} ${neededTravel} min walk and you have ${gap}.`;
        } else if (gap < neededTravel + effectiveBuffer) {
          tightMsg = `You can't comfortably get from ${priorLocLabel} to ${currentLocLabel} by ${formatTime12h(
            startTime
          )} — it's ${articleFor(
            neededTravel
          )} ${neededTravel} min walk (+${effectiveBuffer} min buffer) and you have ${gap}.`;
        }
      }
    }

    // 2. Check transition to next meeting
    if (next && next.format !== 'online' && !next.isOnline) {
      const nextStart = parseTimeToMinutes(next.startTime);
      const gap = nextStart - endMin;
      const calc = calculateBuildingToBuildingSeconds(
        buildingCode,
        floor,
        next.buildingCode,
        next.floor || 1,
        settings,
        roomNumber.trim(),
        next.roomNumber
      );
      const neededTravel = calc.totalMinutes;
      const effectiveBuffer = calc.bufferMinutes;
      const nextLocLabel = `${next.buildingCode}${next.roomNumber ? ` ${next.roomNumber}` : ''}`;

      if (!calc.isSameRoom) {
        if (gap < neededTravel && !impossibleMsg) {
          impossibleMsg = `You can't get from ${currentLocLabel} to ${nextLocLabel} by ${formatTime12h(
            next.startTime
          )} — it's ${articleFor(neededTravel)} ${neededTravel} min walk and you have ${gap}.`;
        } else if (gap < neededTravel + effectiveBuffer && !impossibleMsg && !tightMsg) {
          tightMsg = `You can't comfortably get from ${currentLocLabel} to ${nextLocLabel} by ${formatTime12h(
            next.startTime
          )} — it's ${articleFor(
            neededTravel
          )} ${neededTravel} min walk (+${effectiveBuffer} min buffer) and you have ${gap}.`;
        }
      }
    }

    if (impossibleMsg) {
      setTravelWarning(impossibleMsg);
      setIsImpossible(true);
      setWorkingSlots(computeWorkingSlots());
      return;
    }

    if (tightMsg) {
      setTravelWarning(tightMsg);
      setIsImpossible(false);
      setWorkingSlots(computeWorkingSlots());
      return;
    }

    setTravelWarning(null);
    setIsImpossible(false);
    setWorkingSlots([]);
  }, [
    startTime,
    endTime,
    format,
    buildingCode,
    roomNumber,
    floor,
    date,
    existingMeetings,
    meetingToEdit,
    isOpen,
    settings,
  ]);

  if (!isOpen) return null;

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setJumpedToTomorrow(false);
    if (!newDate || meetingToEdit) return;

    const curStartMin = parseTimeToMinutes(startTime);
    const curEndMin = parseTimeToMinutes(endTime);
    const durationMinutes = Math.max(15, curEndMin > curStartMin ? curEndMin - curStartMin : 30);

    const sameDayEvents = existingMeetings.filter((m) => m.date === newDate);
    const slots = findAvailableSlots(
      sameDayEvents,
      {
        buildingCode: format === 'online' ? 'ONLINE' : buildingCode,
        roomNumber: format === 'online' ? '' : roomNumber.trim(),
        floor,
        isOnline: format === 'online',
        durationMinutes,
      },
      settings,
      '08:00',
      '18:00',
      undefined,
      newDate
    );
    if (slots.length > 0) {
      setStartTime(slots[0].startTime);
      setEndTime(slots[0].endTime);
    }
  };

  const handleRoomChange = (val: string) => {
    setRoomNumber(val);
    const firstChar = parseInt(val.trim()[0], 10);
    if (!isNaN(firstChar) && firstChar >= 1 && firstChar <= 7) {
      setFloor(firstChar);
    }
  };

  const handleSetDuration = (durationMin: number) => {
    const startMin = parseTimeToMinutes(startTime);
    const endMin = startMin + durationMin;
    const h = Math.floor(endMin / 60) % 24;
    const m = endMin % 60;
    setEndTime(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const meetingId = meetingToEdit ? meetingToEdit.id : `meeting-${Date.now()}`;
    const rawLoc =
      format === 'online'
        ? 'Microsoft Teams'
        : format === 'hybrid'
        ? `${buildingCode} ${roomNumber || ''} / Online`.trim()
        : `${buildingCode} ${roomNumber || ''}`.trim();

    const updated: CampusMeeting = {
      id: meetingId,
      title: title.trim() || 'Untitled Meeting',
      date,
      startTime,
      endTime,
      format,
      buildingCode: format === 'online' ? 'ONLINE' : buildingCode,
      roomNumber: format === 'online' ? '' : roomNumber,
      floor: format === 'online' ? 1 : floor,
      onlineLink: format !== 'in_person' ? onlineLink || 'Microsoft Teams' : undefined,
      organizer: organizer.trim() || undefined,
      notes: notes.trim() || undefined,
      source: meetingToEdit ? meetingToEdit.source : 'created',
      rawLocation: rawLoc,
      isOnline: format === 'online',
    };

    onSaveMeeting(updated);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--text-primary)]/45 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={meetingToEdit ? 'Edit Meeting' : 'Schedule Campus Meeting'}
    >
      <div className="absolute inset-0" onClick={onClose} />

      <div
        ref={modalRef}
        className="relative w-full max-w-lg bg-[var(--bg-card)] rounded-2xl shadow-xl border border-[var(--border)] overflow-hidden z-10 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            {meetingToEdit ? 'Edit Meeting' : 'Schedule Campus Meeting'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sky-strong)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Meeting Title <span className="text-[var(--status-late-fg)]">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Faculty Senate Working Group"
              className="w-full px-3 py-2 text-sm bg-[var(--bg-main)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sky-strong)] focus:border-transparent text-[var(--text-primary)]"
            />
          </div>

          {/* Format Selector: In-Person / Online / Hybrid */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
              Meeting Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormat('in_person')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                  format === 'in_person'
                    ? 'bg-[var(--sky-tint)] border-[var(--sky-strong)] text-[var(--sky-strong)]'
                    : 'bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>In-Person</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat('hybrid')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                  format === 'hybrid'
                    ? 'bg-[var(--sky-tint)] border-[var(--sky-strong)] text-[var(--sky-strong)]'
                    : 'bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Hybrid</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat('online')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                  format === 'online'
                    ? 'bg-[var(--sky-tint)] border-[var(--sky-strong)] text-[var(--sky-strong)]'
                    : 'bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Online</span>
              </button>
            </div>
          </div>

          {/* Campus Location (if In-Person or Hybrid) */}
          {format !== 'online' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Campus Building
                </label>
                <select
                  value={buildingCode}
                  onChange={(e) => setBuildingCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[var(--bg-main)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sky-strong)] focus:border-transparent text-[var(--text-primary)] font-medium"
                >
                  {Object.values(UW_BUILDINGS).map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Room Number
                </label>
                <input
                  type="text"
                  value={roomNumber}
                  onChange={(e) => handleRoomChange(e.target.value)}
                  placeholder="e.g. 5479"
                  className="w-full px-3 py-2 text-sm bg-[var(--bg-main)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sky-strong)] focus:border-transparent text-[var(--text-primary)]"
                />
              </div>
            </div>
          )}

          {/* Online Link (if Online or Hybrid) */}
          {format !== 'in_person' && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Virtual Link or Platform
              </label>
              <input
                type="text"
                value={onlineLink}
                onChange={(e) => setOnlineLink(e.target.value)}
                placeholder="e.g. Microsoft Teams / Zoom Meeting Link"
                className="w-full px-3 py-2 text-sm bg-[var(--bg-main)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sky-strong)] focus:border-transparent text-[var(--text-primary)]"
              />
            </div>
          )}

          {/* Date, Time & Quick Durations */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[var(--bg-main)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sky-strong)] focus:border-transparent text-[var(--text-primary)] font-mono"
              />
              {jumpedToTomorrow && (
                <p className="mt-1 text-[11px] font-medium text-[var(--text-muted)]">
                  No times left today — showing tomorrow.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Start Time
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[var(--bg-main)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sky-strong)] focus:border-transparent text-[var(--text-primary)] font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                End Time
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[var(--bg-main)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sky-strong)] focus:border-transparent text-[var(--text-primary)] font-mono"
              />
            </div>
          </div>

          {/* Duration Quick Helpers */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span className="font-medium">Quick duration:</span>
            {[15, 30, 45, 60].map((dur) => (
              <button
                key={dur}
                type="button"
                onClick={() => handleSetDuration(dur)}
                className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-main)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] font-mono text-[11px] transition-colors"
              >
                +{dur}m
              </button>
            ))}
          </div>

          {/* Live Travel Conflict Warning */}
          {travelWarning && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                isImpossible
                  ? 'bg-[var(--status-late-bg)] border-[var(--status-late-fg)]/30 text-[var(--status-late-fg)]'
                  : 'bg-[var(--status-tight-bg)] border-[var(--status-tight-fg)]/30 text-[var(--status-tight-fg)]'
              }`}
            >
              <AlertTriangle
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  isImpossible ? 'text-[var(--status-late-fg)]' : 'text-[var(--status-tight-fg)]'
                }`}
              />
              <div className="flex-1 space-y-2">
                <p className="font-medium leading-relaxed">{travelWarning}</p>

                {workingSlots.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] font-semibold">
                      Times that work:
                    </span>
                    {workingSlots.map((slot) => (
                      <button
                        key={slot.startTime}
                        type="button"
                        onClick={() => {
                          setStartTime(slot.startTime);
                          setEndTime(slot.endTime);
                        }}
                        className="px-2 py-0.5 rounded-md bg-[var(--bg-main)] hover:bg-[var(--sky-tint)] border border-[var(--border)] hover:border-[var(--sky-strong)] text-[var(--text-primary)] hover:text-[var(--sky-strong)] font-mono font-semibold text-[11px] transition-colors cursor-pointer shadow-2xs"
                      >
                        {formatTime12h(slot.startTime)}
                      </button>
                    ))}
                  </div>
                ) : (
                  parseTimeToMinutes(endTime) > parseTimeToMinutes(startTime) &&
                  (() => {
                    const now = new Date();
                    const todayLocalStr = `${now.getFullYear()}-${String(
                      now.getMonth() + 1
                    ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    return date === todayLocalStr ? (
                      <div className="pt-0.5 text-[11px] font-semibold">
                        No times left today
                      </div>
                    ) : null;
                  })()
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-[var(--border)]">
            {meetingToEdit && onDeleteMeeting ? (
              <button
                type="button"
                onClick={() => {
                  onDeleteMeeting(meetingToEdit.id);
                  onClose();
                }}
                className="px-3 py-2 text-xs font-semibold text-[var(--status-late-fg)] hover:bg-[var(--status-late-bg)] rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[var(--sky-strong)] hover:bg-[var(--sky-hover)] rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>
                  {isImpossible
                    ? 'Save anyway'
                    : meetingToEdit
                    ? 'Save Changes'
                    : 'Schedule Meeting'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
