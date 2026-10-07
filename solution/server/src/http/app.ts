import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';

import type { AuthDeps } from '../application/auth.use-cases.js';
import type { RoundsDeps } from '../application/rounds.use-cases.js';
import { registerErrorHandler } from './errors.js';
import { authRoutes } from './routes/auth.routes.js';
import { roundsRoutes } from './routes/rounds.routes.js';
import type { CookieSettings } from './session.js';

export interface AppDeps {
  auth: AuthDeps;
  rounds: RoundsDeps;
  cookie: CookieSettings;
  corsOrigin: string;
  logger: boolean;
  trustProxyHops?: number;
}

/** Builds the HTTP app from ready dependencies; tests pass in-memory ones. */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const hops = deps.trustProxyHops ?? 0;
  // Trust X-Forwarded-For only from the given number of proxies in front of the app.
  const app = Fastify({ logger: deps.logger, trustProxy: (_address, hop) => hop < hops });
  await app.register(cookie);
  await app.register(cors, { origin: deps.corsOrigin, credentials: true });
  registerErrorHandler(app);
  app.get('/api/health', async () => ({ ok: true }));
  authRoutes(app, deps.auth, deps.cookie);
  roundsRoutes(app, deps.rounds, deps.auth);
  return app;
}
