import { describe, expect, it, vi } from 'vitest';

import { login, logout, userBySession, type AuthDeps } from '../src/application/auth.use-cases.js';
import { AppError } from '../src/application/errors.js';
import type { Round, RoundRepository, SessionRepository, User, UserRepository, UserWithPassword } from '../src/application/ports.js';
import { createRound, getRound, listRounds, tap, type RoundsDeps } from '../src/application/rounds.use-cases.js';

const NOW = new Date('2026-01-01T00:00:00Z');

function authDeps(): AuthDeps & { stored: Map<string, UserWithPassword>; sessionUsers: Map<string, string> } {
  const stored = new Map<string, UserWithPassword>();
  const sessionUsers = new Map<string, string>();
  const users: UserRepository = {
    findByUsername: async (username) => stored.get(username) ?? null,
    createIfAbsent: async (input) => {
      const user = stored.get(input.username) ?? { id: `id-${input.username}`, ...input };
      stored.set(input.username, user);
      return user;
    },
  };
  const sessions: SessionRepository = {
    create: async ({ tokenHash, userId }) => void sessionUsers.set(tokenHash, userId),
    findUser: async (tokenHash) => {
      const id = sessionUsers.get(tokenHash);
      const user = [...stored.values()].find((candidate) => candidate.id === id);
      return user ? { id: user.id, username: user.username, role: user.role } : null;
    },
    delete: async (tokenHash) => void sessionUsers.delete(tokenHash),
  };
  let counter = 0;
  return {
    stored,
    sessionUsers,
    users,
    sessions,
    hasher: { hash: async (p) => `hashed:${p}`, verify: async (p, h) => h === `hashed:${p}` },
    tokens: {
      issue: () => {
        counter += 1;
        return { token: `t${counter}`, tokenHash: `h:t${counter}` };
      },
      hash: (token) => `h:${token}`,
    },
    sessionTtlMs: 1000,
    now: () => NOW,
  };
}

describe('auth', () => {
  it('creates the user on first login with the role from the name and opens a session', async () => {
    const deps = authDeps();

    const { user, token } = await login(deps, 'admin', 'secret');

    expect(user).toEqual({ id: 'id-admin', username: 'admin', role: 'admin' });
    expect(await userBySession(deps, token)).toEqual(user);
  });

  it('assigns nikita and survivor roles', async () => {
    const deps = authDeps();
    expect((await login(deps, 'Никита', 'x')).user.role).toBe('nikita');
    expect((await login(deps, 'Вася', 'x')).user.role).toBe('survivor');
  });

  it('rejects a wrong password for an existing user and opens no session', async () => {
    const deps = authDeps();
    await login(deps, 'Вася', 'right');
    const sessionsBefore = deps.sessionUsers.size;

    await expect(login(deps, 'Вася', 'wrong')).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(deps.sessionUsers.size).toBe(sessionsBefore);
  });

  it('opens the session for the configured lifetime', async () => {
    const deps = authDeps();
    const create = vi.spyOn(deps.sessions, 'create');

    await login(deps, 'Вася', 'x');

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: new Date(NOW.getTime() + 1000) }));
  });

  it('forgets the session on logout', async () => {
    const deps = authDeps();
    const { token } = await login(deps, 'Вася', 'x');

    await logout(deps, token);

    expect(await userBySession(deps, token)).toBeNull();
  });
});

const survivor: User = { id: 'u1', username: 'Вася', role: 'survivor' };
const nikita: User = { id: 'u2', username: 'Никита', role: 'nikita' };
const admin: User = { id: 'u3', username: 'admin', role: 'admin' };

const roundAt = (startOffsetSec: number, endOffsetSec: number): Round => ({
  id: 'r1',
  startAt: new Date(NOW.getTime() + startOffsetSec * 1000),
  endAt: new Date(NOW.getTime() + endOffsetSec * 1000),
  createdAt: NOW,
});

function roundsDeps(round: Round | null, overrides: Partial<RoundRepository> = {}): RoundsDeps & { repo: RoundRepository } {
  const repo: RoundRepository = {
    create: vi.fn(async () => ({ round: roundAt(30, 90), now: NOW })),
    listNotFinished: async () => ({ rounds: round ? [round] : [], now: NOW }),
    find: async () => (round ? { round, now: NOW } : null),
    scoreOf: async () => 7,
    summary: async () => ({ totalScore: 100, winner: { username: 'Вася', score: 60 } }),
    tap: vi.fn(async () => ({ ok: true as const, score: 1 })),
    ...overrides,
  };
  return { repo, rounds: repo, cooldownSeconds: 30, durationSeconds: 60 };
}

describe('rounds', () => {
  it('lets only an admin create a round, with the configured durations', async () => {
    const deps = roundsDeps(null);

    await expect(createRound(deps, survivor)).rejects.toMatchObject({ code: 'forbidden' });
    const created = await createRound(deps, admin);

    expect(deps.repo.create).toHaveBeenCalledWith({ cooldownSeconds: 30, durationSeconds: 60 });
    expect(created.round.status).toBe('cooldown');
  });

  it('lists rounds with their status by the database clock', async () => {
    const { rounds } = await listRounds(roundsDeps(roundAt(-10, 50)));
    expect(rounds.map((round) => round.status)).toEqual(['active']);
  });

  it('shows the summary only for a finished round', async () => {
    expect((await getRound(roundsDeps(roundAt(-10, 50)), survivor, 'r1')).summary).toBeNull();
    expect((await getRound(roundsDeps(roundAt(-90, -30)), survivor, 'r1')).summary).toEqual({
      totalScore: 100,
      winner: { username: 'Вася', score: 60 },
    });
  });

  it('shows zero to Никита whatever is stored', async () => {
    expect((await getRound(roundsDeps(roundAt(-10, 50)), nikita, 'r1')).myScore).toBe(0);
    expect((await getRound(roundsDeps(roundAt(-10, 50)), survivor, 'r1')).myScore).toBe(7);
  });

  it('fails for an unknown round', async () => {
    await expect(getRound(roundsDeps(null), survivor, 'r1')).rejects.toBeInstanceOf(AppError);
    await expect(getRound(roundsDeps(null), survivor, 'r1')).rejects.toMatchObject({ code: 'round_not_found' });
  });

  it('counts a survivor tap through the atomic repository call', async () => {
    const deps = roundsDeps(roundAt(-10, 50));
    expect(await tap(deps, survivor, 'r1')).toEqual({ score: 1 });
    expect(deps.repo.tap).toHaveBeenCalledWith('r1', 'u1');
  });

  it('maps a refused tap to an error', async () => {
    const notActive = roundsDeps(roundAt(30, 90), { tap: async () => ({ ok: false, reason: 'not_active' }) });
    const missing = roundsDeps(null, { tap: async () => ({ ok: false, reason: 'not_found' }) });

    await expect(tap(notActive, survivor, 'r1')).rejects.toMatchObject({ code: 'round_not_active' });
    await expect(tap(missing, survivor, 'r1')).rejects.toMatchObject({ code: 'round_not_found' });
  });

  it('answers Никита like a survivor but never counts his tap', async () => {
    const active = roundsDeps(roundAt(-10, 50));
    expect(await tap(active, nikita, 'r1')).toEqual({ score: 0 });
    expect(active.repo.tap).not.toHaveBeenCalled();

    await expect(tap(roundsDeps(roundAt(30, 90)), nikita, 'r1')).rejects.toMatchObject({ code: 'round_not_active' });
  });
});
