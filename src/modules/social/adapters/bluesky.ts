import {
  socialFetch,
  socialProviderMode,
  SocialBoundaryError,
  socialRetryAfter,
} from '../dispatch-boundary'
import { createHash } from 'node:crypto'
import {
  normalizeProviderError,
  type AccountConstraints,
  type AdapterResult,
  type AuthContext,
  type MediaResolver,
  type NormalizedAnalytics,
  type NormalizedRemotePost,
  type ProviderCapabilities,
  type SocialProviderAdapter,
  type SocialVariant,
  type ValidationReport,
} from '../contracts'
import { validateOutboundUrl } from '../security'

export interface BlueskyFacet {
  index: {
    byteStart: number
    byteEnd: number
  }
  features: Array<
    | { $type: 'app.bsky.richtext.facet#link'; uri: string }
    | { $type: 'app.bsky.richtext.facet#mention'; did: string }
    | { $type: 'app.bsky.richtext.facet#tag'; tag: string }
  >
}

/**
 * Accurately extracts AT Protocol rich text facets based on exact UTF-8 byte offsets.
 * Preserves multi-byte UTF-8 character boundaries (emojis, accented characters, CJK).
 */
export function parseRichTextFacets(
  text: string,
  mentionDidMap: Record<string, string> = {},
): BlueskyFacet[] {
  const facets: BlueskyFacet[] = []
  const utf8Encoder = new TextEncoder()

  // Match URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g
  let match: RegExpExecArray | null
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0]
    const charIndex = match.index
    const byteStart = utf8Encoder.encode(text.slice(0, charIndex)).length
    const byteEnd = byteStart + utf8Encoder.encode(url).length

    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
    })
  }

  // Match Mentions: @handle.domain
  const mentionRegex = /@([a-zA-Z0-9.-]+\.[a-zA-Z0-9]{2,})/g
  while ((match = mentionRegex.exec(text)) !== null) {
    const fullMention = match[0]
    const handle = match[1]
    const charIndex = match.index
    const byteStart = utf8Encoder.encode(text.slice(0, charIndex)).length
    const byteEnd = byteStart + utf8Encoder.encode(fullMention).length
    const did = mentionDidMap[handle] || `did:plc:${handle}`

    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#mention', did }],
    })
  }

  // Match Tags: #tag
  const tagRegex = /(?:^|\s)#([a-zA-Z0-9_]{1,64})/g
  while ((match = tagRegex.exec(text)) !== null) {
    const fullTagWithPrefix = match[0]
    const tagName = match[1]
    const tagStartIndex = match.index + (fullTagWithPrefix.startsWith('#') ? 0 : 1)
    const rawTagToken = '#' + tagName
    const byteStart = utf8Encoder.encode(text.slice(0, tagStartIndex)).length
    const byteEnd = byteStart + utf8Encoder.encode(rawTagToken).length

    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: tagName }],
    })
  }

  return facets.sort((a, b) => a.index.byteStart - b.index.byteStart)
}

export class BlueskyAdapter implements SocialProviderAdapter {
  readonly id = 'adapter-bluesky'
  readonly name = 'Bluesky AT Protocol Adapter'
  readonly version = '2026.1.0'
  readonly network = 'bluesky' as const
  readonly mode = 'live' as const

