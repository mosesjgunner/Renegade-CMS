import {
  normalizeProviderError,
  type AccountConstraints,
  type AdapterResult,
  type AuthContext,
  type DeliveryReceipt,
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
    const ssrf = validateOutboundUrl(endpoint)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await fetch(endpoint, {
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
    const ssrf = validateOutboundUrl(endpoint)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(err?.message || `Authentication failed with HTTP ${res.status}`)
    }

    return res.json() as Promise<{
      accessJwt: string
      refreshJwt: string
      did: string
      handle: string
    }>
  }

  async publish(
    variant: SocialVariant,
    context?:
      | AuthContext
      | Readonly<{ accountId: string; credentials: Record<string, string> | null }>,
    mediaResolver?: MediaResolver,
  ): Promise<AdapterResult> {
    const auth = context as AuthContext | undefined
    const identifier = auth?.credentials?.identifier || auth?.accountHandle
    const password = auth?.credentials?.appPassword || auth?.credentials?.password
    const serviceUrl = (auth?.credentials?.service || 'https://bsky.social').replace(/\/+$/, '')

    if (!identifier || !password) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'reconnect-required',
          message:
            'Bluesky requires an account identifier and app password. Reconnect this account.',
        }),
      }
    }

    try {
      // 1. Establish or refresh session
      const session = await this.createSession(serviceUrl, identifier, password)

      // 2. Parse UTF-8 rich text facets
      const facets = parseRichTextFacets(variant.text)

      // 3. Upload images if attached
      let embed: Record<string, unknown> | undefined
      if (variant.attachments.length > 0 && mediaResolver) {
        const images: Array<{ image: unknown; alt: string }> = []
        for (const att of variant.attachments) {
          const { buffer, mimeType } = await mediaResolver.resolveBuffer(att.mediaAssetId)
          const blob = await this.uploadBlob(serviceUrl, session.accessJwt, buffer, mimeType)
          images.push({
            image: blob,
            alt: att.altText || '',
          })
        }
        embed = {
          $type: 'app.bsky.embed.images',
          images,
        }
      } else if (variant.linkUrl) {
        // Link card embed
        embed = {
          $type: 'app.bsky.embed.external',
          external: {
            uri: variant.linkUrl,
            title: variant.linkUrl,
            description: '',
          },
        }
      }

      // 4. Create Post Record
      const recordPayload: Record<string, unknown> = {
        $type: 'app.bsky.feed.post',
        text: variant.text,
        createdAt: new Date().toISOString(),
      }

      if (facets.length > 0) recordPayload.facets = facets
      if (embed) recordPayload.embed = embed

      const createEndpoint = `${serviceUrl}/xrpc/com.atproto.repo.createRecord`
      const ssrf = validateOutboundUrl(createEndpoint)
      if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

      const postRes = await fetch(createEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repo: session.did,
          collection: 'app.bsky.feed.post',
          record: recordPayload,
        }),
      })

      if (postRes.status === 429) {
        const retryAfter = postRes.headers.get('retry-after')
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: 'rate-limit',
            message: 'Bluesky PDS rate limit reached.',
            retryAfter: retryAfter
              ? new Date(Date.now() + Number(retryAfter) * 1000).toISOString()
              : undefined,
          }),
        }
      }

      if (!postRes.ok) {
        const errBody = (await postRes.json().catch(() => null)) as { message?: string } | null
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: postRes.status >= 500 ? 'transient' : 'validation',
            message: errBody?.message || `Bluesky returned HTTP ${postRes.status}`,
          }),
        }
      }

      const result = (await postRes.json()) as { uri: string; cid: string }
      // URI format: at://did:plc:.../app.bsky.feed.post/rkey
      const rkey = result.uri.split('/').pop() || ''
      const publicUrl = `https://bsky.app/profile/${session.handle}/post/${rkey}`

      return {
        status: 'published',
        remoteId: result.uri,
        remoteUrl: publicUrl,
        receipt: {
          remotePostId: result.uri,
          remoteUrl: publicUrl,
          publishedAt: new Date(),
          rawResponse: result as Record<string, unknown>,
        },
      }
    } catch (err: unknown) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'transient',
          message: err instanceof Error ? err.message : String(err),
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
