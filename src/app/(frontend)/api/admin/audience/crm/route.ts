import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
import { normalizeEmailAddress, audienceDigest } from '@/modules/audience/contracts'
import { normalizeE164Phone } from '@/modules/telecom/contracts'
import {
  exportAudienceSubject,
  eraseAudienceSubject,
  suppressSubscriber,
  isSubscriberSuppressed,
  subscriberSuppressionReason,
} from '@/modules/audience/service'
import { executeDbQuery } from '@/modules/community/comment-composer'
import { exportAudienceSummaryReport } from '@/modules/audience/command-center-service'

export const runtime = 'nodejs'

async function authenticateOperator(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user?.id || !['owner', 'administrator', 'staff'].includes(String(user.role))) {
    return null
  }
  const grant = await resolveOperatorGrantContext(payload, user)
  if (!grant.authorized) return null
  return { payload, user, grant }
}

async function resolveSite(
  request: Request,
  payload: any,
  grant: any,
): Promise<{ siteId: string | null; errorResponse?: Response }> {
  const url = new URL(request.url)
  const siteId =
    url.searchParams.get('siteId') ??
    (await publicSiteForHost(payload, request.headers.get('host') ?? url.host))
  if (!siteId || (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId))) {
    return {
      siteId: null,
      errorResponse: Response.json({ error: 'Staff site access required.' }, { status: 403 }),
    }
  }
  return { siteId }
}

