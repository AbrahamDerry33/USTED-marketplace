import { auth } from '../lib/firebase';
import type {
  ChatModelId,
  MapsGroundingPlace,
  RolePresetId,
  VideoAspectRatio,
} from '../lib/aiValidation';

export class AiApiError extends Error {
  status: number;
  requiresPaidKey: boolean;

  constructor(message: string, status = 500, requiresPaidKey = false) {
    super(message);
    this.name = 'AiApiError';
    this.status = status;
    this.requiresPaidKey = requiresPaidKey;
  }
}

export interface ChatSessionRecord {
  id: number;
  userId: number;
  title: string;
  rolePreset: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: number;
  sessionId: number;
  sender: 'user' | 'model';
  content: string;
  model: string;
  createdAt: string;
}

export interface MeetupSpotRecord {
  id: number;
  userId: number;
  name: string;
  address: string;
  placeUri: string | null;
  lat: number;
  lng: number;
  notes: string | null;
  createdAt: string;
}

export interface VideoJobRecord {
  id: number;
  userId: number;
  prompt: string;
  aspectRatio: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface MapsGroundingResponse {
  text: string;
  places: MapsGroundingPlace[];
}

export async function getVerifiedBearerToken(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new AiApiError('Please sign in with your verified account.', 401);
  }
  return currentUser.getIdToken();
}

async function authFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getVerifiedBearerToken();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    requiresPaidKey?: boolean;
  };

  if (!response.ok) {
    throw new AiApiError(
      payload.error || `Request failed (${response.status}).`,
      response.status,
      Boolean(payload.requiresPaidKey)
    );
  }

  return payload as T;
}

export async function fetchChatSessions(): Promise<ChatSessionRecord[]> {
  const data = await authFetch<{ sessions: ChatSessionRecord[] }>('/api/chat/sessions');
  return data.sessions;
}

export async function fetchChatSession(sessionId: number): Promise<{
  session: ChatSessionRecord;
  messages: ChatMessageRecord[];
}> {
  return authFetch(`/api/chat/sessions/${sessionId}`);
}

export async function sendChatMessage(params: {
  sessionId: number | null;
  model: ChatModelId;
  rolePreset: RolePresetId;
  message: string;
}): Promise<{
  session: ChatSessionRecord;
  messages: ChatMessageRecord[];
  reply: string;
}> {
  return authFetch('/api/chat/send', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function deleteChatSession(sessionId: number): Promise<void> {
  await authFetch(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function queryMapsGrounding(params: {
  query: string;
  latLng?: { latitude: number; longitude: number };
}): Promise<MapsGroundingResponse> {
  return authFetch('/api/maps/grounding', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function fetchMeetupSpots(): Promise<MeetupSpotRecord[]> {
  const data = await authFetch<{ spots: MeetupSpotRecord[] }>('/api/maps/spots');
  return data.spots;
}

export async function saveMeetupSpot(params: {
  name: string;
  address: string;
  placeUri?: string;
  lat: number;
  lng: number;
  notes?: string;
}): Promise<MeetupSpotRecord> {
  const data = await authFetch<{ spot: MeetupSpotRecord }>('/api/maps/spots', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return data.spot;
}

export async function deleteMeetupSpot(spotId: number): Promise<void> {
  await authFetch(`/api/maps/spots/${spotId}`, { method: 'DELETE' });
}

export async function fetchVideoJobs(): Promise<VideoJobRecord[]> {
  const data = await authFetch<{ jobs: VideoJobRecord[] }>('/api/video/jobs');
  return data.jobs;
}

export async function animateListingPhoto(params: {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  aspectRatio: VideoAspectRatio;
}): Promise<{
  jobId: number;
  mimeType: string;
  videoBase64: string;
}> {
  return authFetch('/api/video/animate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
