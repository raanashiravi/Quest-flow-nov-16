import React, { useState, useRef, useEffect } from 'react';
import { QuestMeeting, TravelLeg } from '../types';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Bot,
  User,
  ArrowRight,
  Video,
  Navigation,
  RotateCcw,
  Minimize2,
  Calendar,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

interface AiCampusChatbotProps {
  meetings: QuestMeeting[];
  travelLegs: TravelLeg[];
  lateCount?: number;
  totalWalkMinutes?: number;
  mainOffice?: { buildingCode: string; roomNumber: string };
  selectedDate?: string;
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  onSwitchToOnline: (meetingId: string) => void;
  onSelectMapLeg?: (legId: string) => void;
  onOpenAddModal?: () => void;
}

const QUICK_PROMPTS = [
  'Will I be late to any meetings today?',
  'Where should I work between meetings?',
  'How do I fix the late meeting in NH?',
  'Plan a 30-min sync in DC this afternoon',
];

export const AiCampusChatbot: React.FC<AiCampusChatbotProps> = ({
  meetings,
  travelLegs,
  lateCount = 0,
  totalWalkMinutes = 0,
  mainOffice,
  selectedDate = 'Today',
  isOpen,
  onClose,
  onOpen,
  onSwitchToOnline,
  onSelectMapLeg,
  onOpenAddModal,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return [
      {
        id: 'welcome',
        role: 'model',
        text: `Hi! I'm your QuestFlow Campus AI Assistant. I have your full Waterloo schedule loaded with realistic room-to-room walking times. How can I help plan or adjust your day?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const userText = (textToSend || input).trim();
    if (!userText || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const contextPayload = {
        currentSchedule: meetings,
        travelLegs: travelLegs.map((l) => ({
          fromMeeting: { buildingCode: l.fromMeeting.buildingCode, endTime: l.fromMeeting.endTime },
          toMeeting: { buildingCode: l.toMeeting.buildingCode, startTime: l.toMeeting.startTime, id: l.toMeeting.id, title: l.toMeeting.title },
          questFlowTravelMinutes: l.questFlowTravelMinutes,
          gapMinutes: l.gapMinutes,
          status: l.status,
          minutesLate: l.minutesLate,
        })),
        lateMeetingsCount: lateCount,
        totalWalkMinutes,
        mainOffice,
        selectedDate,
      };

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: historyPayload,
          context: contextPayload,
        }),
      });

      if (!res.ok) throw new Error('Failed to get AI response');
      const data = await res.json();

      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'model',
        text: data.reply || 'I checked your campus schedule. All walking calculations are up to date.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'model',
          text: `You have ${meetings.length} meetings today. With ${totalWalkMinutes} min of room-to-room walking planned, MC to NH takes ~11 min. I can help answer questions about your route or meetings.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'model',
        text: `Chat cleared. Ask me anything about your meetings, realistic cross-campus walks, or schedule adjustments.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // Check if late meeting exists for quick action
  const lateLeg = travelLegs.find((l) => l.status === 'LATE' && l.toMeeting.source === 'imported');

  return (
    <>
      {/* Floating Trigger Button (Bottom Right) */}
      {!isOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="fixed bottom-5 right-5 z-40 px-4 py-2.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 shadow-xl border border-neutral-700/30 flex items-center gap-2 cursor-pointer transition-all active:scale-95 group"
          aria-label="Open AI Campus Assistant"
        >
          <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold font-sans">Ask AI Assistant</span>
          {lateCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          )}
        </button>
      )}

      {/* Slide-Up / Overlay Chat Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-0 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="relative w-full sm:w-[420px] h-[85vh] sm:h-[620px] max-h-[92vh] bg-white dark:bg-[#1E1E1E] rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/70 dark:bg-neutral-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <span>QuestFlow AI</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold border border-purple-200 dark:border-purple-800/50">
                      UW Context
                    </span>
                  </h3>
                  <p className="text-[10px] text-neutral-400">
                    Room-to-room walking & smart scheduling
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleClearChat}
                  title="Clear chat"
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  aria-label="Close chat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Context Strip */}
            <div className="px-4 py-1.5 bg-purple-50/50 dark:bg-purple-950/20 border-b border-purple-100/60 dark:border-purple-900/30 flex items-center justify-between text-[11px] text-neutral-500">
              <span>{meetings.length} meetings · {totalWalkMinutes}m walking</span>
              {lateCount > 0 ? (
                <span className="text-red-600 dark:text-red-400 font-bold">
                  {lateCount} late warning
                </span>
              ) : (
                <span className="text-emerald-600 font-medium">Schedule on time</span>
              )}
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs ${
                        isUser
                          ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900'
                          : 'bg-purple-600 text-white'
                      }`}
                    >
                      {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                    </div>

                    <div
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed space-y-2 ${
                        isUser
                          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 rounded-tr-xs'
                          : 'bg-neutral-100 dark:bg-neutral-800/90 text-neutral-800 dark:text-neutral-200 rounded-tl-xs border border-neutral-200/60 dark:border-neutral-700/50'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      <span className="block text-[9px] opacity-60 text-right">
                        {m.timestamp}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Dynamic Action Buttons in Chat if user asks about fixes or schedule */}
              {lateLeg && (
                <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1.5 animate-in fade-in duration-150">
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Quick AI Shortcuts:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSwitchToOnline(lateLeg.toMeeting.id)}
                      className="px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold text-[11px] border border-blue-200 dark:border-blue-800 flex items-center gap-1 cursor-pointer hover:bg-blue-100 transition-colors"
                    >
                      <Video className="w-3 h-3 text-blue-600" />
                      <span>Switch {lateLeg.toMeeting.title} to Teams</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectMapLeg?.(lateLeg.id);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-bold text-[11px] border border-purple-200 dark:border-purple-800 flex items-center gap-1 cursor-pointer hover:bg-purple-100 transition-colors"
                    >
                      <Navigation className="w-3 h-3 text-purple-600" />
                      <span>Show MC → NH on Map</span>
                    </button>
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-neutral-400 italic py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                  <span>QuestFlow AI is reasoning with campus walking data...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts Carousel */}
            <div className="px-3 pt-2 pb-1 overflow-x-auto flex gap-1.5 no-scrollbar border-t border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-900/40">
              {QUICK_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-all shrink-0 cursor-pointer shadow-2xs"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask to plan your afternoon, check travel..."
                  className="flex-1 px-3.5 py-2.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-sans"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="w-9 h-9 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
