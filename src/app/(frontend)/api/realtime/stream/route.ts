import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { memberFromUser } from '@/modules/collaboration/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const encoder = new TextEncoder()
const sse = (event: string, id: number, data: unknown) =>
  encoder.encode(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

export async function GET(request: Request) {
  const appConfig = loadConfig()
  if (!appConfig.realtime.enabled)
    return Response.json(
      { error: 'Realtime is disabled; use ordinary HTTP refresh.' },
      { status: 503 },
    )
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  const memberId = memberFromUser(auth.user)
  if (!memberId)
    return Response.json({ error: 'Authenticated team member required.' }, { status: 401 })
  const scopeKey = new URL(request.url).searchParams.get('scope')
  if (!scopeKey) return Response.json({ error: 'scope is required.' }, { status: 400 })
  const [kind, value] = scopeKey.split(':', 2)
  if (!value || !['site', 'publication', 'space'].includes(kind))
    return Response.json({ error: 'Invalid scope.' }, { status: 400 })
  // Use the stored membership scope directly; its site relation is irrelevant to this check.
  try {
    const membership = await payload.find({
      collection: 'team-memberships',
      where: {
        and: [
          { member: { equals: memberId } },
          { scopeKey: { equals: scopeKey } },
          { status: { equals: 'active' } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    } as never)
    if (!membership.docs[0]) throw new Error('Team scope access denied.')
  } catch {
    return Response.json({ error: 'Team scope access denied.' }, { status: 403 })
  }
  let cursor = Number(
    request.headers.get('last-event-id') ?? new URL(request.url).searchParams.get('after') ?? 0,
  )
  if (!Number.isSafeInteger(cursor) || cursor < 0) cursor = 0
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        const membership = await payload.find({
          collection: 'team-memberships',
          where: {
            and: [
              { member: { equals: memberId } },
              { scopeKey: { equals: scopeKey } },
              { status: { equals: 'active' } },
            ],
          },
          limit: 1,
          overrideAccess: true,
        } as never)
        if (!membership.docs[0]) {
          controller.enqueue(sse('access.revoked', cursor, { scope: scopeKey }))
          controller.close()
          return
        }
        const result = await payload.find({
          collection: 'realtime-events',
          where: {
            and: [{ scopeKey: { equals: scopeKey } }, { sequence: { greater_than: cursor } }],
          },
          sort: 'sequence',
          limit: 100,
          overrideAccess: true,
        } as never)
        for (const event of result.docs as unknown as Array<Record<string, unknown>>) {
          const recipient = event.recipientMember
          if (recipient && String(recipient) !== memberId) continue
          cursor = Number(event.sequence)
          controller.enqueue(
            sse(String(event.kind), cursor, {
              sequence: cursor,
              payload: event.payload,
              occurredAt: event.occurredAt,
            }),
          )
        }
      }
      try {
        await send()
      } catch {
        controller.error(new Error('Realtime stream unavailable.'))
        return
      }
      const timer = setInterval(() => void send().catch(() => controller.close()), 2000)
      const close = () => {
        clearInterval(timer)
        try {
          controller.close()
        } catch {}
      }
      request.signal.addEventListener('abort', close, { once: true })
      controller.enqueue(encoder.encode(': connected\n\n'))
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
