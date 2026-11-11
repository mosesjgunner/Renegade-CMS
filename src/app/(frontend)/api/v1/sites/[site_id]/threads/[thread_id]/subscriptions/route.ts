import config from '@payload-config'
import { getPayload } from 'payload'

import { resolveCommunityActor } from '@/modules/community/service'
import {
  isSubscribedToThread,
  subscribeToThread,
  unsubscribeFromThread,
} from '@/modules/community/thread-lifecycle'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-renegade-api-version': 'v1',
      ...extra,
    },
  })

const problem = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status)

export async function GET(
  request: Request,
  context: { params: Promise<{ site_id: string; thread_id: string }> },
) {
  const { site_id, thread_id } = await context.params
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)

  // TA-P1-2: identity comes from the resolved session actor only. This
  // route previously fell back to a caller-supplied x-member-id header,
  // which let anyone impersonate any member's subscription state; the
  // resolver never sets userId, so the staff branch was dead scaffolding.
  const memberId = actor.memberId

  if (!memberId) {
    return problem(401, 'UNAUTHORIZED', 'Authentication required.')
  }

  const subscribed = await isSubscribedToThread(payload, {
    threadId: thread_id,
    memberId: String(memberId),
  })

  return json({ data: { subscribed, threadId: thread_id, memberId: String(memberId) } }, 200)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ site_id: string; thread_id: string }> },
) {
  const { site_id, thread_id } = await context.params
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)

  // TA-P1-2: identity comes from the resolved session actor only. This
  // route previously fell back to a caller-supplied x-member-id header,
  // which let anyone impersonate any member's subscription state; the
  // resolver never sets userId, so the staff branch was dead scaffolding.
  const memberId = actor.memberId

  if (!memberId) {
    return problem(401, 'UNAUTHORIZED', 'Authentication required to subscribe.')
  }

  const result = await subscribeToThread(payload, {
    siteId: site_id,
    threadId: thread_id,
    memberId: String(memberId),
  })

  return json({ data: result }, 200)
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ site_id: string; thread_id: string }> },
) {
  const { site_id, thread_id } = await context.params
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)

  // TA-P1-2: identity comes from the resolved session actor only. This
  // route previously fell back to a caller-supplied x-member-id header,
  // which let anyone impersonate any member's subscription state; the
  // resolver never sets userId, so the staff branch was dead scaffolding.
  const memberId = actor.memberId

  if (!memberId) {
    return problem(401, 'UNAUTHORIZED', 'Authentication required to unsubscribe.')
  }

  const result = await unsubscribeFromThread(payload, {
    siteId: site_id,
    threadId: thread_id,
    memberId: String(memberId),
  })

  return json({ data: result }, 200)
}
