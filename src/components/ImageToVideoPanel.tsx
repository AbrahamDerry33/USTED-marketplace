import React, { useEffect, useState } from 'react';
import { Download, Film, ImagePlus, Loader2 } from 'lucide-react';
import {
  VIDEO_ASPECT_RATIOS,
  type VideoAspectRatio,
} from '../lib/aiValidation';
import {
  AiApiError,
  animateListingPhoto,
  fetchVideoJobs,
  type VideoJobRecord,
} from '../services/aiClient';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MOTION_PRESETS = [
  'Slow smooth 360-degree showcase orbit around the item in bright natural campus daylight.',
  'Subtle handheld push-in highlighting surface condition, clean edges, and natural shadows.',
  'Gentle parallax sweep from left to right with crisp studio lighting.',
];

export function ImageToVideoPanel() {
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string>('');
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [prompt, setPrompt] = useState(MOTION_PRESETS[0]);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [generating, setGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState<VideoJobRecord[]>([]);

  const loadJobs = async () => {
    try {
      const list = await fetchVideoJobs();
      setJobs(list);
    } catch {
      // Non-blocking history load
    }
  };

  useEffect(() => {
    void loadJobs();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Upload a JPEG, PNG, or WebP photo.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image must be 8 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = result.indexOf(',');
      if (commaIndex === -1) {
        setError('Could not read image file.');
        return;
      }
      setImagePreviewUrl(result);
      setImageBase64(result.slice(commaIndex + 1));
      setImageMimeType(file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageBase64) {
      setError('Select a listing photo first.');
      return;
    }
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setError('Describe how the image should animate.');
      return;
    }

    setGenerating(true);
    setError('');
    setVideoUrl(null);

    try {
      const result = await animateListingPhoto({
        imageBase64,
        mimeType: imageMimeType,
        prompt: cleanPrompt,
        aspectRatio,
      });
      setVideoUrl(`data:${result.mimeType};base64,${result.videoBase64}`);
      await loadJobs();
    } catch (err) {
      if (err instanceof AiApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to animate image right now.');
      }
      await loadJobs();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Upload + Motion Controls */}
      <form
        onSubmit={handleGenerate}
        className="lg:col-span-7 bg-white border border-stone-200 rounded-xl p-6 space-y-5"
      >
        <div className="space-y-1">
          <h2 className="text-base font-bold text-zinc-900">
            Animate Product Photo into Video (Omni 1.2 Flash)
          </h2>
          <p className="text-xs text-zinc-600">
            Turn a static listing photo into a short showcase video clip. Paid-tier model: requires a configured GEMINI_API_KEY in Settings &gt; Secrets.
          </p>
        </div>

        {/* File Picker */}
        <div className="space-y-2">
          <span className="block text-xs font-medium text-zinc-700">1. Starting Image</span>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-stone-300 hover:border-emerald-800 rounded-xl p-5 cursor-pointer bg-stone-50/70 transition-colors">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="sr-only"
            />
            {imagePreviewUrl ? (
              <img
                src={imagePreviewUrl}
                alt="Uploaded starting frame"
                className="max-h-56 rounded-lg object-contain"
              />
            ) : (
              <div className="flex flex-col items-center text-center space-y-1.5 text-zinc-600 py-4">
                <ImagePlus className="w-7 h-7 text-emerald-900" aria-hidden="true" />
                <span className="text-sm font-medium text-zinc-900">
                  Choose a JPEG, PNG, or WebP photo
                </span>
                <span className="text-xs text-zinc-500">Up to 8 MB</span>
              </div>
            )}
          </label>
        </div>

        {/* Motion Prompt */}
        <div className="space-y-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-700">2. Motion Prompt</span>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe camera movement and motion..."
              className="w-full px-3 py-2 text-sm text-zinc-900 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MOTION_PRESETS.map((preset, idx) => (
              <button
                key={preset}
                type="button"
                onClick={() => setPrompt(preset)}
                className="px-2.5 py-1 text-[11px] font-medium text-zinc-700 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors"
              >
                Preset {idx + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-zinc-700">3. Video Aspect Ratio</span>
          <div className="grid grid-cols-2 gap-3">
            {VIDEO_ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`px-3 py-2.5 text-xs font-medium rounded-lg border transition-colors ${
                  aspectRatio === ratio
                    ? 'bg-emerald-900 text-white border-emerald-900'
                    : 'bg-stone-50 text-zinc-800 border-stone-200 hover:bg-stone-100'
                }`}
              >
                {ratio === '16:9' ? '16:9 Landscape' : '9:16 Portrait'}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="px-3.5 py-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={generating}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 disabled:opacity-60 rounded-lg transition-colors"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Generating video clip...
            </>
          ) : (
            <>
              <Film className="w-4 h-4" aria-hidden="true" />
              Animate Photo into Video
            </>
          )}
        </button>
      </form>

      {/* Right: Video Preview & Recent Jobs */}
      <aside className="lg:col-span-5 space-y-5">
        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">Video Preview</h3>
          {videoUrl ? (
            <div className="space-y-3">
              <video
                src={videoUrl}
                controls
                playsInline
                className="w-full rounded-lg bg-black max-h-80"
              />
              <a
                href={videoUrl}
                download={`campus-market-clip-${Date.now()}.mp4`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Download MP4
              </a>
            </div>
          ) : (
            <div className="border border-stone-200 rounded-lg bg-stone-50 p-8 text-center text-xs text-zinc-500">
              {generating
                ? 'Rendering your animated product video via Interactions API...'
                : 'Your generated video will play here once rendering completes.'}
            </div>
          )}
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">Recent Video Requests</h3>
          {jobs.length === 0 ? (
            <p className="text-xs text-zinc-500">No video generation jobs recorded yet.</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {jobs.slice(0, 8).map((job) => (
                <li
                  key={job.id}
                  className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-zinc-700">{job.aspectRatio}</span>
                    <span
                      className={`font-medium ${
                        job.status === 'completed'
                          ? 'text-emerald-800'
                          : job.status === 'failed'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-800 line-clamp-2">{job.prompt}</p>
                  {job.errorMessage && (
                    <p className="text-[11px] text-red-700">{job.errorMessage}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
