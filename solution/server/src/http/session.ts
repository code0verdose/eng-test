import type { FastifyReply, FastifyRequest } from 'fastify';

import { userBySession, type AuthDeps } from '../application/auth.use-cases.js';
import { AppError } from '../application/errors.js';
import type { User } from '../application/ports.js';

export const SESSION_COOKIE = 'guss_session';

export interface CookieSettings {
  secure: boolean;
  ttlMs: number;
}

export function setSessionCookie(reply: FastifyReply, token: string, settings: CookieSettings): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: settings.secure,
    path: '/',
    maxAge: Math.floor(settings.ttlMs / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** The current user, or 401. The session is looked up in the database, so any instance can serve it. */
export async function requireUser(request: FastifyRequest, deps: Pick<AuthDeps, 'sessions' | 'tokens'>): Promise<User> {
  const token = request.cookies[SESSION_COOKIE];
  const user = token ? await userBySession(deps, token) : null;
  if (!user) throw new AppError('unauthorized', 'Нужно войти');
  return user;
}
