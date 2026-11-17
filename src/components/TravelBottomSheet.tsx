import React, { useState, useEffect, useRef } from 'react';
import { TravelLeg } from '../types';
import { UW_BUILDINGS } from '../data/uwaterlooCampus';
import { downloadTravelBlockIcs } from '../utils/icsExport';
import {
  X,
  Footprints,
  Clock,
  MapPin,
  CalendarPlus,
  MessageSquare,
  Video,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Navigation,
  ExternalLink,
  Sparkles,
  Loader2,
} from 'lucide-react';

interface TravelBottomSheetProps {
  leg: TravelLeg | null;
  onClose: () => void;
  onSwitchToOnline?: (meetingId: string) => void;
}

export const TravelBottomSheet: React.FC<TravelBottomSheetProps> = ({
  leg,
  onClose,
  onSwitchToOnline,
}) => {
  const [activeDraftType, setActiveDraftType] = useState<'later_start' | 'join_online' | null>(null);
  const [draftedMessage, setDraftedMessage] = useState<string>('');
  const [isDrafting, setIsDrafting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [travelBlockAdded, setTravelBlockAdded] = useState<boolean>(false);

  // Google Maps Hand-off transient card state
  const [handoffVisible, setHandoffVisible] = useState<boolean>(false);

  const fromBldg = leg
    ? UW_BUILDINGS[leg.fromMeeting.buildingCode?.toUpperCase()?.trim()] || UW_BUILDINGS['MC']
    : null;
  const toBldg = leg
    ? UW_BUILDINGS[leg.toMeeting.buildingCode?.toUpperCase()?.trim()] || UW_BUILDINGS['NH']
    : null;

  // Google Maps walking navigation URL with building entrance coordinates
  const googleMapsUrl =
    fromBldg && toBldg
      ? `https://www.google.com/maps/dir/?api=1&origin=${fromBldg.lat},${fromBldg.lng}&destination=${toBldg.lat},${toBldg.lng}&travelmode=walking&dir_action=navigate`
      : `https://www.google.com/maps/dir/?api=1&travelmode=walking&dir_action=navigate`;

  // Auto-dismiss the brief reminder toast card after 3 seconds without blocked window.open in timer
  useEffect(() => {
    if (!handoffVisible) return;
    const timer = setTimeout(() => {
      setHandoffVisible(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, [handoffVisible]);

  // Reset handoff and draft state when leg changes
  useEffect(() => {
    setHandoffVisible(false);
    setActiveDraftType(null);
    setDraftedMessage('');
    setCopied(false);
    setTravelBlockAdded(false);
  }, [leg?.id]);

  if (!leg) return null;

  const {
    fromMeeting,
    toMeeting,
    status,
    minutesLate,
    gapMinutes,
    googleMapsWalkMinutes,
    questFlowTravelMinutes,
    safeTimeMinutes,
    breakdown,
  } = leg;

  // Room-level steps Google Maps doesn't know
  const fromFloorsDown = Math.max(0, (fromMeeting.floor || 1) - 1);
  const fromMethod = fromFloorsDown <= 2 ? 'stairs' : 'elevator';
  const originStepText =
    fromFloorsDown > 0
      ? `Leave ${fromMeeting.buildingCode} ${fromMeeting.roomNumber || ''} → ${fromMethod} to floor 1`
      : `Leave ${fromMeeting.buildingCode} ${fromMeeting.roomNumber || ''}`;

  const toFloorsUp = Math.max(0, (toMeeting.floor || 1) - 1);
  const toMethod = toFloorsUp <= 2 ? 'stairs' : 'elevator';
  const destStepText =
    toFloorsUp > 0
      ? `In ${toMeeting.buildingCode} → ${toMethod} to floor ${toMeeting.floor || 1} → room ${toMeeting.roomNumber || ''}`
      : `In ${toMeeting.buildingCode} → room ${toMeeting.roomNumber || ''}`;

  // Trigger Google Maps navigation hand-off
  const handleTriggerNavigation = () => {
    setHandoffVisible(true);
  };

  const handleInstantOpen = () => {
    window.open(googleMapsUrl, '_blank');
    setHandoffVisible(false);
  };

  // Ref for auto-scrolling to draft box
  const draftBoxRef = useRef<HTMLDivElement>(null);

  const handleDraftMessage = async (type: 'later_start' | 'join_online') => {
    setActiveDraftType(type);
    setIsDrafting(true);
    setCopied(false);

    // Scroll into view immediately so user sees the draft box appear
    setTimeout(() => {
      draftBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);

    const organizer = toMeeting.organizer || 'there';
    const [h, m] = toMeeting.startTime.split(':').map(Number);
    const total = (h || 0) * 60 + (m || 0) + Math.max(10, minutesLate);
    const proposedTime = `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;

    const instantTemplate =
      type === 'join_online'
        ? `Hi ${organizer},\n\nI have back-to-back meetings across campus right before our session (${fromMeeting.buildingCode} to ${toMeeting.buildingCode}) and won't have enough travel time to make it in person by ${toMeeting.startTime}.\n\nWould it be alright if I joined virtually via Teams so we can start promptly? Let me know if that works!`
        : `Hi ${organizer},\n\nLooking forward to our meeting today. I have a prior commitment ending in ${fromMeeting.buildingCode} right at ${fromMeeting.endTime}, and realistic room-to-room walking across campus takes ~${questFlowTravelMinutes} minutes.\n\nCould we start a few minutes later at ${proposedTime} so I can get there without cutting into our discussion? Thank you!`;

    setDraftedMessage(instantTemplate);

    try {
      const res = await fetch('/api/gemini/draft-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          fromMeeting,
          toMeeting,
          gapMinutes,
          travelMinutes: questFlowTravelMinutes,
          minutesLate,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setDraftedMessage(data.message);
        }
      }
    } catch (err) {
      console.warn('Using client template draft:', err);
    } finally {
      setIsDrafting(false);
    }
  };

  const handleCopy = async () => {
    if (!draftedMessage) return;
    try {
      await navigator.clipboard.writeText(draftedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
    }
  };

  const handleDownloadTravelBlock = () => {
    downloadTravelBlockIcs(leg);
    setTravelBlockAdded(true);
    setTimeout(() => setTravelBlockAdded(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Click outside backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide-Up Bottom Sheet on Mobile / Centered Sheet on Desktop */}
      <div className="relative w-full sm:max-w-xl max-h-[92vh] flex flex-col bg-white dark:bg-[#1E1E1E] rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-neutral-200 dark:border-neutral-800 overflow-hidden animate-in slide-in-from-bottom-6 duration-200 z-10">
        {/* Mobile Pull Handle */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-12 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        </div>

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-100 dark:border-neutral-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                Route Details
              </span>
              {status === 'LATE' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  LATE · ~{minutesLate} min late
                </span>
              )}
              {status === 'TIGHT' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  TIGHT BUFFER
                </span>
              )}
              {status === 'ON_TIME' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ON TIME
                </span>
              )}
            </div>

            <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 mt-1 flex items-center gap-1.5">
              <span>{fromMeeting.buildingCode} {fromMeeting.roomNumber || ''}</span>
              <span className="text-neutral-400 font-normal">→</span>
              <span>{toMeeting.buildingCode} {toMeeting.roomNumber || ''}</span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 font-mono">
              {fromMeeting.endTime} departure · {toMeeting.startTime} arrival ({gapMinutes} min gap)
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 -mr-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="Close route details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Times Comparison Banner */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 text-center">
            <div>
              <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Google Maps</p>
              <p className="text-base font-bold text-neutral-800 dark:text-neutral-200 mt-0.5">
                {googleMapsWalkMinutes} min
              </p>
              <p className="text-[10px] text-neutral-400">door-to-door only</p>
            </div>
            <div className="border-l border-neutral-200 dark:border-neutral-700 pl-3">
              <p className="text-[11px] font-medium text-purple-600 dark:text-purple-400">QuestFlow Real Time</p>
              <p className="text-base font-bold text-purple-700 dark:text-purple-300 mt-0.5">
                {questFlowTravelMinutes} min
              </p>
              <p className="text-[10px] text-purple-500/80 dark:text-purple-400/80">room-to-room realistic</p>
            </div>
          </div>

          {/* PERMANENT INDOOR ROOM-LEVEL STEPS */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider">
              <Footprints className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Indoor Steps</span>
            </div>

            <div className="space-y-2 text-xs font-medium text-neutral-800 dark:text-neutral-200">
              <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700">
                <span className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase font-bold block">Departure</span>
                  <span className="font-semibold">{originStepText}</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700">
                <span className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase font-bold block">After Outdoor Walk Arrival</span>
                  <span className="font-semibold">{destStepText}</span>
                </div>
              </div>
            </div>
          </div>

          {/* PRIMARY BUTTON: Navigate in Google Maps */}
          <div className="pt-1">
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setHandoffVisible(true);
              }}
              className="w-full min-h-[48px] py-3 px-5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.98] text-center"
            >
              <Navigation className="w-4 h-4 shrink-0" />
              <span>Navigate in Google Maps</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80 ml-1" />
            </a>
            <p className="text-[11px] text-neutral-400 text-center mt-1.5">
              Opens walking directions between {fromMeeting.buildingCode} and {toMeeting.buildingCode} entrances.
            </p>
          </div>

          {/* Step-by-Step Breakdown */}
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-3.5 bg-white dark:bg-[#1E1E1E] space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Travel Time Breakdown
            </p>
            <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 leading-relaxed font-mono">
              {breakdown.summaryLine}
            </p>

            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
              <div className="flex justify-between">
                <span>Available meeting gap:</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{gapMinutes} min</span>
              </div>
              <div className="flex justify-between">
                <span>Room-to-room travel:</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{questFlowTravelMinutes} min</span>
              </div>
              <div className="flex justify-between">
                <span>Safe recommended time (1.2× buffer):</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{safeTimeMinutes} min</span>
              </div>
            </div>
          </div>

          {/* FIX ACTIONS (for LATE and TIGHT meetings) */}
          {(status === 'LATE' || status === 'TIGHT') && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-700 dark:text-neutral-300">
                <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>One-Click Fixes</span>
              </div>

              {/* Action 1: Draft Message to Organizer (propose later start) */}
              <button
                type="button"
                onClick={() => handleDraftMessage('later_start')}
                className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span>Draft note to organizer (propose later start)</span>
              </button>

              {/* Action 2: Suggest Joining Online (Draft Email) */}
              <button
                type="button"
                onClick={() => handleDraftMessage('join_online')}
                className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-neutral-200 dark:border-neutral-700 active:scale-[0.98]"
              >
                <Video className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>Draft request to join online via Teams</span>
              </button>

              {/* Action 3: Instant Switch to Online in QuestFlow */}
              {onSwitchToOnline && (
                <button
                  type="button"
                  onClick={() => {
                    onSwitchToOnline(toMeeting.id);
                    onClose();
                  }}
                  className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-blue-200 dark:border-blue-800 active:scale-[0.98]"
                >
                  <Video className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                  <span>Switch this meeting to Online (Teams) now</span>
                </button>
              )}

              {/* Action 4: Add Travel Block (.ics download) */}
              <button
                type="button"
                onClick={handleDownloadTravelBlock}
                className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-purple-200 dark:border-purple-800/60 active:scale-[0.98]"
              >
                {travelBlockAdded ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Travel block downloaded (.ics)!</span>
                  </>
                ) : (
                  <>
                    <CalendarPlus className="w-3.5 h-3.5" />
                    <span>Add travel block to Outlook (.ics)</span>
                  </>
                )}
              </button>

              {/* Drafted Message Box (if generated) */}
              {activeDraftType && (
                <div
                  ref={draftBoxRef}
                  className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-3 animate-in fade-in duration-150"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-purple-900 dark:text-purple-200">
                    <span>
                      {activeDraftType === 'later_start'
                        ? 'Drafted Note (Later Start)'
                        : 'Drafted Note (Join Online)'}
                    </span>
                    {isDrafting && (
                      <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Writing...
                      </span>
                    )}
                  </div>

                  <textarea
                    value={draftedMessage}
                    onChange={(e) => setDraftedMessage(e.target.value)}
                    rows={4}
                    className="w-full text-xs p-3 rounded-xl bg-white dark:bg-[#252525] border border-purple-200 dark:border-purple-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 font-sans"
                    placeholder="Generating draft..."
                  />

                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!draftedMessage || isDrafting}
                    className="w-full min-h-[42px] py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.98] disabled:opacity-50"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied to clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy message</span>
                      </>
                    )}
                  </button>

                  {/* One-click: Switch meeting to Online in QuestFlow */}
                  {activeDraftType === 'join_online' && onSwitchToOnline && (
                    <button
                      type="button"
                      onClick={() => {
                        onSwitchToOnline(toMeeting.id);
                        onClose();
                      }}
                      className="w-full min-h-[38px] py-1.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold text-xs border border-blue-200 dark:border-blue-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Switch this meeting to Online in QuestFlow</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2-SECOND HANDOFF CARD MODAL (BEFORE OPENING GOOGLE MAPS) */}
      {handoffVisible && (
        <div
          onClick={handleInstantOpen}
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm p-5 rounded-3xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-700 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto shadow-sm">
              <Navigation className="w-6 h-6 animate-pulse" />
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                Opening Google Maps Walking...
              </span>
              <h3 className="text-base font-extrabold text-neutral-900 dark:text-neutral-100 mt-1">
                Remember Room-Level Steps
              </h3>
            </div>

            <div className="space-y-2 text-left text-xs bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-[9px] shrink-0 mt-0.5">
                  1
                </span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {originStepText}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-[9px] shrink-0 mt-0.5">
                  2
                </span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {destStepText}
                </span>
              </div>
            </div>

            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setHandoffVisible(false)}
              className="w-full py-2.5 px-4 rounded-xl bg-purple-600 text-white font-bold text-xs shadow-md transition-all cursor-pointer hover:bg-purple-700 block text-center"
            >
              Open in Google Maps Again →
            </a>
            <button
              type="button"
              onClick={() => setHandoffVisible(false)}
              className="text-[11px] text-neutral-500 hover:text-neutral-700 underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
