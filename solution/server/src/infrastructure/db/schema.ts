import { integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import type { Role } from '../../domain/role.js';

/** Mirrors migrations/*.sql, which are the source of truth for the schema. */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<Role>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rounds = pgTable('rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  totalScore: integer('total_score').notNull().default(0),
});

export const roundScores = pgTable(
  'round_scores',
  {
    roundId: uuid('round_id').notNull(),
    userId: uuid('user_id').notNull(),
    taps: integer('taps').notNull().default(0),
    score: integer('score').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.roundId, table.userId] })],
);
