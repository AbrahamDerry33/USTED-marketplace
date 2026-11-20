import 'dotenv/config';
import http from 'http';
import path from 'path';
import express from 'express';
import { Modality, type LiveServerMessage } from '@google/genai';
import { WebSocket, WebSocketServer } from 'ws';
import {
  createChatSessionForUser,
  appendChatTurn,
  createMeetupSpotForUser,
  createVideoJobForUser,
  deleteChatSessionForUser,
  deleteMeetupSpotForUser,
  getChatSessionWithMessages,
  listChatSessionsForUser,
  listMeetupSpotsForUser,
  listVideoJobsForUser,
  updateVideoJobStatus,
} from './src/db/repository.ts';
import {
  formatUpstreamAiError,
  validateAspectRatio,
  validateChatModel,
  validateRolePreset,
} from './src/lib/aiValidation.ts';
import {
  getAiClient,
  runChatTurn,
  runImageToVideo,
  runMapsGrounding,
} from './src/lib/geminiServer.ts';
import {
  requireAuth,
  verifyVerifiedStudentToken,
  type AuthRequest,
} from './src/middleware/auth.ts';

const PORT = Number(process.env.PORT || 3000);
const ALLOWED_LIVE_VOICES = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health probe (no DB call)
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // --- AI Chatbot (Cloud SQL persisted) ---
  app.get('/api/chat/sessions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const sessions = await listChatSessionsForUser(req.dbUser!.id);
      res.json({ sessions });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unable to load chat sessions.',
      });
    }
  });

  app.get('/api/chat/sessions/:id', requireAuth, async (req: AuthRequest, res) => {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: 'Invalid chat session id.' });
      return;
    }

    try {
      const data = await getChatSessionWithMessages(req.dbUser!.id, sessionId);
      if (!data) {
        res.status(404).json({ error: 'Chat session not found.' });
        return;
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unable to load chat session.',
      });
    }
  });

  app.post('/api/chat/send', requireAuth, async (req: AuthRequest, res) => {
    const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!rawMessage || rawMessage.length > 4000) {
      res.status(400).json({ error: 'Message must be between 1 and 4000 characters.' });
      return;
    }

    let model;
    try {
      model = validateChatModel(req.body?.model ?? 'gemini-4-hydrogen');
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid model.' });
      return;
    }

    const rolePreset = validateRolePreset(req.body?.rolePreset);
    const requestedSessionId =
      req.body?.sessionId !== undefined && req.body?.sessionId !== null
        ? Number(req.body.sessionId)
        : null;

    if (
      requestedSessionId !== null &&
      (!Number.isInteger(requestedSessionId) || requestedSessionId <= 0)
    ) {
      res.status(400).json({ error: 'Invalid chat session id.' });
      return;
    }

    try {
      let sessionId = requestedSessionId;
      let existingHistory: Array<{ sender: string; content: string }> = [];

      if (sessionId !== null) {
        const existing = await getChatSessionWithMessages(req.dbUser!.id, sessionId);
        if (!existing) {
          res.status(404).json({ error: 'Chat session not found.' });
          return;
        }
        existingHistory = existing.messages.map((m) => ({
          sender: m.sender,
          content: m.content,
        }));
      }

      const reply = await runChatTurn({
        model,
        rolePreset,
        history: existingHistory,
        message: rawMessage,
      });

      if (sessionId === null) {
        const title =
          rawMessage.length > 60 ? `${rawMessage.slice(0, 57)}...` : rawMessage;
        const created = await createChatSessionForUser({
          userId: req.dbUser!.id,
          title,
          rolePreset,
          model,
        });
        sessionId = created.id;
      }

      await appendChatTurn({
        userId: req.dbUser!.id,
        sessionId,
        rolePreset,
        model,
        userMessage: rawMessage,
        modelReply: reply,
      });

      const updated = await getChatSessionWithMessages(req.dbUser!.id, sessionId);
      res.json({
        session: updated?.session,
        messages: updated?.messages ?? [],
        reply,
      });
    } catch (error) {
      const formatted = formatUpstreamAiError(error);
      res.status(formatted.statusCode).json({
        error: formatted.message,
        requiresPaidKey: formatted.requiresPaidKey,
      });
    }
  });

  app.delete('/api/chat/sessions/:id', requireAuth, async (req: AuthRequest, res) => {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: 'Invalid chat session id.' });
      return;
    }

    try {
      const deleted = await deleteChatSessionForUser(req.dbUser!.id, sessionId);
      if (!deleted) {
        res.status(404).json({ error: 'Chat session not found.' });
        return;
      }
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unable to delete chat session.',
      });
    }
  });

  // --- Google Maps Grounding + Cloud SQL Meetup Spots ---
  app.post('/api/maps/grounding', requireAuth, async (req: AuthRequest, res) => {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!query || query.length > 500) {
      res.status(400).json({ error: 'Search query must be between 1 and 500 characters.' });
      return;
    }

    let latLng: { latitude: number; longitude: number } | undefined;
    if (req.body?.latLng && typeof req.body.latLng === 'object') {
      const lat = Number(req.body.latLng.latitude);
      const lng = Number(req.body.latLng.longitude);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
      ) {
        latLng = { latitude: lat, longitude: lng };
      }
    }

    try {
      const result = await runMapsGrounding({ query, latLng });
      res.json(result);
    } catch (error) {
      const formatted = formatUpstreamAiError(error);
      res.status(formatted.statusCode).json({
        error: formatted.message,
        requiresPaidKey: formatted.requiresPaidKey,
      });
    }
  });

  app.get('/api/maps/spots', requireAuth, async (req: AuthRequest, res) => {
    try {
      const spots = await listMeetupSpotsForUser(req.dbUser!.id);
      res.json({ spots });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unable to load saved meetup spots.',
      });
    }
  });

  app.post('/api/maps/spots', requireAuth, async (req: AuthRequest, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const rawPlaceUri =
      typeof req.body?.placeUri === 'string' ? req.body.placeUri.trim() : '';
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

    if (!name || name.length > 120) {
      res.status(400).json({ error: 'Spot name must be between 1 and 120 characters.' });
      return;
    }
    if (!address || address.length > 240) {
      res.status(400).json({ error: 'Address must be between 1 and 240 characters.' });
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      res.status(400).json({ error: 'Latitude must be between -90 and 90.' });
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      res.status(400).json({ error: 'Longitude must be between -180 and 180.' });
      return;
    }
    if (notes.length > 300) {
      res.status(400).json({ error: 'Notes must be 300 characters or fewer.' });
      return;
    }

    let safePlaceUri: string | null = null;
    if (rawPlaceUri) {
      try {
        const parsed = new URL(rawPlaceUri);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          safePlaceUri = parsed.toString();
        }
      } catch {
        res.status(400).json({ error: 'Place link must be a valid URL.' });
        return;
      }
    }

    try {
      const spot = await createMeetupSpotForUser({
        userId: req.dbUser!.id,
        name,
        address,
        placeUri: safePlaceUri,
        lat,
        lng,
        notes: notes || null,
      });
      res.status(201).json({ spot });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unable to save meetup spot.',
      });
    }
  });

  app.delete('/api/maps/spots/:id', requireAuth, async (req: AuthRequest, res) => {
    const spotId = Number(req.params.id);
    if (!Number.isInteger(spotId) || spotId <= 0) {
      res.status(400).json({ error: 'Invalid spot id.' });
      return;
    }

    try {
      const deleted = await deleteMeetupSpotForUser(req.dbUser!.id, spotId);
      if (!deleted) {
        res.status(404).json({ error: 'Meetup spot not found.' });
        return;
      }
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unable to delete meetup spot.',
      });
    }
  });

  // --- Image-to-Video (Interactions API + Cloud SQL Job History) ---
  app.get('/api/video/jobs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const jobs = await listVideoJobsForUser(req.dbUser!.id);
      res.json({ jobs });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unable to load video job history.',
      });
    }
  });

  app.post('/api/video/animate', requireAuth, async (req: AuthRequest, res) => {
    const imageBase64 =
      typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64.trim() : '';
    const mimeType =
      typeof req.body?.mimeType === 'string' ? req.body.mimeType.trim() : '';
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';

    if (!imageBase64) {
      res.status(400).json({ error: 'Please upload an image to animate.' });
      return;
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      res.status(400).json({ error: 'Image must be JPEG, PNG, or WebP.' });
      return;
    }
    if (!prompt || prompt.length > 1000) {
      res.status(400).json({ error: 'Motion prompt must be between 1 and 1000 characters.' });
      return;
    }

    let aspectRatio;
    try {
      aspectRatio = validateAspectRatio(req.body?.aspectRatio ?? '16:9');
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid aspect ratio.',
      });
      return;
    }

    let jobId: number | null = null;
    try {
      const createdJob = await createVideoJobForUser({
        userId: req.dbUser!.id,
        prompt,
        aspectRatio,
        status: 'processing',
      });
      jobId = createdJob.id;

      const result = await runImageToVideo({
        imageBase64,
        mimeType,
        prompt,
        aspectRatio,
      });

      await updateVideoJobStatus({
        jobId,
        status: 'completed',
      });

      res.json({
        jobId,
        mimeType: result.mimeType,
        videoBase64: result.videoBase64,
      });
    } catch (error) {
      const formatted = formatUpstreamAiError(error);
      if (jobId !== null) {
        try {
          await updateVideoJobStatus({
            jobId,
            status: 'failed',
            errorMessage: formatted.message,
          });
        } catch {
          // Preserve primary AI error
        }
      }
      res.status(formatted.statusCode).json({
        error: formatted.message,
        requiresPaidKey: formatted.requiresPaidKey,
      });
    }
  });

  // Frontend Vite Dev Middleware or Static Production Serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname !== '/live') {
        socket.destroy();
        return;
      }

      const token = url.searchParams.get('token')?.trim() || '';
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      await verifyVerifiedStudentToken(token);
      const requestedVoice = url.searchParams.get('voice') || 'Zephyr';
      const voiceName = ALLOWED_LIVE_VOICES.has(requestedVoice)
        ? requestedVoice
        : 'Zephyr';

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, voiceName);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', async (clientWs: WebSocket, _req: http.IncomingMessage, voiceName: string) => {
    let session: Awaited<ReturnType<ReturnType<typeof getAiClient>['live']['connect']>> | null =
      null;
    let closed = false;

    const sendJson = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    try {
      const ai = getAiClient();
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            'You are Campus Market’s voice shopping assistant for students in Ghana. Help students price used campus gear in Ghana cedis (GHS), draft concise listing descriptions, and plan safe daylight campus meetups. Speak naturally and concisely.',
        },
        callbacks: {
          onopen: () => {
            sendJson({ ready: true });
          },
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              sendJson({ inputTranscript: content.inputTranscription.text });
            }
            if (content?.outputTranscription?.text) {
              sendJson({ outputTranscript: content.outputTranscription.text });
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                sendJson({ audio: part.inlineData.data });
              }
            }
            if (content?.interrupted) {
              sendJson({ interrupted: true });
            }
            if (content?.turnComplete) {
              sendJson({ turnComplete: true });
            }
          },
          onerror: (err: unknown) => {
            const formatted = formatUpstreamAiError(err);
            sendJson({ error: formatted.message });
          },
          onclose: () => {
            if (!closed && clientWs.readyState === WebSocket.OPEN) {
              clientWs.close();
            }
          },
        },
      });
    } catch (error) {
      const formatted = formatUpstreamAiError(error);
      sendJson({ error: formatted.message });
      clientWs.close();
      return;
    }

    clientWs.on('message', (raw) => {
      if (!session || closed) return;
      try {
        const parsed = JSON.parse(raw.toString()) as {
          audio?: string;
          text?: string;
        };
        if (typeof parsed.audio === 'string' && parsed.audio.length > 0) {
          session.sendRealtimeInput({
            audio: {
              data: parsed.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (typeof parsed.text === 'string' && parsed.text.trim().length > 0) {
          session.sendRealtimeInput({
            text: parsed.text.trim(),
          });
        }
      } catch {
        // Ignore malformed client audio frames
      }
    });

    const cleanup = () => {
      if (closed) return;
      closed = true;
      try {
        session?.close();
      } catch {
        // Ignore close errors
      }
      session = null;
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Campus Market server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
