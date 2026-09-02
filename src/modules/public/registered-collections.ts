import type { Payload } from 'payload'

/**
 * Progressive modules mean the public renderer runs against installs where an
 * optional collection (books, events, products, forms, …) is not registered.
 * These helpers let always-on public paths query "only what Payload actually
 * knows about" and degrade to empty results instead of throwing a 500.
 */

export function isRegisteredCollection(payload: Payload, slug: string): boolean {
  const collections = payload.collections as Record<string, unknown> | undefined
  if (!collections) return true
  return Boolean(collections[slug])
}

/** Like `payload.find`, but returns `{ docs: [] }` when the collection is gated off. */
export async function findIfRegistered<T = unknown>(
  payload: Payload,
  args: Parameters<Payload['find']>[0],
): Promise<{ docs: T[] }> {
  if (!isRegisteredCollection(payload, String(args.collection))) return { docs: [] as T[] }
  return payload.find(args) as unknown as Promise<{ docs: T[] }>
}

/** Keep only the collection slugs that are actually registered on this install. */
export function registeredOnly<T extends string>(payload: Payload, slugs: readonly T[]): T[] {
  return slugs.filter((slug) => isRegisteredCollection(payload, slug))
}
