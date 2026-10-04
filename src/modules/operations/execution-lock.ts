import type { Payload } from 'payload'

/** Session locks serialize side effects across web and worker processes and die with the process. */
export async function withExecutionLock<T>(
  payload: Payload,
  key: string,
  execute: () => Promise<T>,
): Promise<T> {
  const pool = (
    payload.db as unknown as
      | {
          pool?: {
            connect: () => Promise<{
              query: (sql: string, values: unknown[]) => Promise<unknown>
              release: () => void
            }>
          }
        }
      | undefined
  )?.pool
  // Non-database contract tests supply an in-memory Payload double.
  if (!pool) return execute()
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key])
    return await execute()
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key])
    } finally {
      client.release()
    }
  }
}
