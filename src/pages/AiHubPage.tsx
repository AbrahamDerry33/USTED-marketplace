import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, MapPin, MessageSquare, Mic } from 'lucide-react';
import { GeminiChatbotPanel } from '../components/GeminiChatbotPanel';
import { ImageToVideoPanel } from '../components/ImageToVideoPanel';
import { LiveVoicePanel } from '../components/LiveVoicePanel';

type AiTab = 'chat' | 'voice' | 'video';

export function AiHubPage() {
  const [activeTab, setActiveTab] = useState<AiTab>('chat');

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Campus Market AI Studio
          </h1>
          <p className="text-sm text-zinc-600">
            Chat with Gemini for GHS pricing &amp; listing copy, talk hands-free over Live Voice, or animate listing photos into short video clips.
          </p>
        </div>

        <Link
          to="/campus-map"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-zinc-800 bg-white border border-stone-200 hover:bg-stone-50 rounded-lg transition-colors shrink-0"
        >
          <MapPin className="w-3.5 h-3.5 text-emerald-900" aria-hidden="true" />
          Open Campus Meetup Map
        </Link>
      </div>

      {/* Mode Switcher */}
      <div
        role="tablist"
        aria-label="AI Studio capabilities"
        className="inline-flex flex-wrap gap-2 bg-white border border-stone-200 rounded-xl p-1.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'chat'}
          onClick={() => setActiveTab('chat')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'chat'
              ? 'bg-emerald-900 text-white'
              : 'text-zinc-700 hover:bg-stone-100'
          }`}
        >
          <MessageSquare className="w-4 h-4" aria-hidden="true" />
          Gemini Chatbot
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'voice'}
          onClick={() => setActiveTab('voice')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'voice'
              ? 'bg-emerald-900 text-white'
              : 'text-zinc-700 hover:bg-stone-100'
          }`}
        >
          <Mic className="w-4 h-4" aria-hidden="true" />
          Voice Live
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'video'}
          onClick={() => setActiveTab('video')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'video'
              ? 'bg-emerald-900 text-white'
              : 'text-zinc-700 hover:bg-stone-100'
          }`}
        >
          <Film className="w-4 h-4" aria-hidden="true" />
          Photo to Video
        </button>
      </div>

      {activeTab === 'chat' && <GeminiChatbotPanel />}
      {activeTab === 'voice' && <LiveVoicePanel />}
      {activeTab === 'video' && <ImageToVideoPanel />}
    </main>
  );
}
