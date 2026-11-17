import React, { useState, useRef } from 'react';
import { QuestMeeting } from '../types';
import { parseIcsContents, getTodayTorontoDateString } from '../utils/icsParser';
import { parseLocationString } from '../utils/locationParser';
import { getSampleDayMeetings } from '../data/sampleDay';
import {
  X,
  Upload,
  Calendar,
  Image as ImageIcon,
  FileText,
  Sparkles,
  Loader2,
  Check,
  AlertCircle,
  ArrowRight,
  Clock,
  MapPin,
  Laptop,
} from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  onImportMeetings: (meetings: QuestMeeting[], replaceExisting: boolean) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  selectedDate,
  onImportMeetings,
}) => {
  const [activeTab, setActiveTab] = useState<'screenshot' | 'ics' | 'text' | 'sample'>('screenshot');
  const [targetDate, setTargetDate] = useState<string>(selectedDate || getTodayTorontoDateString());
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewEvents, setPreviewEvents] = useState<QuestMeeting[]>([]);
  const [pastedText, setPastedText] = useState<string>('');

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Process Screenshot via Gemini 3.8 Flash (zero manual input required)
  const handleScreenshotUpload = async (file: File) => {
    if (!file) return;
    setLoading(true);
    setErrorMessage(null);

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
          targetDate,
        }),
      });

      if (!res.ok) throw new Error('Failed to analyze calendar screenshot');
      const data = await res.json();

      if (!data.events || data.events.length === 0) {
        throw new Error('No events detected from image. You can also paste text or upload an .ics file.');
      }

      const formatted: QuestMeeting[] = data.events.map((ev: any, idx: number) => {
        const parsed = parseLocationString(ev.location);
        return {
          id: `scr-${Date.now()}-${idx}`,
          title: ev.title || 'Meeting',
          date: targetDate,
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

      setPreviewEvents(formatted);
    } catch (err: any) {
      console.error('Screenshot error:', err);
      setErrorMessage(err.message || 'Could not parse screenshot.');
    } finally {
      setLoading(false);
    }
  };

  // Process .ICS File client-side
  const handleIcsFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const fileTexts: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith('.ics') || file.type.includes('calendar') || file.name.includes('.ic')) {
          const content = await file.text();
          fileTexts.push(content);
        }
      }

      if (fileTexts.length === 0) {
        throw new Error('Please select valid .ics calendar files.');
      }

      const events = parseIcsContents(fileTexts, targetDate);

      if (events.length === 0) {
        setErrorMessage(
          `No timed meetings found for ${targetDate}. You can select another date or upload another .ics.`
        );
      } else {
        setPreviewEvents(events);
      }
    } catch (err: any) {
      console.error('ICS parse error:', err);
      setErrorMessage(err.message || 'Could not parse .ics file.');
    } finally {
      setLoading(false);
    }
  };

  // Process Pasted Text via Gemini 3.8 Flash
  const handlePasteSubmit = async () => {
    if (!pastedText.trim()) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/gemini/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pastedText,
          targetDate,
        }),
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
          date: targetDate,
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

      setPreviewEvents(formatted);
    } catch (err: any) {
      console.error('Text error:', err);
      setErrorMessage(err.message || 'Failed to extract events.');
    } finally {
      setLoading(false);
    }
  };

  // Load Sample Schedule
  const handleLoadSample = () => {
    const sample = getSampleDayMeetings(targetDate);
    setPreviewEvents(sample);
  };

  const handleConfirmImport = (replaceExisting: boolean) => {
    if (previewEvents.length > 0) {
      onImportMeetings(previewEvents, replaceExisting);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full sm:max-w-xl bg-white dark:bg-[#1E1E1E] rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-neutral-200 dark:border-neutral-800 overflow-hidden z-10 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Import Schedule
              </h2>
              <p className="text-xs text-neutral-500">
                Auto-extract from screenshots, calendar files, or text
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Target Date Picker */}
          <div className="flex items-center justify-between text-xs bg-neutral-50 dark:bg-neutral-800/60 p-2.5 rounded-2xl border border-neutral-200 dark:border-neutral-700">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">
              Schedule Date:
            </span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#252525] border border-neutral-300 dark:border-neutral-700 font-mono text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Import Method Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-2xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('screenshot')}
              className={`py-2 px-1 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                activeTab === 'screenshot'
                  ? 'bg-white dark:bg-[#252525] text-purple-700 dark:text-purple-300 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Screenshot</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ics')}
              className={`py-2 px-1 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                activeTab === 'ics'
                  ? 'bg-white dark:bg-[#252525] text-purple-700 dark:text-purple-300 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>.ICS File</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={`py-2 px-1 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                activeTab === 'text'
                  ? 'bg-white dark:bg-[#252525] text-purple-700 dark:text-purple-300 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Paste Text</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sample')}
              className={`py-2 px-1 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                activeTab === 'sample'
                  ? 'bg-white dark:bg-[#252525] text-purple-700 dark:text-purple-300 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sample</span>
            </button>
          </div>

          {/* TAB 1: Screenshot Upload */}
          {activeTab === 'screenshot' && (
            <div className="space-y-3">
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
                className="border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-purple-500 dark:hover:border-purple-500 rounded-3xl p-6 text-center cursor-pointer bg-neutral-50/50 dark:bg-neutral-800/30 transition-all group"
              >
                <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <p className="font-bold text-sm text-neutral-800 dark:text-neutral-200">
                  Drop screenshot of your calendar or schedule
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  Outlook, Google Calendar, Quest, or LEARN screenshot (PNG, JPG)
                </p>
                <button
                  type="button"
                  className="mt-3 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-xs"
                >
                  Choose Image
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: .ICS Calendar File */}
          {activeTab === 'ics' && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".ics,text/calendar"
                multiple
                className="hidden"
                onChange={(e) => handleIcsFiles(e.target.files)}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleIcsFiles(e.dataTransfer.files);
                }}
                className="border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-purple-500 rounded-3xl p-6 text-center cursor-pointer bg-neutral-50/50 dark:bg-neutral-800/30 transition-all group"
              >
                <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
                  <Calendar className="w-6 h-6" />
                </div>
                <p className="font-bold text-sm text-neutral-800 dark:text-neutral-200">
                  Select or drop .ics calendar file
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  Exported from Outlook, Google Calendar, or Apple Calendar
                </p>
                <button
                  type="button"
                  className="mt-3 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-xs"
                >
                  Choose .ics File
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Paste Text */}
          {activeTab === 'text' && (
            <div className="space-y-3">
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={4}
                placeholder="Paste meeting text or emails e.g.:&#10;10:00 - 10:30 Team sync in MC 5479&#10;10:30 - 11:00 Budget review in NH 3001"
                className="w-full text-xs p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 font-sans focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="button"
                onClick={handlePasteSubmit}
                disabled={!pastedText.trim() || loading}
                className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-xs disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>Extract Meetings with AI</span>
              </button>
            </div>
          )}

          {/* TAB 4: Sample Schedule */}
          {activeTab === 'sample' && (
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 text-center space-y-3">
              <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400 mx-auto" />
              <div>
                <p className="font-bold text-sm text-neutral-800 dark:text-neutral-200">
                  UWaterloo Campus Staff Sample Day
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Loads 4 meetings across MC 5479, NH 3001, DC 1302, and Teams
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadSample}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-xs transition-all"
              >
                Load Sample Day
              </button>
            </div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-center text-xs text-purple-700 dark:text-purple-300 font-semibold flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
              <span>Analyzing schedule with Gemini...</span>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Preview Extracted Events */}
          {previewEvents.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  Recognized Events ({previewEvents.length})
                </span>
                <span className="text-[11px] text-neutral-400 font-mono">{targetDate}</span>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {previewEvents.map((ev, idx) => (
                  <div
                    key={ev.id || idx}
                    className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-neutral-900 dark:text-neutral-100 truncate">
                        {ev.title}
                      </p>
                      <p className="text-[11px] text-neutral-500 font-mono">
                        {ev.startTime}–{ev.endTime} · {ev.isOnline ? 'Online / Teams' : ev.rawLocation}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[10px] font-bold shrink-0">
                      {ev.isOnline ? 'Teams' : ev.buildingCode}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleConfirmImport(false)}
                  className="py-2.5 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold text-xs transition-colors"
                >
                  Append to Existing
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmImport(true)}
                  className="py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Replace Schedule</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
