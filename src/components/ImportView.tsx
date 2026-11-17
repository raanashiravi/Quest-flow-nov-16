import React, { useState, useRef } from 'react';
import { QuestMeeting } from '../types';
import { parseIcsContents, getTodayTorontoDateString } from '../utils/icsParser';
import { parseLocationString } from '../utils/locationParser';
import { UW_BUILDINGS, KNOWN_BUILDING_CODES } from '../data/uwaterlooCampus';
import {
  Upload,
  Calendar,
  Image as ImageIcon,
  FileText,
  Plus,
  Trash2,
  AlertCircle,
  Check,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Clock,
  MapPin,
  Laptop,
  HelpCircle,
} from 'lucide-react';

interface ImportViewProps {
  onConfirmEvents: (events: QuestMeeting[], selectedDate: string) => void;
  onCancel: () => void;
}

export const ImportView: React.FC<ImportViewProps> = ({ onConfirmEvents, onCancel }) => {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayTorontoDateString());
  const [step, setStep] = useState<'upload' | 'confirm'>('upload');
  const [parsedEvents, setParsedEvents] = useState<QuestMeeting[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Secondary text input state
  const [showPasteBox, setShowPasteBox] = useState<boolean>(false);
  const [pastedText, setPastedText] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Process .ICS files client-side with ical.js
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

      // Parse with ical.js client-side
      const events = parseIcsContents(fileTexts, selectedDate);

      if (events.length === 0) {
        setErrorMessage(
          `No timed meetings found for ${selectedDate}. Try selecting another date or confirm your .ics includes meetings on this day.`
        );
      } else {
        setParsedEvents(events);
        setStep('confirm');
      }
    } catch (err: any) {
      console.error('ICS parse error:', err);
      setErrorMessage(err.message || 'Could not parse .ics file. Please check file format.');
    } finally {
      setLoading(false);
    }
  };

  // Process screenshot via Gemini 3.8 Flash
  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
          targetDate: selectedDate,
        }),
      });

      if (!res.ok) throw new Error('Failed to analyze calendar screenshot');
      const data = await res.json();

      if (!data.events || data.events.length === 0) {
        throw new Error('No events could be recognized from the screenshot. Try pasting text instead.');
      }

      const formattedEvents: QuestMeeting[] = data.events.map((ev: any, idx: number) => {
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
          organizer: 'Calendar Invite',
          source: 'imported' as const,
        };
      });

      setParsedEvents(formattedEvents);
      setStep('confirm');
    } catch (err: any) {
      console.error('Screenshot extraction error:', err);
      setErrorMessage(err.message || 'Failed to extract meetings from image.');
    } finally {
      setLoading(false);
    }
  };

  // Process pasted text via Gemini 3.8 Flash
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
          targetDate: selectedDate,
        }),
      });

      if (!res.ok) throw new Error('Failed to parse pasted text');
      const data = await res.json();

      if (!data.events || data.events.length === 0) {
        throw new Error('No events could be recognized in the text. Ensure times and locations are included.');
      }

      const formattedEvents: QuestMeeting[] = data.events.map((ev: any, idx: number) => {
        const parsed = parseLocationString(ev.location);
        return {
          id: `pst-${Date.now()}-${idx}`,
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
          organizer: 'Text Import',
          source: 'imported' as const,
        };
      });

      setParsedEvents(formattedEvents);
      setStep('confirm');
    } catch (err: any) {
      console.error('Text extraction error:', err);
      setErrorMessage(err.message || 'Failed to extract meetings from text.');
    } finally {
      setLoading(false);
    }
  };

  // Confirmation editor helpers
  const handleUpdateEvent = (id: string, updates: Partial<QuestMeeting>) => {
    setParsedEvents((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const merged = { ...e, ...updates };

        // If rawLocation changed, re-parse location
        if (updates.rawLocation !== undefined) {
          const parsed = parseLocationString(updates.rawLocation);
          merged.buildingCode = parsed.buildingCode;
          merged.roomNumber = parsed.roomNumber;
          merged.floor = parsed.floor;
          merged.isOnline = parsed.isOnline;
          merged.isUnparseableLocation = parsed.isUnparseableLocation;
        }

        return merged;
      })
    );
  };

  const handleDeleteEvent = (id: string) => {
    setParsedEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const handleAddNewEvent = () => {
    const newEvt: QuestMeeting = {
      id: `manual-${Date.now()}`,
      title: 'New Meeting',
      date: selectedDate,
      startTime: '11:00',
      endTime: '11:30',
      rawLocation: 'MC 2018',
      buildingCode: 'MC',
      roomNumber: '2018',
      floor: 2,
      isOnline: false,
      isUnparseableLocation: false,
      source: 'imported' as const,
    };
    setParsedEvents((prev) => [...prev, newEvt].sort((a, b) => a.startTime.localeCompare(b.startTime)));
  };

  const handleFinish = () => {
    if (parsedEvents.length === 0) {
      setErrorMessage('Please add at least one meeting to calculate travel.');
      return;
    }
    onConfirmEvents(parsedEvents, selectedDate);
  };

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-6">
      {/* Back button */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={step === 'confirm' ? () => setStep('upload') : onCancel}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{step === 'confirm' ? 'Back to upload' : 'Back to start'}</span>
        </button>

        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
          {step === 'upload' ? 'Step 1 of 2' : 'Step 2 of 2'}
        </span>
      </div>

      {step === 'upload' ? (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
              Import your day
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Upload your schedule or meeting invites to estimate real room-to-room walking times.
            </p>
          </div>

          {/* Date Picker (default: today) */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <div>
                <label className="block text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  Select day to analyze
                </label>
                <p className="text-[11px] text-neutral-400">Toronto Timezone (EDT/EST)</p>
              </div>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Error Message banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* PRIMARY OPTION: .ICS UPLOAD (Client-Side ical.js) */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleIcsFiles(e.dataTransfer.files);
            }}
            className="p-8 rounded-3xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-purple-500 dark:hover:border-purple-400 bg-white/70 dark:bg-[#1E1E1E]/70 hover:bg-purple-50/30 dark:hover:bg-purple-950/20 transition-all flex flex-col items-center justify-center text-center cursor-pointer group shadow-sm"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".ics,text/calendar"
              multiple
              onChange={(e) => handleIcsFiles(e.target.files)}
              className="hidden"
            />

            <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              {loading ? (
                <Loader2 className="w-7 h-7 animate-spin" />
              ) : (
                <Upload className="w-7 h-7" />
              )}
            </div>

            <p className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              Upload Outlook .ics file(s)
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm">
              Tap to browse or drop your calendar export. Accepts multiple invites at once.
            </p>

            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
              <HelpCircle className="w-3.5 h-3.5 text-neutral-400" />
              <span>Classic Outlook: File &gt; Save Calendar. Or drop .ics attachments.</span>
            </div>
          </div>

          {/* SECONDARY OPTIONS (Smaller, below) */}
          <div className="pt-2">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 text-center">
              Or import without an .ics file
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* Secondary Option 1: Outlook Screenshot */}
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={loading}
                className="min-h-[44px] p-3.5 rounded-2xl bg-white dark:bg-[#1E1E1E] hover:bg-neutral-50 dark:hover:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-800 text-left transition-all flex flex-col justify-between cursor-pointer group shadow-sm disabled:opacity-50"
              >
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleScreenshotUpload}
                  className="hidden"
                />
                <div className="flex items-center gap-2 mb-1">
                  <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                    Upload screenshot
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
                  Snapshot of your Outlook day view.
                </p>
              </button>

              {/* Secondary Option 2: Paste Text */}
              <button
                type="button"
                onClick={() => setShowPasteBox(!showPasteBox)}
                disabled={loading}
                className="min-h-[44px] p-3.5 rounded-2xl bg-white dark:bg-[#1E1E1E] hover:bg-neutral-50 dark:hover:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-800 text-left transition-all flex flex-col justify-between cursor-pointer group shadow-sm disabled:opacity-50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                    Paste text / email
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
                  Copy-paste meeting invites or day list.
                </p>
              </button>
            </div>

            {/* Paste Text Slide-Down Box */}
            {showPasteBox && (
              <div className="mt-3 p-4 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-md space-y-3 animate-in fade-in duration-150">
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`Paste schedule text, e.g.:\n10:00 - 10:30 Team sync in MC 2018\n10:30 - 11:00 Budget review in NH 3001\n13:00 - 13:30 IT check-in in DC 1302`}
                  rows={4}
                  className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={handlePasteSubmit}
                  disabled={loading || !pastedText.trim()}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Parse text into events</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* STEP 2: CONFIRMATION & EDITING LIST */
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
                Confirm your day
              </h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {parsedEvents.length} meeting{parsedEvents.length === 1 ? '' : 's'} on {selectedDate}. Verify room numbers and floors.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddNewEvent}
              className="px-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add meeting</span>
            </button>
          </div>

          {/* Events List */}
          <div className="space-y-3">
            {parsedEvents.map((evt) => (
              <div
                key={evt.id}
                className={`p-4 rounded-2xl bg-white dark:bg-[#1E1E1E] border shadow-sm transition-all ${
                  evt.isUnparseableLocation
                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50/20'
                    : 'border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <input
                    type="text"
                    value={evt.title}
                    onChange={(e) => handleUpdateEvent(evt.id, { title: e.target.value })}
                    className="font-bold text-sm text-neutral-900 dark:text-neutral-100 bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-neutral-700 focus:border-purple-500 focus:outline-none w-full"
                    placeholder="Meeting Title"
                  />
                  <button
                    onClick={() => handleDeleteEvent(evt.id)}
                    className="p-1 rounded text-neutral-400 hover:text-red-600 transition-colors cursor-pointer"
                    title="Remove meeting"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Times */}
                  <div className="flex items-center gap-1.5 bg-neutral-50 dark:bg-neutral-800/80 p-2 rounded-xl border border-neutral-100 dark:border-neutral-700">
                    <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <input
                      type="time"
                      value={evt.startTime}
                      onChange={(e) => handleUpdateEvent(evt.id, { startTime: e.target.value })}
                      className="bg-transparent font-semibold text-neutral-800 dark:text-neutral-200 w-16 text-center"
                    />
                    <span className="text-neutral-400">–</span>
                    <input
                      type="time"
                      value={evt.endTime}
                      onChange={(e) => handleUpdateEvent(evt.id, { endTime: e.target.value })}
                      className="bg-transparent font-semibold text-neutral-800 dark:text-neutral-200 w-16 text-center"
                    />
                  </div>

                  {/* Location or Online */}
                  <div className="flex items-center gap-1.5 bg-neutral-50 dark:bg-neutral-800/80 p-2 rounded-xl border border-neutral-100 dark:border-neutral-700">
                    {evt.isOnline ? (
                      <Laptop className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    )}
                    <input
                      type="text"
                      value={evt.rawLocation}
                      onChange={(e) => handleUpdateEvent(evt.id, { rawLocation: e.target.value })}
                      className="bg-transparent font-semibold text-neutral-800 dark:text-neutral-200 w-full truncate"
                      placeholder="e.g. MC 2018 or Teams"
                    />
                  </div>
                </div>

                {/* Unparseable Location Prompt */}
                {evt.isUnparseableLocation && (
                  <div className="mt-2.5 pt-2 border-t border-amber-200 dark:border-amber-900/60 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Set location:</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {['MC', 'NH', 'DC', 'E7', 'Teams'].map((code) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => {
                            if (code === 'Teams') {
                              handleUpdateEvent(evt.id, { rawLocation: 'Microsoft Teams' });
                            } else {
                              handleUpdateEvent(evt.id, { rawLocation: `${code} 2001` });
                            }
                          }}
                          className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 font-bold text-[11px] hover:bg-amber-200 transition-colors cursor-pointer"
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Floor Override */}
                {!evt.isOnline && evt.buildingCode && (
                  <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span>
                      Detected: <strong>{evt.buildingCode}</strong> {evt.roomNumber && `· Room ${evt.roomNumber}`}
                    </span>
                    <label className="flex items-center gap-1.5">
                      <span>Floor:</span>
                      <input
                        type="number"
                        min="1"
                        max="9"
                        value={evt.floor || 1}
                        onChange={(e) =>
                          handleUpdateEvent(evt.id, { floor: Math.max(1, parseInt(e.target.value) || 1) })
                        }
                        className="w-10 px-1.5 py-0.5 text-center font-bold rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
                      />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Full-Width Calculate Travel Time Button (minimum 44px) */}
          <button
            type="button"
            onClick={handleFinish}
            className="w-full min-h-[48px] py-3 px-5 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.99]"
          >
            <span>Calculate travel times</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
