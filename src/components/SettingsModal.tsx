import React from 'react';
import { QuestSettings, DEFAULT_QUEST_SETTINGS, MainOffice } from '../types';
import { UW_BUILDINGS } from '../data/uwaterlooCampus';
import { X, RotateCcw, Sliders, Accessibility, Building2, Download } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: QuestSettings;
  onUpdateSettings: (newSettings: QuestSettings) => void;
  onResetApp?: () => void;
  onExport?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetApp,
  onExport,
}) => {
  if (!isOpen) return null;

  const handleChange = (key: keyof QuestSettings, value: any) => {
    onUpdateSettings({
      ...settings,
      [key]: value,
    });
  };

  const handleOfficeChange = (partial: Partial<MainOffice>) => {
    const current = settings.mainOffice || {
      buildingCode: 'NH',
      roomNumber: '3001',
      floor: 3,
      returnThresholdMinutes: 45,
      enabled: true,
    };
    const updated = { ...current, ...partial };
    if (partial.roomNumber && partial.roomNumber.length > 0) {
      const f = parseInt(partial.roomNumber[0], 10);
      if (!isNaN(f) && f >= 1) updated.floor = f;
    }
    handleChange('mainOffice', updated);
  };

  const handleReset = () => {
    onUpdateSettings(DEFAULT_QUEST_SETTINGS);
  };

  const office = settings.mainOffice || {
    buildingCode: 'NH',
    roomNumber: '3001',
    floor: 3,
    returnThresholdMinutes: 45,
    enabled: true,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full sm:max-w-md bg-white dark:bg-[#1E1E1E] rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-neutral-200 dark:border-neutral-800 overflow-hidden z-10 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              Travel Time Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs sm:text-sm">
          {/* Main Office (Home Base) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                  Main Office / Home Base
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={office.enabled}
                  onChange={(e) => handleOfficeChange({ enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-neutral-300 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600" />
              </label>
            </div>

            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              If you have free time between meetings, QuestFlow assumes you return to work here.
            </p>

            {office.enabled && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      Office Building
                    </label>
                    <select
                      value={office.buildingCode}
                      onChange={(e) => handleOfficeChange({ buildingCode: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-xs font-bold"
                    >
                      {Object.keys(UW_BUILDINGS).map((code) => (
                        <option key={code} value={code}>
                          {code} - {UW_BUILDINGS[code].name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      Room (Floor auto-detected)
                    </label>
                    <input
                      type="text"
                      value={office.roomNumber}
                      onChange={(e) => handleOfficeChange({ roomNumber: e.target.value })}
                      placeholder="3001"
                      className="w-full px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-xs font-bold"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    <span>Return threshold</span>
                    <span className="font-bold text-neutral-900 dark:text-neutral-100 font-mono">
                      Gap ≥ {office.returnThresholdMinutes} min
                    </span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="120"
                    step="5"
                    value={office.returnThresholdMinutes}
                    onChange={(e) =>
                      handleOfficeChange({ returnThresholdMinutes: parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-purple-600 cursor-pointer"
                  />
                  <span className="text-[10px] text-neutral-400">
                    If gap is at least {office.returnThresholdMinutes} min, plans travel back to {office.buildingCode} {office.roomNumber}.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Accessibility Toggle */}
          <div className="p-3.5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Accessibility className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Accessibility Mode
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Always use elevator for floor changes (ignores stairs).
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={settings.accessibilityAlwaysElevator}
                onChange={(e) => handleChange('accessibilityAlwaysElevator', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600" />
            </label>
          </div>

          {/* Room Transitions */}
          <div className="space-y-3 pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Room & Transitions
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Exit room (sec)
                </label>
                <input
                  type="number"
                  min="0"
                  max="300"
                  step="10"
                  value={settings.exitRoomSeconds}
                  onChange={(e) => handleChange('exitRoomSeconds', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Find room (sec)
                </label>
                <input
                  type="number"
                  min="0"
                  max="300"
                  step="10"
                  value={settings.findRoomSeconds}
                  onChange={(e) => handleChange('findRoomSeconds', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                />
              </div>
            </div>
          </div>

          {/* Vertical Floor Changes */}
          <div className="space-y-3 pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Stairs & Elevator
            </p>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Stairs / fl (s)
                </label>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={settings.stairsSecondsPerFloor}
                  onChange={(e) =>
                    handleChange('stairsSecondsPerFloor', parseInt(e.target.value) || 20)
                  }
                  className="w-full px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Elevator wait (s)
                </label>
                <input
                  type="number"
                  min="10"
                  max="180"
                  step="10"
                  value={settings.elevatorWaitSeconds}
                  onChange={(e) =>
                    handleChange('elevatorWaitSeconds', parseInt(e.target.value) || 60)
                  }
                  className="w-full px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Elevator / fl (s)
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={settings.elevatorSecondsPerFloor}
                  onChange={(e) =>
                    handleChange('elevatorSecondsPerFloor', parseInt(e.target.value) || 5)
                  }
                  className="w-full px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-center"
                />
              </div>
            </div>
          </div>

          {/* Safety Multiplier */}
          <div className="space-y-3 pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Safety Buffer
            </p>

            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Safe time buffer factor (adds margin to travel estimate)
              </label>
              <input
                type="number"
                min="1.0"
                max="2.0"
                step="0.05"
                value={settings.safeTimeMultiplier}
                onChange={(e) =>
                  handleChange('safeTimeMultiplier', parseFloat(e.target.value) || 1.2)
                }
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
              />
            </div>
          </div>

          {/* Export to Outlook / Calendar */}
          {onExport && (
            <div className="pt-1">
              <button
                type="button"
                onClick={onExport}
                className="w-full py-2.5 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Schedule to Outlook (.ics)</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset defaults</span>
            </button>

            {onResetApp && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onResetApp();
                }}
                className="px-3 py-2 rounded-xl text-neutral-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold text-xs transition-colors cursor-pointer"
              >
                Start over
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 font-semibold text-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
