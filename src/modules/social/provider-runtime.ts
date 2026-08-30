import {
  normalizeProviderError,
  type AdapterResult,
  type SocialProviderAdapter,
  type SocialProviderCapabilities,
  type SocialVariant,
} from './contracts'

const base: SocialProviderCapabilities = {
  postTypes: ['text', 'link'],
  textLimit: null,
  media: { images: false, video: false, audio: false },
  threads: false,
  linkCards: 'none',
  edit: false,
  delete: false,
  nativeScheduling: false,
  authentication: { required: false, modes: [] },
  rateLimit: {},
}

const manual = (
  network: SocialProviderAdapter['network'],
  mode: 'manual-handoff' | 'unavailable' = 'manual-handoff',
): SocialProviderAdapter => ({ network, mode, capabilities: base })

const blueskyCapabilities: SocialProviderCapabilities = {
  ...base,
  textLimit: 300,
  linkCards: 'text-only',
  authentication: { required: true, modes: ['app-password'] },
  rateLimit: { retryAfterHeader: 'retry-after' },
}

const providerError = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as {
    error?: string
    message?: string
  } | null
  if (response.status === 401 || response.status === 403)
    return normalizeProviderError({
      kind: 'reconnect-required',
      message: 'Bluesky credentials were rejected; reconnect this account.',
      providerCode: body?.error,
    })
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after'))
    return normalizeProviderError({
      kind: 'rate-limit',
      message: body?.message ?? 'Bluesky is rate limiting this account.',
      retryAfter: Number.isFinite(seconds)
        ? new Date(Date.now() + seconds * 1000).toISOString()
        : undefined,
      providerCode: body?.error,
    })
  }
  return normalizeProviderError({
    kind: response.status >= 500 ? 'transient' : 'validation',
    message: body?.message ?? 'Bluesky rejected this post.',
    providerCode: body?.error,
  })
}

export const blueskyAdapter: SocialProviderAdapter = {
  network: 'bluesky',
  mode: 'live',
  capabilities: blueskyCapabilities,
  async publish(variant: SocialVariant, context): Promise<AdapterResult> {
    const identifier = context.credentials?.identifier,
      password = context.credentials?.appPassword,
      service = context.credentials?.service ?? 'https://bsky.social'
    if (!identifier || !password)
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'reconnect-required',
          message:
            'Bluesky requires an account identifier and app password. Reconnect this account.',
        }),
      }
    try {
      const session = await fetch(
        service.replace(/\/$/, '') + '/xrpc/com.atproto.server.createSession',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ identifier, password }),
        },
      )
      if (!session.ok) return { status: 'failed', error: await providerError(session) }
      const auth = (await session.json()) as { accessJwt?: string; did?: string }
      if (!auth.accessJwt || !auth.did)
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: 'authentication',
            message: 'Bluesky returned an incomplete session.',
          }),
        }
      const post = await fetch(service.replace(/\/$/, '') + '/xrpc/com.atproto.repo.createRecord', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + auth.accessJwt,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          repo: auth.did,
          collection: 'app.bsky.feed.post',
          record: {
            $type: 'app.bsky.feed.post',
            text: variant.text,
            createdAt: new Date().toISOString(),
          },
        }),
      })
      if (!post.ok) return { status: 'failed', error: await providerError(post) }
      const record = (await post.json()) as { uri?: string }
      return record.uri
        ? {
            status: 'published',
            remoteId: record.uri,
            remoteUrl:
              'https://bsky.app/profile/' + auth.did + '/post/' + record.uri.split('/').pop(),
          }
        : {
            status: 'unknown',
            error: normalizeProviderError({
              kind: 'remote-unknown',
              message: 'Bluesky accepted the request without a record URI.',
              remoteOutcome: 'unknown',
            }),
          }
    } catch {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'transient',
          message: 'Bluesky could not be reached.',
        }),
      }
    }
  },
}

export const socialProviderAdapters: readonly SocialProviderAdapter[] = [
  blueskyAdapter,
  manual('activitypub', 'unavailable'),
  manual('x'),
  manual('threads'),
  manual('facebook'),
  manual('instagram'),
  manual('linkedin'),
  manual('youtube'),
  manual('tiktok'),
  manual('manual'),
]

export const socialProviderFor = (network: SocialProviderAdapter['network']) =>
  socialProviderAdapters.find((adapter) => adapter.network === network) ??
  manual(network, 'unavailable')

export const credentialsForSocialAccount = (connectionReference?: string | null) => {
  if (!connectionReference) return null
  const key = connectionReference.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  const identifier = process.env['SOCIAL_BLUESKY_' + key + '_IDENTIFIER']
  const appPassword = process.env['SOCIAL_BLUESKY_' + key + '_APP_PASSWORD']
  const service = process.env['SOCIAL_BLUESKY_' + key + '_SERVICE']
  return identifier && appPassword
    ? { identifier, appPassword, ...(service ? { service } : {}) }
    : null
}
