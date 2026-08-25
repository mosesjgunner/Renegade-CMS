export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    readonly status: number,
    readonly correlationId: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(safeMessage)
    this.name = 'AppError'
  }
}

export function publicError(error: unknown, correlationId: string) {
  if (error instanceof AppError) {
    return { code: error.code, message: error.safeMessage, correlationId }
  }
  return { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', correlationId }
}
