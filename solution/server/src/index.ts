import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.js';
import { buildApp } from './http/app.js';
import { connect } from './infrastructure/db/client.js';
import { migrate } from './infrastructure/db/migrate.js';
import { roundRepository, sessionRepository, userRepository } from './infrastructure/repositories.js';
import { scryptHasher, sessionTokens } from './infrastructure/security.js';

/** Composition root: the only place that knows which implementation stands behind each port. */
async function main(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env file: variables come from the environment (Docker, CI).
  }
  const config = loadConfig(process.env);
  const { db, pool } = connect(config.DATABASE_URL, {
    onError: (error) => console.warn('Idle database connection failed, it will be replaced:', error.message),
  });
  await migrate(pool, fileURLToPath(new URL('../migrations', import.meta.url)));

  const sessionTtlMs = config.SESSION_TTL_HOURS * 3_600_000;
  const auth = {
    users: userRepository(db),
    sessions: sessionRepository(db),
    hasher: scryptHasher,
    tokens: sessionTokens,
    sessionTtlMs,
    now: () => new Date(),
  };
  const app = await buildApp({
    auth,
    rounds: {
      rounds: roundRepository(db),
      cooldownSeconds: config.COOLDOWN_DURATION,
      durationSeconds: config.ROUND_DURATION,
    },
    cookie: { secure: config.COOKIE_SECURE, ttlMs: sessionTtlMs },
    corsOrigin: config.CORS_ORIGIN,
    logger: true,
    trustProxyHops: config.TRUST_PROXY_HOPS,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down: finishing requests in flight');
    // In-flight requests finish first; a hung one does not keep the process forever.
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: '0.0.0.0', port: config.PORT });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
