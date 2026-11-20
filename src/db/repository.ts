import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { chatMessages, chatSessions, meetupSpots, users, videoJobs } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string) {
  try {
    const result = await db
      .insert(users)
      .values({ uid, email })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Unable to load user profile right now.', { cause: error });
  }
}

export async function listChatSessionsForUser(userId: number) {
  try {
    return await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.userId, userId))
      .orderBy(desc(chatSessions.updatedAt));
  } catch (error) {
    console.error('Database query failed in listChatSessionsForUser:', error);
    throw new Error('Unable to load chat history right now.', { cause: error });
  }
}

export async function getChatSessionWithMessages(userId: number, sessionId: number) {
  try {
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
      .limit(1);

    if (!session) return null;

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, session.id))
      .orderBy(chatMessages.createdAt, chatMessages.id);

    return { session, messages };
  } catch (error) {
    console.error('Database query failed in getChatSessionWithMessages:', error);
    throw new Error('Unable to load chat session right now.', { cause: error });
  }
}

export async function createChatSessionForUser(params: {
  userId: number;
  title: string;
  rolePreset: string;
  model: string;
}) {
  try {
    const [created] = await db
      .insert(chatSessions)
      .values({
        userId: params.userId,
        title: params.title,
        rolePreset: params.rolePreset,
        model: params.model,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createChatSessionForUser:', error);
    throw new Error('Unable to create chat session right now.', { cause: error });
  }
}

export async function appendChatTurn(params: {
  userId: number;
  sessionId: number;
  rolePreset: string;
  model: string;
  userMessage: string;
  modelReply: string;
}) {
  try {
    await db
      .update(chatSessions)
      .set({
        rolePreset: params.rolePreset,
        model: params.model,
        updatedAt: new Date(),
      })
      .where(and(eq(chatSessions.id, params.sessionId), eq(chatSessions.userId, params.userId)));

    const inserted = await db
      .insert(chatMessages)
      .values([
        {
          sessionId: params.sessionId,
          sender: 'user',
          content: params.userMessage,
          model: params.model,
        },
        {
          sessionId: params.sessionId,
          sender: 'model',
          content: params.modelReply,
          model: params.model,
        },
      ])
      .returning();

    return inserted;
  } catch (error) {
    console.error('Database query failed in appendChatTurn:', error);
    throw new Error('Unable to save chat messages right now.', { cause: error });
  }
}

export async function deleteChatSessionForUser(userId: number, sessionId: number) {
  try {
    const deleted = await db
      .delete(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
      .returning({ id: chatSessions.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Database query failed in deleteChatSessionForUser:', error);
    throw new Error('Unable to delete chat session right now.', { cause: error });
  }
}

export async function listMeetupSpotsForUser(userId: number) {
  try {
    return await db
      .select()
      .from(meetupSpots)
      .where(eq(meetupSpots.userId, userId))
      .orderBy(desc(meetupSpots.createdAt));
  } catch (error) {
    console.error('Database query failed in listMeetupSpotsForUser:', error);
    throw new Error('Unable to load saved meetup spots right now.', { cause: error });
  }
}

export async function createMeetupSpotForUser(params: {
  userId: number;
  name: string;
  address: string;
  placeUri?: string | null;
  lat: number;
  lng: number;
  notes?: string | null;
}) {
  try {
    const [created] = await db
      .insert(meetupSpots)
      .values({
        userId: params.userId,
        name: params.name,
        address: params.address,
        placeUri: params.placeUri ?? null,
        lat: params.lat,
        lng: params.lng,
        notes: params.notes ?? null,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createMeetupSpotForUser:', error);
    throw new Error('Unable to save meetup spot right now.', { cause: error });
  }
}

export async function deleteMeetupSpotForUser(userId: number, spotId: number) {
  try {
    const deleted = await db
      .delete(meetupSpots)
      .where(and(eq(meetupSpots.id, spotId), eq(meetupSpots.userId, userId)))
      .returning({ id: meetupSpots.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Database query failed in deleteMeetupSpotForUser:', error);
    throw new Error('Unable to delete meetup spot right now.', { cause: error });
  }
}

export async function listVideoJobsForUser(userId: number) {
  try {
    return await db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.userId, userId))
      .orderBy(desc(videoJobs.createdAt));
  } catch (error) {
    console.error('Database query failed in listVideoJobsForUser:', error);
    throw new Error('Unable to load video job history right now.', { cause: error });
  }
}

export async function createVideoJobForUser(params: {
  userId: number;
  prompt: string;
  aspectRatio: string;
  status: string;
  errorMessage?: string | null;
}) {
  try {
    const [created] = await db
      .insert(videoJobs)
      .values({
        userId: params.userId,
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        status: params.status,
        errorMessage: params.errorMessage ?? null,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createVideoJobForUser:', error);
    throw new Error('Unable to record video generation job right now.', { cause: error });
  }
}

export async function updateVideoJobStatus(params: {
  jobId: number;
  status: string;
  errorMessage?: string | null;
}) {
  try {
    const [updated] = await db
      .update(videoJobs)
      .set({
        status: params.status,
        errorMessage: params.errorMessage ?? null,
      })
      .where(eq(videoJobs.id, params.jobId))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database query failed in updateVideoJobStatus:', error);
    throw new Error('Unable to update video job status right now.', { cause: error });
  }
}
