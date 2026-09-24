import type { Payload } from 'payload'

export type IndexingState = 'queued' | 'submitted' | 'acknowledged' | 'failed' | 'manual'
export type IndexingChange = {
  siteId: string
  url: string
  action: 'upsert' | 'remove'
  reason:
    | 'publication'
    | 'unpublication'
    | 'slug'
    | 'noindex'
    | 'media-expiry'
    | 'media-replacement'
  version: string
}

export interface WebmasterAdapter {
  readonly id: string
  health(): Promise<{ configured: boolean; detail: string }>
  submit(change: IndexingChange): Promise<{
    state: Exclude<IndexingState, 'queued'>
    remoteId?: string
    retryAfterMs?: number
    detail?: string
  }>
  submitSitemap?(sitemapUrl: string): Promise<{
    state: Exclude<IndexingState, 'queued'>
    remoteId?: string
    retryAfterMs?: number
    detail?: string
  }>
  ingestStatus(
    remoteId: string,
  ): Promise<{ state: 'submitted' | 'acknowledged' | 'failed'; detail?: string }>
}

export class WebmasterProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'rate_limit' | 'authentication' | 'remote' | 'timeout',
    readonly retryAfterMs?: number,
  ) {
    super(message)
  }
}

export async function submitSitemapUrl(
  adapter: WebmasterAdapter,
  sitemapUrl: string,
  timeoutMs = 2_000,
) {
  if (!adapter.submitSitemap) {
    return { state: 'manual' as const, detail: 'Adapter does not support sitemap submission.' }
  }
  try {
    return await Promise.race([
      adapter.submitSitemap(sitemapUrl),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(new WebmasterProviderError('Provider response timed out.', 'timeout', 30_000)),
          timeoutMs,
        ),
      ),
    ])
  } catch (error) {
    if (error instanceof WebmasterProviderError)
      return {
        state: 'failed' as const,
        detail: error.message,
        retryAfterMs: error.retryAfterMs,
        retryable: error.kind !== 'authentication',
      }
    return {
      state: 'failed' as const,
      detail: error instanceof Error ? error.message : 'Provider failed.',
      retryable: true,
    }
  }
}

export async function submitIndexingChange(
  adapter: WebmasterAdapter,
  change: IndexingChange,
  timeoutMs = 2_000,
) {
  try {
    return await Promise.race([
      adapter.submit(change),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(new WebmasterProviderError('Provider response timed out.', 'timeout', 30_000)),
          timeoutMs,
        ),
      ),
    ])
  } catch (error) {
    if (error instanceof WebmasterProviderError)
      return {
        state: 'failed' as const,
        detail: error.message,
        retryAfterMs: error.retryAfterMs,
        retryable: error.kind !== 'authentication',
      }
    return {
      state: 'failed' as const,
      detail: error instanceof Error ? error.message : 'Provider failed.',
      retryable: true,
    }
  }
}

/** Always-working handoff. Exported does not mean submitted to any provider. */
export class ManualWebmasterAdapter implements WebmasterAdapter {
  readonly id = 'manual'
  async health() {
    return {
      configured: true,
      detail: 'Manual JSON export is available; no provider is contacted.',
    }
  }
  async submit(_change?: IndexingChange) {
    void _change
    return { state: 'manual' as const, detail: 'Awaiting operator handoff; not submitted.' }
  }
  async submitSitemap(_sitemapUrl: string) {
    void _sitemapUrl
    return { state: 'manual' as const, detail: 'Awaiting operator handoff; sitemap not submitted.' }
  }
  async ingestStatus() {
    return { state: 'submitted' as const, detail: 'Manual state has no remote acknowledgement.' }
  }
}

export async function processIndexingExecutionEvent(
  payload: Payload,
  event: { id: string; payload: Record<string, unknown> },
  adapter: WebmasterAdapter = new ManualWebmasterAdapter(),
) {
  const change = event.payload as unknown as IndexingChange
  const result = await submitIndexingChange(adapter, change)
  await payload.update({
    collection: 'execution-events',
    id: event.id,
    overrideAccess: true,
    data: {
      payload: {
        ...event.payload,
        indexingState: result.state,
        provider: adapter.id,
        providerDetail: result.detail || null,
        remoteId: ('remoteId' in result && result.remoteId) || null,
        retryAfterMs: result.retryAfterMs || null,
      },
    },
  } as never)
  if (result.state === 'failed' && 'retryable' in result && result.retryable)
    throw new WebmasterProviderError(
      result.detail || 'Provider submission failed.',
      'remote',
      result.retryAfterMs,
    )
  return result
}

