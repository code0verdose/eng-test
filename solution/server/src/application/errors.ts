export type AppErrorCode =
  | 'invalid_credentials'
  | 'unauthorized'
  | 'forbidden'
  | 'round_not_found'
  | 'round_not_active'
  | 'validation';

/** Expected business failure; the HTTP layer maps the code to a status. */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
