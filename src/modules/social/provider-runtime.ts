import { createHash } from 'node:crypto'
import { socialFetch, socialProviderMode } from './dispatch-boundary'
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

const blueskyReceipt = (service: string, remoteId: string, remoteUrl: string) => ({
  remotePostId: remoteId,
  remoteUrl,
  publishedAt: new Date(),
  rawResponse: { providerMode: socialProviderMode(service) },
})
const blueskyRemoteUrl = (service: string, did: string, rkey: string) =>
  socialProviderMode(service) === 'local-harness'
    ? `${service.replace(/\/$/, '')}/posts/${rkey}`
    : `https://bsky.app/profile/${did}/post/${rkey}`

export const blueskyAdapter: SocialProviderAdapter = {
  network: 'bluesky',
  mode: 'live',
  capabilities: blueskyCapabilities,
  async publish(variant: SocialVariant, context): Promise<AdapterResult> {
    const identifier = context?.credentials?.identifier,
      password = context?.credentials?.appPassword,
      service = context?.credentials?.service ?? 'https://bsky.social'
    if (!identifier || !password)
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'reconnect-required',
          message:
            'Bluesky requires an account identifier and app password. Reconnect this account.',
        }),
      }
    let submitted = false
    try {
      const session = await socialFetch(
        service.replace(/\/$/, '') + '/xrpc/com.atproto.server.createSession',
        {
          method: 'POST',
          signal: AbortSignal.timeout(30_000),
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
      const rkey = createHash('sha256')
        .update(variant.idempotencyKey || variant.id)
        .digest('hex')
        .slice(0, 32)
      const expectedUri = `at://${auth.did}/app.bsky.feed.post/${rkey}`
      const recordUrl = new URL(service.replace(/\/$/, '') + '/xrpc/com.atproto.repo.getRecord')
      recordUrl.searchParams.set('repo', auth.did)
      recordUrl.searchParams.set('collection', 'app.bsky.feed.post')
      recordUrl.searchParams.set('rkey', rkey)
      const existing = await socialFetch(recordUrl.toString(), {
        signal: AbortSignal.timeout(30_000),
        headers: { authorization: 'Bearer ' + auth.accessJwt },
      })
      if (existing.ok) {
        const record = (await existing.json()) as { uri?: string; value?: { text?: string } }
        if (record.uri !== expectedUri || record.value?.text !== variant.text)
          return {
            status: 'failed',
            error: normalizeProviderError({
              kind: 'validation',
              message: 'Provider idempotency key is occupied by different content.',
            }),
          }
        const remoteUrl = blueskyRemoteUrl(service, auth.did, rkey)
        return {
          status: 'published',
          remoteId: record.uri,
          remoteUrl,
          receipt: blueskyReceipt(service, record.uri, remoteUrl),
        }
      }
      const missing =
        existing.status === 404 ||
        (existing.status === 400 &&
          (
            await existing
              .clone()
              .json()
              .catch(() => null)
          )?.error === 'RecordNotFound')
      if (!missing) return { status: 'failed', error: await providerError(existing) }
      submitted = true
      const post = await socialFetch(
        service.replace(/\/$/, '') + '/xrpc/com.atproto.repo.createRecord',
        {
          method: 'POST',
          signal: AbortSignal.timeout(30_000),
          headers: {
            authorization: 'Bearer ' + auth.accessJwt,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            repo: auth.did,
            collection: 'app.bsky.feed.post',
            rkey,
            record: {
              $type: 'app.bsky.feed.post',
              text: variant.text,
              createdAt: new Date().toISOString(),
            },
          }),
        },
      )
      if (post.status >= 500)
        return {
          status: 'unknown',
          error: normalizeProviderError({
            kind: 'remote-unknown',
            remoteOutcome: 'unknown',
            message: 'Bluesky returned a server error after submission; reconcile before retrying.',
          }),
        }
      if (!post.ok) return { status: 'failed', error: await providerError(post) }
      const record = (await post.json()) as { uri?: string }
      const remoteUrl = record.uri
        ? blueskyRemoteUrl(service, auth.did, record.uri.split('/').pop() || rkey)
        : ''
      return record.uri === expectedUri
        ? {
            status: 'published',
            remoteId: record.uri,
            remoteUrl,
            receipt: blueskyReceipt(service, record.uri, remoteUrl),
          }
        : {
            status: 'unknown',
            error: normalizeProviderError({
              kind: 'remote-unknown',
              message:
                'Bluesky did not confirm the expected record URI; reconcile before retrying.',
              remoteOutcome: 'unknown',
            }),
          }
    } catch {
      return {
        status: submitted ? 'unknown' : 'failed',
        error: normalizeProviderError({
          kind: submitted ? 'remote-unknown' : 'transient',
          remoteOutcome: submitted ? 'unknown' : 'known-failed',
          message: submitted
            ? 'Bluesky submission could not be confirmed; reconcile before retrying.'
            : 'Bluesky could not be reached.',
        }),
      }
    }
  },
  // RC2-DEBT-25: read-only reconciliation by the deterministic record
  // key. The roster adapter previously had no reconcile at all, so the
  // executor's recovery path could never settle any item from provider
  // truth. Found-with-matching-text settles published; missing or
  // mismatched stays quarantined as unknown — reconcile never sends.
  async reconcile(variant: SocialVariant, context): Promise<AdapterResult> {
    const identifier = context?.credentials?.identifier,
      password = context?.credentials?.appPassword,
      service = context?.credentials?.service ?? 'https://bsky.social'
    const unknown = (message: string): AdapterResult => ({
      status: 'unknown',
      error: normalizeProviderError({
        kind: 'remote-unknown',
        message,
        remoteOutcome: 'unknown',
      }),
    })
    if (!identifier || !password)
      return unknown(
        'Reconnect the account before read-only reconciliation. No provider request was made.',
      )
    try {
      const session = await socialFetch(
        service.replace(/\/$/, '') + '/xrpc/com.atproto.server.createSession',
        {
          method: 'POST',
          signal: AbortSignal.timeout(30_000),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ identifier, password }),
        },
      )
      if (!session.ok)
        return unknown('Read-only reconciliation could not confirm delivery: session refused.')
      const auth = (await session.json()) as { accessJwt?: string; did?: string }
      if (!auth.accessJwt || !auth.did)
        return unknown('Read-only reconciliation could not confirm delivery: incomplete session.')
      const rkey = createHash('sha256')
        .update(variant.idempotencyKey || variant.id)
        .digest('hex')
        .slice(0, 32)
      const recordUrl = new URL(service.replace(/\/$/, '') + '/xrpc/com.atproto.repo.getRecord')
      recordUrl.searchParams.set('repo', auth.did)
      recordUrl.searchParams.set('collection', 'app.bsky.feed.post')
      recordUrl.searchParams.set('rkey', rkey)
      const existing = await socialFetch(recordUrl.toString(), {
        signal: AbortSignal.timeout(30_000),
        headers: { authorization: 'Bearer ' + auth.accessJwt },
      })
      if (existing.ok) {
        const record = (await existing.json()) as { uri?: string; value?: { text?: string } }
        if (
          record.uri === `at://${auth.did}/app.bsky.feed.post/${rkey}` &&
          record.value?.text === variant.text
        )
          return {
            status: 'published',
            remoteId: record.uri,
            remoteUrl: blueskyRemoteUrl(service, auth.did, rkey),
            receipt: {
              remotePostId: record.uri,
              remoteUrl: blueskyRemoteUrl(service, auth.did, rkey),
              publishedAt: new Date(),
              rawResponse: {
                ...record,
                reconciled: true,
                providerMode: socialProviderMode(service),
              },
            },
          }
        return unknown(
          'Provider idempotency key is occupied by different content. Keep this delivery quarantined; no new post was submitted.',
        )
      }
      const missing =
        existing.status === 404 ||
        (existing.status === 400 &&
          (
            await existing
              .clone()
              .json()
              .catch(() => null)
          )?.error === 'RecordNotFound')
      if (missing)
        return unknown(
          'No matching provider record is visible. Keep this delivery quarantined; no new post was submitted.',
        )
      return unknown(
        `Read-only reconciliation could not confirm delivery: HTTP ${existing.status}.`,
      )
    } catch {
      return unknown('Read-only reconciliation could not confirm delivery: provider unreachable.')
    }
  },
}

