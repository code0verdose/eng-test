import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/http/app.js';
import { roundRepository, sessionRepository, userRepository } from '../src/infrastructure/repositories.js';
import { scryptHasher, sessionTokens } from '../src/infrastructure/security.js';
import { startPostgres, type TestDatabase } from './postgres.js';

let pg: TestDatabase;

beforeAll(async () => {
  pg = await startPostgres();
}, 120_000);

afterAll(async () => {
  await pg?.stop();
});

beforeEach(async () => {
  await pg.pool.query('TRUNCATE round_scores, rounds, sessions, users CASCADE');
});

async function app(cooldownSeconds: number, trustProxyHops = 0): Promise<FastifyInstance> {
  return buildApp({
    auth: {
      users: userRepository(pg.db),
      sessions: sessionRepository(pg.db),
      hasher: scryptHasher,
      tokens: sessionTokens,
      sessionTtlMs: 3_600_000,
      now: () => new Date(),
    },
    rounds: { rounds: roundRepository(pg.db), cooldownSeconds, durationSeconds: 60 },
    cookie: { secure: false, ttlMs: 3_600_000 },
    corsOrigin: 'http://localhost:5173',
    logger: false,
    trustProxyHops,
  });
}

async function loginAs(server: FastifyInstance, username: string, password = 'secret'): Promise<string> {
  const response = await server.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  expect(response.statusCode).toBe(200);
  const cookie = response.cookies.find((item) => item.name === 'guss_session');
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
  return `guss_session=${cookie!.value}`;
}

