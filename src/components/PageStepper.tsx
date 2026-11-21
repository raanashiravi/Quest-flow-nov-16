import React, { useState, useEffect, useRef } from 'react';
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
  const sidebarRef = useRef<HTMLElement>(null);

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

  // Close mobile sidebar on Escape key and trap focus
  useEffect(() => {
    if (!isSidebarOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSidebarOpen(false);
        return;
      }
      if (e.key === 'Tab' && sidebarRef.current) {
        const focusable = sidebarRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !sidebarRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !sidebarRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
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
      <header className="sticky top-0 z-40 bg-[var(--bg-header)] border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Left: Brand Icon & Wordmark */}
            <button
              type="button"
              onClick={() => handleMobileSelectPage('welcome')}
              className="flex items-center gap-2.5 text-left group focus-visible:outline-none shrink-0 cursor-pointer"
              aria-label="Go to Home"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[var(--sky-strong)] text-white flex items-center justify-center font-bold text-sm shadow-xs transition-transform group-hover:scale-105 shrink-0">
                QF
              </div>
              <div className="flex flex-col">
                <span className="text-sm sm:text-base font-bold text-[var(--text-primary)] leading-none tracking-tight">
                  QuestFlow
                </span>
                <span className="text-[10px] sm:text-[11px] text-[var(--text-muted)] font-medium leading-tight mt-0.5 whitespace-nowrap">
                  Room-to-room scheduling
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
                        ? 'bg-[var(--sky-strong)] text-white border border-[var(--sky-strong)] shadow-2xs font-bold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] font-medium'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-white' : 'text-[var(--sky)]'
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
                              ? 'bg-[var(--sky-tint)] text-[var(--sky-strong)]'
                              : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
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
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 md:px-4 md:py-2.5 rounded-xl text-xs md:text-sm font-extrabold bg-[var(--sky-strong)] text-white hover:bg-[var(--sky-hover)] shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Add Meeting</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onLoadSample}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--bg-main)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border)] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[var(--sky)]" />
                    <span>Try the tutorial</span>
                  </button>
                )
              )}

              {/* Mobile Hamburger (Three Lines) Button */}
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={isSidebarOpen}
                className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Slide-Over Sidebar Drawer */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[var(--text-primary)]/45 backdrop-blur-xs transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />

          {/* Sidebar Panel */}
          <aside
            ref={sidebarRef}
            className="relative w-72 max-w-[85vw] h-full bg-[var(--bg-card)] border-l border-[var(--border)] shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200"
          >
            {/* Sidebar Header */}
            <div className="px-5 h-16 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--sky-strong)] text-white flex items-center justify-center font-bold text-sm">
                  QF
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-[var(--text-primary)] leading-none">
                    QuestFlow
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] font-medium mt-0.5">
                    Navigation
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
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
                        ? 'bg-[var(--sky-strong)] text-white border border-[var(--sky-strong)] shadow-2xs'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          isActive ? 'text-white' : 'text-[var(--sky)]'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className={`text-sm leading-tight ${isActive ? 'font-extrabold' : 'font-semibold'}`}>
                          {item.label}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${isActive ? 'text-white/90' : 'text-[var(--text-muted)]'}`}>
                          {item.sub}
                        </p>
                      </div>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold tabular-nums shrink-0 ${
                          isActive
                            ? 'bg-[var(--sky-tint)] text-[var(--sky-strong)]'
                            : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
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
            <div className="p-4 border-t border-[var(--border)] space-y-2.5">
              {hasMeetingsLoaded ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsSidebarOpen(false);
                    onOpenNewMeeting?.();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-extrabold bg-[var(--sky-strong)] text-white hover:bg-[var(--sky-hover)] shadow-md transition-all cursor-pointer active:scale-95"
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
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-[var(--sky-strong)] text-white hover:bg-[var(--sky-hover)] shadow-md transition-all cursor-pointer active:scale-95"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Try the tutorial</span>
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
