import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type pg from 'pg';

/** Any fixed number shared by all instances; only one of them applies migrations at a time. */
const MIGRATION_LOCK_ID = 7_421_001;

/**
 * Applies migrations/*.sql in name order, each in its own transaction.
 * An advisory lock makes it safe to start several backend instances at once.
 */
export async function migrate(pool: pg.Pool, directory: string): Promise<string[]> {
  const client = await pool.connect();
  try {
    // The pool's statement_timeout is for requests; a migration or the wait for another
    // instance's migration may legitimately take longer.
    await client.query('SET statement_timeout = 0');
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const applied = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((row) => row.name),
    );
    const pending = (await readdir(directory)).filter((name) => name.endsWith('.sql') && !applied.has(name)).sort();

    for (const name of pending) {
      const sqlText = await readFile(join(directory, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sqlText);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return pending;
  } finally {
    const unlockError = await client
      .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID])
      .then(() => undefined, (error: unknown) => (error instanceof Error ? error : new Error(String(error))));
    if (!unlockError) await client.query('RESET statement_timeout').catch(() => undefined);
    // A connection that failed to unlock is discarded instead of going back to the pool.
    client.release(unlockError);
  }
}
