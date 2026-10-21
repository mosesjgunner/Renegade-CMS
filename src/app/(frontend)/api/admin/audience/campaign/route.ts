import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import { publicSiteForHost } from '@/modules/public/site-scope'
import {
  evaluateSegmentRecipients,
  createRecipientSnapshot,
  queueTestSend,
} from '@/modules/audience/service'
import {
  renderEmailDesign,
  validateEmailDesign,
  type MessageDesign,
} from '@/modules/audience/email-composer'

export const runtime = 'nodejs'

type Doc = Record<string, unknown>

async function resolveContext(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user?.id || !['owner', 'administrator', 'staff'].includes(String(user.role))) {
    return null
  }
  const grant = await resolveOperatorGrantContext(payload, user)
  if (!grant.authorized) return null

  const url = new URL(request.url)
  const querySite = url.searchParams.get('siteId')
  const cookieHeader = request.headers.get('cookie') ?? ''
  const cookieSite = cookieHeader
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('renegade-active-site='))
    ?.slice('renegade-active-site='.length)

  const host = request.headers.get('host') ?? url.host
  const hostSite = await publicSiteForHost(payload, host)

  const candidateSiteId = querySite || cookieSite || hostSite || grant.authorizedSiteIds[0]
  if (
    !candidateSiteId ||
    (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(candidateSiteId))
  ) {
    return null
  }

  return { payload, user, siteId: candidateSiteId, grant }
}

