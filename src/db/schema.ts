import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chatSessions = pgTable('chat_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  rolePreset: text('role_preset').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id')
    .references(() => chatSessions.id, { onDelete: 'cascade' })
    .notNull(),
  sender: text('sender').notNull(),
  content: text('content').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const meetupSpots = pgTable('meetup_spots', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  placeUri: text('place_uri'),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const videoJobs = pgTable('video_jobs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  prompt: text('prompt').notNull(),
  aspectRatio: text('aspect_ratio').notNull(),
  status: text('status').notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  chatSessions: many(chatSessions),
  meetupSpots: many(meetupSpots),
  videoJobs: many(videoJobs),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [chatSessions.userId],
    references: [users.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));

export const meetupSpotsRelations = relations(meetupSpots, ({ one }) => ({
  user: one(users, {
    fields: [meetupSpots.userId],
    references: [users.id],
  }),
}));

export const videoJobsRelations = relations(videoJobs, ({ one }) => ({
  user: one(users, {
    fields: [videoJobs.userId],
    references: [users.id],
  }),
}));