async function readCRM(request: Request) {
  const session = await authenticateOperator(request)
  if (!session) {
    return Response.json({ error: 'Staff access required.' }, { status: 403 })
  }
  const { payload, user, grant } = session
  if (!payload.collections['contacts'])
    return Response.json({ error: 'CRM module unavailable.' }, { status: 404 })
  const { siteId, errorResponse } = await resolveSite(request, payload, grant)
  if (errorResponse || !siteId) return errorResponse!

  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  // 1. Privacy-Safe Aggregate Export (K-Anonymity N >= 5)
  if (action === 'export') {
    const [subscribersCount, contactsCount, suppressionsCount, outcomes] = await Promise.all([
      payload.count({
        collection: 'subscribers',
        where: { site: { equals: siteId } },
        overrideAccess: true,
      }),
      payload.count({
        collection: 'contacts',
        where: { site: { equals: siteId } },
        overrideAccess: true,
      }),
      payload.count({
        collection: 'suppressions',
        where: { site: { equals: siteId } },
        overrideAccess: true,
      }),
      executeDbQuery<{ status: string; count: number }>(
        payload,
        `SELECT d.status, count(*)::int AS count FROM email_deliveries d
         JOIN email_messages m ON m.id=d.message_id WHERE m.site_id=$1 GROUP BY d.status`,
        [siteId],
      ),
    ])

    const acceptedCount = outcomes.find((d) => d.status === 'accepted')?.count ?? 0
    const bouncedCount = outcomes.find((d) => d.status === 'bounced')?.count ?? 0

    const summaryReport = exportAudienceSummaryReport({
      siteId,
      userRole: String(user.role),
      windowLabel: 'Lifetime to date',
      metrics: [
        {
          key: 'subscribers',
          label: 'Total Subscriber Records',
          channel: 'multi',
          count: subscribersCount.totalDocs,
          definition: 'All subscriber records, including pending, suppressed and erased records.',
          caveats: 'Subject to unsubscribe, bounce, or deletion policies.',
        },
        {
          key: 'contacts',
          label: 'Total CRM Contacts',
          channel: 'multi',
          count: contactsCount.totalDocs,
          definition: 'First-party CRM directory contacts.',
          caveats: 'Directory entries may have multiple communication channels.',
        },
        {
          key: 'suppressions',
          label: 'Site Suppressions',
          channel: 'multi',
          count: suppressionsCount.totalDocs,
          definition: 'Unsubscribes, hard bounces, and complaint addresses.',
          caveats:
            'Site-scoped suppression; unsubscribe may be reversed by explicit double opt-in.',
        },
        {
          key: 'accepted_deliveries',
          label: 'Provider Accepted Deliveries',
          channel: 'email',
          count: acceptedCount,
          definition: 'Deliveries accepted by upstream MTA / provider.',
          caveats: 'Provider acceptance is transport handoff, not proof of inbox placement.',
        },
        {
          key: 'hard_bounces',
          label: 'Permanent Hard Bounces',
          channel: 'email',
          count: bouncedCount,
          definition: 'Permanent 5xx MTA bounce notifications.',
          caveats: 'Automatically enrolled into suppression ledger.',
        },
      ],
      cohorts: [
        {
          dimension: 'Status',
          label: 'Active Subscribers',
          eligible: subscribersCount.totalDocs,
          delivered: acceptedCount,
          observedClicks: 0,
          conversions: 0,
        },
      ],
    })

    const format = url.searchParams.get('format') || 'json'
    if (format === 'csv') {
      return new Response(summaryReport.csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="audience-report-${siteId}.csv"`,
          'cache-control': 'private, no-store',
        },
      })
    }

    return Response.json(summaryReport, {
      headers: { 'cache-control': 'private, no-store' },
    })
  }

  // 2. Single Contact Details with Consent History & Observed Metrics
  const contactId = url.searchParams.get('contactId')
  if (contactId) {
    if (!/^[a-f0-9-]{36}$/i.test(contactId))
      return Response.json({ error: 'Invalid contact ID.' }, { status: 400 })
    const contact = (await payload.findByID({
      collection: 'contacts',
      id: contactId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })) as any

    if (!contact || String(contact.site) !== siteId) {
      return Response.json({ error: 'Contact not found or access denied.' }, { status: 404 })
    }

    // Find linked subscriber
    const computedHash =
      contact.emailHash ||
      (contact.email ? audienceDigest(normalizeEmailAddress(String(contact.email))) : undefined)

    let subscriber: any = null
    const subRes = await payload.find({
      collection: 'subscribers',
      where: {
        and: [
          { site: { equals: siteId } },
          {
            or: [
              { contact: { equals: contactId } },
              ...(computedHash ? [{ emailHash: { equals: computedHash } }] : []),
              ...(contact.email
                ? [{ email: { equals: String(contact.email).toLowerCase().trim() } }]
                : []),
            ],
          },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (subRes.docs[0]) {
      subscriber = subRes.docs[0]
    }

    const emailHash = subscriber?.emailHash || contact.emailHash || computedHash
    const isSuppressed = emailHash
      ? await isSubscriberSuppressed(payload, siteId, emailHash)
      : false
    const suppressionRecord =
      isSuppressed && emailHash
        ? await subscriberSuppressionReason(payload, siteId, emailHash)
        : null
    const suppressionReason = suppressionRecord?.reason || null

    // Consent History
    const consentWhere: any = {
      and: [
        { site: { equals: siteId } },
        {
          or: [
            { contact: { equals: contactId } },
            ...(subscriber ? [{ subscriber: { equals: subscriber.id } }] : []),
          ],
        },
      ],
    }

    const consentEvents = await payload.find({
      collection: 'consent-events',
      where: consentWhere,
      sort: '-occurredAt',
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })

    // Observed Engagement Metrics (do NOT infer opens/clicks without observed events)
    let deliveriesCount = 0
    let acceptedCount = 0
    const observedOpensConfirmed = 0
    const observedOpensProxyCached = 0
    const observedClicksHuman = 0
    const observedClicksBot = 0

    const deliveryOutcomes = await executeDbQuery<{ status: string; count: number }>(
      payload,
      `SELECT d.status, count(*)::int AS count FROM email_deliveries d
       JOIN email_messages m ON m.id=d.message_id
       WHERE m.site_id=$1 AND (d.subscriber_id=$2 OR lower(d.recipient_email)=$3)
       GROUP BY d.status`,
      [siteId, subscriber?.id ?? null, contact.email?.trim().toLowerCase() ?? null],
    )
    deliveriesCount = deliveryOutcomes.reduce((total, row) => total + row.count, 0)
    acceptedCount = deliveryOutcomes.find((row) => row.status === 'accepted')?.count ?? 0

    return Response.json(
      {
        contact: {
          id: contact.id,
          displayName: contact.displayName,
          email: contact.email,
          emailHash: contact.emailHash,
          phoneE164: contact.phoneE164,
          status: contact.status,
          profile: contact.profile,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        },
        subscriber: subscriber
          ? {
              id: subscriber.id,
              status: subscriber.status,
              verifiedAt: subscriber.verifiedAt,
              globalUnsubscribedAt: subscriber.globalUnsubscribedAt,
            }
          : null,
        isSuppressed,
        suppressionReason,
        consentHistory: consentEvents.docs.map((c: any) => ({
          id: c.id,
          event: c.event,
          basis: c.basis,
          channel: c.channel,
          purpose: c.purpose,
          wording: c.wording,
          occurredAt: c.occurredAt,
          proofReference: c.proofReference,
          captureSource: c.captureSource ?? c.evidence?.source ?? null,
          formSubmission: c.formSubmission ?? null,
          audienceList: c.audienceList ?? null,
        })),
        metrics: {
          deliveryRecords: deliveriesCount,
          deliveriesAttempted: deliveryOutcomes
            .filter((row) => !['queued', 'cancelled'].includes(row.status))
            .reduce((total, row) => total + row.count, 0),
          source: 'email-deliveries joined to email-messages.site; lifetime status counts',
          deliveriesAccepted: acceptedCount,
          observedOpensConfirmed,
          observedOpensProxyCached,
          observedClicksHuman,
          observedClicksBot,
          uncertaintyNotice:
            'Zero unobserved events inferred. Delivery status counts are observed; open/click tracking is unavailable, so zero does not establish no engagement.',
        },
      },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  }

  // 3. Search & Filter Contacts List
  const query = url.searchParams.get('query')?.trim()
  const statusFilter = url.searchParams.get('status')
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50),
  )

  const andConditions: any[] = [{ site: { equals: siteId } }]

  if (statusFilter && statusFilter !== 'all') {
    andConditions.push({ status: { equals: statusFilter } })
  }

  if (query) {
    andConditions.push({
      or: [
        { displayName: { like: query } },
        { email: { like: query } },
        { phoneE164: { like: query } },
      ],
    })
  }

  const [contactsResult, leadCount, activeCount, inactiveCount, blockedCount, archivedCount] =
    await Promise.all([
      payload.find({
        collection: 'contacts',
        where: { and: andConditions },
        limit,
        page,
        sort: '-createdAt',
        depth: 0,
        overrideAccess: true,
      }),
      payload.count({
        collection: 'contacts',
        where: { and: [{ site: { equals: siteId } }, { status: { equals: 'lead' } }] },
        overrideAccess: true,
      }),
      payload.count({
        collection: 'contacts',
        where: { and: [{ site: { equals: siteId } }, { status: { equals: 'active' } }] },
        overrideAccess: true,
      }),
      payload.count({
        collection: 'contacts',
        where: { and: [{ site: { equals: siteId } }, { status: { equals: 'inactive' } }] },
        overrideAccess: true,
      }),
      payload.count({
        collection: 'contacts',
        where: { and: [{ site: { equals: siteId } }, { status: { equals: 'blocked' } }] },
        overrideAccess: true,
      }),
      payload.count({
        collection: 'contacts',
        where: { and: [{ site: { equals: siteId } }, { status: { equals: 'archived' } }] },
        overrideAccess: true,
      }),
    ])

  return Response.json(
    {
      contacts: contactsResult.docs.map((c: any) => ({
        id: c.id,
        displayName: c.displayName,
        email: c.email,
        phoneE164: c.phoneE164,
        status: c.status,
        createdAt: c.createdAt,
      })),
      totalDocs: contactsResult.totalDocs,
      limit: contactsResult.limit,
      page: contactsResult.page,
      totalPages: contactsResult.totalPages,
      statusCounts: {
        all:
          leadCount.totalDocs +
          activeCount.totalDocs +
          inactiveCount.totalDocs +
          blockedCount.totalDocs +
          archivedCount.totalDocs,
        lead: leadCount.totalDocs,
        active: activeCount.totalDocs,
        inactive: inactiveCount.totalDocs,
        blocked: blockedCount.totalDocs,
        archived: archivedCount.totalDocs,
      },
    },
    { headers: { 'cache-control': 'private, no-store' } },
  )
}

export async function POST(request: Request) {
  const session = await authenticateOperator(request)
  if (!session) {
    return Response.json({ error: 'Staff access required.' }, { status: 403 })
  }
  const { payload, user, grant } = session
  if (!(await samePublicOrigin(payload, request, true))) {
    return Response.json({ error: 'Same-origin CRM action required.' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const siteIdFromParam = new URL(request.url).searchParams.get('siteId') || body.siteId
  const siteId = siteIdFromParam ?? (await publicSiteForHost(payload, request.headers.get('host')))

  if (!siteId || (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId))) {
    return Response.json({ error: 'Staff site access required.' }, { status: 403 })
  }

  const action = body.action || 'create-contact'

  // Action: Create Contact
  if (action === 'create-contact') {
    if (!body.displayName || typeof body.displayName !== 'string') {
      return Response.json({ error: 'Display name is required.' }, { status: 400 })
    }

    let email = body.email ? String(body.email).trim() : undefined
    let emailHash: string | undefined = undefined
    if (email) {
      try {
        email = normalizeEmailAddress(email)
        emailHash = audienceDigest(email)
      } catch (err: any) {
        return Response.json({ error: err.message || 'Invalid email format.' }, { status: 400 })
      }
    }

    let phoneE164: string | undefined = undefined
    if (body.phoneE164) {
      try {
        const normalized = normalizeE164Phone(String(body.phoneE164).trim())
        phoneE164 = normalized.e164
      } catch (err: any) {
        return Response.json({ error: err.message || 'Invalid phone format.' }, { status: 400 })
      }
    }

    const newContact = (await (payload as any).create({
      collection: 'contacts',
      data: {
        site: siteId,
        displayName: body.displayName.trim(),
        email,
        emailHash,
        phoneE164,
        status: ['lead', 'active', 'inactive', 'blocked', 'archived'].includes(body.status)
          ? body.status
          : 'lead',
        profile: body.profile || {},
      },
      overrideAccess: true,
    })) as any

    return Response.json(newContact, { status: 201 })
  }

  // Action: Update Contact
  if (action === 'update-contact') {
    if (!body.contactId) {
      return Response.json({ error: 'Contact ID is required.' }, { status: 400 })
    }
    const existing = (await payload.findByID({
      collection: 'contacts',
      id: body.contactId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })) as any

    if (!existing || String(existing.site) !== siteId) {
      return Response.json({ error: 'Contact not found or access denied.' }, { status: 404 })
    }

    const updateData: any = {}
    if (body.displayName) updateData.displayName = String(body.displayName).trim()
    if (
      body.status &&
      ['lead', 'active', 'inactive', 'blocked', 'archived'].includes(body.status)
    ) {
      updateData.status = body.status
    }
    if (body.profile) updateData.profile = body.profile

    const updated = await payload.update({
      collection: 'contacts',
      id: body.contactId,
      data: updateData,
      overrideAccess: true,
    })

    return Response.json(updated)
  }

  // Action: Export Subject Data (GDPR / Privacy Access Request)
  if (action === 'export-subject') {
    const subscriberId = body.subscriberId
    if (!subscriberId) {
      return Response.json(
        { error: 'Subscriber ID is required for subject export.' },
        { status: 400 },
      )
    }
    try {
      const subjectData = await exportAudienceSubject(payload, { siteId, subscriberId })
      return Response.json(subjectData, { headers: { 'cache-control': 'private, no-store' } })
    } catch (err: any) {
      return Response.json({ error: err.message || 'Subject export failed.' }, { status: 400 })
    }
  }

  // Action: Erase Subject Data (GDPR Right to be Forgotten)
  if (action === 'erase-subject') {
    const subscriberId = body.subscriberId
    if (!subscriberId) {
      return Response.json({ error: 'Subscriber ID is required for erasure.' }, { status: 400 })
    }
    try {
      await eraseAudienceSubject(payload, {
        siteId,
        subscriberId,
        policyVersion: body.policyVersion || '2026.1',
        actor: String(user.id),
      })
      return Response.json({ status: 'erased', subscriberId })
    } catch (err: any) {
      return Response.json({ error: err.message || 'Subject erasure failed.' }, { status: 400 })
    }
  }

  // Action: Suppress Contact
  if (action === 'suppress-contact') {
    const email = body.email
    if (!email) {
      return Response.json({ error: 'Email is required for suppression.' }, { status: 400 })
    }
    try {
      await suppressSubscriber(payload, {
        siteId,
        email: normalizeEmailAddress(String(email)),
        reason: 'legal',
      })
    } catch {
      return Response.json({ error: 'Valid email required.' }, { status: 400 })
    }
    return Response.json({ status: 'suppressed' })
  }

  return Response.json({ error: `Unknown action: "${action}"` }, { status: 400 })
}

export async function GET(request: Request) {
  try {
    return await readCRM(request)
  } catch {
    return Response.json(
      { error: 'Saved CRM records could not be loaded.' },
      { status: 503, headers: { 'cache-control': 'private, no-store' } },
    )
  }
}
