import { getActivePublicExperiment } from '@/modules/experiences/public-experiment'
import { validatePublicEventAssignment } from '@/modules/experiences/event-assignment'
import { randomUUID } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { withExecutionLock } from '@/modules/operations/execution-lock'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
import { loadConfig } from '@/modules/core/config'
import { ANALYTICS_SCHEMA_VERSION, isBotOrInternal } from '@/modules/analytics/contracts'
import { PayloadAnalyticsEventStore } from '@/modules/analytics/service'
import {
  browserPrivacySignals,
  isInternalAnalyticsActor,
  privacyPolicyFromSettings,
  readConsent,
  analyticsSubjectHash,
  hasCurrentAnalyticsConsent,
} from '@/modules/analytics/privacy'

export async function POST(request: Request) {
  const runtime = loadConfig()
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as {
    experimentId?: string
    variantId?: string
    goalKey?: string
    assignmentKey?: string
    siteId?: string
    submissionId?: string
  }

  if (!body.experimentId || !body.variantId) {
    return NextResponse.json({ error: 'experimentId and variantId are required.' }, { status: 400 })
  }

  if (typeof body.submissionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.submissionId))
    return NextResponse.json({ error: 'A persisted form submission is required.' }, { status: 400 })
  const goalKey = 'lead-contact-volunteer'
  const experimentId = body.experimentId
  const variantId = body.variantId
  const policy = privacyPolicyFromSettings(
    await payload.findGlobal({ slug: 'site-settings', overrideAccess: true }),
  )
  const consent = readConsent(request.headers.get('cookie'), runtime.payloadSecret)
  const signals = browserPrivacySignals(new Headers(request.headers))

  const siteId = await publicSiteForHost(payload, request.headers.get('host'))
  if (!siteId || body.siteId !== siteId)
    return NextResponse.json({ error: 'Publication mismatch.' }, { status: 404 })
  if (!(await samePublicOrigin(payload, request)))
    return NextResponse.json({ error: 'Origin denied.' }, { status: 403 })
  if (!consent) return new NextResponse(null, { status: 204 })
  return withExecutionLock(payload, `analytics.subject:${siteId}:${consent.subject}`, async () => {
    if (await isInternalAnalyticsActor(payload, request))
      return NextResponse.json({ accepted: false, reason: 'internal-actor' }, { status: 202 })
    if (
      !(await hasCurrentAnalyticsConsent(
        payload,
        consent,
        siteId,
        runtime.payloadSecret,
        policy,
        signals,
      )) ||
      isBotOrInternal({
        userAgent: request.headers.get('user-agent') ?? undefined,
        internal: request.headers.get('x-renegade-internal') === '1',
      })
    )
      return new NextResponse(null, { status: 204 })
    const assignment = await validatePublicEventAssignment(
      payload,
      request,
      siteId,
      experimentId,
      variantId,
      runtime.payloadSecret,
      policy,
    )
    if (!assignment)
      return NextResponse.json({ error: 'Experiment assignment unavailable.' }, { status: 404 })
    const subjectHash = analyticsSubjectHash(consent, siteId, runtime.payloadSecret)
    const exposure = await payload.find({
      collection: 'analytics-events',
      where: {
        and: [
          { site: { equals: siteId } },
          { anonymousHash: { equals: subjectHash } },
          {
            dedupeKey: {
              equals: `${siteId}:source:exp-exposure:${experimentId}:${variantId}:${subjectHash}`,
            },
          },
          { eventType: { equals: 'experiment_exposure' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (!exposure.docs.length)
      return NextResponse.json({ error: 'Prior exposure required.' }, { status: 409 })
    const outcomes = await payload.find({
      collection: 'analytics-events',
      where: {
        and: [
          { site: { equals: siteId } },
          { anonymousHash: { equals: subjectHash } },
          { dedupeKey: { equals: `${siteId}:source:form-submissions:${body.submissionId}` } },
          { trusted: { equals: true } },
          { eventType: { equals: 'form_submit' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (!outcomes.docs.length)
      return NextResponse.json(
        { error: 'Consented canonical outcome unavailable.' },
        { status: 404 },
      )
    const active = await getActivePublicExperiment(payload, siteId)
    const submission = await payload
      .findByID({
        collection: 'form-submissions',
        id: body.submissionId!,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    const submittedForm =
      typeof submission?.form === 'object' ? submission.form?.id : submission?.form
    if (!active.form || String(submittedForm) !== String(active.form.form.id))
      return NextResponse.json({ error: 'Configured form outcome required.' }, { status: 404 })
    const dedupeSource = `exp-conversion:${body.experimentId}:${body.variantId}:${goalKey}:${subjectHash}`
    const now = new Date().toISOString()

    const event = {
      id: randomUUID(),
      eventType: 'experiment_conversion' as const,
      occurredAt: now,
      receivedAt: now,
      identity: { anonymousId: subjectHash },
      context: {
        siteId,
        sourceEventId: dedupeSource,
        path: '/',
        channel: 'web-experiment',
        goal: goalKey,
      },
      consentBasis: 'analytics-consent' as const,
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      trusted: false,
      dedupeKey: '',
      properties: {
        canonicalOutcomeId: body.submissionId ?? null,
        source: 'form-submissions',
        experimentId,
        variantId,
        goalKey,
        assignmentKey: subjectHash,
      },
    }

    const result = await new PayloadAnalyticsEventStore(payload).record(
      event,
      policy.rawEventRetentionDays,
    )

    // Also record in canonical experiment-events collection if enabled
    if (!result.deduplicated) {
      try {
        await payload.create({
          collection: 'experiment-events',
          data: {
            site: siteId,
            experiment: body.experimentId,
            variant: body.variantId,
            kind: 'conversion',
            goalKey,
            dedupeKey: `${siteId}:${dedupeSource}`,
            occurredAt: now,
            consentBasis: 'analytics-consent',
          },
          overrideAccess: true,
        } as never)
      } catch {
        // Best-effort canonical mirror; does not block analytics response
      }
    }

    return NextResponse.json(
      {
        accepted: !result.deduplicated,
        deduplicated: result.deduplicated,
        variantId,
        experimentId,
        goalKey,
      },
      { status: result.deduplicated ? 202 : 201 },
    )
  })
}
