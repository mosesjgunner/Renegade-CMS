import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  createCanonicalSocialPost,
  createSocialDeliveryRecord,
  type CanonicalSocialPost,
  type SocialDeliveryRecord,
} from '@/modules/social/models'
import { type SocialNetwork } from '@/modules/social/contracts'
import { canManageAdminSite } from '@/modules/admin/site-access'

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'staff'].includes(String(user?.role))

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    if (!staffOnly(auth.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const body = (await request.json()) as {
      title?: string
      baseCopy?: string
      canonicalUrl?: string
      imageUrl?: string
      targetAccountIds?: string[]
      variants?: Array<{
        accountId: string
        network: SocialNetwork
        customCopy?: string
        isOverridden?: boolean
        platformSettings?: Record<string, unknown>
      }>
      siteId?: string
      publicationId?: string
    }

    if (!body.siteId || !canManageAdminSite(auth.user, body.siteId))
      return NextResponse.json({ error: 'Choose an assigned site.' }, { status: 403 })
    const selectedAccounts =
      body.targetAccountIds ?? body.variants?.map((variant) => variant.accountId) ?? []
    if (selectedAccounts.length) {
      const accountResult = await payload.find({
        collection: 'social-accounts' as never,
        where: { and: [{ id: { in: selectedAccounts } }, { site: { equals: body.siteId } }] },
        limit: selectedAccounts.length,
        depth: 0,
        overrideAccess: true,
      } as never)
      if (accountResult.docs.length !== new Set(selectedAccounts).size)
        return NextResponse.json(
          { error: 'A target account is outside the selected site.' },
          { status: 403 },
        )
    }

    if (!body.baseCopy && !body.variants?.length) {
      return NextResponse.json(
        { error: 'Post must contain base copy or variants.' },
        { status: 400 },
      )
    }

    const targets =
      body.variants?.map((v) => ({
        accountId: v.accountId,
        network: v.network,
        customCopy: v.isOverridden ? v.customCopy : undefined,
        platformSettings: v.platformSettings,
      })) || []

    const post: CanonicalSocialPost = createCanonicalSocialPost({
      id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      siteId: body.siteId,
      publicationId: body.publicationId || '',
      title: body.title || 'Social Distribution Dispatch',
      baseCopy: body.baseCopy || '',
      canonicalUrl: body.canonicalUrl,
      authorId: String(auth.user?.id || 'admin'),
      targetAccounts: targets,
    })

    const stagedDeliveries: SocialDeliveryRecord[] = post.variants.map((v) =>
      createSocialDeliveryRecord(v),
    )

    return NextResponse.json({
      success: true,
      canonicalPost: {
        id: post.id,
        title: post.title,
        status: post.status,
        variantsCount: post.variants.length,
      },
      stagedDeliveries: stagedDeliveries.map((d: SocialDeliveryRecord) => ({
        deliveryId: d.id,
        network: d.network,
        status: d.status,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Social dispatch failed.' },
      { status: 500 },
    )
  }
}