export async function GET(request: Request) {
  const ctx = await resolveContext(request)
  if (!ctx) {
    return Response.json({ error: 'Staff site access required.' }, { status: 403 })
  }
  const { payload, siteId } = ctx

  try {
    const siteDoc = (await payload.findByID({
      collection: 'sites',
      id: siteId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Doc

    const [articlesRes, templatesRes, segmentsRes, campaignsRes] = await Promise.all([
      payload.find({
        collection: 'content',
        where: {
          and: [
            { site: { equals: siteId } },
            { status: { in: ['published', 'updated'] } },
          ],
        },
        limit: 50,
        sort: '-publishedAt',
        depth: 0,
        overrideAccess: true,
      }),
      payload.collections['email-templates']
        ? payload.find({
            collection: 'email-templates',
            where: { site: { equals: siteId } },
            limit: 50,
            overrideAccess: true,
          })
        : { docs: [] },
      payload.collections['audience-segments']
        ? payload.find({
            collection: 'audience-segments',
            where: {
              and: [
                { site: { equals: siteId } },
                { status: { equals: 'active' } },
              ],
            },
            limit: 50,
            overrideAccess: true,
          })
        : { docs: [] },
      payload.collections['email-messages']
        ? payload.find({
            collection: 'email-messages',
            where: { site: { equals: siteId } },
            limit: 50,
            sort: '-createdAt',
            overrideAccess: true,
          })
        : { docs: [] },
    ])

    return Response.json(
      {
        site: {
          id: siteId,
          name: siteDoc?.name ?? 'Renegade Site',
          slug: siteDoc?.slug ?? 'site',
        },
        articles: articlesRes.docs.map((doc) => ({
          id: doc.id,
          title: doc.title,
          summary: doc.summary ?? doc.excerpt ?? '',
          canonicalPath: doc.canonicalPath,
          publishedAt: doc.publishedAt,
          updatedAt: doc.updatedAt,
        })),
        templates: templatesRes.docs.map((t) => ({
          id: t.id,
          name: t.name,
          version: t.version,
          locale: t.locale,
          brandTokens: t.brandTokens,
        })),
        segments: segmentsRes.docs.map((s) => ({
          id: s.id,
          name: s.name,
          version: s.version,
          status: s.status,
          definition: s.definition,
        })),
        campaigns: campaignsRes.docs.map((c) => ({
          id: c.id,
          subject: c.subject,
          status: c.status,
          kind: c.kind,
          scheduledFor: c.scheduledFor,
          reviewedAt: c.reviewedAt,
          recipientSnapshot: c.recipientSnapshot,
          createdAt: c.createdAt,
        })),
      },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  } catch (error) {
    return Response.json(
      { error: `Failed to load campaign metadata: ${String(error)}` },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const ctx = await resolveContext(request)
  if (!ctx) {
    return Response.json({ error: 'Staff site access required.' }, { status: 403 })
  }
  const { payload, user, siteId } = ctx

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Malformed JSON payload.' }, { status: 400 })
  }

  const action = String(body.action ?? '')

  // 1. Evaluate segment recipients (consent, suppression, deduplication, site scoping)
  if (action === 'evaluate-segment') {
    const segmentId = String(body.segmentId ?? '')
    if (!segmentId) {
      return Response.json({ error: 'Segment ID is required.' }, { status: 400 })
    }

    try {
      const evaluation = await evaluateSegmentRecipients(payload, { siteId, segmentId })
      return Response.json({
        ok: true,
        segmentId,
        segmentName: evaluation.segment.name,
        segmentVersion: evaluation.segment.version,
        counts: evaluation.counts,
        eligibleRecipientsSample: evaluation.eligibleRecipients.slice(0, 5),
        isEmpty: evaluation.counts.isEmpty,
      })
    } catch (err: unknown) {
      const msg = String(err)
      if (msg.includes('mismatch') || msg.includes('access denied')) {
        return Response.json({ error: 'Segment access outside owning site is forbidden.' }, { status: 403 })
      }
      return Response.json({ error: msg }, { status: 400 })
    }
  }

  // 2. Preview message design (responsive HTML and plain text companion)
  if (action === 'preview') {
    const messageDesign = body.messageDesign as MessageDesign | undefined
    if (!messageDesign) {
      return Response.json({ error: 'Message design is required.' }, { status: 400 })
    }
    const errors = validateEmailDesign(messageDesign, 'bulk')
    if (errors.length) {
      return Response.json({ ok: false, errors }, { status: 400 })
    }

    try {
      const siteDoc = (await payload.findByID({
        collection: 'sites',
        id: siteId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Doc

      const rendered = renderEmailDesign(messageDesign, {
        origin: process.env.APP_URL ?? 'http://localhost:3000',
        recipient: (body.recipientPreview as Record<string, unknown>) ?? {
          'recipient.firstName': 'Jane',
          'recipient.lastName': 'Doe',
          'recipient.email': 'jane.doe@example.test',
        },
        siteName: String(siteDoc?.name ?? 'Renegade Movement'),
      })

      return Response.json({
        ok: true,
        html: rendered.html,
        text: rendered.text,
        hash: rendered.hash,
        warnings: rendered.warnings,
      })
    } catch (err: unknown) {
      return Response.json({ ok: false, error: String(err) }, { status: 400 })
    }
  }

  // 3. Test send to operator inbox via local SMTP boundary
  if (action === 'test-send') {
    const recipientEmail = String(body.recipientEmail ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return Response.json({ error: 'Enter a valid recipient email address.' }, { status: 400 })
    }
    const messageDesign = body.messageDesign as MessageDesign | undefined
    if (!messageDesign) {
      return Response.json({ error: 'Message design is required for test send.' }, { status: 400 })
    }
    const designErrors = validateEmailDesign(messageDesign, 'bulk')
    if (designErrors.length) {
      return Response.json({ error: designErrors.join(' ') }, { status: 400 })
    }

    try {
      // Create or use draft message for test send
      const draftMessage = await payload.create({
        collection: 'email-messages',
        data: {
          site: siteId,
          subject: String(body.subject ?? 'Newsletter Preview Test Send'),
          kind: 'bulk',
          status: 'draft',
          blocks: messageDesign.blocks,
          messageDesign,
          audience: { test: true },
        },
        overrideAccess: true,
      })

      const delivery = await queueTestSend(payload, {
        messageId: draftMessage.id,
        recipientEmail,
      })

      return Response.json({
        ok: true,
        deliveryId: delivery.id,
        recipientEmail,
        status: delivery.status,
      })
    } catch (err: unknown) {
      return Response.json({ error: `Test send failed: ${String(err)}` }, { status: 400 })
    }
  }

  // 4. Save draft, submit for review, or schedule campaign
  if (action === 'save-and-schedule') {
    const subject = String(body.subject ?? '').trim()
    if (!subject) {
      return Response.json({ error: 'Subject is required.' }, { status: 400 })
    }
    const segmentId = String(body.segmentId ?? '').trim()
    if (!segmentId) {
      return Response.json({ error: 'Target audience segment is required.' }, { status: 400 })
    }
    const messageDesign = body.messageDesign as MessageDesign | undefined
    if (!messageDesign) {
      return Response.json({ error: 'Message design is required.' }, { status: 400 })
    }

    const designErrors = validateEmailDesign(messageDesign, 'bulk')
    if (designErrors.length) {
      return Response.json({ error: designErrors.join(' ') }, { status: 400 })
    }

    const targetAction = String(body.targetStatus ?? 'schedule') // 'draft' | 'review' | 'schedule'
    const scheduledFor = String(body.scheduledFor ?? new Date(Date.now() + 3600000).toISOString())

    try {
      // Evaluate segment to verify site scoping & consent
      const evaluation = await evaluateSegmentRecipients(payload, { siteId, segmentId })
      if (targetAction === 'schedule' && evaluation.counts.isEmpty && !body.allowEmptyAudience) {
        return Response.json(
          {
            error:
              'Empty audience: No consented subscribers match this segment. Review audience targeting before scheduling.',
            emptyAudience: true,
          },
          { status: 400 },
        )
      }

      // Step A: Create message in 'draft' status
      const message = await payload.create({
        collection: 'email-messages',
        data: {
          site: siteId,
          subject,
          preheader: String(body.preheader ?? ''),
          kind: 'bulk',
          status: 'draft',
          blocks: messageDesign.blocks,
          messageDesign,
          audience: {
            segmentId,
            segmentVersion: evaluation.segment.version,
          },
        },
        overrideAccess: true,
      })

      if (targetAction === 'draft') {
        return Response.json({
          ok: true,
          status: 'draft',
          messageId: message.id,
          recipientCount: evaluation.counts.eligibleConsented,
        })
      }

      // Step B: Transition to 'review' status
      await payload.update({
        collection: 'email-messages',
        id: message.id,
        data: { status: 'review' },
        overrideAccess: true,
      })

      if (targetAction === 'review') {
        return Response.json({
          ok: true,
          status: 'review',
          messageId: message.id,
          recipientCount: evaluation.counts.eligibleConsented,
        })
      }

      // Step C: Generate immutable recipient snapshot
      const snapshot = await createRecipientSnapshot(payload, {
        siteId,
        messageId: message.id,
        segmentId,
        actorUserId: String(user.id),
      })

      // Step D: Transition to 'scheduled' status with snapshot attached
      const scheduledMessage = await payload.update({
        collection: 'email-messages',
        id: message.id,
        data: {
          status: 'scheduled',
          scheduledFor,
          recipientSnapshot: snapshot.id,
        },
        overrideAccess: true,
      })

      return Response.json({
        ok: true,
        status: 'scheduled',
        messageId: scheduledMessage.id,
        scheduledFor,
        snapshotId: snapshot.id,
        snapshotHash: snapshot.hash,
        recipientCount: evaluation.counts.eligibleConsented,
        exclusionCounts: snapshot.exclusionCounts,
      })
    } catch (err: unknown) {
      const msg = String(err)
      if (msg.includes('mismatch') || msg.includes('access denied')) {
        return Response.json({ error: 'Segment access outside owning site is forbidden.' }, { status: 403 })
      }
      return Response.json({ error: msg }, { status: 400 })
    }
  }

  return Response.json({ error: `Unsupported campaign action: ${action}` }, { status: 400 })
}
