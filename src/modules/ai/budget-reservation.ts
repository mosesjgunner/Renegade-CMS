import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

type Pool = {
  query: (sql: string, values: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
}
const poolFor = (payload: Payload): Pool => (payload.db as typeof payload.db & { pool: Pool }).pool

export type AiBudgetLease = { id: string; reservedUsd: number; spentBeforeUsd: number }

/** One provider call per connection. The worst-case estimate is charged before dispatch.
 * A crashed process leaves that charge in place until an operator reviews it. */
export async function reserveAiBudget(
  payload: Payload,
  input: { connectionId: string; reserveUsd: number; perTaskUsd: number },
): Promise<{ status: 'reserved'; lease: AiBudgetLease } | { status: 'busy' | 'no-budget' }> {
  const reserveUsd = input.reserveUsd
  if (!Number.isFinite(reserveUsd) || reserveUsd < 0 || reserveUsd > input.perTaskUsd)
    return { status: 'no-budget' }
  const month = new Date().toISOString().slice(0, 7)
  const id = randomUUID()
  const result = await poolFor(payload).query(
    `
    UPDATE ai_connections SET
      budget_month = $2,
      spent_month_usd = (CASE WHEN budget_month = $2 THEN spent_month_usd ELSE 0 END) + $3,
      lease_until = now() + interval '60 seconds', lease_id = $4, leased_cost_usd = $3
    WHERE id = $1 AND (lease_until IS NULL OR lease_until < now())
      AND (CASE WHEN budget_month = $2 THEN spent_month_usd ELSE 0 END) + $3 <= monthly_usd
    RETURNING spent_month_usd
  `,
    [input.connectionId, month, reserveUsd, id],
  )
  if (result.rows[0])
    return {
      status: 'reserved',
      lease: {
        id,
        reservedUsd: reserveUsd,
        spentBeforeUsd: Number(result.rows[0].spent_month_usd) - reserveUsd,
      },
    }
  const state = await poolFor(payload).query(
    'SELECT lease_until FROM ai_connections WHERE id = $1',
    [input.connectionId],
  )
  return {
    status:
      state.rows[0]?.lease_until && Date.parse(String(state.rows[0].lease_until)) > Date.now()
        ? 'busy'
        : 'no-budget',
  }
}

export async function settleAiBudget(
  payload: Payload,
  connectionId: string,
  lease: AiBudgetLease,
  actualUsd: number | null,
): Promise<void> {
  // Unknown usage is charged at the reserved maximum. This is conservative for
  // failed and cancelled provider calls, which may still be billed remotely.
  const cost =
    actualUsd !== null && Number.isFinite(actualUsd) && actualUsd >= 0
      ? actualUsd
      : lease.reservedUsd
  await poolFor(payload).query(
    `
    UPDATE ai_connections SET
      spent_month_usd = greatest(0, spent_month_usd - leased_cost_usd + $3),
      lease_until = NULL, lease_id = NULL, leased_cost_usd = 0
    WHERE id = $1 AND lease_id = $2
  `,
    [connectionId, lease.id, cost],
  )
}
