import type { Role } from '../domain/role.js';

export interface User {
  id: string;
  username: string;
  role: Role;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface UserRepository {
  findByUsername(username: string): Promise<UserWithPassword | null>;
  /** Creates the user unless one with this username appeared concurrently; returns the stored one. */
  createIfAbsent(input: { username: string; passwordHash: string; role: Role }): Promise<UserWithPassword>;
}

export interface SessionRepository {
  create(input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<void>;
  findUser(tokenHash: string): Promise<User | null>;
  delete(tokenHash: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export interface TokenService {
  /** A new random session token and the hash that is stored instead of it. */
  issue(): { token: string; tokenHash: string };
  hash(token: string): string;
}

export interface Round {
  id: string;
  startAt: Date;
  endAt: Date;
  createdAt: Date;
}

export interface RoundSummary {
  totalScore: number;
  winner: { username: string; score: number } | null;
}

/** Every timestamp comes from the database clock, shared by all backend instances. */
export interface RoundRepository {
  create(input: { cooldownSeconds: number; durationSeconds: number }): Promise<{ round: Round; now: Date }>;
  listNotFinished(): Promise<{ rounds: Round[]; now: Date }>;
  find(roundId: string): Promise<{ round: Round; now: Date } | null>;
  scoreOf(roundId: string, userId: string): Promise<number>;
  summary(roundId: string): Promise<RoundSummary>;
  /**
   * Counts one tap atomically, only while the round is active by the database clock.
   * Returns the player's new score, or why the tap was refused.
   */
  tap(roundId: string, userId: string): Promise<{ ok: true; score: number } | { ok: false; reason: 'not_found' | 'not_active' }>;
}
