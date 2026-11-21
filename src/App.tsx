import React, { useState, useEffect, useRef } from 'react';
import {
  CampusMeeting,
  CampusSettings,
  DEFAULT_CAMPUS_SETTINGS,
  SAMPLE_DEFAULT_OFFICE,
  UserOffice,
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
import {
  formatTime12h,
  getDepartureForMeeting,
} from './utils/travelCalculator';
import { getGoogleMapsDirectionsUrl } from './utils/googleMapsLinks';
import { Bell, Navigation, X, ExternalLink } from 'lucide-react';

export default function App() {
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

  // Page Stepper navigation state:
  // - First-run visitors land on 'welcome'
  // - Returning users with meetings loaded open directly on 'review' (Calendar)
  const [currentPage, setCurrentPage] = useState<AppPage>(() => {
    try {
      const hasVisited = localStorage.getItem('questflow_visited_v6') === 'true';
      localStorage.setItem('questflow_visited_v6', 'true');
      if (!hasVisited) {
        return 'welcome';
      }
      const savedMeetingsRaw = localStorage.getItem('questflow_meetings_v6');
      if (savedMeetingsRaw) {
        const parsed = JSON.parse(savedMeetingsRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return 'review';
        }
      }
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

  // Track previous page so "Back" on ConnectCalendarPage returns to the page actually visited
  const [previousPage, setPreviousPage] = useState<AppPage>(() =>
    currentPage === 'review' ? 'review' : 'welcome'
  );

  // Next Up modal box visibility (opened from Calendar blue time strip or Welcome shortcut)
  const [isNextUpOpen, setIsNextUpOpen] = useState(false);
  const nextUpDialogRef = useRef<HTMLDivElement>(null);

  // Selected date
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('questflow_date_v6');
      if (saved) return saved;
    } catch {}
    return getTodayLocalDateString();
  });

  // Settings
  const [settings, setSettings] = useState<CampusSettings>(() => {
    try {
      const saved = localStorage.getItem('questflow_settings_v6');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.office && Number(parsed.office.returnMinGapMinutes) === 30) {
          parsed.office.returnMinGapMinutes = 45;
        }
        if (parsed?.notifications) {
          parsed.notifications.soundAlert = false;
        }
        return parsed;
      }
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

  // Close Next Up modal on Escape & trap focus inside dialog
  useEffect(() => {
    if (!isNextUpOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsNextUpOpen(false);
        return;
      }
      if (e.key === 'Tab' && nextUpDialogRef.current) {
        const focusable = nextUpDialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !nextUpDialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !nextUpDialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
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

      for (let i = 0; i < todayList.length; i++) {
        const m = todayList[i];
        const prev = i > 0 ? todayList[i - 1] : null;
        const dep = getDepartureForMeeting(m, prev, settings);
        if (!dep.hasOrigin) continue;

        const departMin = dep.leaveByMinutes;
        const travelMin = dep.walkMinutes;
        const originBuildingCode = dep.originBuildingCode;

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
    setSettings((prev) => ({
      ...prev,
      office: prev.office ?? SAMPLE_DEFAULT_OFFICE,
    }));
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
    if (targetPage !== currentPage && currentPage !== 'connect') {
      setPreviousPage(currentPage);
    }
    setCurrentPage(targetPage);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] font-sans selection:bg-[var(--sky-strong)] selection:text-white flex flex-col">
      {/* Real-time departure reminder banner */}
      {activeDepartureAlert && (
        <div className="sticky top-0 z-50 bg-[var(--bg-card)] text-[var(--text-primary)] px-4 py-3 shadow-md border-b border-[var(--border)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--sky-strong)] flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-white animate-bounce" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                Time to Depart for {activeDepartureAlert.meetingTitle}!
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
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
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[var(--sky-strong)] hover:bg-[var(--sky-hover)] rounded-lg transition-colors flex items-center gap-1.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sky-strong)]"
            >
              <Navigation className="w-3.5 h-3.5 text-white" />
              <span>Google Maps</span>
              <ExternalLink className="w-3 h-3 text-white opacity-85" />
            </a>
            <button
              type="button"
              aria-label="Dismiss departure reminder"
              onClick={() => setActiveDepartureAlert(null)}
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sky-strong)]"
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
              setIsNextUpOpen(true);
            }}
            onConnectCalendar={() => handleSelectPage('connect')}
          />
        )}

        {currentPage === 'connect' && (
          <ConnectCalendarPage
            currentMeetings={meetings}
            selectedDate={selectedDate}
            onSetMeetings={(newMeetings, isSample) => {
              setMeetings(newMeetings);
              if (isSample) {
                setSettings((prev) => ({
                  ...prev,
                  office: prev.office ?? SAMPLE_DEFAULT_OFFICE,
                }));
              }
            }}
            onContinue={() => {
              setPreviousPage('connect');
              setCurrentPage('review');
            }}
            onBack={() => setCurrentPage(previousPage === 'review' ? 'review' : 'welcome')}
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
            onBackToConnect={() => handleSelectPage('connect')}
            settings={settings}
            onUpdateOffice={(office: UserOffice | null) =>
              setSettings((prev) => ({ ...prev, office }))
            }
          />
        )}
      </main>

      {/* Next Up Modal Box (dismissible with X, Escape, or backdrop tap) */}
      {isNextUpOpen && (
        <div
          className="fixed inset-0 z-50 bg-[var(--text-primary)]/45 backdrop-blur-xs flex items-start sm:items-center justify-center overflow-y-auto py-6 px-4 sm:px-16 animate-in fade-in duration-150"
          onClick={() => setIsNextUpOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Next Up Meetings"
        >
          <div
            ref={nextUpDialogRef}
            className="w-full max-w-xl relative my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Close Row */}
            <div className="flex items-center justify-end mb-2.5">
              <button
                type="button"
                onClick={() => setIsNextUpOpen(false)}
                aria-label="Close Next Up"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] shadow-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sky-strong)]"
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
              isFromCalendar={currentPage === 'review'}
              onClose={() => setIsNextUpOpen(false)}
              onOpenCalendar={() => {
                setCurrentPage('review');
                setIsNextUpOpen(false);
              }}
              onConnectCalendar={() => {
                setIsNextUpOpen(false);
                handleSelectPage('connect');
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
