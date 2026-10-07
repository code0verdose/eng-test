import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface ConnectOptions {
  /** Called when an idle connection breaks (database restart, failover, network drop). */
  onError?: (error: Error) => void;
}

export function connect(databaseUrl: string, options: ConnectOptions = {}): { db: Database; pool: pg.Pool } {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    // A database that stops answering must not hang requests forever.
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
  // Without a listener an idle connection error crashes the process. The pool already drops
  // the broken client; the next query takes a fresh one.
  pool.on('error', (error) => options.onError?.(error));
  return { db: drizzle(pool, { schema }), pool };
}
