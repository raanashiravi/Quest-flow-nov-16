import React, { useState, useEffect } from 'react';
import {
  CampusMeeting,
  CampusSettings,
  MeetingFormat,
} from '../types';
import { UW_BUILDINGS } from '../data/uwaterlooCampus';
import {
  parseTimeToMinutes,
  calculateBuildingToBuildingSeconds,
  formatTime12h,
} from '../utils/travelCalculator';
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

  useEffect(() => {
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
      setTitle('');
      setDate(selectedDate);
      setStartTime('11:00');
      setEndTime('11:45');
      setFormat('in_person');
      setBuildingCode('MC');
      setRoomNumber('2018');
      setFloor(2);
      setOnlineLink('');
      setOrganizer('');
      setNotes('');
    }
    setTravelWarning(null);
  }, [meetingToEdit, selectedDate, isOpen]);

  // Live travel validation
  useEffect(() => {
    if (!isOpen) return;

    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);

    if (endMin <= startMin) {
      setTravelWarning('End time must be after start time.');
      return;
    }

    if (format === 'online') {
      setTravelWarning(null);
      return;
    }

    const sameDay = existingMeetings.filter(
      (m) => m.date === date && (!meetingToEdit || m.id !== meetingToEdit.id)
    );

    // Check overlap
    const overlapping = sameDay.find((m) => {
      const s = parseTimeToMinutes(m.startTime);
      const e = parseTimeToMinutes(m.endTime);
      return startMin < e && endMin > s;
    });

    if (overlapping) {
      setTravelWarning(`Time overlaps with "${overlapping.title}" (${overlapping.startTime}–${overlapping.endTime}).`);
      return;
    }

    // Check travel from preceding meeting
    const sorted = [...sameDay].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const prior = [...sorted].reverse().find((m) => parseTimeToMinutes(m.endTime) <= startMin);

    if (prior && prior.format !== 'online') {
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
      const buffer = settings.arrivalBufferMinutes ?? 5;

      if (gap < neededTravel) {
        setTravelWarning(
          `Impossible transition from "${prior.title}" in ${prior.buildingCode}: ${gap}m gap is less than the ${neededTravel}m room-to-room walking time.`
        );
        return;
      } else if (gap < neededTravel + buffer) {
        setTravelWarning(
          `Tight transition: ${gap}m gap leaves only ${gap - neededTravel}m before start (configured arrival buffer is ${buffer}m).`
        );
        return;
      }
    }

    setTravelWarning(null);
  }, [startTime, endTime, format, buildingCode, floor, date, existingMeetings, meetingToEdit, isOpen, settings]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            {meetingToEdit ? 'Edit Meeting' : 'Schedule Campus Meeting'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
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
              <div>
                <p className="font-semibold text-amber-950">Schedule Advisory</p>
                <p className="mt-0.5 text-amber-800 leading-relaxed">{travelWarning}</p>
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
                <span>{meetingToEdit ? 'Save Changes' : 'Schedule Meeting'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
