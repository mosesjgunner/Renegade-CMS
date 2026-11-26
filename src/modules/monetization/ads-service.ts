/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildAdsTxt, selectPlacement, type AdsTxtLine, type PlacementShape } from './ads'
import { relId } from './earn-service'

/**
 * RC3-CE first-party ad operations (CE-08).
 *
 * Rendering a slot is an explicit act by the site: the render
 * operation evaluates the site's placements for that slot, records
 * the delivery (first-party observation, labeled as such), and
 * returns the decision with its reason. Nothing renders anywhere the
 * site did not ask. ads.txt is generated only from connected
 * provider relationships the operator recorded on the connection.
 */

const siteWhere = (siteId: string) => ({ site: { equals: siteId } })

async function findAll(db: any, collection: string, siteId: string, limit = 1000): Promise<any[]> {
  const result = await db.find({
    collection,
    where: siteWhere(siteId),
    limit,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs as any[]
}

export async function createPlacement(db: any, siteId: string, data: Record<string, unknown>) {
  return db.create({
    collection: 'ad-placements',
    data: { ...data, site: siteId },
    depth: 0,
    overrideAccess: true,
  })
}

export async function renderSlot(
  db: any,
  siteId: string,
  input: {
    slot: string
    contentPaid?: boolean
    contentCategory?: string | null
    consentGranted?: boolean
    at?: string
  },
): Promise<{ decision: ReturnType<typeof selectPlacement>; deliveryId: string | null }> {
  const at = input.at ?? new Date().toISOString()
  const [placements, connections, deliveries] = await Promise.all([
    findAll(db, 'ad-placements', siteId),
    findAll(db, 'provider-connections', siteId),
    findAll(db, 'ad-deliveries', siteId),
  ])
  const connectedProviders = new Set(
    connections.filter((c) => c.status === 'connected').map((c) => String(c.providerId)),
  )
  const startOfDay = `${at.slice(0, 10)}T00:00:00.000Z`
  const impressionsTodayByPlacement: Record<string, number> = {}
  for (const delivery of deliveries) {
    if (String(delivery.deliveredAt ?? '') >= startOfDay) {
      const key = relId(delivery.placement) ?? ''
      impressionsTodayByPlacement[key] = (impressionsTodayByPlacement[key] ?? 0) + 1
    }
  }
  const shapes: PlacementShape[] = placements.map((p) => ({
    id: String(p.id),
    slot: String(p.slot),
    kind: p.kind,
    providerId: p.providerId ?? null,
    providerConnected: p.providerId ? connectedProviders.has(String(p.providerId)) : false,
    status: String(p.status),
    startsAt: p.startsAt ?? null,
    endsAt: p.endsAt ?? null,
    frequencyCapPerDay: p.frequencyCapPerDay ?? null,
    categoryExclusions: (p.categoryExclusions as string[]) ?? [],
    excludePaidContent: p.excludePaidContent !== false,
    requiresConsent: Boolean(p.requiresConsent),
  }))
  const decision = selectPlacement(shapes, {
    slot: input.slot,
    at,
    contentPaid: Boolean(input.contentPaid),
    contentCategory: input.contentCategory ?? null,
    consentGranted: Boolean(input.consentGranted),
    impressionsTodayByPlacement,
  })
  if (!decision.placementId) return { decision, deliveryId: null }
  const placement = placements.find((p) => String(p.id) === decision.placementId)
  const delivery = await db.create({
    collection: 'ad-deliveries',
    data: {
      site: siteId,
      placement: decision.placementId,
      slot: input.slot,
      kind: decision.kind,
      reason: decision.reason,
      context: {
        contentPaid: Boolean(input.contentPaid),
        contentCategory: input.contentCategory ?? null,
        firstPartyObservation: true,
      },
      deliveredAt: at,
    },
    depth: 0,
    overrideAccess: true,
  })
  void placement
  return { decision, deliveryId: String(delivery.id) }
}

/** ads.txt for the site, from connected connections' recorded seller lines only. */
export async function adsTxtForSite(db: any, siteId: string): Promise<string> {
  const connections = await findAll(db, 'provider-connections', siteId)
  const lines: AdsTxtLine[] = []
  for (const connection of connections) {
    if (connection.status !== 'connected') continue
    const recorded = (connection.evidenceByCapability as any)?.adsTxtLines
    if (!Array.isArray(recorded)) continue
    for (const line of recorded) {
      if (
        line &&
        typeof line.domain === 'string' &&
        typeof line.sellerId === 'string' &&
        (line.relationship === 'DIRECT' || line.relationship === 'RESELLER')
      )
        lines.push({
          domain: line.domain,
          sellerId: line.sellerId,
          relationship: line.relationship,
          tagId: typeof line.tagId === 'string' ? line.tagId : undefined,
        })
    }
  }
  return buildAdsTxt(lines)
}

export async function deliveryCounts(db: any, siteId: string): Promise<Record<string, number>> {
  const deliveries = await findAll(db, 'ad-deliveries', siteId)
  const counts: Record<string, number> = {}
  for (const delivery of deliveries) {
    const key = relId(delivery.placement) ?? 'unknown'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}
