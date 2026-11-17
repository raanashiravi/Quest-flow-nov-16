import React from 'react';
import { ArrowRight, Sparkles, Calendar, Clock } from 'lucide-react';

interface LandingScreenProps {
  onImportClick: () => void;
  onSampleDayClick: () => void;
  savedMeetingCount?: number;
  onResumeClick?: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  onImportClick,
  onSampleDayClick,
  savedMeetingCount = 0,
  onResumeClick,
}) => {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#FBFBFA] dark:bg-[#191919] text-neutral-900 dark:text-neutral-100 px-5 py-4 sm:py-8 max-w-md mx-auto w-full">
      {/* Brand Badge */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
            Q
          </div>
          <span className="font-bold text-sm tracking-tight text-neutral-900 dark:text-neutral-100">
            QuestFlow
          </span>
        </div>
        <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/70 px-2.5 py-0.5 rounded-full border border-purple-200 dark:border-purple-800/50">
          UWaterloo Staff
        </span>
      </header>

      {/* Main Focus: Headline & Subtext & Full-Width Action Buttons */}
      <main className="my-auto py-4 sm:py-6 space-y-4 sm:space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 dark:text-white tracking-tight leading-[1.15]">
            Your calendar says 10:30 is free. Is it?
          </h1>

          <p className="text-base sm:text-lg text-neutral-600 dark:text-neutral-300 leading-relaxed font-normal">
            Calendars assume you can teleport. Google Maps stops at the building door. QuestFlow plans your day with real room-to-room walking time.
          </p>
        </div>

        {/* Both buttons full-width, visible without scrolling */}
        <div className="space-y-3 pt-2">
          {/* Button 1: Import my day */}
          <button
            type="button"
            onClick={onImportClick}
            className="w-full min-h-[48px] py-3.5 px-6 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 font-bold text-base transition-all flex items-center justify-center gap-2 shadow-xl hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
          >
            <Calendar className="w-5 h-5 shrink-0" />
            <span>Import my day</span>
            <ArrowRight className="w-4 h-4 shrink-0 ml-1" />
          </button>

          {/* Button 2: Try a sample day */}
          <button
            type="button"
            onClick={onSampleDayClick}
            className="w-full min-h-[48px] py-3.5 px-6 rounded-2xl bg-white hover:bg-neutral-50 dark:bg-[#252525] dark:hover:bg-[#2c2c2c] text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 font-semibold text-base transition-all flex items-center justify-center gap-2 shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
          >
            <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span>Try a sample day</span>
          </button>

          {/* Optional Resume Saved Day Banner if user previously loaded meetings */}
          {savedMeetingCount > 0 && onResumeClick && (
            <button
              type="button"
              onClick={onResumeClick}
              className="w-full min-h-[44px] py-2 px-4 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer hover:bg-purple-100"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Resume previous day ({savedMeetingCount} meetings)</span>
            </button>
          )}
        </div>
      </main>

      {/* Footer: Section 8 Requirement */}
      <footer className="pt-4 text-center">
        <p className="text-xs text-neutral-400 dark:text-neutral-500 leading-relaxed">
          Prototype for the Google x UWaterloo Futures Lab. Estimates use default walking and floor-change times; calibrate with real measurements.
        </p>
      </footer>
    </div>
  );
};
