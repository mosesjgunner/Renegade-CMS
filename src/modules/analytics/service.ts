import type { Payload } from 'payload'

import { analyticsRetention, normalizeEvent, type FirstPartyEvent } from './contracts'

/** Canonical first-party analytics writer. Callers never create parallel event stores. */
export interface AnalyticsEventStore {
  record(event: FirstPartyEvent, rawRetentionDays?: number): Promise<{ event: FirstPartyEvent; deduplicated: boolean }>
}

type AnalyticsPayload = Pick<Payload, 'create' | 'find'>

export class PayloadAnalyticsEventStore implements AnalyticsEventStore {
  constructor(private readonly payload: AnalyticsPayload) {}

  async record(event: FirstPartyEvent, rawRetentionDays: number = analyticsRetention.rawDays) {
    const normalized = normalizeEvent(event)
    if (!normalized) return { event, deduplicated: true }
    const existing = await this.payload.find({
      collection: 'analytics-events',
      where: { dedupeKey: { equals: normalized.dedupeKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    if (existing.docs.length) return { event: normalized, deduplicated: true }
    await this.payload.create({
      collection: 'analytics-events',
      data: {
        site: normalized.context.siteId,
        eventId: normalized.id,
        dedupeKey: normalized.dedupeKey,
        eventType: normalized.eventType,
        occurredAt: normalized.occurredAt,
        receivedAt: normalized.receivedAt,
        schemaVersion: normalized.schemaVersion,
        consentBasis: normalized.consentBasis,
        anonymousHash: normalized.identity.anonymousId,
        sessionHash: normalized.identity.sessionId,
        member: normalized.identity.memberId,
        context: normalized.context,
        properties: normalized.properties,
        trusted: normalized.trusted,
        retentionMode: 'expire-at',
        retentionExpiresAt: new Date(new Date(normalized.receivedAt).getTime() + rawRetentionDays * 86_400_000).toISOString(),
      },
      overrideAccess: true,
    } as never)
    return { event: normalized, deduplicated: false }
  }
}
