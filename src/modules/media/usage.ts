import type { Payload } from 'payload'

/**
 * The single write seam for `media-usages` rows (RC2-H-03).
 *
 * A usage row is identified by its `usageKey`. Writing the same key twice
 * updates the existing row instead of creating a second one. Callers keep
 * ownership of their field semantics (usageKey scheme, purpose, lifecycle);
 * this seam owns only the find-by-usageKey → update-or-create mechanics
 * that the media workflow, graphics, and profile writers previously
 * hand-rolled — one with upsert semantics, two with bare creates that
 * could duplicate the row on a repeat write.
 */
export async function recordMediaUsage(
  payload: Payload,
  data: Record<string, unknown> & { usageKey: string },
): Promise<void> {
  const existing = await payload.find({
    collection: 'media-usages',
    where: { usageKey: { equals: data.usageKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const usage = (existing.docs as unknown as { id: string }[])[0]
  if (usage)
    await payload.update({
      collection: 'media-usages',
      id: usage.id,
      data,
      overrideAccess: true,
    } as never)
  else await payload.create({ collection: 'media-usages', data, overrideAccess: true } as never)
}
