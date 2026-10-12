import { sql } from 'drizzle-orm'
import type { Payload } from 'payload'

export function commerceTransactionPayload(
  payload: Payload,
  transactionID: string | number,
): Payload {
  const operations = new Set(['find', 'findByID', 'count', 'create', 'update', 'delete'])
  return new Proxy(payload, {
    get(target, property) {
      const value = Reflect.get(target, property)
      if (typeof value !== 'function') return value
      if (!operations.has(String(property))) return value.bind(target)
      return (input: Record<string, unknown>) =>
        value.call(target, {
          ...input,
          req: { ...((input.req as object) ?? {}), transactionID },
        })
    },
  })
}

function transactionDb(payload: Payload, transactionID: string | number) {
  const db = payload.db as unknown as {
    sessions?: Record<
      string,
      { db: { execute: (query: unknown) => Promise<{ rows: Record<string, unknown>[] }> } }
    >
  }
  const transaction = db.sessions?.[transactionID]?.db
  if (!transaction) throw new Error('Transactional inventory storage is unavailable.')
  return transaction
}

/** Sorted product locks serialize quotes and settlement without deadlocking multi-line carts. */
export async function lockCommerceStock(
  payload: Payload,
  transactionID: string | number,
  productIds: string[],
  cartId?: string,
) {
  const db = transactionDb(payload, transactionID)
  for (const productId of [...new Set(productIds)].sort())
    await db.execute(sql`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`)
  if (cartId) await db.execute(sql`SELECT id FROM carts WHERE id = ${cartId}::uuid FOR UPDATE`)
}

export async function reservedCommerceStock(
  payload: Payload,
  transactionID: string | number,
  productId: string,
  variantSku: string,
) {
  const result = await transactionDb(payload, transactionID).execute(sql`
    SELECT coalesce(sum(quantity), 0) AS reserved FROM inventory_reservations
    WHERE product_id = ${productId}::uuid AND variant_sku = ${variantSku}
      AND status = 'active' AND expires_at > now()`)
  return Number(result.rows[0]?.reserved ?? 0)
}

export class InventoryReservationError extends Error {
  readonly status = 409
}
