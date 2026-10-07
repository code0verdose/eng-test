import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { login, logout, type AuthDeps } from '../../application/auth.use-cases.js';
import { clearSessionCookie, requireUser, SESSION_COOKIE, setSessionCookie, type CookieSettings } from '../session.js';

const credentialsSchema = z.object({
  username: z.string().trim().min(1, 'Введите имя').max(32, 'Имя не длиннее 32 символов'),
  password: z.string().min(1, 'Введите пароль').max(128),
});

export function authRoutes(app: FastifyInstance, deps: AuthDeps, cookie: CookieSettings): void {
  app.post('/api/auth/login', async (request, reply) => {
    const { username, password } = credentialsSchema.parse(request.body);
    const { user, token } = await login(deps, username, password, request.cookies[SESSION_COOKIE]);
    setSessionCookie(reply, token, cookie);
    return { user };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await logout(deps, token);
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get('/api/auth/me', async (request) => ({ user: await requireUser(request, deps) }));
}
