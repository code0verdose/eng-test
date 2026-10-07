import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AuthDeps } from '../../application/auth.use-cases.js';
import { createRound, getRound, listRounds, tap, type RoundsDeps } from '../../application/rounds.use-cases.js';
import { requireUser } from '../session.js';

const roundParams = z.object({ id: z.uuid('Раунд не найден') });

/** serverTime lets the client run its countdown against the database clock, not its own. */
export function roundsRoutes(app: FastifyInstance, deps: RoundsDeps, auth: Pick<AuthDeps, 'sessions' | 'tokens'>): void {
  app.get('/api/rounds', async (request) => {
    await requireUser(request, auth);
    const { rounds, now } = await listRounds(deps);
    return { rounds, serverTime: now };
  });

  app.post('/api/rounds', async (request, reply) => {
    const user = await requireUser(request, auth);
    const { round, now } = await createRound(deps, user);
    return reply.status(201).send({ round, serverTime: now });
  });

  app.get('/api/rounds/:id', async (request) => {
    const user = await requireUser(request, auth);
    const { id } = roundParams.parse(request.params);
    const { round, now, myScore, summary } = await getRound(deps, user, id);
    return { round, myScore, summary, serverTime: now };
  });

  app.post('/api/rounds/:id/taps', async (request) => {
    const user = await requireUser(request, auth);
    const { id } = roundParams.parse(request.params);
    return tap(deps, user, id);
  });
}
