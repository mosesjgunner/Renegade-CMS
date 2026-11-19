import type { Payload } from 'payload'

type QueryablePayload = Payload & {
  db: {
    pool?: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }
    drizzle?: { execute: (text: string, values?: unknown[]) => Promise<{ rows?: unknown[] }> }
  }
}

/**
 * Shared raw-SQL read/write helper for the community modules whose
 * stores are plain tables (outbox, subscriptions, sanctions, audit).
 * Extracted from comment-composer (RC2-DEBT-20) so module layering
 * stays acyclic: every community module may import this leaf.
 */
export async function executeDbQuery<T = Record<string, unknown>>(
  payload: Payload,
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const queryable = payload as unknown as QueryablePayload
  if (queryable.db?.pool?.query) {
    return (await queryable.db.pool.query(text, values)).rows as T[]
  }
  if (queryable.db?.drizzle?.execute) {
    const res = await queryable.db.drizzle.execute(text, values)
    const rows = (res.rows ?? res) as T[]
    return rows
  }
  throw new Error('Database adapter query execution not available')
}
