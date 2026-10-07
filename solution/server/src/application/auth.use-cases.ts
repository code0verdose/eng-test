import { roleForUsername } from '../domain/role.js';
import { AppError } from './errors.js';
import type { PasswordHasher, SessionRepository, TokenService, User, UserRepository } from './ports.js';

export interface AuthDeps {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  tokens: TokenService;
  sessionTtlMs: number;
  now: () => Date;
}

/**
 * Logs in, creating the user on the first login; a wrong password for an existing user fails.
 * The session this browser had before is closed, so a re-login never leaves an orphan session.
 */
export async function login(
  deps: AuthDeps,
  username: string,
  password: string,
  previousToken?: string,
): Promise<{ user: User; token: string }> {
  const existing = await deps.users.findByUsername(username);
  const user =
    existing ??
    (await deps.users.createIfAbsent({
      username,
      passwordHash: await deps.hasher.hash(password),
      role: roleForUsername(username),
    }));

  if (!(await deps.hasher.verify(password, user.passwordHash))) {
    throw new AppError('invalid_credentials', 'Неверный пароль');
  }

  if (previousToken) await deps.sessions.delete(deps.tokens.hash(previousToken));
  const { token, tokenHash } = deps.tokens.issue();
  await deps.sessions.create({
    tokenHash,
    userId: user.id,
    expiresAt: new Date(deps.now().getTime() + deps.sessionTtlMs),
  });
  return { user: { id: user.id, username: user.username, role: user.role }, token };
}

export async function userBySession(deps: Pick<AuthDeps, 'sessions' | 'tokens'>, token: string): Promise<User | null> {
  return deps.sessions.findUser(deps.tokens.hash(token));
}

export async function logout(deps: Pick<AuthDeps, 'sessions' | 'tokens'>, token: string): Promise<void> {
  await deps.sessions.delete(deps.tokens.hash(token));
}
