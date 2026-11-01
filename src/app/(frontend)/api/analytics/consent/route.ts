import config from '@payload-config'
import { createLocalReq, getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { loadConfig } from '@/modules/core/config'
import { withExecutionLock } from '@/modules/operations/execution-lock'
import { normalizeConsentChoices } from '@/modules/analytics/contracts'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
import {
  browserPrivacySignals,
  consentSetCookie,
  consentSubject,
  analyticsSubjectHash,
  hasCurrentAnalyticsConsent,
  privacyPolicyFromSettings,
  readConsent,
} from '@/modules/analytics/privacy'

export async function GET(request: Request) {
  const runtime = loadConfig()
  const payload = await getPayload({ config })
  const policy = privacyPolicyFromSettings(
    await payload.findGlobal({ slug: 'site-settings', overrideAccess: true }),
  )
  let current = readConsent(request.headers.get('cookie'), runtime.payloadSecret)
  const signals = browserPrivacySignals(new Headers(request.headers))
  const siteId = await publicSiteForHost(payload, request.headers.get('host'))
  if (current && (current.siteId !== siteId || current.version !== policy.consentVersion))
    current = null
  if (
    current?.choices.analytics &&
    !(await hasCurrentAnalyticsConsent(
      payload,
      current,
      siteId,
      runtime.payloadSecret,
      policy,
      signals,
    ))
  )
    current = { ...current, choices: normalizeConsentChoices(undefined) }
  return NextResponse.json({
    policy,
    choices: current?.version === policy.consentVersion ? current.choices : null,
    version: current?.version ?? policy.consentVersion,
    signals,
  })
}
export async function POST(request: Request) {
  const runtime = loadConfig()
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => null)) as {
    siteId?: string
    choices?: Record<string, boolean>
  } | null
  if (!body || typeof body.siteId !== 'string' || !body.siteId)
    return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
  const siteId = await publicSiteForHost(
    payload,
    request.headers.get('host') ?? new URL(request.url).host,
  )
  if (!siteId || body.siteId !== siteId)
    return NextResponse.json(
      { error: 'Consent site does not match this publication.' },
      { status: 404 },
    )
  if (request.headers.get('origin') && !(await samePublicOrigin(payload, request, false)))
    return NextResponse.json({ error: 'Origin access denied.' }, { status: 403 })
  const sites = await payload.find({
    collection: 'sites',
    where: { id: { equals: body.siteId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (!sites.docs.length) return NextResponse.json({ error: 'Unknown site.' }, { status: 404 })
  const policy = privacyPolicyFromSettings(
    await payload.findGlobal({ slug: 'site-settings', overrideAccess: true }),
  )
  const existing = readConsent(request.headers.get('cookie'), runtime.payloadSecret)
  const choices = normalizeConsentChoices(body.choices)
  const subject = consentSubject(existing)
  const action =
    !choices.analytics && !choices.personalization && !choices.marketing
      ? 'withdraw'
      : existing
        ? 'update'
        : 'grant'

  return withExecutionLock(payload, `analytics.subject:${siteId}:${subject}`, async () => {
    const transactionID = await payload.db.beginTransaction()
    if (!transactionID)
      return NextResponse.json({ error: 'Consent storage unavailable.' }, { status: 503 })
    const req = await createLocalReq({}, payload)
    req.transactionID = transactionID
    const subjectHash = analyticsSubjectHash(
      { subject, version: policy.consentVersion, choices, siteId },
      siteId,
      runtime.payloadSecret,
    )
    try {
      await payload.create({
        collection: 'analytics-consent-records',
        data: {
          site: siteId,
          subjectHash,
          consentVersion: policy.consentVersion,
          action,
          categories: choices,
          occurredAt: new Date().toISOString(),
          source: 'browser',
        },
        overrideAccess: true,
        req,
      })
      if (!choices.analytics) {
        await payload.delete({
          collection: 'analytics-events',
          where: {
            and: [{ site: { equals: siteId } }, { anonymousHash: { equals: subjectHash } }],
          },
          overrideAccess: true,
          req,
        })
        if (payload.collections['experiment-events']) {
          await payload.delete({
            collection: 'experiment-events',
            where: {
              and: [{ site: { equals: siteId } }, { dedupeKey: { contains: subjectHash } }],
            },
            overrideAccess: true,
            req,
          })
        }
        // Unlinked derived aggregates cannot be safely decremented; invalidate them for rebuilding.
        await payload.delete({
          collection: 'analytics-rollups',
          where: { site: { equals: siteId } },
          overrideAccess: true,
          req,
        })
      }
      await payload.db.commitTransaction(transactionID)
    } catch {
      await payload.db.rollbackTransaction(transactionID)
      return NextResponse.json({ error: 'Consent could not be saved. Try again.' }, { status: 503 })
    }
    const signals = browserPrivacySignals(new Headers(request.headers))
    return NextResponse.json(
      { choices, policy, signals },
      {
        headers: {
          'set-cookie': consentSetCookie(
            { subject, version: policy.consentVersion, choices, siteId },
            runtime.payloadSecret,
            runtime.secureCookies,
          ),
        },
      },
    )
  })
}
