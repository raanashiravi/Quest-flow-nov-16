import React from 'react';
import { Plus } from 'lucide-react';

export type NavSection = 'home' | 'calendar' | 'explore' | 'settings';

interface NavbarProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  onOpenNewMeeting: () => void;
  todayDateDisplay: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeSection,
  onNavigate,
  onOpenNewMeeting,
  todayDateDisplay,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 text-left group focus-visible:outline-none"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-tight transition-transform group-hover:scale-105">
              CF
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-slate-900 leading-none">
                CampusFlow
              </span>
              <span className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
                UWaterloo Staff
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: 4 Primary Nav Links (Single-line, no wraps) */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'home'
                ? 'bg-slate-100 text-slate-900 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'calendar'
                ? 'bg-slate-100 text-slate-900 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Calendar
          </button>
          <button
            type="button"
            onClick={() => onNavigate('explore')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'explore'
                ? 'bg-slate-100 text-slate-900 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Explore
          </button>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'settings'
                ? 'bg-slate-100 text-slate-900 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Settings
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden lg:inline text-xs font-mono text-slate-500 tabular-nums">
            {todayDateDisplay}
          </span>
          <button
            type="button"
            onClick={onOpenNewMeeting}
            className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>New Meeting</span>
          </button>
        </div>
      </div>
    </header>
  );
};
