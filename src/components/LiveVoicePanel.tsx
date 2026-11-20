import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Radio, Send } from 'lucide-react';
import { getVerifiedBearerToken } from '../services/aiClient';

type VoiceOption = 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';

interface TranscriptItem {
  id: string;
  speaker: 'You' | 'Assistant';
  text: string;
}

function encodePcm16Base64(float32Samples: Float32Array): string {
  const int16 = new Int16Array(float32Samples.length);
  for (let i = 0; i < float32Samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32Samples[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodePcm16Base64(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

export function LiveVoicePanel() {
  const [voice, setVoice] = useState<VoiceOption>('Zephyr');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [muted, setMuted] = useState(false);
  const [textHint, setTextHint] = useState('');
  const [error, setError] = useState('');
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const activePlaybackNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const mutedRef = useRef<boolean>(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const stopPlaybackQueue = () => {
    for (const node of activePlaybackNodesRef.current) {
      try {
        node.stop();
      } catch {
        // Ignore already stopped sources
      }
    }
    activePlaybackNodesRef.current = [];
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  };

  const cleanupSession = () => {
    stopPlaybackQueue();

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      void inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      void outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      const socket = wsRef.current;
      wsRef.current = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }
    setStatus('idle');
  };

  useEffect(() => {
    return () => {
      cleanupSession();
    };
    // Cleanup audio & socket resources on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleAudioChunk = (base64Audio: string) => {
    const outputCtx = outputCtxRef.current;
    if (!outputCtx) return;

    const samples = decodePcm16Base64(base64Audio);
    if (samples.length === 0) return;

    const buffer = outputCtx.createBuffer(1, samples.length, 24000);
    buffer.copyToChannel(new Float32Array(samples), 0);

    const node = outputCtx.createBufferSource();
    node.buffer = buffer;
    node.connect(outputCtx.destination);

    const startAt = Math.max(outputCtx.currentTime, nextStartTimeRef.current);
    node.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activePlaybackNodesRef.current.push(node);
    node.onended = () => {
      activePlaybackNodesRef.current = activePlaybackNodesRef.current.filter(
        (item) => item !== node
      );
    };
  };

  const appendTranscript = (speaker: 'You' | 'Assistant', delta: string) => {
    const clean = delta.trim();
    if (!clean) return;

    setTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text} ${clean}`.trim() },
        ];
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          speaker,
          text: clean,
        },
      ];
    });
  };

  const startVoiceSession = async () => {
    if (status !== 'idle') return;
    setError('');
    setStatus('connecting');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      const token = await getVerifiedBearerToken();
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      await inputCtx.resume();
      await outputCtx.resume();
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live?token=${encodeURIComponent(
        token
      )}&voice=${encodeURIComponent(voice)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        sourceNodeRef.current = source;
        processorRef.current = processor;

        processor.onaudioprocess = (event) => {
          if (mutedRef.current) return;
          const socket = wsRef.current;
          if (!socket || socket.readyState !== WebSocket.OPEN) return;
          const channel = event.inputBuffer.getChannelData(0);
          const audioBase64 = encodePcm16Base64(channel);
          socket.send(JSON.stringify({ audio: audioBase64 }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            ready?: boolean;
            audio?: string;
            inputTranscript?: string;
            outputTranscript?: string;
            interrupted?: boolean;
            error?: string;
          };

          if (msg.ready) {
            setStatus('connected');
          }
          if (msg.error) {
            setError(msg.error);
          }
          if (msg.interrupted) {
            stopPlaybackQueue();
          }
          if (msg.audio) {
            setStatus('connected');
            scheduleAudioChunk(msg.audio);
          }
          if (msg.inputTranscript) {
            appendTranscript('You', msg.inputTranscript);
          }
          if (msg.outputTranscript) {
            appendTranscript('Assistant', msg.outputTranscript);
          }
        } catch {
          // Ignore invalid JSON payloads
        }
      };

      ws.onerror = () => {
        setError('Live voice connection interrupted. Please check microphone permissions or GEMINI_API_KEY.');
      };

      ws.onclose = () => {
        cleanupSession();
      };
    } catch (err) {
      cleanupSession();
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to start live voice conversation.'
      );
    }
  };

  const handleSendTextHint = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = textHint.trim();
    if (!clean || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ text: clean }));
    appendTranscript('You', clean);
    setTextHint('');
  };

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-zinc-900">
            Voice Shopping Assistant (Gemini 3.8 Live)
          </h2>
          <p className="text-xs text-zinc-600">
            Speak naturally to estimate GHS item prices, rehearse meetup questions, or draft a listing hands-free.
          </p>
        </div>

        <label className="block space-y-1 sm:w-44">
          <span className="text-xs font-medium text-zinc-600">Voice Profile</span>
          <select
            value={voice}
            disabled={status !== 'idle'}
            onChange={(e) => setVoice(e.target.value as VoiceOption)}
            className="w-full px-3 py-2 text-xs font-medium text-zinc-900 bg-stone-50 border border-stone-200 rounded-lg disabled:opacity-60"
          >
            <option value="Zephyr">Zephyr</option>
            <option value="Puck">Puck</option>
            <option value="Charon">Charon</option>
            <option value="Kore">Kore</option>
            <option value="Fenrir">Fenrir</option>
          </select>
        </label>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {status === 'idle' ? (
          <button
            type="button"
            onClick={() => void startVoiceSession()}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors"
          >
            <Mic className="w-4 h-4" aria-hidden="true" />
            Start Live Voice Call
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setMuted((prev) => !prev)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                muted
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-stone-100 border-stone-200 text-zinc-800 hover:bg-stone-200'
              }`}
            >
              {muted ? (
                <>
                  <MicOff className="w-4 h-4" aria-hidden="true" />
                  Mic Muted
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" aria-hidden="true" />
                  Mute Mic
                </>
              )}
            </button>

            <button
              type="button"
              onClick={cleanupSession}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors"
            >
              <PhoneOff className="w-4 h-4" aria-hidden="true" />
              End Session
            </button>
          </>
        )}

        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 ml-auto">
          <Radio
            className={`w-4 h-4 ${
              status === 'connected'
                ? 'text-emerald-700'
                : status === 'connecting'
                  ? 'text-amber-700'
                  : 'text-zinc-400'
            }`}
            aria-hidden="true"
          />
          {status === 'connected'
            ? muted
              ? 'Connected (mic muted)'
              : 'Live · Listening at 16 kHz / Playing at 24 kHz'
            : status === 'connecting'
              ? 'Connecting to voice session...'
              : 'Ready to connect'}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="px-3.5 py-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg"
        >
          {error}
        </div>
      )}

      {/* Optional text prompt during live voice call */}
      {status === 'connected' && (
        <form onSubmit={handleSendTextHint} className="flex gap-2">
          <input
            type="text"
            value={textHint}
            onChange={(e) => setTextHint(e.target.value)}
            placeholder="Send a written note during the call (e.g. an item title or price)..."
            className="flex-1 px-3 py-2 text-sm text-zinc-900 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20"
          />
          <button
            type="submit"
            disabled={!textHint.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 disabled:opacity-50 rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            Send
          </button>
        </form>
      )}

      {/* Live Transcript */}
      <div className="border border-stone-200 rounded-xl bg-stone-50/70 p-4 space-y-3 min-h-[240px] max-h-[380px] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-700">Live Transcript</h3>
          {transcripts.length > 0 && (
            <button
              type="button"
              onClick={() => setTranscripts([])}
              className="text-xs text-zinc-500 hover:text-zinc-800"
            >
              Clear
            </button>
          )}
        </div>

        {transcripts.length === 0 ? (
          <p className="text-xs text-zinc-500 py-8 text-center">
            Start a voice session and begin speaking to see live captions here.
          </p>
        ) : (
          <div className="space-y-2.5">
            {transcripts.map((entry) => (
              <div key={entry.id} className="text-sm leading-relaxed">
                <span
                  className={`font-semibold mr-2 ${
                    entry.speaker === 'You' ? 'text-emerald-900' : 'text-zinc-900'
                  }`}
                >
                  {entry.speaker}:
                </span>
                <span className="text-zinc-700">{entry.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
