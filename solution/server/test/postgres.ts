import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { connect, type Database } from '../src/infrastructure/db/client.js';
import { migrate } from '../src/infrastructure/db/migrate.js';

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));

export interface TestDatabase {
  url: string;
  db: Database;
  pool: pg.Pool;
  stop: () => Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A throwaway PostgreSQL 16 in Docker, or TEST_DATABASE_URL if set (CI service container).
 * Real database on purpose: the atomicity of a tap is a property of SQL, a fake would prove nothing.
 */
export async function startPostgres(): Promise<TestDatabase> {
  let url = process.env.TEST_DATABASE_URL;
  let containerId: string | undefined;

  if (!url) {
    containerId = execFileSync('docker', [
      'run', '-d', '--rm', '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_DB=guss', '-p', '127.0.0.1::5432', 'postgres:16-alpine',
    ]).toString().trim();
    const port = execFileSync('docker', ['port', containerId, '5432/tcp']).toString().trim().split(':').pop();
    url = `postgresql://postgres:test@127.0.0.1:${port}/guss`;
  }

  for (let attempt = 0; ; attempt += 1) {
    const probe = new pg.Client({ connectionString: url });
    try {
      await probe.connect();
      await probe.end();
      break;
    } catch (error) {
      await probe.end().catch(() => undefined);
      if (attempt > 60) throw error;
      await sleep(500);
    }
  }

  const { db, pool } = connect(url, { onError: () => undefined });
  await migrate(pool, MIGRATIONS);
  return {
    url,
    db,
    pool,
    stop: async () => {
      await pool.end();
      if (containerId) execFileSync('docker', ['rm', '-f', containerId]);
    },
  };
}

export { MIGRATIONS };