import { ADAPTER_REGISTRY } from './worker'
import { decryptSecret } from './security'

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

export const socialProviderFor = (network: SocialProviderAdapter['network']) => {
  // The declared roster above is the single source of truth for provider
  // mode: Bluesky is the sole live adapter, the commercial networks are
  // manual-handoff, and ActivityPub is unavailable. The worker registry's
  // adapter classes hardcode their own modes (e.g. XAdapter mode 'live')
  // and must not override the roster for any network the roster declares;
  // they remain the fallback only for networks the roster does not declare
  // (mastodon, discord, telegram, pinterest).
  const declared = socialProviderAdapters.find((adapter) => adapter.network === network)
  if (declared) return declared
  const registered = ADAPTER_REGISTRY[network]
  if (registered && (registered as any).publish) {
    return registered
  }
  return manual(network, 'unavailable')
}

export function getProviderCapabilityTruth(
  network: SocialProviderAdapter['network'],
  modeOverride?:
    | 'fixture'
    | 'local-harness'
    | 'remote-sandbox'
    | 'live'
    | 'manual-handoff'
    | 'unavailable',
): {
  network: string
  mode: 'fixture' | 'local-harness' | 'remote-sandbox' | 'live' | 'manual-handoff' | 'unavailable'
  capabilities: SocialProviderCapabilities
  detailedCapabilities?: Record<string, unknown>
  verifiedAt: string
} {
  const adapter = socialProviderFor(network)
  const effectiveMode =
    adapter.mode === 'manual-handoff' || adapter.mode === 'unavailable'
      ? adapter.mode
      : modeOverride || adapter.mode

  return {
    network,
    mode: effectiveMode as any,
    capabilities: adapter.capabilities,
    detailedCapabilities: adapter.getCapabilities ? (adapter.getCapabilities() as any) : undefined,
    verifiedAt: new Date().toISOString(),
  }
}

