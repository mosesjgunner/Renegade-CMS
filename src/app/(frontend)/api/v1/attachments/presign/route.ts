import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { resolveCommunityActor } from '@/modules/community/service'
import { ConversationError } from '@/modules/community/conversation-composer'
import { createMessageAttachmentPresign } from '@/modules/community/message-attachments'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? request.headers.get('x-site-id') ?? 'default')
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId)
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const attachment = await createMessageAttachmentPresign(payload, loadConfig(), {
      siteId,
      memberId: actor.memberId,
      filename: String(body.filename ?? ''),
      mimeType: String(body.mimeType ?? ''),
      size: Number(body.size),
    })
    return Response.json(attachment, {
      status: 201,
      headers: { 'cache-control': 'private, no-store' },
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not create upload.' },
      { status: error instanceof ConversationError ? error.status : 500 },
    )
  }
}
