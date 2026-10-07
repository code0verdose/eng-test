import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  ROUND_DURATION: z.coerce.number().int().positive(),
  COOLDOWN_DURATION: z.coerce.number().int().nonnegative(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(24),
  // Number of reverse proxies in front of the app; 0 means X-Forwarded-For is not trusted.
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
});

export type Config = z.output<typeof envSchema>;

/** Read once at startup; a missing or malformed variable stops the process with a clear message. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  return parsed.data;
}
