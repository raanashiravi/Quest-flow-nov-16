import React, { useState } from 'react';
import {
  CampusSettings,
  WalkingSpeed,
} from '../types';
import { UW_BUILDINGS } from '../data/uwaterlooCampus';
import { playDepartureChime } from '../utils/audioChime';
import {
  Footprints,
  Clock,
  Briefcase,
  Accessibility,
  Bell,
  Volume2,
  RotateCcw,
  Check,
} from 'lucide-react';

interface SettingsSectionProps {
  settings: CampusSettings;
  onUpdateSettings: (settings: CampusSettings) => void;
  onResetSchedule: () => void;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  settings,
  onUpdateSettings,
  onResetSchedule,
}) => {
  const [savedToast, setSavedToast] = useState(false);
  const [chimePlaying, setChimePlaying] = useState(false);

  const handleUpdate = (partial: Partial<CampusSettings>) => {
    const updated = { ...settings, ...partial };
    onUpdateSettings(updated);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  };

  const handleTestChime = () => {
    playDepartureChime();
    setChimePlaying(true);
    setTimeout(() => setChimePlaying(false), 2500);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Navigation & Reminder Settings
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Personalize walking speeds, arrival buffers, office anchor, and departure notifications.
          </p>
        </div>

        {savedToast && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold animate-in fade-in">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>Preferences Saved</span>
          </span>
        )}
      </div>

      {/* 1. Walking Speed Preference */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Footprints className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">
            Campus Walking Pace
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Adjusts outdoor travel calculations between Waterloo buildings based on your walking speed.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { id: 'brisk', label: 'Brisk Pace', sub: '~90 m/min (Quick transfer)' },
            { id: 'moderate', label: 'Moderate Pace', sub: '~75 m/min (Standard walking)' },
            { id: 'relaxed', label: 'Relaxed Pace', sub: '~60 m/min (Accessible / Leisurely)' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleUpdate({ walkingSpeed: item.id as WalkingSpeed })}
              className={`p-3.5 rounded-xl border text-left transition-colors flex flex-col justify-between ${
                settings.walkingSpeed === item.id
                  ? 'bg-blue-50 border-blue-600 text-blue-900 ring-1 ring-blue-600'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="font-bold text-sm">{item.label}</span>
              <span className="text-[11px] text-slate-500 mt-1">{item.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Arrival Buffer */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">
            Arrival Buffer
          </h2>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          How many minutes you want to arrive at the meeting room BEFORE the scheduled start time to find seating, set up AV, and connect to Wi-Fi.
        </p>

        <div className="flex flex-wrap gap-2">
          {[2, 5, 10, 15].map((mins) => (
            <button
              key={mins}
              type="button"
              onClick={() => handleUpdate({ arrivalBufferMinutes: mins })}
              className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                settings.arrivalBufferMinutes === mins
                  ? 'bg-blue-50 border-blue-600 text-blue-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              +{mins} minutes early {mins === 5 ? '(Recommended)' : ''}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Main Campus Office Anchor */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">
            Faculty / Staff Campus Office
          </h2>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          CampusFlow uses your designated office location to calculate start-of-day morning departures and return trips when there is a significant schedule break between meetings.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Office Building
            </label>
            <select
              value={settings.mainOffice?.buildingCode || 'E7'}
              onChange={(e) => {
                const bCode = e.target.value;
                handleUpdate({
                  mainOffice: {
                    ...settings.mainOffice,
                    buildingCode: bCode,
                  },
                });
              }}
              className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900"
            >
              {Object.values(UW_BUILDINGS).map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Office Room Number
            </label>
            <input
              type="text"
              value={settings.mainOffice?.roomNumber || '2408'}
              onChange={(e) => {
                const rNum = e.target.value;
                const f = parseInt(rNum[0], 10) || 1;
                handleUpdate({
                  mainOffice: {
                    ...settings.mainOffice,
                    roomNumber: rNum,
                    floor: f,
                  },
                });
              }}
              placeholder="e.g. 2408"
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium">
            <input
              type="checkbox"
              checked={settings.mainOffice?.enabled ?? true}
              onChange={(e) => {
                handleUpdate({
                  mainOffice: {
                    ...settings.mainOffice,
                    enabled: e.target.checked,
                  },
                });
              }}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            <span>Enable automatic desk return calculations for 45+ minute breaks</span>
          </label>
        </div>
      </div>

      {/* 4. Accessibility Preferences */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Accessibility className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">
            Accessibility & Elevation
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Route preferences for mobility access and multi-floor indoor navigation.
        </p>

        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={settings.accessibilityAlwaysElevator}
              onChange={(e) => handleUpdate({ accessibilityAlwaysElevator: e.target.checked })}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 mt-0.5"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-900 block">
                Always Prefer Elevators (Avoid Stairs)
              </span>
              <span className="text-slate-500 mt-0.5 block leading-relaxed">
                Applies standard elevator wait buffer (60s) for all floor transitions regardless of floor count.
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* 5. Departure Reminders & Audio Notifications */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">
              Departure Reminders
            </h2>
          </div>

          <button
            type="button"
            onClick={handleTestChime}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            <Volume2 className="w-3.5 h-3.5 text-slate-600" />
            <span>{chimePlaying ? 'Chime playing...' : 'Test Chime'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Receive departure chimes before you need to leave for your next campus meeting.
        </p>

        <div className="space-y-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
            <input
              type="checkbox"
              checked={settings.notifications?.soundAlert ?? true}
              onChange={(e) =>
                handleUpdate({
                  notifications: {
                    ...settings.notifications,
                    soundAlert: e.target.checked,
                  },
                })
              }
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            <span>Play subtle audio chime when departure time is reached</span>
          </label>
        </div>
      </div>

      {/* 6. Reset Schedule & Prototype Data */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Reset Sample Schedule
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Reload the realistic UWaterloo faculty and staff sample meetings (MC 5479, NH 3001, DC 1302, E7, Teams).
          </p>
        </div>

        <button
          type="button"
          onClick={onResetSchedule}
          className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap self-start sm:self-center"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Sample Meetings</span>
        </button>
      </div>
    </div>
  );
};
