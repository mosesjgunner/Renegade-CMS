import type { Payload } from 'payload'

/** Serialize revision checks across web processes using the canonical PostgreSQL pool. */
export async function withLayoutWriteLock<T>(
  payload: Payload,
  id: string,
  work: () => Promise<T>,
): Promise<T> {
  const client = await payload.db.pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [`layout:${id}`])
    return await work()
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [`layout:${id}`])
    } finally {
      client.release()
    }
  }
}
