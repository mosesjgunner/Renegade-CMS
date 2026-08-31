/* eslint-disable @typescript-eslint/no-explicit-any -- Payload's dynamic collection API is intentionally untyped at this boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import {
  authenticateMachineCredential,
  canAccess,
  INTEGRATION_API_VERSION,
  type IntegrationScope,
  type MachineCredential,
} from '@/modules/integrations/service'
import {
  redeliverWebhook,
  resolveWebhookSecret,
  verifyWebhookEndpoint,
} from '@/modules/integrations/webhooks'
import { recordExecutionEvent } from '@/modules/execution/service'
import { consumeApiRateLimit } from '@/modules/integrations/rate-limit'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-renegade-api-version': INTEGRATION_API_VERSION,
      ...extra,
    },
  })
const problem = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  json({ error: { code, message, fields } }, status)
const asId = (value: unknown) =>
  String(typeof value === 'object' && value ? (value as { id?: unknown }).id : (value ?? ''))
const clientRecord = (doc: Record<string, any>): MachineCredential => ({
  id: String(doc.id),
  name: String(doc.name),
  siteId: asId(doc.site),
  publicationId: doc.publication ? asId(doc.publication) : null,
  spaceId: doc.space ? asId(doc.space) : null,
  tokenPrefix: String(doc.tokenPrefix),
  tokenHash: String(doc.tokenHash),
  scopes: Array.isArray(doc.scopes) ? doc.scopes : [],
  expiresAt: doc.expiresAt ?? null,
  revokedAt: doc.revokedAt ?? null,
})

function version(request: Request) {
  const requested = request.headers.get('x-renegade-api-version') ?? request.headers.get('accept')
  if (!requested || requested.includes('v1')) return null
  return problem(
    406,
    'unsupported_version',
    'Only API version v1 is supported. Deprecated versions return 410 after their published sunset date.',
  )
}
async function authenticate(request: Request, scope: IntegrationScope) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) return { error: problem(401, 'unauthorized', 'Use a Bearer machine credential.') }
  const payload = await getPayload({ config })
  const prefix = token.split('.')[0]
  const result = await payload.find({
    collection: 'api-clients' as never,
    where: { tokenPrefix: { equals: prefix } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const credential = authenticateMachineCredential(
    token,
    result.docs.map((doc) => clientRecord(doc as Record<string, any>)),
  )
  if (!credential)
    return { error: problem(401, 'unauthorized', 'Credential is invalid, expired, or revoked.') }
  if (!credential.scopes.includes(scope))
    return { error: problem(403, 'insufficient_scope', `This operation requires ${scope}.`) }
  const rate = consumeApiRateLimit(
    credential.id,
    scope.endsWith('.write') || scope === 'webhooks.manage',
  )
  if (!rate.allowed)
    return {
      error: problem(429, 'rate_limited', 'Rate limit exceeded.'),
      retryAfter: rate.retryAfter,
    }
  await payload.update({
    collection: 'api-clients' as never,
    id: credential.id,
    data: { lastUsedAt: new Date().toISOString() } as never,
    overrideAccess: true,
  } as never)
  return { payload, credential }
}
function contentView(doc: Record<string, any>) {
  return {
    id: String(doc.id),
    type: 'content',
    content_type: doc.contentType,
    title: doc.title,
    slug: doc.slug,
    canonical_path: doc.canonicalPath,
    summary: doc.summary ?? null,
    excerpt: doc.excerpt ?? null,
    status: doc.status,
    published_at: doc.publishedAt ?? null,
    updated_at: doc.updatedAt ?? null,
    featured: Boolean(doc.featured),
    tags: Array.isArray(doc.tags) ? doc.tags.map(asId) : [],
  }
}
function webhookView(doc: Record<string, any>) {
  return {
    id: String(doc.id),
    events: Array.isArray(doc.events) ? doc.events : [],
    target: doc.target,
    status: doc.status,
    failure_count: Number(doc.failureCount ?? 0),
    rotated_at: doc.rotatedAt ?? null,
    created_at: doc.createdAt ?? null,
  }
}
const matchScope = (credential: MachineCredential, doc: Record<string, any>) =>
  canAccess(credential, 'content.read', {
    siteId: asId(doc.site),
    publicationId: doc.publication ? asId(doc.publication) : null,
    spaceId: doc.space ? asId(doc.space) : null,
  })

export async function GET(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  const mismatch = version(request)
  if (mismatch) return mismatch
  const segments = (await context.params).segments
  if (segments[0] === 'content') {
    const auth = await authenticate(request, 'content.read')
    if ('error' in auth)
      return auth.retryAfter
        ? new Response(await auth.error.text(), {
            status: 429,
            headers: {
              'content-type': 'application/json',
              'retry-after': String(auth.retryAfter),
              'x-renegade-api-version': INTEGRATION_API_VERSION,
            },
          })
        : auth.error
    const url = new URL(request.url),
      page = Math.max(1, Number(url.searchParams.get('page') ?? 1)),
      limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25)))
    const where: any = { site: { equals: auth.credential.siteId } }
    const requestedStatus = url.searchParams.get('status')
    const canReadDrafts = auth.credential.scopes.includes('content.draft.read')
    if (requestedStatus) where.and = [{ status: { equals: requestedStatus } }]
    else if (!canReadDrafts) where.and = [{ status: { in: ['published', 'updated'] } }]
    const result = await auth.payload.find({
      collection: 'content' as never,
      where,
      page,
      limit,
      depth: 0,
      sort: url.searchParams.get('sort') === 'title' ? 'title' : '-updatedAt',
      overrideAccess: true,
    } as never)
    const docs = result.docs.filter((doc) =>
      matchScope(auth.credential, doc as Record<string, any>),
    ) as Record<string, any>[]
    if (segments[1]) {
      const doc = docs.find((item) => String(item.id) === segments[1])
      return doc
        ? json({ data: contentView(doc) })
        : problem(404, 'not_found', 'Content was not found.')
    }
    return json({
      data: docs.map(contentView),
      pagination: { page, limit, total: result.totalDocs, total_pages: result.totalPages },
    })
  }
  if (segments[0] === 'webhooks') {
    const auth = await authenticate(request, 'webhooks.manage')
    if ('error' in auth)
      return auth.retryAfter
        ? new Response(await auth.error.text(), {
            status: 429,
            headers: {
              'content-type': 'application/json',
              'retry-after': String(auth.retryAfter),
              'x-renegade-api-version': INTEGRATION_API_VERSION,
            },
          })
        : auth.error
    if (segments[1] === 'deliveries') {
      const subscriptions = await auth.payload.find({
        collection: 'webhook-subscriptions' as never,
        where: { site: { equals: auth.credential.siteId } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      } as never)
      const result = await auth.payload.find({
        collection: 'webhook-deliveries' as never,
        where: { subscription: { in: subscriptions.docs.map((doc) => String(doc.id)) } },
        page: 1,
        limit: 100,
        depth: 0,
        overrideAccess: true,
      } as never)
      return json({
        data: (result.docs as any[]).map((doc) => ({
          id: String(doc.id),
          event_id: doc.eventId,
          event_type: doc.eventType,
          state: doc.state,
          attempts: doc.attempts,
          next_attempt_at: doc.nextAttemptAt ?? null,
          response: doc.redactedResponse ?? null,
        })),
      })
    }
    const result = await auth.payload.find({
      collection: 'webhook-subscriptions' as never,
      where: { site: { equals: auth.credential.siteId } },
      page: 1,
      limit: 100,
      depth: 0,
      overrideAccess: true,
    } as never)
    return json({ data: result.docs.map((doc) => webhookView(doc as Record<string, any>)) })
  }
  return problem(404, 'not_found', 'Unknown API resource.')
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
) {
  const mismatch = version(request)
  if (mismatch) return mismatch
  const segments = (await context.params).segments
  if (segments[0] !== 'webhooks' || !segments[1])
    return problem(404, 'not_found', 'Unknown API operation.')
  const auth = await authenticate(request, 'webhooks.manage')
  if ('error' in auth) return auth.error
  const body = (await request.json().catch(() => null)) as Record<string, any> | null
  if (!body?.secret_ref) return problem(422, 'validation_error', 'secret_ref is required.')
  const existing = await auth.payload
    .findByID({
      collection: 'webhook-subscriptions' as never,
      id: segments[1],
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  if (!existing || asId((existing as any).site) !== auth.credential.siteId)
    return problem(404, 'not_found', 'Webhook subscription was not found.')
  const secret = await resolveWebhookSecret(String(body.secret_ref))
  if (!secret)
    return problem(422, 'secret_unavailable', 'secret_ref cannot be resolved by this deployment.')
  try {
    await verifyWebhookEndpoint(String((existing as any).target), secret)
  } catch (error) {
    return problem(
      422,
      'verification_failed',
      error instanceof Error ? error.message : 'Endpoint verification failed.',
    )
  }
  const updated = await auth.payload.update({
    collection: 'webhook-subscriptions' as never,
    id: segments[1],
    data: {
      secretRef: body.secret_ref,
      rotatedAt: new Date().toISOString(),
      status: 'active',
      failureCount: 0,
    } as never,
    overrideAccess: true,
  } as never)
  return json({ data: webhookView(updated as Record<string, any>) })
}

export async function POST(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  const mismatch = version(request)
  if (mismatch) return mismatch
  const segments = (await context.params).segments
  const scope: IntegrationScope =
    segments[0] === 'webhooks' ? 'webhooks.manage' : 'content.draft.write'
  const auth = await authenticate(request, scope)
  if ('error' in auth)
    return auth.retryAfter
      ? new Response(await auth.error.text(), {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': String(auth.retryAfter),
            'x-renegade-api-version': INTEGRATION_API_VERSION,
          },
        })
      : auth.error
  const body = (await request.json().catch(() => null)) as Record<string, any> | null
  if (!body) return problem(400, 'validation_error', 'Request body must be JSON.')
  if (segments[0] === 'content') {
    const key = request.headers.get('idempotency-key')
    if (!key || key.length > 255)
      return problem(
        400,
        'idempotency_required',
        'An Idempotency-Key header is required for writes.',
      )
    const prior = await auth.payload.find({
      collection: 'api-request-records' as never,
      where: { idempotencyKey: { equals: key } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    if (prior.docs[0])
      return json((prior.docs[0] as any).response, Number((prior.docs[0] as any).responseStatus), {
        'idempotency-replayed': 'true',
      })
    const fields: Record<string, string> = {}
    if (!body.title) fields.title = 'is required'
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(body.slug ?? '')))
      fields.slug = 'must be a canonical slug'
    if (!String(body.canonical_path ?? '').startsWith('/'))
      fields.canonical_path = 'must be an absolute path'
    if (Object.keys(fields).length)
      return problem(422, 'validation_error', 'One or more fields are invalid.', fields)
    const created = await auth.payload.create({
      collection: 'content' as never,
      data: {
        site: auth.credential.siteId,
        publication: auth.credential.publicationId ?? undefined,
        space: auth.credential.spaceId ?? undefined,
        contentType: body.content_type ?? 'article',
        title: body.title,
        slug: body.slug,
        canonicalPath: body.canonical_path,
        summary: body.summary,
        excerpt: body.excerpt,
        status: body.status ?? 'draft',
      } as never,
      overrideAccess: true,
    } as never)
    const response = { data: contentView(created as Record<string, any>) }
    await auth.payload.create({
      collection: 'api-request-records' as never,
      data: {
        site: auth.credential.siteId,
        publication: auth.credential.publicationId ?? undefined,
        space: auth.credential.spaceId ?? undefined,
        client: auth.credential.id,
        idempotencyKey: key,
        method: 'POST',
        path: '/api/v1/content',
        responseStatus: 201,
        response,
      } as never,
      overrideAccess: true,
    } as never)
    await recordExecutionEvent(auth.payload as any, {
      siteId: auth.credential.siteId,
      tenantId: auth.credential.publicationId ?? auth.credential.siteId,
      actor: { kind: 'service', id: auth.credential.id },
      eventType: 'content.created',
      idempotencyKey: `event:${key}`,
      privacyClass: 'public',
      payload: {
        contentId: String(created.id),
        status: (created as any).status,
        contentType: (created as any).contentType,
        canonicalPath: (created as any).canonicalPath,
      },
    })
    return json(response, 201)
  }
  if (segments[0] === 'webhooks' && !segments[1]) {
    if (
      !Array.isArray(body.events) ||
      !body.events.every((event) => typeof event === 'string') ||
      !body.target ||
      !body.secret_ref
    )
      return problem(422, 'validation_error', 'events, target, and secret_ref are required.')
    const secret = await resolveWebhookSecret(String(body.secret_ref))
    if (!secret)
      return problem(422, 'secret_unavailable', 'secret_ref cannot be resolved by this deployment.')
    try {
      await verifyWebhookEndpoint(String(body.target), secret)
    } catch (error) {
      return problem(
        422,
        'verification_failed',
        error instanceof Error ? error.message : 'Endpoint verification failed.',
      )
    }
    const created = await auth.payload.create({
      collection: 'webhook-subscriptions' as never,
      data: {
        site: auth.credential.siteId,
        publication: auth.credential.publicationId ?? undefined,
        space: auth.credential.spaceId ?? undefined,
        events: body.events,
        target: body.target,
        secretRef: body.secret_ref,
        status: 'active',
        failureCount: 0,
      } as never,
      overrideAccess: true,
    } as never)
    return json({ data: webhookView(created as Record<string, any>) }, 201)
  }
  if (segments[0] === 'webhooks' && segments[2] === 'redeliver') {
    const delivery = await redeliverWebhook(auth.payload as any, segments[1]!)
    return json({ data: { id: String(delivery.id), state: 'queued' } }, 202)
  }
  return problem(404, 'not_found', 'Unknown API operation.')
}
