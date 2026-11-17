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
      let prefillStart = initialSlots[0]?.startTime || '11:00';
      let prefillEnd = initialSlots[0]?.endTime || '11:30';

      if (initialSlots.length === 0 && selectedDate === todayLocalStr) {
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(
          tomorrow.getMonth() + 1
        ).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        targetFormDate = tomorrowStr;

        const tomorrowEvents = existingMeetings.filter((m) => m.date === tomorrowStr);
        const tomorrowSlots = findAvailableSlots(
          tomorrowEvents,
          {
            buildingCode: defaultBldg,
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
    }
    setTravelWarning(null);
    setIsImpossible(false);
    setWorkingSlots([]);
  }, [meetingToEdit, selectedDate, isOpen]);

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
        floor,
        isOnline: format === 'online',
        durationMinutes,
      };
      const preferred = formatMinutesToTime(Math.ceil(startMin / 5) * 5);
      const afterChosen = findAvailableSlots(
        sameDay,
        target,
        settings,
        '08:00',
        '18:00',
        preferred,
        date
      );
      if (afterChosen.length >= 3) return afterChosen;
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
        `Time overlaps with "${overlapping.title}" (${overlapping.startTime}–${overlapping.endTime}).`
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

    const buffer = settings.arrivalBufferMinutes ?? 5;
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
        settings
      );
      const neededTravel = calc.totalMinutes;
      const priorLocLabel = `${prior.buildingCode}${prior.roomNumber ? ` ${prior.roomNumber}` : ''}`;

      if (gap < neededTravel) {
        impossibleMsg = `You can't get from ${priorLocLabel} to ${currentLocLabel} by ${startTime} — it's ${articleFor(
          neededTravel
        )} ${neededTravel} min walk and you have ${gap}.`;
      } else if (gap < neededTravel + buffer) {
        tightMsg = `You can't comfortably get from ${priorLocLabel} to ${currentLocLabel} by ${startTime} — it's ${articleFor(
          neededTravel
        )} ${neededTravel} min walk (+${buffer} min buffer) and you have ${gap}.`;
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
        settings
      );
      const neededTravel = calc.totalMinutes;
      const nextLocLabel = `${next.buildingCode}${next.roomNumber ? ` ${next.roomNumber}` : ''}`;

      if (gap < neededTravel && !impossibleMsg) {
        impossibleMsg = `You can't get from ${currentLocLabel} to ${nextLocLabel} by ${next.startTime} — it's ${articleFor(
          neededTravel
        )} ${neededTravel} min walk and you have ${gap}.`;
      } else if (gap < neededTravel + buffer && !impossibleMsg && !tightMsg) {
        tightMsg = `You can't comfortably get from ${currentLocLabel} to ${nextLocLabel} by ${next.startTime} — it's ${articleFor(
          neededTravel
        )} ${neededTravel} min walk (+${buffer} min buffer) and you have ${gap}.`;
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={meetingToEdit ? 'Edit Meeting' : 'Schedule Campus Meeting'}
    >
      <div className="absolute inset-0" onClick={onClose} />

      <div
        ref={modalRef}
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            {meetingToEdit ? 'Edit Meeting' : 'Schedule Campus Meeting'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Meeting Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Faculty Senate Working Group"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-slate-900"
            />
          </div>

          {/* Format Selector: In-Person / Online / Hybrid */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Meeting Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormat('in_person')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                  format === 'in_person'
                    ? 'bg-blue-50 border-blue-600 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
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
                    ? 'bg-blue-50 border-blue-600 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
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
                    ? 'bg-blue-50 border-blue-600 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Campus Building
                </label>
                <select
                  value={buildingCode}
                  onChange={(e) => setBuildingCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-slate-900 font-medium"
                >
                  {Object.values(UW_BUILDINGS).map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Room Number
                </label>
                <input
                  type="text"
                  value={roomNumber}
                  onChange={(e) => handleRoomChange(e.target.value)}
                  placeholder="e.g. 5479"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-slate-900"
                />
              </div>
            </div>
          )}

          {/* Online Link (if Online or Hybrid) */}
          {format !== 'in_person' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Virtual Link or Platform
              </label>
              <input
                type="text"
                value={onlineLink}
                onChange={(e) => setOnlineLink(e.target.value)}
                placeholder="e.g. Microsoft Teams / Zoom Meeting Link"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-slate-900"
              />
            </div>
          )}

          {/* Date, Time & Quick Durations */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Time
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                End Time
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-slate-900 font-mono"
              />
            </div>
          </div>

          {/* Duration Quick Helpers */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-medium">Quick duration:</span>
            {[15, 30, 45, 60].map((dur) => (
              <button
                key={dur}
                type="button"
                onClick={() => handleSetDuration(dur)}
                className="px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 font-mono text-[11px] transition-colors"
              >
                +{dur}m
              </button>
            ))}
          </div>

          {/* Organizer */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Organizer / Contact
            </label>
            <input
              type="text"
              value={organizer}
              onChange={(e) => setOrganizer(e.target.value)}
              placeholder="e.g. Prof. Sarah Chen"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-slate-900"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Agenda or Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Brief agenda, AV requirements, or discussion points"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-slate-900"
            />
          </div>

          {/* Live Travel Conflict Warning */}
          {travelWarning && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-amber-900 font-medium leading-relaxed">{travelWarning}</p>

                {workingSlots.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] font-semibold text-amber-800">
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
                        className="px-2 py-0.5 rounded-md bg-white hover:bg-blue-50 border border-amber-300 hover:border-blue-500 text-slate-900 hover:text-blue-700 font-mono font-semibold text-[11px] transition-colors cursor-pointer shadow-2xs"
                      >
                        {slot.startTime}
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
                      <div className="pt-0.5 text-[11px] font-semibold text-amber-800">
                        No times left today
                      </div>
                    ) : null;
                  })()
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-100">
            {meetingToEdit && onDeleteMeeting ? (
              <button
                type="button"
                onClick={() => {
                  onDeleteMeeting(meetingToEdit.id);
                  onClose();
                }}
                className="px-3 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5"
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
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
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
