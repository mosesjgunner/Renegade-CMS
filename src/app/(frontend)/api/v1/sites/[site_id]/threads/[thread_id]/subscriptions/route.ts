import config from '@payload-config'
import { getPayload } from 'payload'

import { discussionTarget, resolveCommunityActor } from '@/modules/community/service'
import { discussionRequestSite } from '@/modules/community/discussion-operations'
import { evaluateCommunityPolicy } from '@/modules/community/policy'
import { verifyCsrf } from '@/modules/identity/member-identity'
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

async function subscriptionThread(
  payload: Awaited<ReturnType<typeof getPayload>>,
  siteId: string,
  threadId: string,
) {
  const discussion = await payload
    .findByID({ collection: 'discussions', id: threadId, depth: 0, overrideAccess: true })
    .catch(() => null)
  return discussion && String(discussion.site) === siteId ? discussion : null
}

export async function GET(
  request: Request,
  context: { params: Promise<{ site_id: string; thread_id: string }> },
) {
  const { site_id, thread_id } = await context.params
  const payload = await getPayload({ config })
  if (!(await discussionRequestSite(payload, request.headers, site_id)))
    return problem(404, 'NOT_FOUND', 'Thread unavailable.')
  const actor = await resolveCommunityActor(payload, request.headers, site_id)

  // TA-P1-2: identity comes from the resolved session actor only. This
  // route previously fell back to a caller-supplied x-member-id header,
  // which let anyone impersonate any member's subscription state; the
  // resolver never sets userId, so the staff branch was dead scaffolding.
  const memberId = actor.memberId

  if (!memberId) {
    return problem(401, 'UNAUTHORIZED', 'Authentication required.')
  }
  if (!(await subscriptionThread(payload, site_id, thread_id)))
    return problem(404, 'NOT_FOUND', 'Thread unavailable.')

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
  if (!verifyCsrf(request.headers)) return problem(403, 'INVALID_CSRF', 'Invalid CSRF token.')
  const payload = await getPayload({ config })
  if (!(await discussionRequestSite(payload, request.headers, site_id)))
    return problem(404, 'NOT_FOUND', 'Thread unavailable.')
  const actor = await resolveCommunityActor(payload, request.headers, site_id)

  // TA-P1-2: identity comes from the resolved session actor only. This
  // route previously fell back to a caller-supplied x-member-id header,
  // which let anyone impersonate any member's subscription state; the
  // resolver never sets userId, so the staff branch was dead scaffolding.
  const memberId = actor.memberId

  if (!memberId || actor.status !== 'active') {
    return problem(401, 'UNAUTHORIZED', 'Authentication required to subscribe.')
  }

  const thread = await subscriptionThread(payload, site_id, thread_id)
  if (
    !thread ||
    !evaluateCommunityPolicy(
      { siteId: site_id, actor },
      {
        siteId: site_id,
        ownerId: String(thread.owner ?? ''),
        status: thread.status,
        moderationState: thread.moderationState,
        visibility: thread.visibility,
      },
      'read',
    ).allowed
  )
    return problem(404, 'NOT_FOUND', 'Thread unavailable.')
  if (thread.kind === 'attached') {
    const attached = thread.attachedTo
    const id =
      typeof attached?.value === 'object' && attached.value !== null
        ? String(attached.value.id)
        : String(attached?.value ?? '')
    if (!id || !['content', 'media-assets', 'albums'].includes(String(attached?.relationTo)))
      return problem(404, 'NOT_FOUND', 'Thread unavailable.')
    try {
      await discussionTarget(
        payload,
        site_id,
        attached!.relationTo as 'content' | 'media-assets' | 'albums',
        id,
      )
    } catch {
      return problem(404, 'NOT_FOUND', 'Thread unavailable.')
    }
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
  if (!verifyCsrf(request.headers)) return problem(403, 'INVALID_CSRF', 'Invalid CSRF token.')
  const payload = await getPayload({ config })
  if (!(await discussionRequestSite(payload, request.headers, site_id)))
    return problem(404, 'NOT_FOUND', 'Thread unavailable.')
  const actor = await resolveCommunityActor(payload, request.headers, site_id)

  // TA-P1-2: identity comes from the resolved session actor only. This
  // route previously fell back to a caller-supplied x-member-id header,
  // which let anyone impersonate any member's subscription state; the
  // resolver never sets userId, so the staff branch was dead scaffolding.
  const memberId = actor.memberId

  if (!memberId) {
    return problem(401, 'UNAUTHORIZED', 'Authentication required to unsubscribe.')
  }
  if (!(await subscriptionThread(payload, site_id, thread_id)))
    return problem(404, 'NOT_FOUND', 'Thread unavailable.')

  const result = await unsubscribeFromThread(payload, {
    siteId: site_id,
    threadId: thread_id,
    memberId: String(memberId),
  })

  return json({ data: result }, 200)
}
