import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, Send, Sparkles, Trash2 } from 'lucide-react';
import {
  CHAT_MODEL_OPTIONS,
  ROLE_PRESET_OPTIONS,
  type ChatModelId,
  type RolePresetId,
} from '../lib/aiValidation';
import {
  AiApiError,
  deleteChatSession,
  fetchChatSession,
  fetchChatSessions,
  sendChatMessage,
  type ChatMessageRecord,
  type ChatSessionRecord,
} from '../services/aiClient';

const STARTER_PROMPTS = [
  'What is a fair GHS price range for a used HP EliteBook 840 G5 on campus?',
  'Draft a clear Campus Market listing description for a TI-84 Plus calculator.',
  'How should I inspect a used smartphone before paying at a campus meetup?',
];

export function GeminiChatbotPanel() {
  const [sessions, setSessions] = useState<ChatSessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [model, setModel] = useState<ChatModelId>('gemini-4-hydrogen');
  const [rolePreset, setRolePreset] = useState<RolePresetId>('campus-buyer');
  const [draft, setDraft] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const list = await fetchChatSessions();
      setSessions(list);
      if (list.length > 0 && activeSessionId === null) {
        const latest = list[0];
        setActiveSessionId(latest.id);
        setModel((latest.model as ChatModelId) || 'gemini-4-hydrogen');
        setRolePreset((latest.rolePreset as RolePresetId) || 'campus-buyer');
        const detail = await fetchChatSession(latest.id);
        setMessages(detail.messages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load saved chats.');
    } finally {
      setLoadingSessions(false);
    }
  }, [activeSessionId]);

  useEffect(() => {
    void loadSessions();
    // Initial session load on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const handleSelectSession = async (session: ChatSessionRecord) => {
    setError('');
    setActiveSessionId(session.id);
    setModel((session.model as ChatModelId) || 'gemini-4-hydrogen');
    setRolePreset((session.rolePreset as RolePresetId) || 'campus-buyer');
    try {
      const detail = await fetchChatSession(session.id);
      setMessages(detail.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open chat session.');
    }
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setError('');
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    setError('');
    try {
      await deleteChatSession(sessionId);
      setSessions((prev) => prev.filter((item) => item.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete chat session.');
    }
  };

  const submitPrompt = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean || sending) return;

    setSending(true);
    setError('');
    try {
      const result = await sendChatMessage({
        sessionId: activeSessionId,
        model,
        rolePreset,
        message: clean,
      });

      setActiveSessionId(result.session.id);
      setMessages(result.messages);
      setDraft('');
      setSessions((prev) => {
        const filtered = prev.filter((item) => item.id !== result.session.id);
        return [result.session, ...filtered];
      });
    } catch (err) {
      if (err instanceof AiApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to send message.');
      }
    } finally {
      setSending(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitPrompt(draft);
  };

  const selectedModelMeta = CHAT_MODEL_OPTIONS.find((opt) => opt.id === model);
  const selectedPresetMeta = ROLE_PRESET_OPTIONS.find((opt) => opt.id === rolePreset);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Saved Conversation Sidebar */}
      <aside className="lg:col-span-4 bg-white border border-stone-200 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Saved Conversations</h2>
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
            New Chat
          </button>
        </div>

        {loadingSessions ? (
          <div className="space-y-2">
            <div className="h-12 bg-stone-100 rounded-lg animate-pulse" />
            <div className="h-12 bg-stone-100 rounded-lg animate-pulse" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-zinc-500 py-4 text-center">
            No saved chats yet. Start a conversation to keep history across sessions.
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-80 lg:max-h-[420px] overflow-y-auto pr-1">
            {sessions.map((session) => {
              const isSelected = session.id === activeSessionId;
              return (
                <li key={session.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void handleSelectSession(session)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void handleSelectSession(session);
                      }
                    }}
                    className={`w-full flex items-start justify-between gap-2 p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/70 border-emerald-900/40 text-zinc-900'
                        : 'bg-white border-stone-200 hover:bg-stone-50 text-zinc-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-zinc-900 truncate">
                        {session.title}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                        {session.model}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => void handleDeleteSession(e, session.id)}
                      aria-label={`Delete conversation ${session.title}`}
                      className="p-1 text-zinc-400 hover:text-red-700 rounded transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* Main Multi-turn Chat Panel */}
      <section className="lg:col-span-8 bg-white border border-stone-200 rounded-xl flex flex-col min-h-[540px] max-h-[680px]">
        {/* Role + Model Configuration Header */}
        <div className="p-4 border-b border-stone-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-600">Assistant Role</span>
            <select
              value={rolePreset}
              onChange={(e) => setRolePreset(e.target.value as RolePresetId)}
              className="w-full px-3 py-2 text-xs font-medium text-zinc-900 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20"
            >
              {ROLE_PRESET_OPTIONS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            {selectedPresetMeta && (
              <span className="block text-[11px] text-zinc-500">
                {selectedPresetMeta.description}
              </span>
            )}
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-600">Gemini Model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ChatModelId)}
              className="w-full px-3 py-2 text-xs font-medium text-zinc-900 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20"
            >
              {CHAT_MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} · {opt.subtitle}
                </option>
              ))}
            </select>
            {selectedModelMeta && (
              <span className="block text-[11px] text-zinc-500">
                {selectedModelMeta.paidKeyNote
                  ? 'Paid-tier model: requires your Gemini API key in Settings > Secrets.'
                  : 'Included default tier for student marketplace questions.'}
              </span>
            )}
          </label>
        </div>

        {/* Scrollable Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-8 space-y-4">
              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-900">
                <Sparkles className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-900">
                  Ask the Campus Market Assistant
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Get GHS price checks, write honest item descriptions, or plan safer campus
                  handovers. Conversations save automatically.
                </p>
              </div>
              <div className="w-full space-y-2 pt-2">
                {STARTER_PROMPTS.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => void submitPrompt(sample)}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-emerald-900 text-white'
                        : 'bg-stone-50 border border-stone-200 text-zinc-900'
                    }`}
                  >
                    <p>{msg.content}</p>
                    <span
                      className={`block mt-1.5 text-[10px] ${
                        isUser ? 'text-emerald-100' : 'text-zinc-500'
                      }`}
                    >
                      {isUser ? 'You' : msg.model}
                    </span>
                  </div>
                </div>
              );
            })
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-xs text-zinc-600">
                Thinking with {selectedModelMeta?.label || model}...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div
            role="alert"
            className="mx-4 mb-2 px-3 py-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg"
          >
            {error}
          </div>
        )}

        {/* Composer */}
        <form onSubmit={handleFormSubmit} className="p-3 border-t border-stone-200 flex gap-2">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submitPrompt(draft);
              }
            }}
            placeholder="Ask about fair GHS pricing, listing copy, or safe campus meetups..."
            className="flex-1 resize-none px-3 py-2 text-sm text-zinc-900 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="self-end inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 disabled:opacity-50 rounded-lg transition-colors shrink-0"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
