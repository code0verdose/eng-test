import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { connect, type Database } from '../src/infrastructure/db/client.js';
import { migrate } from '../src/infrastructure/db/migrate.js';
import { roundRepository, userRepository } from '../src/infrastructure/repositories.js';
import { scoreForTaps } from '../src/domain/scoring.js';
import { MIGRATIONS, startPostgres, type TestDatabase } from './postgres.js';

let pg: TestDatabase;

beforeAll(async () => {
  pg = await startPostgres();
}, 120_000);

afterAll(async () => {
  await pg?.stop();
});

beforeEach(async () => {
  await pg.pool.query('TRUNCATE round_scores, rounds, sessions, users CASCADE');
});

async function makeUsers(count: number): Promise<string[]> {
  const users = userRepository(pg.db);
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    ids.push((await users.createIfAbsent({ username: `player${index}`, passwordHash: 'x', role: 'survivor' })).id);
  }
  return ids;
}

async function roundAt(startOffsetSec: number, endOffsetSec: number): Promise<string> {
  const created = Math.min(startOffsetSec, 0);
  const result = await pg.pool.query<{ id: string }>(
    `INSERT INTO rounds (created_at, start_at, end_at)
     VALUES (now() + make_interval(secs => $1), now() + make_interval(secs => $2), now() + make_interval(secs => $3))
     RETURNING id`,
    [created, startOffsetSec, endOffsetSec],
  );
  return result.rows[0]!.id;
}

describe('tap against PostgreSQL', () => {
  it('loses no tap and keeps the round total equal to the sum of scores under concurrency', async () => {
    const roundId = await roundAt(-5, 60);
    const players = await makeUsers(3);
    const tapsEach = 100;
    // Three pools stand for three backend instances sharing one database.
    const instances = [0, 1, 2].map(() => connect(pg.url, { onError: () => undefined }));
    try {
      await Promise.all(
        players.flatMap((userId, index) =>
          Array.from({ length: tapsEach }, () => roundRepository(instances[index % 3]!.db).tap(roundId, userId)),
        ),
      );
    } finally {
      await Promise.all(instances.map(({ pool }) => pool.end()));
    }

    const scores = await pg.pool.query<{ taps: number; score: number }>('SELECT taps, score FROM round_scores');
    expect(scores.rows).toHaveLength(3);
    for (const row of scores.rows) {
      expect(row.taps).toBe(tapsEach);
      expect(row.score).toBe(scoreForTaps(tapsEach));
    }
    const summary = await roundRepository(pg.db).summary(roundId);
    expect(summary.totalScore).toBe(3 * scoreForTaps(tapsEach));
  });

  it('returns the player score after each tap, with the bonus on every eleventh', async () => {
    const roundId = await roundAt(-5, 60);
    const [userId] = await makeUsers(1);
    const repo = roundRepository(pg.db);

    const scores: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const result = await repo.tap(roundId, userId!);
      if (result.ok) scores.push(result.score);
    }

    expect(scores).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20]);
  });

  it('refuses taps before the start and after the end, and for an unknown round', async () => {
    const [userId] = await makeUsers(1);
    const repo = roundRepository(pg.db);

    expect(await repo.tap(await roundAt(30, 90), userId!)).toEqual({ ok: false, reason: 'not_active' });
    expect(await repo.tap(await roundAt(-90, -30), userId!)).toEqual({ ok: false, reason: 'not_active' });
    expect(await repo.tap('00000000-0000-4000-8000-000000000000', userId!)).toEqual({ ok: false, reason: 'not_found' });
    expect((await pg.pool.query('SELECT 1 FROM round_scores')).rowCount).toBe(0);
  });

  it('accepts a tap exactly at start_at', async () => {
    const [userId] = await makeUsers(1);
    // now() is fixed for a transaction, so the round starts at the very moment of the tap.
    const result = await pg.db.transaction(async (tx) => {
      const inserted = await tx.execute<{ id: string }>(
        sql`INSERT INTO rounds (start_at, end_at) VALUES (now(), now() + interval '1 minute') RETURNING id`,
      );
      return roundRepository(tx as unknown as Database).tap(inserted.rows[0]!.id, userId!);
    });

    expect(result).toEqual({ ok: true, score: 1 });
  });

  it('names the alphabetically first player when scores are equal', async () => {
    const roundId = await roundAt(-5, 60);
    const repo = roundRepository(pg.db);
    const users = userRepository(pg.db);
    const boris = await users.createIfAbsent({ username: 'Борис', passwordHash: 'x', role: 'survivor' });
    const anna = await users.createIfAbsent({ username: 'Анна', passwordHash: 'x', role: 'survivor' });
    await repo.tap(roundId, boris.id);
    await repo.tap(roundId, anna.id);

    expect(await repo.summary(roundId)).toEqual({ totalScore: 2, winner: { username: 'Анна', score: 1 } });
  });

  it('sums up a round nobody tapped as zero with no winner', async () => {
    const roundId = await roundAt(-90, -30);

    expect(await roundRepository(pg.db).summary(roundId)).toEqual({ totalScore: 0, winner: null });
  });

  it('lists only rounds that are not finished, soonest first', async () => {
    const later = await roundAt(60, 120);
    const active = await roundAt(-5, 60);
    await roundAt(-90, -30);

    const { rounds } = await roundRepository(pg.db).listNotFinished();

    expect(rounds.map((round) => round.id)).toEqual([active, later]);
  });

  it('creates one user when the same new name logs in concurrently', async () => {
    const users = userRepository(pg.db);
    const created = await Promise.all(
      Array.from({ length: 10 }, () => users.createIfAbsent({ username: 'Вася', passwordHash: 'x', role: 'survivor' })),
    );

    expect(new Set(created.map((user) => user.id)).size).toBe(1);
  });

  it('survives the database dropping its connections and keeps serving', async () => {
    const instance = connect(pg.url, { onError: () => undefined });
    try {
      await instance.pool.query('SELECT 1');
      await pg.pool.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()',
      );
      await new Promise((resolve) => setTimeout(resolve, 200));

      const result = await instance.pool.query<{ ok: number }>('SELECT 1 AS ok');
      expect(result.rows[0]?.ok).toBe(1);
    } finally {
      await instance.pool.end();
    }
  });

  it('applies migrations once even when several instances start together', async () => {
    const instances = [0, 1, 2].map(() => connect(pg.url, { onError: () => undefined }));
    try {
      const applied = await Promise.all(instances.map(({ pool }) => migrate(pool, MIGRATIONS)));
      expect(applied.flat()).toEqual([]);
    } finally {
      await Promise.all(instances.map(({ pool }) => pool.end()));
    }
  });
});
