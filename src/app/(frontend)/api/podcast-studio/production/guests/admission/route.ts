/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { getGuestAdmission } from '@/modules/podcast-studio/production'
import { loadShow, privateJson, relationId, requireSiteAccess, resolveStaff } from '../../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-04 (POD-REQ-10): GET ?showId=&guestId= evaluates the guest
 * admission hook (assertGuestAdmissionReady's non-throwing form) —
 * the same evaluation POD-10 will consume when admitting guests to
 * sessions. `ready: false` under a block policy is the flag, with the
 * missing appearances named.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const user = await resolveStaff(payload, request)
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const url = new URL(request.url)
  const show = await loadShow(payload, url.searchParams.get('showId') ?? '')
  if (!show) return NextResponse.json({ error: 'Podcast show not found.' }, { status: 404 })
  const guestId = url.searchParams.get('guestId') ?? ''
  if (!guestId) return privateJson({ error: 'guestId is required.' }, 400)
  const denied = await requireSiteAccess(payload, user, relationId(show.site))
  if (denied) return denied
  const admission = await getGuestAdmission(payload as never, show, guestId)
  return privateJson({ showId: String(show.id), guestId, ...admission })
}