export type ConnectionReferenceKind = 'empty' | 'envelope' | 'plaintext-json' | 'named-reference'

/**
 * Classifies a stored connection reference without resolving it. Only two
 * kinds may ever hold or locate credentials: `envelope` (AES-256-GCM,
 * decrypted server-side) and `named-reference` (a name resolved against
 * server environment variables — the row itself holds no secret).
 * `plaintext-json` rows stored usable secrets unencrypted at rest; the
 * credential scan (modules/social/credential-scan) migrates or
 * invalidates them.
 */
export const classifyConnectionReference = (
  connectionReference?: string | null,
): ConnectionReferenceKind => {
  if (!connectionReference) return 'empty'
  if (connectionReference.startsWith('enc:')) return 'envelope'
  if (connectionReference.startsWith('{')) return 'plaintext-json'
  return 'named-reference'
}

export const credentialsForSocialAccount = (connectionReference?: string | null) => {
  if (!connectionReference) return null

  // Support direct encrypted secret envelope
  if (connectionReference.startsWith('enc:')) {
    try {
      const decrypted = decryptSecret(connectionReference.slice(4))
      return JSON.parse(decrypted)
    } catch {
      return null
    }
  }

  // SOC-SEC-1 (Red F-3): plaintext credential JSON is never resolved.
  // A reference beginning with '{' is unencrypted secrets at rest; such
  // rows cannot dispatch and are migrated or invalidated by the
  // credential scan — they are never silently honored here.
  if (connectionReference.startsWith('{')) {
    return null
  }

  // Fallback to environment variable lookup
  const key = connectionReference.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  const identifier = process.env['SOCIAL_BLUESKY_' + key + '_IDENTIFIER']
  const appPassword = process.env['SOCIAL_BLUESKY_' + key + '_APP_PASSWORD']
  const service = process.env['SOCIAL_BLUESKY_' + key + '_SERVICE']
  return identifier && appPassword
    ? { identifier, appPassword, ...(service ? { service } : {}) }
    : null
}
