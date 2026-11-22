/**
 * Application errors carry a stable machine code, an HTTP status and a message
 * that is safe to return to a browser. Internal details never leak.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYMENTS_DISABLED'
  | 'GATEWAY_ERROR'
  | 'GATEWAY_SIGNATURE_INVALID'
  | 'INVALID_TRANSITION'
  | 'REFUND_EXCEEDS_BALANCE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYMENTS_DISABLED: 503,
  GATEWAY_ERROR: 502,
  GATEWAY_SIGNATURE_INVALID: 401,
  INVALID_TRANSITION: 409,
  REFUND_EXCEEDS_BALANCE: 400,
  IDEMPOTENCY_CONFLICT: 409,
  INTERNAL: 500
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const badRequest = (message: string) => new AppError('BAD_REQUEST', message);
export const unauthorized = (message = 'Authentication required') =>
  new AppError('UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError('FORBIDDEN', message);
export const notFound = (message = 'Resource not found') => new AppError('NOT_FOUND', message);

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