export const indexingKey = (change: IndexingChange) =>
  `indexing:${change.siteId}:${change.action}:${change.url}:${change.version}`

/** Best-effort transactional-outbox write. Callers deliberately swallow failure after logging. */
export async function enqueueIndexingChange(payload: Payload, change: IndexingChange) {
  const key = indexingKey(change)
  const existing = await payload.find({
    collection: 'execution-events',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (existing.docs[0]) return { event: existing.docs[0], duplicate: true }
  const event = await payload.create({
    collection: 'execution-events',
    overrideAccess: true,
    data: {
      site: change.siteId,
      tenantId: change.siteId,
      actor: { type: 'system', id: 'crawler' },
      eventType: 'discovery.indexing.changed',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId: key,
      idempotencyKey: key,
      privacyClass: 'internal',
      payload: { ...change, indexingState: 'queued', provider: null },
      state: 'ready',
      attempts: 0,
    },
  } as never)
  return { event, duplicate: false }
}

export async function safelyRecordIndexingChange(payload: Payload, change: IndexingChange) {
  try {
    return await enqueueIndexingChange(payload, change)
  } catch (error) {
    console.error('Indexing outbox enqueue failed after content mutation:', error)
    return null
  }
}

export function indexingChangesFor(
  doc: Record<string, unknown>,
  previous: Record<string, unknown> | undefined,
  origin: string,
): IndexingChange[] {
  const siteId =
    typeof doc.site === 'string' ? doc.site : (doc.site as { id?: string } | undefined)?.id
  const path = String(doc.canonicalPath || (doc.slug ? `/articles/${doc.slug}` : ''))
  if (!siteId || !path) return []
  const wasPublic =
    previous && ['published', 'updated'].includes(String(previous.status)) && !previous.seoNoIndex
  const isPublic = ['published', 'updated'].includes(String(doc.status)) && !doc.seoNoIndex
  let reason: IndexingChange['reason'] = 'publication'
  if (wasPublic && !isPublic) reason = doc.seoNoIndex ? 'noindex' : 'unpublication'
  else if (wasPublic && previous?.canonicalPath !== doc.canonicalPath) reason = 'slug'
  else if (!isPublic) return []
  const absolute = (value: string) => new URL(value, origin).toString()
  const current: IndexingChange = {
    siteId,
    url: absolute(path),
    action: isPublic ? 'upsert' : 'remove',
    reason,
    version: String(doc.updatedAt || new Date().toISOString()),
  }
  const previousPath = String(
    previous?.canonicalPath || (previous?.slug ? `/articles/${previous.slug}` : ''),
  )
  if (wasPublic && isPublic && previousPath && previousPath !== path)
    return [
      { ...current, url: absolute(previousPath), action: 'remove', reason: 'slug' },
      { ...current, action: 'upsert', reason: 'slug' },
    ]
  return [current]
}

export const indexingChangeFor = (
  doc: Record<string, unknown>,
  previous: Record<string, unknown> | undefined,
  origin = 'http://localhost:3000',
) => indexingChangesFor(doc, previous, origin)[0] || null

export async function indexingChangesForMedia(
  payload: Payload,
  input: {
    siteId: string
    mediaId: string
    origin: string
    reason: 'media-expiry' | 'media-replacement'
    version: string
  },
) {
  const targetIds = new Set<string>()
  let page = 1
  for (;;) {
    const usages = await payload.find({
      collection: 'media-usages',
      where: {
        and: [
          { site: { equals: input.siteId } },
          { media: { equals: input.mediaId } },
          { lifecycle: { equals: 'public' } },
        ],
      },
      limit: 250,
      page,
      depth: 0,
      overrideAccess: true,
    } as never)
    for (const raw of usages.docs as unknown as Array<Record<string, unknown>>)
      if (raw.targetType === 'content' && raw.targetId) targetIds.add(String(raw.targetId))
    if (!usages.hasNextPage) break
    page += 1
  }
  const changes: IndexingChange[] = []
  for (const targetId of targetIds) {
    const content = (await payload
      .findByID({ collection: 'content', id: targetId, depth: 0, overrideAccess: true } as never)
      .catch(() => null)) as Record<string, unknown> | null
    const path = content && String(content.canonicalPath || '')
    if (path && ['published', 'updated'].includes(String(content.status)))
      changes.push({
        siteId: input.siteId,
        url: new URL(path, input.origin).toString(),
        action: 'upsert',
        reason: input.reason,
        version: input.version,
      })
  }
  return changes.sort((a, b) => a.url.localeCompare(b.url))
}
