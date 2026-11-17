import React from 'react';
import {
  Compass,
  Clock,
  AlertTriangle,
  Building2,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Footprints,
  Users,
} from 'lucide-react';

interface WelcomePageProps {
  onContinue: () => void;
  onLoadSampleDirectly: () => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({
  onContinue,
  onLoadSampleDirectly,
}) => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-12">
      {/* Hero Welcome Banner */}
      <section className="text-center space-y-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
          <Building2 className="w-3.5 h-3.5" />
          <span>Built for University of Waterloo Faculty, Staff & Researchers</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight max-w-2xl mx-auto">
          Arrive on time to every meeting across campus.
        </h1>

        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
          Standard calendars assume you can teleport. Google Maps stops at the building door.
          CampusFlow calculates <strong className="text-slate-900 font-semibold">true room-to-room walking times</strong> across the Waterloo campus so you always know exactly when to leave.
        </p>

        {/* Primary CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
          <button
            type="button"
            onClick={onContinue}
            className="w-full sm:w-auto px-6 py-3.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <span>Get Started — Connect Your Calendar</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onLoadSampleDirectly}
            className="w-full sm:w-auto px-5 py-3.5 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all shadow-2xs"
          >
            <span>Try with UWaterloo Sample Schedule</span>
          </button>
        </div>
      </section>

      {/* The Core Campus Problem Explained */}
      <section className="p-6 sm:p-8 bg-slate-900 text-white rounded-3xl shadow-sm space-y-6">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
            The Campus Travel Problem
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
            "How do I know when to leave and which route to take to arrive on time?"
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-300">
          <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-2">
            <div className="flex items-center gap-2 text-red-400 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>The Calendar Fallacy</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-300">
              Your calendar schedules a 10:00–10:22 AM sync in MC floor 5, and a 10:30 AM budget review in Needles Hall floor 3. It looks like you have an 8-minute gap, but walking across campus takes 11 minutes—making you 3 minutes late every time.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>The CampusFlow Solution</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-300">
              CampusFlow adds realistic floor egress (stairs or elevators), actual paved campus walking paths, and room setup buffers. It gives you an exact departure countdown ("Leave by 10:14 AM") so you arrive ready.
            </p>
          </div>
        </div>
      </section>

      {/* 4 Feature Cards */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 text-center">
          Everything you need to navigate university commitments
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">
              Personalized Departure Reminders
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed font-normal">
              Live countdown timers and gentle audio chimes alert you before departure, factoring in elevator wait times and room setup buffers.
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Footprints className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">
              Realistic Paved Walkways
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed font-normal">
              Routes strictly follow paved pedestrian sidewalks, plazas, and building arcades across campus—never through grass lawns or roads.
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">
              Impossible Meeting Detection
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed font-normal">
              Immediately flags when back-to-back cross-campus meetings are physically impossible, with 1-click solutions to switch to Teams or adjust start times.
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">
              In-Person, Online & Hybrid Formats
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed font-normal">
              Distinguishes whether you need to walk across campus, join virtually from your office desk, or head to a hybrid seminar room.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom Progress Bar to Step 2 */}
      <section className="pt-4 text-center">
        <button
          type="button"
          onClick={onContinue}
          className="px-8 py-3.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-all inline-flex items-center gap-2 active:scale-[0.98]"
        >
          <span>Continue to Step 2: Connect Calendar</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </section>
    </div>
  );
};
