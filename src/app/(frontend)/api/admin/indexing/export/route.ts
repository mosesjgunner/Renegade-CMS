import config from '@payload-config'
import { getPayload } from 'payload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role)))
    return Response.json({ error: 'Staff access required.' }, { status: 403 })

  const changes: Array<{
    idempotencyKey?: string | null
    occurredAt: string
    siteId?: string
    action?: string
    url?: string
    reason?: string
    version?: string
    state: string
  }> = []

  let page = 1
  for (;;) {
    const events = await payload.find({
      collection: 'execution-events',
      where: { eventType: { equals: 'discovery.indexing.changed' } },
      sort: 'createdAt',
      limit: 250,
      page,
      depth: 0,
      overrideAccess: true,
    } as never)

    for (const raw of events.docs) {
      const event = raw as unknown as Record<string, unknown>
      const detail = event.payload as Record<string, unknown>
      changes.push({
        idempotencyKey: event.idempotencyKey ? String(event.idempotencyKey) : null,
        occurredAt: String(event.occurredAt || event.createdAt),
        siteId: detail?.siteId ? String(detail.siteId) : undefined,
        action: detail?.action ? String(detail.action) : undefined,
        url: detail?.url ? String(detail.url) : undefined,
        reason: detail?.reason ? String(detail.reason) : undefined,
        version: detail?.version ? String(detail.version) : undefined,
        state: String(detail?.indexingState || 'queued'),
      })
    }

    if (!events.hasNextPage) break
    page += 1
  }

  return Response.json(
    { format: 'renegade-indexing-handoff', version: 1, provider: 'manual', changes },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'attachment; filename="renegade-indexing-handoff.json"',
      },
    },
  )
}
