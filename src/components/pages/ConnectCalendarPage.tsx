import React, { useState, useRef } from 'react';
import {
  CampusMeeting,
} from '../../types';
import { getSampleDayMeetings } from '../../data/sampleDay';
import { parseIcsContents } from '../../utils/icsParser';
import { parseLocationString } from '../../utils/locationParser';
import {
  Calendar,
  Upload,
  Link as LinkIcon,
  Sparkles,
  Check,
  ArrowRight,
  ArrowLeft,
  FileText,
  Loader2,
  AlertCircle,
  Plus,
} from 'lucide-react';

interface ConnectCalendarPageProps {
  currentMeetings: CampusMeeting[];
  selectedDate: string;
  onSetMeetings: (meetings: CampusMeeting[]) => void;
  onContinue: () => void;
  onBack: () => void;
}

export const ConnectCalendarPage: React.FC<ConnectCalendarPageProps> = ({
  currentMeetings,
  selectedDate,
  onSetMeetings,
  onContinue,
  onBack,
}) => {
  // Tabs: Outlook/Link (default), Upload ICS, Paste Text, or Sample Data
  const [activeTab, setActiveTab] = useState<'outlook' | 'ics' | 'text' | 'sample'>('outlook');

  // Outlook URL state
  const [outlookUrl, setOutlookUrl] = useState('');
  const [isConnectingOutlook, setIsConnectingOutlook] = useState(false);

  // .ICS file upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [icsLoading, setIcsLoading] = useState(false);

  // Paste text state
  const [pastedText, setPastedText] = useState('');
  const [textParsing, setTextParsing] = useState(false);

  // Validation / Error alerts
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const hasMeetings = currentMeetings && currentMeetings.length > 0;

  // 1-Click Load Sample Data
  const handleLoadSample = () => {
    const sample = getSampleDayMeetings(selectedDate);
    onSetMeetings(sample);
    setErrorNotice(null);
    setSuccessNotice(`Loaded 5 sample Waterloo meetings for ${selectedDate}.`);
    setTimeout(() => {
      onContinue();
    }, 400);
  };

  // Connect Outlook / WebCal Link (Fetches live ICS from server endpoint)
  const handleConnectOutlook = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);
    setSuccessNotice(null);

    const urlTrimmed = outlookUrl.trim();
    if (!urlTrimmed) {
      setErrorNotice('Please paste your Outlook/iCal sharing link (e.g. webcal:// or https://outlook.office365.com/.../calendar.ics).');
      return;
    }

    setIsConnectingOutlook(true);

    try {
      const resp = await fetch('/api/calendar/fetch-webcal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlTrimmed }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.ics) {
        throw new Error(data.error || 'Could not fetch calendar from link. Please verify the URL or try uploading the .ics file.');
      }

      const parsed = parseIcsContents([data.ics], selectedDate);
      if (parsed.length === 0) {
        throw new Error(`Calendar link connected successfully, but no meetings were found for ${selectedDate}. Please select a date with scheduled events or try another date.`);
      }

      const converted: CampusMeeting[] = parsed.map((m) => ({
        ...m,
        format: m.isOnline ? 'online' : 'in_person',
      }));

      onSetMeetings(converted);
      setSuccessNotice(`Successfully imported ${converted.length} meetings from your calendar link!`);

      setTimeout(() => {
        onContinue();
      }, 500);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to connect calendar link. Please ensure your calendar is published/shared publicly.');
    } finally {
      setIsConnectingOutlook(false);
    }
  };

  // Upload .ICS file
  const handleIcsFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIcsLoading(true);
    setErrorNotice(null);
    setSuccessNotice(null);

    try {
      const fileTexts: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith('.ics') || file.type.includes('calendar') || file.name.includes('.ic')) {
          fileTexts.push(await file.text());
        }
      }

      if (fileTexts.length === 0) {
        throw new Error('Please select a valid .ics calendar file.');
      }

      const parsed = parseIcsContents(fileTexts, selectedDate);
      if (parsed.length === 0) {
        throw new Error(`The uploaded .ics file does not contain any events for ${selectedDate}.`);
      }

      const converted: CampusMeeting[] = parsed.map((m) => ({
        ...m,
        format: m.isOnline ? 'online' : 'in_person',
      }));

      onSetMeetings(converted);
      setSuccessNotice(`Successfully imported ${converted.length} meetings from your file!`);

      setTimeout(() => {
        onContinue();
      }, 500);
    } catch (err: any) {
      setErrorNotice(err.message || 'Could not parse .ics file.');
    } finally {
      setIcsLoading(false);
    }
  };

  // Parse Text Invitations
  const handleParseText = () => {
    setErrorNotice(null);
    setSuccessNotice(null);

    if (!pastedText.trim()) {
      setErrorNotice('Please paste your meeting invitations or schedule lines first.');
      return;
    }

    setTextParsing(true);

    try {
      const lines = pastedText.split('\n').filter((l) => l.trim().length > 0);
      const extracted: CampusMeeting[] = [];

      lines.forEach((line, idx) => {
        const timeMatch = line.match(/(\d{1,2}:\d{2})\s*(?:-|to|–)\s*(\d{1,2}:\d{2})/);
        const startTime = timeMatch ? timeMatch[1] : `1${idx}:00`;
        const endTime = timeMatch ? timeMatch[2] : `1${idx}:30`;
        const locInfo = parseLocationString(line);

        extracted.push({
          id: `pasted-${Date.now()}-${idx}`,
          title: line.replace(timeMatch ? timeMatch[0] : '', '').trim() || `Meeting ${idx + 1}`,
          date: selectedDate,
          startTime,
          endTime,
          format: locInfo.isOnline ? 'online' : 'in_person',
          buildingCode: locInfo.buildingCode || 'MC',
          roomNumber: locInfo.roomNumber || '2018',
          floor: locInfo.floor || 2,
          rawLocation: locInfo.isOnline ? 'Microsoft Teams' : `${locInfo.buildingCode} ${locInfo.roomNumber}`,
          source: 'imported',
        });
      });

      if (extracted.length === 0) {
        throw new Error('Could not parse any meetings from the text. Example format: "10:00 - 10:30 Team sync in MC 5479".');
      }

      onSetMeetings(extracted);
      setSuccessNotice(`Parsed ${extracted.length} meetings from your text.`);

      setTimeout(() => {
        onContinue();
      }, 500);
    } catch (err: any) {
      setErrorNotice(err.message || 'Could not parse text.');
    } finally {
      setTextParsing(false);
    }
  };

  // Guard: if user clicks Continue without inputting meetings, stop and show error
  const handleAttemptContinue = () => {
    if (!hasMeetings) {
      setErrorNotice('No meetings have been inputted yet. Please connect an Outlook link, upload a .ics file, paste text, or load the sample data to continue.');
      return;
    }
    setErrorNotice(null);
    onContinue();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
          <span>Sync & Import Schedule</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white tracking-tight">
          Connect Your Schedule
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 font-normal">
          Import your meetings from Outlook, upload an .ics file, or paste your schedule.
        </p>
      </div>

      {/* Error Notice */}
      {errorNotice && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 flex items-start gap-3 text-xs animate-in slide-in-from-top-1">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Input Required</p>
            <p className="mt-0.5 text-rose-800 dark:text-rose-300 leading-relaxed">{errorNotice}</p>
          </div>
        </div>
      )}

      {/* Success Notice */}
      {successNotice && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-2.5 text-xs animate-in slide-in-from-top-1">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successNotice}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl flex gap-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => {
            setActiveTab('outlook');
            setErrorNotice(null);
          }}
          className={`flex-1 py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'outlook'
              ? 'bg-white dark:bg-neutral-700 text-blue-700 dark:text-white shadow-2xs font-bold'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          <span>Outlook / Link</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('ics');
            setErrorNotice(null);
          }}
          className={`flex-1 py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'ics'
              ? 'bg-white dark:bg-neutral-700 text-blue-700 dark:text-white shadow-2xs font-bold'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Upload .ICS</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('text');
            setErrorNotice(null);
          }}
          className={`flex-1 py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'text'
              ? 'bg-white dark:bg-neutral-700 text-blue-700 dark:text-white shadow-2xs font-bold'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Paste Text</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('sample');
            setErrorNotice(null);
          }}
          className={`flex-1 py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'sample'
              ? 'bg-white dark:bg-neutral-700 text-blue-700 dark:text-white shadow-2xs font-bold'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Sample Data</span>
        </button>
      </div>

      {/* Tab 1: Outlook / WebCal Link */}
      {activeTab === 'outlook' && (
        <form onSubmit={handleConnectOutlook} className="p-6 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">
              Connect via Outlook / iCal Calendar Link
            </h2>
            <p className="text-xs text-neutral-500 font-normal">
              Paste your shared calendar link (e.g. from Outlook Web Settings &gt; Shared Calendars &gt; Publish a calendar &gt; ICS link).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Calendar Subscription Link (.ics / webcal://)
            </label>
            <input
              type="text"
              value={outlookUrl}
              onChange={(e) => {
                setOutlookUrl(e.target.value);
                setErrorNotice(null);
              }}
              placeholder="https://outlook.office365.com/owa/calendar/.../reachcalendar.ics"
              className="w-full px-3.5 py-2.5 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-neutral-900 dark:text-white font-medium"
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              Tip: In Outlook Web, go to Settings ⚙️ → Calendar → Shared calendars → Publish a calendar → copy the ICS link.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              type="submit"
              disabled={isConnectingOutlook || !outlookUrl.trim()}
              className="px-6 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isConnectingOutlook ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
              <span>{isConnectingOutlook ? 'Fetching Calendar...' : 'Import from Link'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Upload .ICS */}
      {activeTab === 'ics' && (
        <div className="p-6 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={(e) => handleIcsFiles(e.target.files)}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-blue-500 rounded-2xl p-8 text-center cursor-pointer bg-neutral-50/50 dark:bg-neutral-800/40 hover:bg-blue-50/30 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
              <Upload className="w-6 h-6" />
            </div>
            <p className="font-bold text-sm text-neutral-800 dark:text-neutral-200">
              Upload your .ICS Calendar File
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Exported from Outlook, Apple Calendar, or Google Calendar
            </p>
            <button
              type="button"
              className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
            >
              Browse Files
            </button>
          </div>

          {icsLoading && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Parsing calendar file...</span>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Paste Text */}
      {activeTab === 'text' && (
        <div className="p-6 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">
              Paste Meeting Invitations
            </h2>
            <p className="text-xs text-neutral-500 font-normal">
              Paste schedule text or email invitations (e.g. "10:00 - 10:22 Team Sync in MC 5479").
            </p>
          </div>

          <textarea
            rows={4}
            value={pastedText}
            onChange={(e) => {
              setPastedText(e.target.value);
              setErrorNotice(null);
            }}
            placeholder={`10:00 - 10:22 Team Sync in MC 5479\n10:30 - 11:00 Budget Review in NH 3001\n13:00 - 13:45 IT Systems in DC 1302`}
            className="w-full p-3 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-neutral-900 dark:text-white"
          />

          <button
            type="button"
            onClick={handleParseText}
            disabled={textParsing || !pastedText.trim()}
            className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {textParsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>Parse & Add to Calendar</span>
          </button>
        </div>
      )}

      {/* Tab 4: Sample Data Option */}
      {activeTab === 'sample' && (
        <div className="p-6 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">
              University of Waterloo Sample Schedule
            </h2>
            <p className="text-xs text-neutral-500 font-normal">
              Preloads 5 realistic faculty meetings in MC, NH, DC, E7, and Teams to test room-to-room navigation.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-300 space-y-1.5 font-normal">
            <p className="font-semibold text-neutral-900 dark:text-white">Includes:</p>
            <p>• 10:00 – 10:22: Team Sync (MC 5479)</p>
            <p>• 10:30 – 11:00: Budget Review (NH 3001) <span className="text-rose-600 font-semibold">(Tight 8 min gap)</span></p>
            <p>• 13:00 – 13:45: IT Systems (DC 1302)</p>
            <p>• 14:15 – 15:00: Curriculum Committee (E7 2409)</p>
            <p>• 15:30 – 16:15: Research Sync (Microsoft Teams)</p>
          </div>

          <button
            type="button"
            onClick={handleLoadSample}
            className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Load Sample Data & Open Calendar</span>
          </button>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="pt-4 flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={handleAttemptContinue}
          className={`px-6 py-2.5 text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            hasMeetings
              ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-[0.98]'
              : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 cursor-not-allowed'
          }`}
        >
          <span>Continue to Calendar</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
