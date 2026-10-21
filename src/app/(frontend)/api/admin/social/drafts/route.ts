import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import { socialHash } from '@/modules/social/contracts'
import { getSocialAdapter } from '@/modules/social/worker'

const idOf = (val: unknown): string => {
  if (typeof val === 'object' && val !== null && 'id' in val) {
    return String((val as { id: unknown }).id)
  }
  return String(val ?? '')
}

/**
 * GET /api/admin/social/drafts
 * Lists social drafts scoped by site and tenant permissions, or returns details of a single draft.
 */
export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    const grant = await resolveOperatorGrantContext(payload, auth?.user)
    if (!grant.authorized) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('siteId')
    const draftId = searchParams.get('draftId')
    const cookieHeader = request.headers.get('cookie') || ''
    const match = cookieHeader.match(/renegade-active-site=([^;]+)/)
    const effectiveSiteId = siteId || (match ? match[1].trim() : undefined)

    if (effectiveSiteId && !grant.isGlobalOwner && !grant.authorizedSiteIds.includes(effectiveSiteId)) {
      return NextResponse.json(
        { error: 'Forbidden. You do not have operator access to this site.' },
        { status: 403 },
      )
    }

    if (draftId) {
      const draft = (await payload.findByID({
        collection: 'social-drafts' as never,
        id: draftId,
        depth: 1,
        overrideAccess: true,
      })) as any

      if (!draft) {
        return NextResponse.json({ error: 'Draft not found.' }, { status: 404 })
      }

      const draftSite = idOf(draft.site)
      if (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(draftSite)) {
        return NextResponse.json(
          { error: 'Forbidden. Draft belongs to another site.' },
          { status: 403 },
        )
      }

      const variants = await payload.find({
        collection: 'social-network-variants' as never,
        where: { draft: { equals: draftId } },
        depth: 1,
        overrideAccess: true,
      })

      // Query queued items, external posts, and publish attempts for these variants
      const variantIds = (variants.docs as any[]).map((v) => v.id)
      const queueItems = variantIds.length
        ? await payload.find({
            collection: 'social-queue-items' as never,
            where: { variant: { in: variantIds } },
            depth: 1,
            overrideAccess: true,
          })
        : { docs: [] }

      const externalPosts = variantIds.length
        ? await payload.find({
            collection: 'external-posts' as never,
            where: { variant: { in: variantIds } },
            depth: 1,
            overrideAccess: true,
          })
        : { docs: [] }

      const publishAttempts = variantIds.length
        ? await payload.find({
            collection: 'social-publish-attempts' as never,
            where: { variant: { in: variantIds } },
            sort: '-createdAt',
            limit: 50,
            depth: 1,
            overrideAccess: true,
          })
        : { docs: [] }

      return NextResponse.json({
        draft,
        variants: variants.docs,
        queueItems: queueItems.docs,
        externalPosts: externalPosts.docs,
        publishAttempts: publishAttempts.docs,
      })
    }

    const where = effectiveSiteId
      ? { site: { equals: effectiveSiteId } }
      : grant.isGlobalOwner
        ? undefined
        : { site: { in: grant.authorizedSiteIds } }

    const drafts = await payload.find({
      collection: 'social-drafts' as never,
      where,
      limit: 50,
      sort: '-createdAt',
      depth: 1,
      overrideAccess: true,
    })

    return NextResponse.json({
      drafts: drafts.docs,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query social drafts.' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/admin/social/drafts
 * Supports:
 * - 'create-draft': creates a social-draft and its child variants with strict platform validation
 * - 'update-draft': updates copy/media of existing draft & variants, validates platform requirements
 * - 'submit-review': transitions draft to review
 * - 'approve': computes approvalHash per variant, sets status='approved' with operator attribution
 * - 'decline': moves draft to 'cancelled', denying unsent execution
 * - 'schedule': schedules approved variants in social-queue-items with release/calendar integration
 */
export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    const grant = await resolveOperatorGrantContext(payload, auth?.user)
    if (!grant.authorized) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const body = (await request.json()) as {
      action: 'create-draft' | 'update-draft' | 'submit-review' | 'approve' | 'decline' | 'schedule'
      siteId?: string
      draftId?: string
      title?: string
      sourceContentId?: string
      sourceRevisionId?: string
      canonicalUrl?: string
      scheduledFor?: string
      timeZone?: string
      variants?: Array<{
        id?: string
        accountId: string
        network: string
        text: string
        label?: string
        linkUrl?: string
        attachments?: string[]
      }>
      reason?: string
    }

    const action = body.action || 'create-draft'

    // ==========================================
    // ACTION: CREATE-DRAFT
    // ==========================================
    if (action === 'create-draft') {
      const cookieHeader = request.headers.get('cookie') || ''
      const match = cookieHeader.match(/renegade-active-site=([^;]+)/)
      const siteId = body.siteId || (match ? match[1].trim() : undefined) || grant.authorizedSiteIds[0]
      if (!siteId) {
        return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
      }
      if (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId)) {
        return NextResponse.json(
          { error: 'Forbidden. You do not have operator rights on this site.' },
          { status: 403 },
        )
      }

      if (!body.title?.trim()) {
        return NextResponse.json({ error: 'Draft title is required.' }, { status: 400 })
      }

      if (!body.variants || !body.variants.length) {
        return NextResponse.json(
          { error: 'Draft must include at least one destination variant.' },
          { status: 400 },
        )
      }

      // If sourceContentId provided, verify it belongs to the same site and is published if publication opt-in
      let canonicalUrl = body.canonicalUrl || ''
      if (body.sourceContentId) {
        const sourceDoc = (await payload.findByID({
          collection: 'content',
          id: body.sourceContentId,
          depth: 0,
          overrideAccess: true,
        })) as any
        if (!sourceDoc) {
          return NextResponse.json({ error: 'Source content not found.' }, { status: 404 })
        }
        if (idOf(sourceDoc.site) !== siteId) {
          return NextResponse.json(
            { error: 'Source content belongs to a different site.' },
            { status: 400 },
          )
        }
        if (!canonicalUrl && sourceDoc.canonicalUrl) {
          canonicalUrl = sourceDoc.canonicalUrl
        }
      }

      // Pre-validate all variants with their destination adapter
      const validationErrors: string[] = []
      for (const v of body.variants) {
        const adapter = getSocialAdapter(v.network as any)
        const simVariant: any = {
          id: 'val-' + v.accountId,
          accountId: v.accountId,
          network: v.network,
          text: v.text || '',
          attachments: (v.attachments || []).map((attId) => ({
            mediaAssetId: attId,
            role: 'image' as const,
          })),
          status: 'draft',
          idempotencyKey: 'temp',
        }

        if (adapter.validatePost) {
          const report = adapter.validatePost(simVariant)
          if (!report.isValid) {
            for (const err of report.errors) {
              validationErrors.push(`${v.network.toUpperCase()}: ${err.message}`)
            }
          }
        }
      }

      if (validationErrors.length > 0) {
        return NextResponse.json(
          {
            error: `Variant validation failed: ${validationErrors.join('; ')}`,
            validationErrors,
          },
          { status: 400 },
        )
      }

      // Create SocialDraft
      const createdDraft = (await payload.create({
        collection: 'social-drafts' as never,
        data: {
          site: siteId,
          title: body.title.trim(),
          sourceContent: body.sourceContentId || undefined,
          sourceRevision: body.sourceRevisionId || undefined,
          canonicalUrl: canonicalUrl || undefined,
          status: 'draft',
          requiresReview: true,
          createdBy: auth?.user?.id || undefined,
        } as never,
        overrideAccess: true,
      })) as any

      // Create SocialNetworkVariants
      const createdVariants: any[] = []
      for (const v of body.variants) {
        const key = `draft:${createdDraft.id}:${v.accountId}:${Date.now()}`
        const vDoc = await payload.create({
          collection: 'social-network-variants' as never,
          data: {
            draft: createdDraft.id,
            account: v.accountId,
            label: v.label || `${v.network} variant`,
            network: v.network,
            text: v.text,
            linkUrl: v.linkUrl || canonicalUrl || undefined,
            attachments: v.attachments || [],
            status: 'draft',
            idempotencyKey: key,
          } as never,
          overrideAccess: true,
        })
        createdVariants.push(vDoc)
      }

      return NextResponse.json(
        {
          success: true,
          draft: createdDraft,
          variants: createdVariants,
        },
        { status: 201 },
      )
    }

    // ==========================================
    // For all other actions, draftId is required
    // ==========================================
    if (!body.draftId) {
      return NextResponse.json({ error: 'draftId is required.' }, { status: 400 })
    }

    const draft = (await payload.findByID({
      collection: 'social-drafts' as never,
      id: body.draftId,
      depth: 1,
      overrideAccess: true,
    })) as any

    if (!draft) {
      return NextResponse.json({ error: 'Draft not found.' }, { status: 404 })
    }

    const draftSite = idOf(draft.site)
    if (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(draftSite)) {
      return NextResponse.json(
        { error: 'Forbidden. Draft belongs to another site.' },
        { status: 403 },
      )
    }

    // ==========================================
    // ACTION: UPDATE-DRAFT
    // ==========================================
    if (action === 'update-draft') {
      if (['published', 'partially-published', 'publishing'].includes(draft.status)) {
        return NextResponse.json(
          { error: 'Cannot update draft that is already executing or published.' },
          { status: 409 },
        )
      }

      const updateData: any = {}
      if (body.title?.trim()) updateData.title = body.title.trim()
      if (body.canonicalUrl !== undefined) updateData.canonicalUrl = body.canonicalUrl

      // If updating variants
      if (body.variants && body.variants.length > 0) {
        const validationErrors: string[] = []
        for (const v of body.variants) {
          const adapter = getSocialAdapter(v.network as any)
          const simVariant: any = {
            id: v.id || 'val-' + v.accountId,
            accountId: v.accountId,
            network: v.network,
            text: v.text || '',
            attachments: (v.attachments || []).map((attId) => ({
              mediaAssetId: attId,
              role: 'image' as const,
            })),
            status: 'draft',
            idempotencyKey: 'temp',
          }

          if (adapter.validatePost) {
            const report = adapter.validatePost(simVariant)
            if (!report.isValid) {
              for (const err of report.errors) {
                validationErrors.push(`${v.network.toUpperCase()}: ${err.message}`)
              }
            }
          }
        }

        if (validationErrors.length > 0) {
          return NextResponse.json(
            {
              error: `Variant validation failed: ${validationErrors.join('; ')}`,
              validationErrors,
            },
            { status: 400 },
          )
        }

        // Apply variant updates
        for (const v of body.variants) {
          if (v.id) {
            await payload.update({
              collection: 'social-network-variants' as never,
              id: v.id,
              data: {
                text: v.text,
                linkUrl: v.linkUrl || updateData.canonicalUrl || draft.canonicalUrl,
                attachments: v.attachments || [],
                // Modification resets approval on variant
                status: 'draft',
                approvalHash: null,
                approvedAt: null,
                approvedBy: null,
              } as never,
              overrideAccess: true,
            })
          } else {
            const key = `draft:${draft.id}:${v.accountId}:${Date.now()}`
            await payload.create({
              collection: 'social-network-variants' as never,
              data: {
                draft: draft.id,
                account: v.accountId,
                label: v.label || `${v.network} variant`,
                network: v.network,
                text: v.text,
                linkUrl: v.linkUrl || updateData.canonicalUrl || draft.canonicalUrl,
                attachments: v.attachments || [],
                status: 'draft',
                idempotencyKey: key,
              } as never,
              overrideAccess: true,
            })
          }
        }

        // Updating contents resets draft back to draft status for re-review
        updateData.status = 'draft'
      }

      const updatedDraft = await payload.update({
        collection: 'social-drafts' as never,
        id: draft.id,
        data: updateData as never,
        overrideAccess: true,
      })

      const freshVariants = await payload.find({
        collection: 'social-network-variants' as never,
        where: { draft: { equals: draft.id } },
        depth: 1,
        overrideAccess: true,
      })

      return NextResponse.json({
        success: true,
        draft: updatedDraft,
        variants: freshVariants.docs,
      })
    }

    // ==========================================
    // ACTION: SUBMIT-REVIEW
    // ==========================================
    if (action === 'submit-review') {
      if (draft.status !== 'draft') {
        return NextResponse.json(
          { error: `Only drafts in draft status can be submitted for review. Current: ${draft.status}` },
          { status: 400 },
        )
      }

      await payload.update({
        collection: 'social-drafts' as never,
        id: draft.id,
        data: { status: 'review' } as never,
        overrideAccess: true,
      })

      // Also set variants to review
      const variants = await payload.find({
        collection: 'social-network-variants' as never,
        where: { draft: { equals: draft.id } },
        overrideAccess: true,
      })
      for (const v of variants.docs as any[]) {
        await payload.update({
          collection: 'social-network-variants' as never,
          id: v.id,
          data: { status: 'review' } as never,
          overrideAccess: true,
        })
      }

      return NextResponse.json({ success: true, status: 'review' })
    }

    // ==========================================
    // ACTION: APPROVE
    // ==========================================
    if (action === 'approve') {
      // Permission check: only owner or administrator role can approve
      const role = String(auth?.user?.role || '')
      if (!['owner', 'administrator'].includes(role) && !grant.isGlobalOwner) {
        return NextResponse.json(
          { error: 'Forbidden. Only owners or administrators can approve social drafts.' },
          { status: 403 },
        )
      }

      // If draft links source content, verify content is published before external action
      if (draft.sourceContent) {
        const sourceDoc = (await payload.findByID({
          collection: 'content',
          id: idOf(draft.sourceContent),
          depth: 0,
          overrideAccess: true,
        })) as any
        if (sourceDoc && sourceDoc.status !== 'published') {
          return NextResponse.json(
            { error: 'Canonical source content must be published before social approval.' },
            { status: 400 },
          )
        }
      }

      const variants = await payload.find({
        collection: 'social-network-variants' as never,
        where: { draft: { equals: draft.id } },
        depth: 0,
        overrideAccess: true,
      })

      if (!variants.docs.length) {
        return NextResponse.json(
          { error: 'Draft has no variants to approve.' },
          { status: 400 },
        )
      }

      const now = new Date().toISOString()
      const approverId = auth?.user?.id

      for (const v of variants.docs as any[]) {
        const hash = socialHash({
          network: v.network,
          text: v.text,
          linkUrl: v.linkUrl,
          attachments: (v.attachments || []).map((att: any) => ({
            mediaAssetId: idOf(att),
            role: 'image',
          })),
        })

        await payload.update({
          collection: 'social-network-variants' as never,
          id: v.id,
          data: {
            status: 'approved',
            approvalHash: hash,
            approvedAt: now,
            approvedBy: approverId || undefined,
          } as never,
          overrideAccess: true,
        })
      }

      const updatedDraft = await payload.update({
        collection: 'social-drafts' as never,
        id: draft.id,
        data: { status: 'approved' } as never,
        overrideAccess: true,
      })

      return NextResponse.json({
        success: true,
        draft: updatedDraft,
        status: 'approved',
      })
    }

    // ==========================================
    // ACTION: DECLINE
    // ==========================================
    if (action === 'decline') {
      const role = String(auth?.user?.role || '')
      if (!['owner', 'administrator'].includes(role) && !grant.isGlobalOwner) {
        return NextResponse.json(
          { error: 'Forbidden. Only owners or administrators can decline social drafts.' },
          { status: 403 },
        )
      }

      const reason = body.reason || 'Declined during editorial review.'

      // Declined drafts move to cancelled, denying unsent execution
      await payload.update({
        collection: 'social-drafts' as never,
        id: draft.id,
        data: {
          status: 'cancelled',
          provenance: { ...(draft.provenance || {}), declineReason: reason, declinedAt: new Date().toISOString() },
        } as never,
        overrideAccess: true,
      })

      const variants = await payload.find({
        collection: 'social-network-variants' as never,
        where: { draft: { equals: draft.id } },
        overrideAccess: true,
      })
      for (const v of variants.docs as any[]) {
        await payload.update({
          collection: 'social-network-variants' as never,
          id: v.id,
          data: { status: 'cancelled' } as never,
          overrideAccess: true,
        })
      }

      return NextResponse.json({
        success: true,
        status: 'cancelled',
        message: 'Draft declined and cancelled. It will not be sent.',
      })
    }

    // ==========================================
    // ACTION: SCHEDULE
    // ==========================================
    if (action === 'schedule') {
      const role = String(auth?.user?.role || '')
      if (!['owner', 'administrator'].includes(role) && !grant.isGlobalOwner) {
        return NextResponse.json(
          { error: 'Forbidden. Only owners or administrators can schedule social distribution.' },
          { status: 403 },
        )
      }

      if (draft.status !== 'approved') {
        return NextResponse.json(
          { error: 'Draft must be approved before it can be scheduled for release.' },
          { status: 400 },
        )
      }

      const scheduledFor = body.scheduledFor || new Date(Date.now() + 3600000).toISOString()
      const timeZone = body.timeZone || 'UTC'

      const variants = await payload.find({
        collection: 'social-network-variants' as never,
        where: { draft: { equals: draft.id } },
        depth: 0,
        overrideAccess: true,
      })

      const queueDocs: any[] = []
      for (const v of variants.docs as any[]) {
        if (v.status !== 'approved') continue

        const key = `scheduled:draft:${draft.id}:${v.id}:${v.approvalHash || 'approved'}`
        const existing = await payload.find({
          collection: 'social-queue-items' as never,
          where: { idempotencyKey: { equals: key } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })

        let qDoc: any
        if (existing.docs.length > 0) {
          qDoc = existing.docs[0]
          await payload.update({
            collection: 'social-queue-items' as never,
            id: qDoc.id,
            data: {
              scheduledFor,
              timeZone,
              status: 'scheduled',
            } as never,
            overrideAccess: true,
          })
        } else {
          qDoc = await payload.create({
            collection: 'social-queue-items' as never,
            data: {
              variant: v.id,
              account: idOf(v.account),
              scheduledFor,
              timeZone,
              status: 'scheduled',
              idempotencyKey: key,
            } as never,
            overrideAccess: true,
          })
        }

        await payload.update({
          collection: 'social-network-variants' as never,
          id: v.id,
          data: { status: 'scheduled' } as never,
          overrideAccess: true,
        })

        queueDocs.push(qDoc)
      }

      await payload.update({
        collection: 'social-drafts' as never,
        id: draft.id,
        data: { status: 'scheduled' } as never,
        overrideAccess: true,
      })

      return NextResponse.json({
        success: true,
        status: 'scheduled',
        scheduledFor,
        timeZone,
        queueCount: queueDocs.length,
        queueItems: queueDocs,
      })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Social drafts request failed.' },
      { status: 500 },
    )
  }
}
