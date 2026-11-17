import React from 'react';
import {
  Building2,
  ArrowRight,
  Sparkles,
  Calendar,
  Zap,
} from 'lucide-react';

interface WelcomeHeroPageProps {
  onStartSampleWalkthrough: () => void;
  onOpenNextMeeting: () => void;
  onConnectCalendar: () => void;
}

export const WelcomeHeroPage: React.FC<WelcomeHeroPageProps> = ({
  onStartSampleWalkthrough,
  onOpenNextMeeting,
  onConnectCalendar,
}) => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 min-h-[calc(100vh-5rem)] flex flex-col items-center justify-center py-12 animate-in fade-in duration-200">
      <section className="text-center space-y-8 w-full">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-300 text-xs font-semibold shadow-2xs">
          <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>University of Waterloo · QuestFlow</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-neutral-900 dark:text-white tracking-tight leading-[1.15] max-w-3xl mx-auto">
          Arrive on time to every meeting across Waterloo.
        </h1>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-3.5 pt-2">
          <button
            type="button"
            onClick={onStartSampleWalkthrough}
            className="px-6 py-4 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all flex items-center justify-center gap-2.5 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Try Sample Walkthrough</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>

          <button
            type="button"
            onClick={onOpenNextMeeting}
            className="px-6 py-4 text-sm font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 rounded-xl transition-all shadow-2xs flex items-center justify-center gap-2.5 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <Zap className="w-4 h-4 shrink-0" />
            <span>Next Meeting (In a Rush)</span>
            <ArrowRight className="w-4 h-4 shrink-0 opacity-75" />
          </button>

          <button
            type="button"
            onClick={onConnectCalendar}
            className="px-6 py-4 text-sm font-semibold text-neutral-800 dark:text-neutral-200 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 rounded-xl transition-all shadow-2xs flex items-center justify-center gap-2.5 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <Calendar className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <span>Input My Calendar</span>
            <ArrowRight className="w-4 h-4 shrink-0 opacity-60" />
          </button>
        </div>
      </section>
    </div>
  );
};
