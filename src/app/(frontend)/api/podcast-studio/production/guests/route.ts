/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { createPodcastGuest, PODCAST_GUEST_COLLECTION } from '@/modules/podcast-studio/production'
import {
  privateJson,
  productionErrorResponse,
  readJson,
  requireSiteAccess,
  resolveStaff,
} from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-04 guest book (POD-REQ-10).
 *
 * GET  ?siteId= — the site's guest-book records.
 * POST { siteId, name, email?, contact?, bio?, links?, authorId? } —
 *      add a guest to the site's book.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const user = await resolveStaff(payload, request)
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? ''
  const denied = await requireSiteAccess(payload, user, siteId)
  if (denied) return denied
  const result = await payload.find({
    collection: PODCAST_GUEST_COLLECTION as never,
    where: { site: { equals: siteId } },
    sort: 'name',
    limit: 200,
    depth: 0,
    overrideAccess: true,
  } as never)
  return privateJson({
    guests: (result.docs as any[]).map((guest) => ({
      id: String(guest.id),
      name: guest.name,
      email: guest.email ?? null,
      bio: guest.bio ?? null,
    })),
  })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const user = await resolveStaff(payload, request)
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const body = await readJson(request)
  const siteId = typeof body.siteId === 'string' ? body.siteId : ''
  const denied = await requireSiteAccess(payload, user, siteId)
  if (denied) return denied
  try {
    const guest = await createPodcastGuest(payload as never, {
      siteId,
      name: typeof body.name === 'string' ? body.name : '',
      email: typeof body.email === 'string' ? body.email : undefined,
      contact: body.contact ?? undefined,
      bio: typeof body.bio === 'string' ? body.bio : undefined,
      links: body.links ?? undefined,
      authorId: typeof body.authorId === 'string' ? body.authorId : undefined,
    })
    return privateJson({ id: String(guest.id), name: guest.name }, 201)
  } catch (error) {
    return productionErrorResponse(error)
  }
}
