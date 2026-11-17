import React, { useState, useEffect } from 'react';
import {
  CampusMeeting,
  CampusSettings,
  DEFAULT_CAMPUS_SETTINGS,
} from './types';
import { PageStepper, AppPage } from './components/PageStepper';
import { WelcomeHeroPage } from './components/pages/WelcomeHeroPage';
import { NextMeetingPage } from './components/pages/NextMeetingPage';
import { ConnectCalendarPage } from './components/pages/ConnectCalendarPage';
import { CalendarReviewPage } from './components/pages/CalendarReviewPage';
import { MeetingModal } from './components/MeetingModal';
import { getSampleDayMeetings } from './data/sampleDay';
import { getTodayLocalDateString } from './utils/icsParser';
import { playDepartureChime } from './utils/audioChime';
import { formatTime12h, parseTimeToMinutes, calculateTravelLeg } from './utils/travelCalculator';
import { getGoogleMapsDirectionsUrl } from './utils/googleMapsLinks';
import { Bell, Navigation, X, ExternalLink } from 'lucide-react';

export default function App() {
  // Page Stepper navigation state: welcome -> connect -> review
  const [currentPage, setCurrentPage] = useState<AppPage>(() => {
    try {
      const savedPage = localStorage.getItem('questflow_page_v6');
      if (savedPage && ['welcome', 'connect', 'review'].includes(savedPage)) {
        return savedPage as AppPage;
      }
      if (savedPage === 'next') {
        return 'review';
      }
    } catch {}
    return 'welcome';
  });

  // Next Up modal box visibility (opened from Calendar blue time strip or Welcome shortcut)
  const [isNextUpOpen, setIsNextUpOpen] = useState(false);

  // Selected date
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('questflow_date_v6');
      if (saved) return saved;
    } catch {}
    return getTodayLocalDateString();
  });

  // Meetings: user calendar starts empty unless loaded via sample or imported
  const [meetings, setMeetings] = useState<CampusMeeting[]>(() => {
    try {
      const saved = localStorage.getItem('questflow_meetings_v6');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Settings
  const [settings, setSettings] = useState<CampusSettings>(() => {
    try {
      const saved = localStorage.getItem('questflow_settings_v6');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_CAMPUS_SETTINGS;
  });

  // Modal state for Adding/Editing Meetings
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [meetingToEdit, setMeetingToEdit] = useState<CampusMeeting | null>(null);

  // Active departure toast banner
  const [activeDepartureAlert, setActiveDepartureAlert] = useState<{
    meetingTitle: string;
    originBuildingCode?: string;
    buildingCode: string;
    roomNumber: string;
    departureTime: string;
    travelMinutes: number;
  } | null>(null);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('questflow_meetings_v6', JSON.stringify(meetings));
      localStorage.setItem('questflow_date_v6', selectedDate);
      localStorage.setItem('questflow_settings_v6', JSON.stringify(settings));
      localStorage.setItem('questflow_page_v6', currentPage);
    } catch {}
  }, [meetings, selectedDate, settings, currentPage]);

  // Close Next Up modal on Escape
  useEffect(() => {
    if (!isNextUpOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsNextUpOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNextUpOpen]);

  // Departure check background interval
  useEffect(() => {
    if (!settings.notifications?.enabled) return;
    if (meetings.length === 0) return;

    const checkDepartures = () => {
      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();
      const todayStr = getTodayLocalDateString(now);

      const todayList = meetings
        .filter((m) => m.date === todayStr && m.format !== 'online')
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      for (let i = 1; i < todayList.length; i++) {
        const m = todayList[i];
        const leg = calculateTravelLeg(todayList[i - 1], m, settings);
        const departMin = parseTimeToMinutes(leg.departureTime);
        const travelMin = leg.questFlowTravelMinutes;
        const originBuildingCode = todayList[i - 1].buildingCode;

        // Trigger alert within 2-minute window
        if (Math.abs(currentMin - departMin) <= 1) {
          const alertKey = `alerted_${m.id}_${todayStr}`;
          if (!sessionStorage.getItem(alertKey)) {
            sessionStorage.setItem(alertKey, 'true');
            if (settings.notifications?.soundAlert) {
              playDepartureChime();
            }
            setActiveDepartureAlert({
              meetingTitle: m.title,
              originBuildingCode,
              buildingCode: m.buildingCode || 'Campus',
              roomNumber: m.roomNumber || '',
              departureTime: formatTime12h(m.startTime),
              travelMinutes: travelMin,
            });
          }
        }
      }
    };

    const interval = setInterval(checkDepartures, 30000);
    return () => clearInterval(interval);
  }, [meetings, settings]);

  // Load UW Sample walkthrough and open Calendar
  const handleStartSampleWalkthrough = () => {
    const todayStr = getTodayLocalDateString();
    setSelectedDate(todayStr);
    const sample = getSampleDayMeetings(todayStr);
    setMeetings(sample);
    setCurrentPage('review');
  };

  // Open Edit Meeting Modal
  const handleOpenEditMeeting = (meeting: CampusMeeting) => {
    setMeetingToEdit(meeting);
    setIsMeetingModalOpen(true);
  };

  // Open New Meeting Modal
  const handleOpenNewMeeting = () => {
    setMeetingToEdit(null);
    setIsMeetingModalOpen(true);
  };

  // Save Meeting (Add or Update)
  const handleSaveMeeting = (meeting: CampusMeeting) => {
    const exists = meetings.some((m) => m.id === meeting.id);
    let updated: CampusMeeting[];
    if (exists) {
      updated = meetings.map((m) => (m.id === meeting.id ? meeting : m));
    } else {
      updated = [...meetings, meeting];
    }
    updated.sort((a, b) => a.startTime.localeCompare(b.startTime));
    setMeetings(updated);
  };

  // Delete Meeting
  const handleDeleteMeeting = (id: string) => {
    setMeetings(meetings.filter((m) => m.id !== id));
  };

  // 1-Click format toggle (in_person, online, hybrid)
  const handleQuickToggleFormat = (id: string, format: 'in_person' | 'online' | 'hybrid') => {
    const updated = meetings.map((m) => {
      if (m.id !== id) return m;
      return {
        ...m,
        format,
        isOnline: format === 'online',
        rawLocation: format === 'online' ? 'Microsoft Teams' : `${m.buildingCode || 'MC'} ${m.roomNumber || ''}`,
      };
    });
    setMeetings(updated);
  };

  // Navigation handler
  const handleSelectPage = (targetPage: AppPage) => {
    setCurrentPage(targetPage);
  };

  return (
    <div className="min-h-screen bg-[#FBFBFA] dark:bg-[#121212] text-neutral-900 dark:text-neutral-100 font-sans selection:bg-blue-600 selection:text-white flex flex-col">
      {/* Real-time departure reminder banner */}
      {activeDepartureAlert && (
        <div className="sticky top-0 z-50 bg-neutral-900 text-white px-4 py-3 shadow-md border-b border-neutral-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-white animate-bounce" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-white">
                Time to Depart for {activeDepartureAlert.meetingTitle}!
              </p>
              <p className="text-xs text-neutral-300">
                Walk to {activeDepartureAlert.buildingCode} {activeDepartureAlert.roomNumber} takes ~{activeDepartureAlert.travelMinutes} mins to arrive on time for {activeDepartureAlert.departureTime}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={getGoogleMapsDirectionsUrl(
                activeDepartureAlert.originBuildingCode,
                activeDepartureAlert.buildingCode,
                'walking'
              )}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setActiveDepartureAlert(null)}
              className="px-3 py-1.5 text-xs font-semibold text-neutral-900 bg-white hover:bg-neutral-100 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>Google Maps</span>
              <ExternalLink className="w-3 h-3 text-neutral-500" />
            </a>
            <button
              onClick={() => setActiveDepartureAlert(null)}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Top Header App Navigation */}
      <PageStepper
        currentPage={currentPage}
        onSelectPage={handleSelectPage}
        hasMeetingsLoaded={meetings.length > 0}
        meetingCount={meetings.filter((m) => m.date === selectedDate).length}
        onOpenNewMeeting={handleOpenNewMeeting}
        onLoadSample={handleStartSampleWalkthrough}
      />

      {/* Main Multi-Page Container */}
      <main className="flex-1">
        {currentPage === 'welcome' && (
          <WelcomeHeroPage
            onStartSampleWalkthrough={handleStartSampleWalkthrough}
            onOpenNextMeeting={() => {
              setCurrentPage('review');
              setIsNextUpOpen(true);
            }}
            onConnectCalendar={() => setCurrentPage('connect')}
          />
        )}

        {currentPage === 'connect' && (
          <ConnectCalendarPage
            currentMeetings={meetings}
            selectedDate={selectedDate}
            onSetMeetings={(newMeetings) => {
              setMeetings(newMeetings);
            }}
            onContinue={() => {
              setCurrentPage('review');
            }}
            onBack={() => setCurrentPage('welcome')}
          />
        )}

        {currentPage === 'review' && (
          <CalendarReviewPage
            meetings={meetings}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onAddMeeting={handleOpenNewMeeting}
            onEditMeeting={handleOpenEditMeeting}
            onSaveMeeting={handleSaveMeeting}
            onDeleteMeeting={handleDeleteMeeting}
            onQuickToggleFormat={handleQuickToggleFormat}
            onOpenNextMeeting={() => setIsNextUpOpen(true)}
            onBackToConnect={() => setCurrentPage('connect')}
            settings={settings}
          />
        )}
      </main>

      {/* Next Up Modal Box (dismissible with X, Escape, or backdrop tap) */}
      {isNextUpOpen && (
        <div
          className="fixed inset-0 z-50 bg-neutral-950/55 backdrop-blur-xs flex items-start sm:items-center justify-center overflow-y-auto py-6 px-4 sm:px-16 animate-in fade-in duration-150"
          onClick={() => setIsNextUpOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Next Up Meetings"
        >
          <div
            className="w-full max-w-xl relative my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Close Row */}
            <div className="flex items-center justify-end mb-2.5">
              <button
                type="button"
                onClick={() => setIsNextUpOpen(false)}
                aria-label="Close Next Up"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-lg text-neutral-700 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-50 transition-colors cursor-pointer text-xs font-bold"
              >
                <X className="w-4 h-4" />
                <span>Close</span>
              </button>
            </div>

            <NextMeetingPage
              meetings={meetings}
              selectedDate={selectedDate}
              settings={settings}
              isModal={true}
              onClose={() => setIsNextUpOpen(false)}
              onOpenCalendar={() => {
                setCurrentPage('review');
                setIsNextUpOpen(false);
              }}
              onConnectCalendar={() => {
                setIsNextUpOpen(false);
                setCurrentPage('connect');
              }}
              onLoadSample={handleStartSampleWalkthrough}
            />
          </div>
        </div>
      )}

      {/* Add / Edit Meeting Modal */}
      <MeetingModal
        isOpen={isMeetingModalOpen}
        onClose={() => {
          setIsMeetingModalOpen(false);
          setMeetingToEdit(null);
        }}
        meetingToEdit={meetingToEdit}
        selectedDate={selectedDate}
        existingMeetings={meetings}
        settings={settings}
        onSaveMeeting={handleSaveMeeting}
        onDeleteMeeting={handleDeleteMeeting}
      />
    </div>
  );
}
