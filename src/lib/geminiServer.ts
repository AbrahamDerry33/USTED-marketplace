import { GoogleGenAI } from '@google/genai';
import {
  extractMapsGroundingLinks,
  ROLE_PRESET_OPTIONS,
  type ChatModelId,
  type MapsGroundingPlace,
  type RolePresetId,
  type VideoAspectRatio,
} from './aiValidation.ts';

let cachedAi: GoogleGenAI | null = null;
let cachedApiKey: string | undefined;

export function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  if (!cachedAi || cachedApiKey !== apiKey) {
    cachedAi = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    cachedApiKey = apiKey;
  }
  return cachedAi;
}

export async function runChatTurn(params: {
  model: ChatModelId;
  rolePreset: RolePresetId;
  history: Array<{ sender: string; content: string }>;
  message: string;
}): Promise<string> {
  const ai = getAiClient();
  const preset =
    ROLE_PRESET_OPTIONS.find((item) => item.id === params.rolePreset) ?? ROLE_PRESET_OPTIONS[0];

  const chat = ai.chats.create({
    model: params.model,
    history: params.history.map((item) => ({
      role: item.sender === 'user' ? 'user' : 'model',
      parts: [{ text: item.content }],
    })),
    config: {
      systemInstruction: preset.systemInstruction,
    },
  });

  const response = await chat.sendMessage({
    message: params.message,
  });

  return response.text?.trim() || 'No response text was returned.';
}

export async function runMapsGrounding(params: {
  query: string;
  latLng?: { latitude: number; longitude: number };
}): Promise<{ text: string; places: MapsGroundingPlace[] }> {
  const ai = getAiClient();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: params.query,
    config: {
      tools: [{ googleMaps: {} }],
      ...(params.latLng
        ? {
            toolConfig: {
              retrievalConfig: {
                latLng: {
                  latitude: params.latLng.latitude,
                  longitude: params.latLng.longitude,
                },
              },
            },
          }
        : {}),
    },
  });

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  const places = extractMapsGroundingLinks(chunks);

  return {
    text: response.text?.trim() || '',
    places,
  };
}

export async function runImageToVideo(params: {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  aspectRatio: VideoAspectRatio;
}): Promise<{ videoBase64: string; mimeType: string }> {
  const ai = getAiClient();

  const interaction = await ai.interactions.create(
    {
      model: 'gemini-omni-1.2-flash',
      input: [
        {
          type: 'image',
          mime_type: params.mimeType,
          data: params.imageBase64,
        },
        {
          type: 'text',
          text: params.prompt,
        },
      ],
      background: false,
      store: false,
      stream: false,
      response_format: {
        type: 'video',
        aspect_ratio: params.aspectRatio,
      },
    },
    { timeout: 300000 }
  );

  const outputVideo = (
    interaction as {
      output_video?: { data?: string; mime_type?: string };
      outputs?: Array<{ type?: string; data?: string; mime_type?: string }>;
    }
  ).output_video;

  if (outputVideo?.data) {
    return {
      videoBase64: outputVideo.data,
      mimeType: outputVideo.mime_type || 'video/mp4',
    };
  }

  const fallbackVideo = (
    interaction as {
      outputs?: Array<{ type?: string; data?: string; mime_type?: string }>;
    }
  ).outputs?.find((item) => item.type === 'video' && item.data);

  if (fallbackVideo?.data) {
    return {
      videoBase64: fallbackVideo.data,
      mimeType: fallbackVideo.mime_type || 'video/mp4',
    };
  }

  throw new Error('Video generation completed without returning video output bytes.');
}
