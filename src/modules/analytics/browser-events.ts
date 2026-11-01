import type { Payload } from 'payload'
import { randomUUID } from 'node:crypto'
import { loadConfig } from '../core/config'
import { withExecutionLock } from '../operations/execution-lock'
import {
  analyticsSubjectHash,
  isInternalAnalyticsActor,
  browserPrivacySignals,
  hasCurrentAnalyticsConsent,
  privacyPolicyFromSettings,
  readConsent,
} from './privacy'
import { isBotOrInternal, type EventType } from './contracts'
import { PayloadAnalyticsEventStore } from './service'

/** Called only after the canonical workflow has returned a persisted outcome; no answers or PII enter analytics. */
export async function recordBrowserOutcome(
  payload: Payload,
  request: Request,
  siteId: string,
  outcome: { id: string; eventType: EventType; collection: string },
) {
  if (await isInternalAnalyticsActor(payload, request)) return
  const runtime = loadConfig()
  const consent = readConsent(request.headers.get('cookie'), runtime.payloadSecret)
  if (
    !consent ||
    isBotOrInternal({
      userAgent: request.headers.get('user-agent') ?? undefined,
      internal: request.headers.get('x-renegade-internal') === '1',
    })
  )
    return
  return withExecutionLock(payload, `analytics.subject:${siteId}:${consent.subject}`, async () => {
    const policy = privacyPolicyFromSettings(
      await payload.findGlobal({ slug: 'site-settings', overrideAccess: true }),
    )
    if (
      !(await hasCurrentAnalyticsConsent(
        payload,
        consent,
        siteId,
        runtime.payloadSecret,
        policy,
        browserPrivacySignals(request.headers),
      ))
    )
      return
    const now = new Date().toISOString()
    return new PayloadAnalyticsEventStore(payload).record(
      {
        id: randomUUID(),
        eventType: outcome.eventType,
        occurredAt: now,
        receivedAt: now,
        identity: { anonymousId: analyticsSubjectHash(consent, siteId, runtime.payloadSecret) },
        context: { siteId, sourceEventId: `${outcome.collection}:${outcome.id}` },
        consentBasis: 'analytics-consent',
        schemaVersion: 1,
        trusted: true,
        dedupeKey: '',
        properties: {
          source: outcome.collection,
          canonicalOutcomeId: outcome.id,
          grain: 'canonical-outcome',
          reconciliation: 'persisted',
        },
      },
      policy.rawEventRetentionDays,
    )
  })
}