describe('HTTP API', () => {
  it('runs the whole game: admin creates a round, a survivor taps, the summary names the winner', async () => {
    const server = await app(0);
    const admin = await loginAs(server, 'admin');
    const vasya = await loginAs(server, 'Вася');

    const created = await server.inject({ method: 'POST', url: '/api/rounds', headers: { cookie: admin } });
    expect(created.statusCode).toBe(201);
    const roundId = created.json<{ round: { id: string; status: string } }>().round.id;

    for (let index = 0; index < 11; index += 1) {
      await server.inject({ method: 'POST', url: `/api/rounds/${roundId}/taps`, headers: { cookie: vasya } });
    }
    const round = await server.inject({ method: 'GET', url: `/api/rounds/${roundId}`, headers: { cookie: vasya } });
    expect(round.json()).toMatchObject({ round: { status: 'active' }, myScore: 20, summary: null });

    await pg.pool.query("UPDATE rounds SET end_at = now() - interval '1 second', start_at = now() - interval '2 seconds', created_at = now() - interval '3 seconds'");
    const finished = await server.inject({ method: 'GET', url: `/api/rounds/${roundId}`, headers: { cookie: vasya } });
    expect(finished.json()).toMatchObject({
      round: { status: 'finished' },
      myScore: 20,
      summary: { totalScore: 20, winner: { username: 'Вася', score: 20 } },
    });
    await server.close();
  });

  it('shows Никита zeros: his taps answer normally but are never counted', async () => {
    const server = await app(0);
    const admin = await loginAs(server, 'admin');
    const nikita = await loginAs(server, 'Никита');
    const roundId = (await server.inject({ method: 'POST', url: '/api/rounds', headers: { cookie: admin } })).json<{
      round: { id: string };
    }>().round.id;

    const tapResponse = await server.inject({ method: 'POST', url: `/api/rounds/${roundId}/taps`, headers: { cookie: nikita } });

    expect(tapResponse.statusCode).toBe(200);
    expect(tapResponse.json()).toEqual({ score: 0 });
    expect((await pg.pool.query('SELECT 1 FROM round_scores')).rowCount).toBe(0);
    await server.close();
  });

  it('rejects a wrong password with a message for the form', async () => {
    const server = await app(0);
    await loginAs(server, 'Вася', 'right');

    const response = await server.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'Вася', password: 'wrong' } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: 'invalid_credentials', message: 'Неверный пароль' } });
    await server.close();
  });

  it('guards the endpoints: no session, not an admin, cooldown, unknown or malformed round', async () => {
    const server = await app(30);
    const admin = await loginAs(server, 'admin');
    const vasya = await loginAs(server, 'Вася');
    const roundId = (await server.inject({ method: 'POST', url: '/api/rounds', headers: { cookie: admin } })).json<{
      round: { id: string };
    }>().round.id;

    expect((await server.inject({ method: 'GET', url: '/api/rounds' })).statusCode).toBe(401);
    expect((await server.inject({ method: 'POST', url: '/api/rounds', headers: { cookie: vasya } })).statusCode).toBe(403);
    expect(
      (await server.inject({ method: 'POST', url: `/api/rounds/${roundId}/taps`, headers: { cookie: vasya } })).statusCode,
    ).toBe(409);
    expect(
      (await server.inject({ method: 'GET', url: '/api/rounds/00000000-0000-4000-8000-000000000000', headers: { cookie: vasya } }))
        .statusCode,
    ).toBe(404);
    expect((await server.inject({ method: 'GET', url: '/api/rounds/not-a-uuid', headers: { cookie: vasya } })).statusCode).toBe(400);
    await server.close();
  });

  it('treats an expired session as no session', async () => {
    const server = await app(0);
    await loginAs(server, 'Вася');
    const { id: userId } = (await pg.pool.query<{ id: string }>("SELECT id FROM users WHERE username = 'Вася'")).rows[0]!;
    const { token, tokenHash } = sessionTokens.issue();
    await sessionRepository(pg.db).create({ tokenHash, userId, expiresAt: new Date(Date.now() - 1000) });

    const response = await server.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `guss_session=${token}` } });

    expect(response.statusCode).toBe(401);
    await server.close();
  });

  it('answers malformed requests with 4xx, not 500', async () => {
    const server = await app(0);

    const badJson = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{bad',
    });
    const form = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'username=a&password=b',
    });

    expect(badJson.statusCode).toBe(400);
    expect(badJson.json()).toMatchObject({ error: { code: 'bad_request' } });
    expect(form.statusCode).toBe(415);
    await server.close();
  });

  it('closes the previous session of this browser and clears expired ones on login', async () => {
    const server = await app(0);
    const first = await loginAs(server, 'Вася');
    const { id: userId } = (await pg.pool.query<{ id: string }>("SELECT id FROM users WHERE username = 'Вася'")).rows[0]!;
    await sessionRepository(pg.db).create({ tokenHash: 'expired', userId, expiresAt: new Date(Date.now() - 1000) });

    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { cookie: first },
      payload: { username: 'Вася', password: 'secret' },
    });

    expect(response.statusCode).toBe(200);
    expect((await server.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: first } })).statusCode).toBe(401);
    expect((await pg.pool.query('SELECT 1 FROM sessions')).rowCount).toBe(1);
    await server.close();
  });

  it('trusts X-Forwarded-For only from the configured number of proxies', async () => {
    const clientIp = async (hops: number) => {
      const server = await app(0, hops);
      server.get('/probe-ip', async (request) => ({ ip: request.ip }));
      const response = await server.inject({ method: 'GET', url: '/probe-ip', headers: { 'x-forwarded-for': '203.0.113.7' } });
      await server.close();
      return response.json<{ ip: string }>().ip;
    };

    expect(await clientIp(0)).not.toBe('203.0.113.7');
    expect(await clientIp(1)).toBe('203.0.113.7');
  });

  it('answers an unknown address in the common error shape', async () => {
    const server = await app(0);

    const response = await server.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: 'not_found', message: 'Нет такого адреса' } });
    await server.close();
  });

  it('logs out by deleting the session on the server', async () => {
    const server = await app(0);
    const cookie = await loginAs(server, 'Вася');

    await server.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });

    expect((await server.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
    await server.close();
  });
});
