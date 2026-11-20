export const CHAT_MODEL_OPTIONS = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    subtitle: 'General tasks (default)',
    paidKeyNote: false,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    subtitle: 'Fast responses',
    paidKeyNote: false,
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    subtitle: 'Deep reasoning',
    paidKeyNote: true,
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    subtitle: 'Complex interactive tasks',
    paidKeyNote: true,
  },
] as const;

export type ChatModelId = (typeof CHAT_MODEL_OPTIONS)[number]['id'];

export const ROLE_PRESET_OPTIONS = [
  {
    id: 'campus-buyer',
    label: 'Campus Buyer Guide',
    description: 'Check fair student pricing, inspect items, and plan safe meetups.',
    systemInstruction:
      'You are Campus Market’s Campus Buyer Guide for university students in Ghana (currency in GHS / Ghana cedis). Help buyers evaluate used electronics, textbooks, dorm gear, and fashion, suggest fair price ranges, identify red flags, and recommend safe daylight campus meetup spots. Keep answers practical, structured, and concise.',
  },
  {
    id: 'seller-coach',
    label: 'Seller Listing Coach',
    description: 'Write clear titles, honest condition notes, and competitive GHS prices.',
    systemInstruction:
      'You are Campus Market’s Seller Listing Coach for university students in Ghana (currency in GHS). Help student sellers draft clear, accurate listing titles, structured descriptions, condition disclosures, and fair pricing strategies so items sell quickly without buyer disputes.',
  },
  {
    id: 'deal-analyst',
    label: 'Deal & Escrow Analyst',
    description: 'Break down Paystack/manual receipt steps and trade-offs objectively.',
    systemInstruction:
      'You are Campus Market’s Deal & Escrow Analyst. Help students reason step-by-step through order statuses (awaiting payment, payment submitted, paid, shipped, completed), manual transfer receipt verification, and fair negotiation terms. Never give legal or financial guarantees.',
  },
  {
    id: 'quick-helper',
    label: 'Quick Campus Helper',
    description: 'Short, punchy answers for fast marketplace questions.',
    systemInstruction:
      'You are Campus Market’s Quick Campus Helper. Answer student marketplace questions in crisp bullet points under 120 words whenever possible. Use GHS for prices.',
  },
] as const;

export type RolePresetId = (typeof ROLE_PRESET_OPTIONS)[number]['id'];

export const VIDEO_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

export interface MapsReviewSnippet {
  text?: string;
  uri?: string;
  author?: string;
}

export interface MapsGroundingPlace {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: MapsReviewSnippet[];
}

export function validateChatModel(value: unknown): ChatModelId {
  if (typeof value === 'string') {
    const match = CHAT_MODEL_OPTIONS.find((opt) => opt.id === value);
    if (match) return match.id;
  }
  throw new Error(
    `Unsupported model. Choose one of: ${CHAT_MODEL_OPTIONS.map((m) => m.id).join(', ')}.`
  );
}

export function validateRolePreset(value: unknown): RolePresetId {
  if (typeof value === 'string') {
    const match = ROLE_PRESET_OPTIONS.find((opt) => opt.id === value);
    if (match) return match.id;
  }
  return 'campus-buyer';
}

export function validateAspectRatio(value: unknown): VideoAspectRatio {
  if (value === '16:9' || value === '9:16') {
    return value;
  }
  throw new Error("Aspect ratio must be '16:9' or '9:16'.");
}

export function extractMapsGroundingLinks(chunks: unknown): MapsGroundingPlace[] {
  if (!Array.isArray(chunks)) return [];
  const places: MapsGroundingPlace[] = [];
  const seenUris = new Set<string>();

  for (const raw of chunks) {
    if (!raw || typeof raw !== 'object') continue;
    const mapsObj = (raw as { maps?: unknown }).maps;
    if (!mapsObj || typeof mapsObj !== 'object') continue;

    const maps = mapsObj as {
      uri?: unknown;
      title?: unknown;
      placeId?: unknown;
      placeAnswerSources?: {
        reviewSnippets?: unknown[];
      };
    };

    const uri = typeof maps.uri === 'string' ? maps.uri.trim() : '';
    const title = typeof maps.title === 'string' ? maps.title.trim() : '';
    if (!uri || !title || seenUris.has(uri)) continue;

    seenUris.add(uri);
    const reviewSnippets: MapsReviewSnippet[] = [];
    const rawSnippets = maps.placeAnswerSources?.reviewSnippets;

    if (Array.isArray(rawSnippets)) {
      for (const snippet of rawSnippets) {
        if (!snippet || typeof snippet !== 'object') continue;
        const s = snippet as {
          reviewId?: unknown;
          googleMapsUri?: unknown;
          uri?: unknown;
          text?: unknown;
          authorAttribution?: { displayName?: unknown };
        };
        const snippetUri =
          typeof s.googleMapsUri === 'string'
            ? s.googleMapsUri
            : typeof s.uri === 'string'
              ? s.uri
              : undefined;
        const text = typeof s.text === 'string' ? s.text.trim() : undefined;
        const author =
          typeof s.authorAttribution?.displayName === 'string'
            ? s.authorAttribution.displayName
            : undefined;
        if (text || snippetUri) {
          reviewSnippets.push({ text, uri: snippetUri, author });
        }
      }
    }

    places.push({
      title,
      uri,
      placeId: typeof maps.placeId === 'string' ? maps.placeId : undefined,
      reviewSnippets,
    });
  }

  return places;
}

export function formatUpstreamAiError(err: unknown): {
  statusCode: number;
  message: string;
  requiresPaidKey: boolean;
} {
  const rawMessage = err instanceof Error ? err.message : String(err || 'AI request failed');
  const statusFromErr =
    typeof (err as { status?: unknown })?.status === 'number'
      ? ((err as { status: number }).status)
      : undefined;

  const lower = rawMessage.toLowerCase();
  const isPaidOrQuota =
    statusFromErr === 429 ||
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('billing') ||
    lower.includes('paid');

  if (isPaidOrQuota) {
    return {
      statusCode: 429,
      requiresPaidKey: true,
      message:
        'This model or request exceeded the active API quota or requires a paid Gemini API key. Add your own key in Settings > Secrets > GEMINI_API_KEY, or switch to Gemini 4 Hydrogen / Gemini 3.1 Flash-Lite.',
    };
  }

  if (statusFromErr === 401 || statusFromErr === 403 || lower.includes('api key')) {
    return {
      statusCode: statusFromErr || 401,
      requiresPaidKey: true,
      message:
        'Gemini API authentication failed. Verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }

  return {
    statusCode: statusFromErr && statusFromErr >= 400 && statusFromErr < 600 ? statusFromErr : 500,
    requiresPaidKey: false,
    message: rawMessage,
  };
}
