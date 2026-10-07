import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

import type { PasswordHasher, TokenService } from '../application/ports.js';

const SCRYPT: ScryptOptions = { N: 16_384, r: 8, p: 1 };
const KEY_LENGTH = 32;

const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, SCRYPT, (error, key) => (error ? reject(error) : resolve(key))),
  );

/** scrypt from node:crypto: no native addon to build, salt per password. Format: scrypt$salt$key. */
export const scryptHasher: PasswordHasher = {
  async hash(password) {
    const salt = randomBytes(16);
    const key = await derive(password, salt);
    return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
  },
  async verify(password, stored) {
    const [scheme, salt, key] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !key) return false;
    const expected = Buffer.from(key, 'base64url');
    const actual = await derive(password, Buffer.from(salt, 'base64url'));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  },
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const sessionTokens: TokenService = {
  issue() {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: sha256(token) };
  },
  hash: sha256,
};
