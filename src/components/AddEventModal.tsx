import React, { useState, useEffect, useRef } from 'react';
import { QuestMeeting, QuestSettings } from '../types';
import { findAvailableSlots, validateSlotOrFindEarliest, SuggestedSlot } from '../utils/slotFinder';
import { parseIcsContents } from '../utils/icsParser';
import { parseLocationString } from '../utils/locationParser';
import { getSampleDayMeetings } from '../data/sampleDay';
import { UW_BUILDINGS } from '../data/uwaterlooCampus';
import {
  X,
  Sparkles,
  Clock,
  MapPin,
  Check,
  AlertTriangle,
  Loader2,
  Calendar,
  Briefcase,
  BookOpen,
  Upload,
  Image as ImageIcon,
  FileText,
  AlertCircle,
} from 'lucide-react';

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  existingEvents: QuestMeeting[];
  settings: QuestSettings;
  initialTime?: string;
  onAddEvent: (newEvent: QuestMeeting) => void;
  onImportMeetings?: (meetings: QuestMeeting[], replaceExisting: boolean) => void;
}

export const AddEventModal: React.FC<AddEventModalProps> = ({
  isOpen,
  onClose,
  selectedDate,
  existingEvents,
  settings,
  initialTime,
  onAddEvent,
  onImportMeetings,
}) => {
  // Category Tab: 'event' | 'focus' | 'smart' | 'import'
  const [activeTab, setActiveTab] = useState<'event' | 'focus' | 'smart' | 'import'>('event');

  const [naturalPrompt, setNaturalPrompt] = useState<string>('');
  const [isParsingPrompt, setIsParsingPrompt] = useState<boolean>(false);

  // Form fields
  const [title, setTitle] = useState<string>('Meeting');
  const [buildingCode, setBuildingCode] = useState<string>('MC');
  const [roomNumber, setRoomNumber] = useState<string>('2018');
  const [floor, setFloor] = useState<number>(2);
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [startTime, setStartTime] = useState<string>(initialTime || '11:00');
  const [windowAfter, setWindowAfter] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(false);

  // Validation state
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [earliestValidReplacement, setEarliestValidReplacement] = useState<string | null>(null);

  // Suggested slot chips
  const [suggestedSlots, setSuggestedSlots] = useState<SuggestedSlot[]>([]);

  // Import sub-tab states
  const [importType, setImportType] = useState<'screenshot' | 'ics' | 'text' | 'sample'>('screenshot');
  const [importLoading, setImportLoading] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<QuestMeeting[]>([]);
  const [pastedText, setPastedText] = useState<string>('');

  const imageInputRef = useRef<HTMLInputElement>(null);
  const icsInputRef = useRef<HTMLInputElement>(null);

  // Update suggestions whenever building, duration, or window changes
  useEffect(() => {
    if (!isOpen) return;

    const target = {
      buildingCode: isOnline ? 'ONLINE' : buildingCode,
      floor,
      isOnline,
      durationMinutes,
    };

    const slots = findAvailableSlots(
      existingEvents,
      target,
      settings,
      '08:00',
      '18:00',
      windowAfter || (initialTime ? initialTime : undefined)
    );

    setSuggestedSlots(slots);

    // Validate the currently selected startTime
    const [h, m] = startTime.split(':').map(Number);
    const startMin = (h || 0) * 60 + (m || 0);
    const validation = validateSlotOrFindEarliest(
      startMin,
      durationMinutes,
      target,
      existingEvents,
      settings
    );

    if (!validation.isValid) {
      setValidationWarning(validation.reason || 'Walking time is too tight for this slot.');
      setEarliestValidReplacement(validation.earliestValidTime || null);
    } else {
      setValidationWarning(null);
      setEarliestValidReplacement(null);
    }
  }, [
    isOpen,
    buildingCode,
    floor,
    durationMinutes,
    startTime,
    windowAfter,
    isOnline,
    existingEvents,
    settings,
    initialTime,
  ]);

  // Set initial time if opened by clicking calendar grid
  useEffect(() => {
    if (initialTime) {
      setStartTime(initialTime);
      setWindowAfter(initialTime);
    }
  }, [initialTime]);

  if (!isOpen) return null;

  // Natural language parse
  const handleParseNaturalPrompt = async () => {
    if (!naturalPrompt.trim()) return;
    setIsParsingPrompt(true);

    try {
      const res = await fetch('/api/gemini/parse-schedule-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: naturalPrompt, currentDate: selectedDate }),
      });

      if (!res.ok) throw new Error('Failed to parse prompt');
      const data = await res.json();

      if (data.title) setTitle(data.title);
      if (data.durationMinutes) setDurationMinutes(data.durationMinutes);
      if (data.buildingCode) setBuildingCode(data.buildingCode);
      if (data.roomNumber) setRoomNumber(data.roomNumber);
      if (data.floor) setFloor(data.floor);
      if (data.isOnline !== undefined) setIsOnline(data.isOnline);
      if (data.windowStart) {
        setStartTime(data.windowStart);
        setWindowAfter(data.windowStart);
      }
    } catch {
      const dur = naturalPrompt.match(/(\d+)\s*min/i);
      if (dur) setDurationMinutes(parseInt(dur[1], 10));
      const bldg = naturalPrompt.match(/\b(MC|NH|DC|E7|E5|TC|SCH|STC)\b/i);
      if (bldg) setBuildingCode(bldg[1].toUpperCase());
      const rm = naturalPrompt.match(/\b(\d{3,4})\b/);
      if (rm) {
        setRoomNumber(rm[1]);
        setFloor(parseInt(rm[1][0], 10) || 1);
      }
    } finally {
      setIsParsingPrompt(false);
    }
  };

  const handleSelectSlot = (slot: SuggestedSlot) => {
    setStartTime(slot.startTime);
    setValidationWarning(null);
    setEarliestValidReplacement(null);
  };

  const handleApplyEarliestValid = () => {
    if (earliestValidReplacement) {
      setStartTime(earliestValidReplacement);
      setValidationWarning(null);
      setEarliestValidReplacement(null);
    }
  };

  const handleSelectFocusPreset = (type: 'office' | 'library') => {
    if (type === 'office') {
      setTitle('Desk Focus Work');
      setBuildingCode(settings.mainOffice?.buildingCode || 'E7');
      setRoomNumber(settings.mainOffice?.roomNumber || '2408');
      setFloor(settings.mainOffice?.floor || 2);
      setDurationMinutes(60);
      setIsOnline(false);
    } else {
      setTitle('Library Focus / Study');
      setBuildingCode('DC');
      setRoomNumber('Library');
      setFloor(1);
      setDurationMinutes(60);
      setIsOnline(false);
    }
  };

  // Submit manual / focus event
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const [h, m] = startTime.split(':').map(Number);
    const startMin = (h || 0) * 60 + (m || 0);
    const endMin = startMin + durationMinutes;
    const endH = Math.floor(endMin / 60) % 24;
    const endM = endMin % 60;
    const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

    const newMeeting: QuestMeeting = {
      id: `new-${Date.now()}`,
      title: title.trim() || 'Meeting',
      date: selectedDate,
      startTime,
      endTime,
      rawLocation: isOnline ? 'Microsoft Teams' : `${buildingCode} ${roomNumber || ''}`.trim(),
      buildingCode: isOnline ? 'ONLINE' : buildingCode,
      roomNumber: isOnline ? '' : roomNumber,
      floor: isOnline ? 1 : floor,
      isOnline,
      isUnparseableLocation: false,
      source: 'new',
      notes: 'Scheduled with realistic room-to-room walking buffer',
    };

    onAddEvent(newMeeting);
    onClose();
  };

  // Import: Screenshot upload
  const handleScreenshotUpload = async (file: File) => {
    if (!file) return;
    setImportLoading(true);
    setImportError(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const res = await fetch('/api/gemini/extract-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType: file.type || 'image/png',
          targetDate: selectedDate,
        }),
      });

      if (!res.ok) throw new Error('Failed to analyze calendar screenshot');
      const data = await res.json();

      if (!data.events || data.events.length === 0) {
        throw new Error('No events detected from image. You can also paste text or upload .ics.');
      }

      const formatted: QuestMeeting[] = data.events.map((ev: any, idx: number) => {
        const parsed = parseLocationString(ev.location);
        return {
          id: `scr-${Date.now()}-${idx}`,
          title: ev.title || 'Meeting',
          date: selectedDate,
          startTime: ev.start || '10:00',
          endTime: ev.end || '10:30',
          rawLocation: ev.location || '',
          buildingCode: parsed.buildingCode,
          roomNumber: parsed.roomNumber,
          floor: parsed.floor,
          isOnline: parsed.isOnline,
          isUnparseableLocation: parsed.isUnparseableLocation,
          organizer: 'Imported',
          source: 'imported' as const,
        };
      });

      setImportPreview(formatted);
    } catch (err: any) {
      setImportError(err.message || 'Failed to extract meetings from image.');
    } finally {
      setImportLoading(false);
    }
  };

  // Import: .ICS file
  const handleIcsFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImportLoading(true);
    setImportError(null);

    try {
      const fileTexts: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith('.ics') || file.type.includes('calendar') || file.name.includes('.ic')) {
          fileTexts.push(await file.text());
        }
      }

      if (fileTexts.length === 0) {
        throw new Error('Please select valid .ics calendar files.');
      }

      const events = parseIcsContents(fileTexts, selectedDate);
      if (events.length === 0) {
        setImportError(`No timed meetings found for ${selectedDate}.`);
      } else {
        setImportPreview(events);
      }
    } catch (err: any) {
      setImportError(err.message || 'Could not parse .ics file.');
    } finally {
      setImportLoading(false);
    }
  };

  // Import: Paste text
  const handlePasteSubmit = async () => {
    if (!pastedText.trim()) return;
    setImportLoading(true);
    setImportError(null);

    try {
      const res = await fetch('/api/gemini/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pastedText, targetDate: selectedDate }),
      });

      if (!res.ok) throw new Error('Failed to parse text');
      const data = await res.json();
      if (!data.events || data.events.length === 0) {
        throw new Error('No events recognized from text.');
      }

      const formatted: QuestMeeting[] = data.events.map((ev: any, idx: number) => {
        const parsed = parseLocationString(ev.location);
        return {
          id: `txt-${Date.now()}-${idx}`,
          title: ev.title || 'Meeting',
          date: selectedDate,
          startTime: ev.start || '10:00',
          endTime: ev.end || '10:30',
          rawLocation: ev.location || '',
          buildingCode: parsed.buildingCode,
          roomNumber: parsed.roomNumber,
          floor: parsed.floor,
          isOnline: parsed.isOnline,
          isUnparseableLocation: parsed.isUnparseableLocation,
          organizer: 'Imported',
          source: 'imported' as const,
        };
      });

      setImportPreview(formatted);
    } catch (err: any) {
      setImportError(err.message || 'Failed to extract events.');
    } finally {
      setImportLoading(false);
    }
  };

  // Confirm Import
  const handleConfirmImport = (replaceExisting: boolean) => {
    if (importPreview.length > 0 && onImportMeetings) {
      onImportMeetings(importPreview, replaceExisting);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full sm:max-w-lg bg-white dark:bg-[#1E1E1E] rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-neutral-200 dark:border-neutral-800 overflow-hidden z-10 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              +
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">
                Add to Calendar
              </h2>
              <p className="text-[11px] text-neutral-500 font-mono">{selectedDate}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Clean Action Tabs */}
        <div className="px-4 pt-2.5 pb-1 border-b border-neutral-100 dark:border-neutral-800 flex gap-1 bg-neutral-50/50 dark:bg-neutral-800/30">
          <button
            type="button"
            onClick={() => setActiveTab('event')}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
              activeTab === 'event'
                ? 'bg-white dark:bg-[#252525] text-purple-700 dark:text-purple-300 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Event</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('focus');
              handleSelectFocusPreset('office');
            }}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
              activeTab === 'focus'
                ? 'bg-white dark:bg-[#252525] text-purple-700 dark:text-purple-300 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Focus Slot</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('smart')}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
              activeTab === 'smart'
                ? 'bg-white dark:bg-[#252525] text-purple-700 dark:text-purple-300 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Free Slots</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
              activeTab === 'import'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
            title="Import from screenshot, .ics, or paste text"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
        </div>

        {/* =================================================================== */}
        {/* TAB CONTENT: EVENT / FOCUS / SMART / IMPORT */}
        {/* =================================================================== */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* IMPORT TAB */}
          {activeTab === 'import' ? (
            <div className="space-y-3.5">
              {/* Import Sub-Tabs */}
              <div className="grid grid-cols-4 gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setImportType('screenshot')}
                  className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                    importType === 'screenshot'
                      ? 'bg-white dark:bg-[#252525] text-purple-700 dark:text-purple-300 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Screenshot</span>
                  <span className="sm:hidden">Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportType('ics')}
                  className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                    importType === 'ics'
                      ? 'bg-white dark:bg-[#252525] text-purple-700 dark:text-purple-300 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>.ICS</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportType('text')}
                  className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                    importType === 'text'
                      ? 'bg-white dark:bg-[#252525] text-purple-700 dark:text-purple-300 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Text</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportType('sample');
                    setImportPreview(getSampleDayMeetings(selectedDate));
                  }}
                  className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                    importType === 'sample'
                      ? 'bg-white dark:bg-[#252525] text-purple-700 dark:text-purple-300 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Sample</span>
                </button>
              </div>

              {/* Sub-view: Screenshot upload */}
              {importType === 'screenshot' && (
                <div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleScreenshotUpload(file);
                    }}
                  />
                  <div
                    onClick={() => imageInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleScreenshotUpload(file);
                    }}
                    className="border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-purple-500 rounded-2xl p-5 text-center cursor-pointer bg-neutral-50/50 dark:bg-neutral-800/30 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <p className="font-bold text-xs sm:text-sm text-neutral-800 dark:text-neutral-200">
                      Upload schedule screenshot
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Outlook, Google Calendar, Quest or LEARN (auto-extracted)
                    </p>
                    <button
                      type="button"
                      className="mt-2.5 px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-xs"
                    >
                      Choose Image
                    </button>
                  </div>
                </div>
              )}

              {/* Sub-view: .ICS file */}
              {importType === 'ics' && (
                <div>
                  <input
                    ref={icsInputRef}
                    type="file"
                    accept=".ics,text/calendar"
                    multiple
                    className="hidden"
                    onChange={(e) => handleIcsFiles(e.target.files)}
                  />
                  <div
                    onClick={() => icsInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleIcsFiles(e.dataTransfer.files);
                    }}
                    className="border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-purple-500 rounded-2xl p-5 text-center cursor-pointer bg-neutral-50/50 dark:bg-neutral-800/30 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <p className="font-bold text-xs sm:text-sm text-neutral-800 dark:text-neutral-200">
                      Choose .ics calendar file
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Exported from Outlook, Apple Calendar, or Google Calendar
                    </p>
                    <button
                      type="button"
                      className="mt-2.5 px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-xs"
                    >
                      Browse Files
                    </button>
                  </div>
                </div>
              )}

              {/* Sub-view: Paste text */}
              {importType === 'text' && (
                <div className="space-y-2">
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    rows={3}
                    placeholder="Paste meeting text or emails e.g.:&#10;10:00 - 10:30 Team sync in MC 5479&#10;10:30 - 11:00 Budget review in NH 3001"
                    className="w-full text-xs p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 font-sans focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={handlePasteSubmit}
                    disabled={!pastedText.trim() || importLoading}
                    className="w-full py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-xs disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                  >
                    {importLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Extract with AI</span>
                  </button>
                </div>
              )}

              {/* Sub-view: Sample */}
              {importType === 'sample' && (
                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 text-center space-y-1.5">
                  <p className="font-bold text-xs text-neutral-800 dark:text-neutral-200">
                    UW Campus Staff Day Loaded
                  </p>
                  <p className="text-[11px] text-neutral-500">
                    Includes 4 meetings in MC 5479, NH 3001, DC 1302, and Teams
                  </p>
                </div>
              )}

              {/* Loading indicator */}
              {importLoading && (
                <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-center text-xs text-purple-700 dark:text-purple-300 font-semibold flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                  <span>Extracting events with Gemini...</span>
                </div>
              )}

              {/* Error message */}
              {importError && (
                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-start gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Extracted events preview */}
              {importPreview.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                  <div className="flex items-center justify-between text-xs font-bold text-neutral-800 dark:text-neutral-200">
                    <span>Recognized Events ({importPreview.length})</span>
                  </div>

                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {importPreview.map((ev, idx) => (
                      <div
                        key={ev.id || idx}
                        className="p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-neutral-900 dark:text-neutral-100 truncate">
                            {ev.title}
                          </p>
                          <p className="text-[11px] text-neutral-500 font-mono">
                            {ev.startTime}–{ev.endTime} · {ev.isOnline ? 'Teams' : ev.rawLocation}
                          </p>
                        </div>
                        <span className="px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[10px] font-bold shrink-0">
                          {ev.isOnline ? 'Teams' : ev.buildingCode}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleConfirmImport(false)}
                      className="py-2 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold text-xs transition-colors"
                    >
                      Append
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmImport(true)}
                      className="py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Replace Schedule</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* EVENT / FOCUS / SMART TABS FORM */
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Quick natural prompt */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={naturalPrompt}
                  onChange={(e) => setNaturalPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleParseNaturalPrompt();
                    }
                  }}
                  placeholder='Quick prompt: "30 min in MC 2018 after 11"'
                  className="flex-1 px-3 py-1.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500 font-sans"
                />
                <button
                  type="button"
                  onClick={handleParseNaturalPrompt}
                  disabled={isParsingPrompt || !naturalPrompt.trim()}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-1 transition-all disabled:opacity-50"
                >
                  {isParsingPrompt ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Fill</span>
                </button>
              </div>

              {/* Focus presets */}
              {activeTab === 'focus' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectFocusPreset('office')}
                    className="flex-1 p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-purple-500 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Briefcase className="w-3.5 h-3.5 text-purple-600" />
                    <span>Office Desk ({settings.mainOffice?.buildingCode || 'E7'})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectFocusPreset('library')}
                    className="flex-1 p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-purple-500 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-purple-600" />
                    <span>DC Library</span>
                  </button>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* Location */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Location
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isOnline}
                      onChange={(e) => setIsOnline(e.target.checked)}
                      className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                    />
                    <span>Online (Teams)</span>
                  </label>
                </div>

                {!isOnline ? (
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={buildingCode}
                      onChange={(e) => setBuildingCode(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500 font-bold"
                    >
                      {Object.values(UW_BUILDINGS).map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.code} — {b.name}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      placeholder="Room (e.g. 2018)"
                      value={roomNumber}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRoomNumber(val);
                        const digit = parseInt(val[0], 10);
                        if (!isNaN(digit) && digit >= 1) setFloor(digit);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                ) : (
                  <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-200 dark:border-blue-800">
                    Online / Teams
                  </div>
                )}
              </div>

              {/* Time & Duration */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 font-mono focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Duration
                  </label>
                  <select
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10))}
                    className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                  </select>
                </div>
              </div>

              {/* Free Slot Suggestions */}
              {suggestedSlots.length > 0 && (
                <div className="space-y-1 pt-1">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Recommended Slots (Safe buffer)
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {suggestedSlots.slice(0, 4).map((s) => (
                      <button
                        key={s.startTime}
                        type="button"
                        onClick={() => handleSelectSlot(s)}
                        className={`px-2 py-0.5 rounded-lg text-xs font-mono border transition-all ${
                          startTime === s.startTime
                            ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                            : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:border-purple-400 text-neutral-800 dark:text-neutral-200'
                        }`}
                      >
                        {s.startTime} – {s.endTime}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation Warning */}
              {validationWarning && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{validationWarning}</span>
                  </div>
                  {earliestValidReplacement && (
                    <button
                      type="button"
                      onClick={handleApplyEarliestValid}
                      className="font-semibold underline text-purple-700 dark:text-purple-300"
                    >
                      Safe start at {earliestValidReplacement} →
                    </button>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  <Check className="w-4 h-4" />
                  <span>Add to Calendar</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
