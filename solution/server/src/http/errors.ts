import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { AppError, type AppErrorCode } from '../application/errors.js';

const STATUS: Record<AppErrorCode, number> = {
  invalid_credentials: 401,
  unauthorized: 401,
  forbidden: 403,
  round_not_found: 404,
  round_not_active: 409,
  validation: 400,
};

/** One error shape for every endpoint: { error: { code, message } }. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: 'not_found', message: 'Нет такого адреса' } }),
  );
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(STATUS[error.code]).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: { code: 'validation', message: error.issues[0]?.message ?? 'Invalid request' } });
    }
    // Fastify's own errors (malformed JSON, wrong content type, body too large) are client errors.
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      request.log.info({ err: error }, 'bad request');
      return reply.status(statusCode).send({ error: { code: 'bad_request', message: 'Некорректный запрос' } });
    }
    request.log.error(error);
    return reply.status(500).send({ error: { code: 'internal', message: 'Internal error' } });
  });
}
