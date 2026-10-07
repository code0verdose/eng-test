import type { z } from 'zod';

import { serverClock } from '../lib/server-clock';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

/**
 * The only place that talks to the backend. The response is validated with the schema,
 * and every serverTime it carries keeps the client clock in step with the database clock.
 */
export async function request<T extends z.ZodType>(path: string, schema: T, options: RequestOptions = {}): Promise<z.output<T>> {
  const init: RequestInit = { method: options.method ?? 'GET', credentials: 'include' };
  if (options.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(`/api${path}`, init);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(response.status, payload?.error?.code ?? 'unknown', payload?.error?.message ?? 'Что-то пошло не так');
  }
  if (response.status === 204) return schema.parse(undefined);

  const data = schema.parse(await response.json());
  if (data && typeof data === 'object' && 'serverTime' in data && data.serverTime instanceof Date) {
    serverClock.sync(data.serverTime);
  }
  return data;
}
