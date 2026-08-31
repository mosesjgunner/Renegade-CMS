import config from '@payload-config'
import { getPayload } from 'payload'

import { articleScope, memberFromUser } from '@/modules/collaboration/http'
import { loadConfig } from '@/modules/core/config'
import { heartbeatPresence, leavePresence } from '@/modules/collaboration/realtime'
import { assertTeamPermission } from '@/modules/collaboration/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function context(request: Request, articleId: string) {
  const settings = loadConfig()
  if (!settings.realtime.presenceEnabled)
    throw new Response('Presence is disabled.', { status: 503 })
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  const memberId = memberFromUser(auth.user)
  if (!memberId) throw new Response('Authenticated team member required.', { status: 401 })
  return { settings, payload, memberId, scope: await articleScope(payload, articleId) }
}

export async function GET(request: Request) {
  const articleId = new URL(request.url).searchParams.get('articleId')
  if (!articleId) return Response.json({ error: 'articleId is required.' }, { status: 400 })
  try {
    const value = await context(request, articleId)
    await assertTeamPermission(
      value.payload as unknown as import('@/modules/collaboration/realtime').RealtimeStore,
      value.memberId,
      value.scope,
      'content.read',
    )
    const result = await value.payload.find({
      collection: 'realtime-presence',
      where: {
        and: [
          { article: { equals: articleId } },
          { expiresAt: { greater_than: new Date().toISOString() } },
        ],
      },
      sort: '-lastHeartbeatAt',
      limit: 100,
      overrideAccess: true,
    } as never)
    return Response.json({
      presence: (result.docs as unknown as Array<Record<string, unknown>>).map((entry) => {
        const member = entry.member
        return {
          memberId:
            typeof member === 'string'
              ? member
              : (member as { id?: string } | null | undefined)?.id,
          mode: entry.mode,
          expiresAt: entry.expiresAt,
        }
      }),
    })
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status })
    return Response.json({ error: 'Presence access denied.' }, { status: 403 })
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    articleId?: string
    clientId?: string
    mode?: 'viewing' | 'editing'
  } | null
  if (!body?.articleId || !body.clientId || !['viewing', 'editing'].includes(String(body.mode)))
    return Response.json({ error: 'articleId, clientId, and mode are required.' }, { status: 400 })
  try {
    const value = await context(request, body.articleId)
    await heartbeatPresence(
      value.payload as unknown as import('@/modules/collaboration/realtime').RealtimeStore,
      {
        memberId: value.memberId,
        scope: value.scope,
        articleId: body.articleId,
        clientId: body.clientId,
        mode: body.mode!,
        ttlSeconds: value.settings.realtime.presenceTtlSeconds,
      },
    )
    return Response.json({
      status: 'ok',
      expiresInSeconds: value.settings.realtime.presenceTtlSeconds,
    })
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status })
    return Response.json({ error: 'Presence access denied.' }, { status: 403 })
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    articleId?: string
    clientId?: string
  } | null
  if (!body?.articleId || !body.clientId)
    return Response.json({ error: 'articleId and clientId are required.' }, { status: 400 })
  try {
    const value = await context(request, body.articleId)
    await leavePresence(
      value.payload as unknown as import('@/modules/collaboration/realtime').RealtimeStore,
      {
        memberId: value.memberId,
        scope: value.scope,
        articleId: body.articleId,
        clientId: body.clientId,
      },
    )
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status })
    return Response.json({ error: 'Presence access denied.' }, { status: 403 })
  }
}
