import { and, eq, gt, lt, sql } from 'drizzle-orm';

import { BONUS_TAP_EVERY, BONUS_TAP_POINTS } from '../domain/scoring.js';
import type { Round, RoundRepository, SessionRepository, UserRepository } from '../application/ports.js';
import type { Database } from './db/client.js';
import { rounds, sessions, users } from './db/schema.js';

const dbNow = async (db: Database): Promise<Date> => {
  const result = await db.execute<{ now: Date }>(sql`SELECT now() AS now`);
  return new Date(result.rows[0]!.now);
};

export function userRepository(db: Database): UserRepository {
  return {
    async findByUsername(username) {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user ?? null;
    },
    async createIfAbsent(input) {
      // Two first logins with the same name at once: one inserts, the other reads that row.
      await db.insert(users).values(input).onConflictDoNothing({ target: users.username });
      const [user] = await db.select().from(users).where(eq(users.username, input.username));
      return user!;
    },
  };
}

export function sessionRepository(db: Database): SessionRepository {
  return {
    async create(input) {
      // Housekeeping on every login keeps the table small without a background job.
      await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`));
      await db.insert(sessions).values(input);
    },
    async findUser(tokenHash) {
      const [row] = await db
        .select({ id: users.id, username: users.username, role: users.role })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, sql`now()`)));
      return row ?? null;
    },
    async delete(tokenHash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },
  };
}

const roundColumns = { id: rounds.id, startAt: rounds.startAt, endAt: rounds.endAt, createdAt: rounds.createdAt };

export function roundRepository(db: Database): RoundRepository {
  return {
    async create({ cooldownSeconds, durationSeconds }) {
      // Times come from the database clock, so every backend instance agrees on them.
      const [round] = await db
        .insert(rounds)
        .values({
          startAt: sql`now() + make_interval(secs => ${cooldownSeconds})`,
          endAt: sql`now() + make_interval(secs => ${cooldownSeconds + durationSeconds})`,
        })
        .returning(roundColumns);
      return { round: round!, now: await dbNow(db) };
    },

    async listNotFinished() {
      const list: Round[] = await db
        .select(roundColumns)
        .from(rounds)
        .where(gt(rounds.endAt, sql`now()`))
        .orderBy(rounds.startAt);
      return { rounds: list, now: await dbNow(db) };
    },

    async find(roundId) {
      const [round] = await db.select(roundColumns).from(rounds).where(eq(rounds.id, roundId));
      return round ? { round, now: await dbNow(db) } : null;
    },

    async scoreOf(roundId, userId) {
      const result = await db.execute<{ score: number }>(
        sql`SELECT score FROM round_scores WHERE round_id = ${roundId} AND user_id = ${userId}`,
      );
      return result.rows[0]?.score ?? 0;
    },

    async summary(roundId) {
      // One statement, so the total and the winner come from the same snapshot.
      const result = await db.execute<{ total_score: number; username: string | null; score: number | null }>(sql`
        SELECT r.total_score, best.username, best.score
        FROM rounds r
        LEFT JOIN LATERAL (
          SELECT u.username, s.score
          FROM round_scores s
          JOIN users u ON u.id = s.user_id
          WHERE s.round_id = r.id
          ORDER BY s.score DESC, u.username
          LIMIT 1
        ) best ON true
        WHERE r.id = ${roundId}`);
      const row = result.rows[0];
      return {
        totalScore: row?.total_score ?? 0,
        winner: row?.username != null && row.score != null ? { username: row.username, score: row.score } : null,
      };
    },

    /**
     * One statement, so it is atomic without an explicit transaction:
     * - the round must be active by the database clock at this moment;
     * - INSERT ... ON CONFLICT DO UPDATE locks the player's row, so concurrent taps
     *   of the same player are applied one after another and none is lost;
     * - the round total grows by exactly the points of this tap.
     * Works the same with any number of backend instances behind one database.
     */
    async tap(roundId, userId) {
      const result = await db.execute<{ score: number | null; round_exists: boolean }>(sql`
        WITH active AS (
          SELECT id FROM rounds
          WHERE id = ${roundId} AND now() >= start_at AND now() < end_at
        ),
        counted AS (
          INSERT INTO round_scores AS s (round_id, user_id, taps, score)
          SELECT id, ${userId}, 1, 1 FROM active
          ON CONFLICT (round_id, user_id) DO UPDATE
            SET taps = s.taps + 1,
                score = s.score + CASE WHEN (s.taps + 1) % ${BONUS_TAP_EVERY} = 0 THEN ${BONUS_TAP_POINTS} ELSE 1 END
          RETURNING taps, score
        ),
        total AS (
          UPDATE rounds
          SET total_score = total_score
            + (SELECT CASE WHEN taps % ${BONUS_TAP_EVERY} = 0 THEN ${BONUS_TAP_POINTS} ELSE 1 END FROM counted)
          WHERE id = ${roundId} AND EXISTS (SELECT 1 FROM counted)
        )
        SELECT (SELECT score FROM counted) AS score,
               EXISTS (SELECT 1 FROM rounds WHERE id = ${roundId}) AS round_exists`);
      const row = result.rows[0]!;
      if (row.score !== null) return { ok: true, score: row.score };
      return { ok: false, reason: row.round_exists ? 'not_active' : 'not_found' };
    },
  };
}
