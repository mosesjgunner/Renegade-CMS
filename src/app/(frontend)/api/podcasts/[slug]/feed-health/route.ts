/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { inspectPodcastFeed } from '@/modules/media/publishing'
import { loadConfig } from '@/modules/core/config'
import { checkOperatorSiteAccess } from '@/modules/operations/operator-grants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Per-show podcast feed health (POD-REQ-05): staff-authenticated structural
 * validation of the show's live feed. Returns the validator's named errors
 * and warnings so an operator can fix the show config, not just see a red
 * light. Read-only; it never submits the feed anywhere.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { slug } = await params
  const checkedAt = new Date().toISOString()

  const shows = await payload.find({
    collection: 'podcast-shows',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const show = shows.docs[0] as any
  if (!show) return NextResponse.json({ error: 'Podcast show not found.' }, { status: 404 })

  const siteId = typeof show.site === 'string' ? show.site : show.site?.id
  const hasAccess = await checkOperatorSiteAccess(payload, auth.user as never, siteId)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Insufficient site authority.' }, { status: 403 })
  }

  const feedUrl = new URL(`/podcasts/${slug}/feed.xml`, loadConfig().appUrl).toString()
  let feedResponse: Response
  try {
    feedResponse = await fetch(feedUrl)
  } catch (error) {
    return NextResponse.json({
      slug,
      valid: false,
      errors: [
        `Feed could not be fetched: ${error instanceof Error ? error.message : String(error)}`,
      ],
      warnings: [],
      checkedAt,
    })
  }
  if (!feedResponse.ok) {
    return NextResponse.json({
      slug,
      valid: false,
      errors: [
        `Feed route returned HTTP ${feedResponse.status} (is RSS enabled and the show published?).`,
      ],
      warnings: [],
      checkedAt,
    })
  }

  const inspection = inspectPodcastFeed(await feedResponse.text())
  return NextResponse.json(
    {
      slug,
      valid: inspection.valid,
      errors: inspection.errors,
      warnings: inspection.warnings,
      counts: inspection.counts,
      checkedAt,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
