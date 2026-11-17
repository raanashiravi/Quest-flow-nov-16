import React, { useState, useEffect } from 'react';
import { Calendar, Link2, Home, Plus, Sparkles, Menu, X } from 'lucide-react';

export type AppPage = 'welcome' | 'connect' | 'review';

interface PageStepperProps {
  currentPage: AppPage;
  onSelectPage: (page: AppPage) => void;
  hasMeetingsLoaded: boolean;
  meetingCount?: number;
  onOpenNewMeeting?: () => void;
  onLoadSample?: () => void;
}

export const PageStepper: React.FC<PageStepperProps> = ({
  currentPage,
  onSelectPage,
  hasMeetingsLoaded,
  meetingCount = 0,
  onOpenNewMeeting,
  onLoadSample,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navItems: {
    id: AppPage;
    label: string;
    sub: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'welcome', label: 'Home', sub: 'Assistant', icon: Home },
    {
      id: 'review',
      label: 'Calendar',
      sub: 'Schedule & Gaps',
      icon: Calendar,
      badge: meetingCount > 0 ? meetingCount : undefined,
    },
    { id: 'connect', label: 'Sync Calendar', sub: 'Outlook & .ICS', icon: Link2 },
  ];

  // Close mobile sidebar on Escape key
  useEffect(() => {
    if (!isSidebarOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen]);

  const handleMobileSelectPage = (page: AppPage) => {
    onSelectPage(page);
    setIsSidebarOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Left: Brand Icon & Wordmark */}
            <button
              type="button"
              onClick={() => handleMobileSelectPage('welcome')}
              className="flex items-center gap-2.5 text-left group focus-visible:outline-none shrink-0 cursor-pointer"
              aria-label="Go to Home"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs transition-transform group-hover:scale-105 shrink-0">
                QF
              </div>
              <div className="flex flex-col">
                <span className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white leading-none tracking-tight">
                  QuestFlow
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-500 font-medium leading-tight mt-0.5 whitespace-nowrap">
                  UWaterloo Navigation
                </span>
              </div>
            </button>

            {/* Desktop Navigation Tabs (no swiping needed on desktop) */}
            <nav className="hidden md:flex items-center gap-1.5 lg:gap-2 py-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectPage(item.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-left shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs font-bold'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 font-medium'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-400 dark:text-neutral-500'
                      }`}
                    />
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm leading-tight whitespace-nowrap">
                        {item.label}
                      </span>
                      {item.badge !== undefined && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* Right: Quick Action + Mobile Three-Line Sidebar Toggle */}
            <div className="flex items-center gap-2 shrink-0 justify-end">
              {currentPage !== 'welcome' && (
                hasMeetingsLoaded ? (
                  <button
                    type="button"
                    onClick={onOpenNewMeeting}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 md:px-4 md:py-2.5 rounded-xl text-xs md:text-sm font-extrabold bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Add Meeting</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onLoadSample}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Try Sample</span>
                  </button>
                )
              )}

              {/* Mobile Hamburger (Three Lines) Button */}
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={isSidebarOpen}
                className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Slide-Over Sidebar Drawer */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-neutral-900/45 backdrop-blur-xs transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />

          {/* Sidebar Panel */}
          <aside className="relative w-72 max-w-[85vw] h-full bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
            {/* Sidebar Header */}
            <div className="px-5 h-16 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                  QF
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-neutral-900 dark:text-white leading-none">
                    QuestFlow
                  </span>
                  <span className="text-[11px] text-neutral-500 font-medium mt-0.5">
                    Navigation
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sidebar Navigation Buttons */}
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleMobileSelectPage(item.id)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all text-left cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800 shadow-2xs'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          isActive ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-400 dark:text-neutral-500'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className={`text-sm leading-tight ${isActive ? 'font-extrabold' : 'font-semibold'}`}>
                          {item.label}
                        </p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                          {item.sub}
                        </p>
                      </div>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold tabular-nums shrink-0 ${
                          isActive
                            ? 'bg-blue-600 text-white'
                            : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Sidebar Action Footer */}
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 space-y-2.5">
              {hasMeetingsLoaded ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsSidebarOpen(false);
                    onOpenNewMeeting?.();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-extrabold bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all cursor-pointer active:scale-95"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Add Meeting</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsSidebarOpen(false);
                    onLoadSample?.();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all cursor-pointer active:scale-95"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Try Sample</span>
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