  readonly capabilities = {
    postTypes: ['text', 'link', 'image', 'thread'] as const,
    textLimit: 300,
    media: { images: true, video: false, audio: false, maxAttachments: 4 },
    threads: true,
    linkCards: 'native' as const,
    edit: false,
    delete: true,
    nativeScheduling: false,
    authentication: { required: true, modes: ['app-password', 'atproto-oauth'] },
    rateLimit: { requestsPerMinute: 600, retryAfterHeader: 'retry-after' },
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsText: true,
      supportsImages: true,
      supportsVideo: false,
      supportsCarousels: false,
      supportsPolls: false,
      supportsThreads: true,
      supportsAltText: true,
      supportsNativeScheduling: false,
      supportsPostEditing: false,
      supportsPostDeletion: true,
      supportsAnalytics: false,
      supportsComments: true,
      supportsDrafts: false,
      requiresMedia: false,
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: false,
      limits: {
        maxCharacters: 300,
        maxImages: 4,
        maxVideoDurationSeconds: 0,
        maxVideoFileSizeBytes: 0,
        maxImageFileSizeBytes: 1000000, // 1 MB strict threshold
      },
      mediaConstraints: {
        allowedImageMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        allowedVideoMimes: [],
        allowedVideoCodecs: [],
        aspectRatios: { minRatio: 0.5, maxRatio: 2.5 },
      },
    }
  }

  validatePost(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport {
    const errors: ValidationReport['errors'] = []
    const warnings: ValidationReport['warnings'] = []

    const charLimit = constraints?.characterCeilingOverride || 300
    if (!variant.text.trim() && !variant.attachments.length) {
      errors.push({
        field: 'text',
        message: 'Bluesky post must contain text or an image.',
        code: 'EMPTY_POST',
      })
    }

    // Unicode grapheme check approximation
    const graphemeCount = Array.from(variant.text).length
    if (graphemeCount > charLimit) {
      errors.push({
        field: 'text',
        message: `Text length (${graphemeCount}) exceeds Bluesky 300 grapheme limit by ${graphemeCount - charLimit}.`,
        code: 'TEXT_TOO_LONG',
      })
    }

    if (variant.attachments.length > 4) {
      errors.push({
        field: 'attachments',
        message: 'Bluesky allows a maximum of 4 images per post.',
        code: 'TOO_MANY_ATTACHMENTS',
      })
    }

    for (const att of variant.attachments) {
      if (att.role !== 'image') {
        errors.push({
          field: 'attachments',
          message: `Bluesky does not support ${att.role} attachments. Only images are supported.`,
          code: 'UNSUPPORTED_ATTACHMENT_TYPE',
        })
      }
      if (att.fileSizeBytes && att.fileSizeBytes > 1000000) {
        errors.push({
          field: 'attachments',
          message: `Attachment exceeds Bluesky's 1,000,000 byte limit (${att.fileSizeBytes} bytes).`,
          code: 'IMAGE_TOO_LARGE',
        })
      }
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  async uploadBlob(
    serviceUrl: string,
    accessJwt: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }> {
    if (buffer.length > 1000000) {
      throw new Error(`Blob size ${buffer.length} exceeds 1,000,000 byte limit for Bluesky PDS`)
    }

    const endpoint = `${serviceUrl}/xrpc/com.atproto.repo.uploadBlob`
    const ssrf = validateOutboundUrl(endpoint, { allowHttpInDev: true })
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await socialFetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessJwt}`,
        'Content-Type': mimeType,
      },
      body: new Uint8Array(buffer),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(
        `Bluesky blob upload failed (${res.status}): ${err?.message || res.statusText}`,
      )
    }

    const data = (await res.json()) as {
      blob: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }
    }
    return data.blob
  }

  async createSession(
    serviceUrl: string,
    identifier: string,
    password: string,
  ): Promise<{ accessJwt: string; refreshJwt: string; did: string; handle: string }> {
    const endpoint = `${serviceUrl}/xrpc/com.atproto.server.createSession`
    const ssrf = validateOutboundUrl(endpoint, { allowHttpInDev: true })
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await socialFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      const error = new Error(err?.message || `Authentication failed with HTTP ${res.status}`)
      ;(error as any).status = res.status
      ;(error as any).retryAfter =
        res.headers.get('retry-after') || res.headers.get('ratelimit-reset')
      throw error
    }

    return res.json() as Promise<{
      accessJwt: string
      refreshJwt: string
      did: string
      handle: string
    }>
  }

  private async readRecord(variant: SocialVariant, context: AuthContext) {
    const service = (context.credentials?.service || 'https://bsky.social').replace(/\/+$/, '')
    const identifier = context.credentials?.identifier || context.accountHandle
    const password = context.credentials?.appPassword || context.credentials?.password
    if (!identifier || !password)
      throw Object.assign(new Error('Reconnect Bluesky with an identifier and app password.'), {
        status: 401,
      })
    const session = await this.createSession(service, identifier, password)
    const rkey = createHash('sha256')
      .update(variant.idempotencyKey || variant.id)
      .digest('hex')
      .slice(0, 32)
    const url = new URL(`${service}/xrpc/com.atproto.repo.getRecord`)
    url.searchParams.set('repo', session.did)
    url.searchParams.set('collection', 'app.bsky.feed.post')
    url.searchParams.set('rkey', rkey)
    const response = await socialFetch(url.toString(), {
      headers: { Authorization: `Bearer ${session.accessJwt}` },
    })
    const data = await response.json().catch(() => null)
    const missing =
      response.status === 404 || (response.status === 400 && data?.error === 'RecordNotFound')
    if (!missing && !response.ok) {
      const error = new Error(`Bluesky record lookup failed: HTTP ${response.status}`)
      Object.assign(error, {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
      })
      throw error
    }
    const expectedUri = `at://${session.did}/app.bsky.feed.post/${rkey}`
    if (!missing && (data?.uri !== expectedUri || data?.value?.text !== variant.text))
      throw Object.assign(new Error('Provider idempotency key is occupied by different content.'), {
        status: 400,
      })
    const providerMode = socialProviderMode(service)
    const remoteUrl =
      providerMode === 'local-harness'
        ? `${service}/posts/${rkey}`
        : `https://bsky.app/profile/${session.handle}/post/${rkey}`
    return {
      service,
      session,
      rkey,
      data: missing ? null : data,
      providerMode,
      remoteUrl,
      expectedUri,
    }
  }

  async reconcile(variant: SocialVariant, context?: AuthContext): Promise<AdapterResult> {
    try {
      const record = await this.readRecord(
        variant,
        context ?? { accountId: '', accountHandle: '', network: 'bluesky', credentials: {} },
      )
      if (record.data)
        return {
          status: 'published',
          remoteId: record.data.uri,
          remoteUrl: record.remoteUrl,
          receipt: {
            remotePostId: record.data.uri,
            remoteUrl: record.remoteUrl,
            publishedAt: new Date(),
            rawResponse: { ...record.data, reconciled: true, providerMode: record.providerMode },
          },
        }
      return {
        status: 'unknown',
        error: normalizeProviderError({
          kind: 'remote-unknown',
          remoteOutcome: 'unknown',
          message:
            'No matching provider record is visible. Keep this delivery quarantined; no new post was submitted.',
        }),
      }
    } catch (error) {
      return {
        status: 'unknown',
        error: normalizeProviderError({
          kind: 'remote-unknown',
          remoteOutcome: 'unknown',
          message: `Read-only reconciliation could not confirm delivery: ${error instanceof Error ? error.message : String(error)}`,
        }),
      }
    }
  }

  async publish(
    variant: SocialVariant,
    context?:
      | AuthContext
      | Readonly<{ accountId: string; credentials: Record<string, string> | null }>,
    mediaResolver?: MediaResolver,
  ): Promise<AdapterResult> {
    let sent = false
    try {
      const record = await this.readRecord(
        variant,
        (context ?? {
          accountId: '',
          accountHandle: '',
          network: 'bluesky',
          credentials: {},
        }) as AuthContext,
      )
      if (record.data)
        return {
          status: 'published',
          remoteId: record.data.uri,
          remoteUrl: record.remoteUrl,
          receipt: {
            remotePostId: record.data.uri,
            remoteUrl: record.remoteUrl,
            publishedAt: new Date(),
            rawResponse: { ...record.data, reconciled: true, providerMode: record.providerMode },
          },
        }
      let embed: Record<string, unknown> | undefined
      if (variant.attachments.length) {
        if (!mediaResolver)
          return {
            status: 'failed',
            error: normalizeProviderError({
              kind: 'validation',
              message: 'Media resolver is required; no text-only fallback was sent.',
            }),
          }
        const images = []
        for (const attachment of variant.attachments) {
          const { buffer, mimeType } = await mediaResolver.resolveBuffer(attachment.mediaAssetId)
          images.push({
            image: await this.uploadBlob(
              record.service,
              record.session.accessJwt,
              buffer,
              mimeType,
            ),
            alt: attachment.altText || '',
          })
        }
        embed = { $type: 'app.bsky.embed.images', images }
      } else if (variant.linkUrl)
        embed = {
          $type: 'app.bsky.embed.external',
          external: { uri: variant.linkUrl, title: variant.linkUrl, description: '' },
        }
      const facets = parseRichTextFacets(variant.text)
      sent = true
      const response = await socialFetch(`${record.service}/xrpc/com.atproto.repo.createRecord`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${record.session.accessJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repo: record.session.did,
          collection: 'app.bsky.feed.post',
          rkey: record.rkey,
          record: {
            $type: 'app.bsky.feed.post',
            text: variant.text,
            createdAt: new Date().toISOString(),
            ...(facets.length ? { facets } : {}),
            ...(embed ? { embed } : {}),
          },
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        if (data?.error === 'RecordAlreadyExists')
          return this.reconcile(variant, context as AuthContext)
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind:
              response.status === 429
                ? 'rate-limit'
                : [401, 403].includes(response.status)
                  ? 'reconnect-required'
                  : response.status >= 500
                    ? 'transient'
                    : 'validation',
            message: data?.message || data?.error || `Bluesky returned HTTP ${response.status}`,
            retryAfter: socialRetryAfter(
              response.headers.get('retry-after') || response.headers.get('ratelimit-reset'),
            ),
          }),
        }
      }
      if (data?.uri !== record.expectedUri)
        return {
          status: 'unknown',
          error: normalizeProviderError({
            kind: 'remote-unknown',
            remoteOutcome: 'unknown',
            message:
              'Provider response did not confirm the expected record URI; reconcile before retrying.',
          }),
        }
      return {
        status: 'published',
        remoteId: data.uri,
        remoteUrl: record.remoteUrl,
        receipt: {
          remotePostId: data.uri,
          remoteUrl: record.remoteUrl,
          publishedAt: new Date(),
          rawResponse: { ...data, providerMode: record.providerMode },
        },
      }
    } catch (error) {
      const status = (error as { status?: number })?.status
      const rawRetry = (error as { retryAfter?: string })?.retryAfter
      const retryAt = socialRetryAfter(rawRetry)
      return {
        status: sent ? 'unknown' : 'failed',
        error: normalizeProviderError({
          kind: sent
            ? 'remote-unknown'
            : status === 429
              ? 'rate-limit'
              : [401, 403].includes(status ?? 0)
                ? 'reconnect-required'
                : status === 400 || error instanceof SocialBoundaryError
                  ? 'validation'
                  : 'transient',
          remoteOutcome: sent ? 'unknown' : 'known-failed',
          message:
            (status === 429
              ? 'Bluesky rate limit exceeded: '
              : [401, 403].includes(status ?? 0)
                ? 'Bluesky reconnection required: '
                : '') + (error instanceof Error ? error.message : String(error)),
          retryAfter: retryAt,
        }),
      }
    }
  }

  async deletePost(remotePostId: string, authContext: AuthContext): Promise<void> {
    const identifier = authContext.credentials?.identifier || authContext.accountHandle
    const password = authContext.credentials?.appPassword
    const serviceUrl = (authContext.credentials?.service || 'https://bsky.social').replace(
      /\/+$/,
      '',
    )

    if (!identifier || !password) throw new Error('Missing Bluesky credentials for delete')

    const session = await this.createSession(serviceUrl, identifier, password)
    // remotePostId is at-uri: at://did/app.bsky.feed.post/rkey
    const rkey = remotePostId.split('/').pop() || ''

    const endpoint = `${serviceUrl}/xrpc/com.atproto.repo.deleteRecord`
    const ssrf = validateOutboundUrl(endpoint, { allowHttpInDev: true })
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: session.did,
        collection: 'app.bsky.feed.post',
        rkey,
      }),
    })

    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to delete Bluesky record: HTTP ${res.status}`)
    }
  }

  async fetchPost(remotePostId: string, authContext: AuthContext): Promise<NormalizedRemotePost> {
    const serviceUrl = (authContext.credentials?.service || 'https://bsky.social').replace(
      /\/+$/,
      '',
    )
    const endpoint = `${serviceUrl}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(remotePostId)}&depth=0`
    const ssrf = validateOutboundUrl(endpoint, { allowHttpInDev: true })
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await fetch(endpoint)
    if (!res.ok) throw new Error(`Failed to fetch Bluesky thread: HTTP ${res.status}`)

    const data = (await res.json()) as {
      thread: {
        post: {
          uri: string
          author: { handle: string }
          record: { text: string; createdAt: string }
        }
      }
    }

    const post = data.thread.post
    const rkey = post.uri.split('/').pop() || ''
    return {
      remoteId: post.uri,
      remoteUrl: `https://bsky.app/profile/${post.author.handle}/post/${rkey}`,
      text: post.record.text,
      publishedAt: new Date(post.record.createdAt),
      authorHandle: post.author.handle,
    }
  }

  async fetchAnalytics(
    remotePostId: string,
    authContext: AuthContext,
  ): Promise<NormalizedAnalytics> {
    const serviceUrl = (authContext.credentials?.service || 'https://bsky.social').replace(
      /\/+$/,
      '',
    )
    const endpoint = `${serviceUrl}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(remotePostId)}&depth=0`
    const ssrf = validateOutboundUrl(endpoint, { allowHttpInDev: true })
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await fetch(endpoint)
    if (!res.ok) throw new Error(`Failed to fetch Bluesky stats: HTTP ${res.status}`)

    const data = (await res.json()) as {
      thread: {
        post: {
          likeCount?: number
          repostCount?: number
          replyCount?: number
          quoteCount?: number
        }
      }
    }

    const post = data.thread?.post
    return {
      deliveryId: `del-bluesky-${remotePostId}`,
      remotePostId,
      retrievedAt: new Date(),
      metrics: {
        impressions: 0,
        reach: 0,
        views: 0,
        clicks: 0,
        likes: post?.likeCount || 0,
        comments: post?.replyCount || 0,
        shares: (post?.repostCount || 0) + (post?.quoteCount || 0),
        saves: 0,
        engagementRate: 0,
      },
      rawPlatformMetrics: data as Record<string, unknown>,
    }
  }
}

export const blueskyAdapter = new BlueskyAdapter()
