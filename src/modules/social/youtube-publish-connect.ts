import type { Payload } from 'payload'
import {
  YouTubeMetadata,
  youtubeConfiguration,
  youtubeReadonly,
  youtubeUpload,
  type YouTubeConfig,
} from '../creator-studio/youtube-metadata'
import { credentialsForSocialAccount, getProviderCapabilityTruth } from './provider-runtime'
import { encryptSecret } from './security'

/**
 * Self-serve YouTube publishing connect for a site's social account.
 *
 * Until RC3-YT, the only way to give the social YouTube adapter a
 * credential was for an operator to mint a refresh token outside
 * Renegade and paste it in by hand. This module runs the real Google
 * OAuth flow (per-creator, both scopes) and stores the resulting grant
 * in the same `enc:` envelope the adapter already reads. There is no
 * master account and no API-key path: the channel owner consents on
 * Google's own screen, and the stored token can only act on their
 * channel (the allowlist and claim check still apply at publish time).
 *
 * Durability note surfaced in the connect UI: Google issues refresh
 * tokens that expire after 7 days while the OAuth consent screen is in
 * "Testing" status. The operator's Google Cloud app must be published
 * to production status or every connection made here dies within a
 * week. Code cannot detect or fix that from this side.
 */
export const youtubePublishScopes = [youtubeReadonly, youtubeUpload] as const

/**
 * Name of the encrypted state cookie for the publish-connect flow. It
 * rides the installation's one registered YouTube redirect path (the
 * Creator Studio callback) alongside the read-only flow's cookie; the
 * callback routes by which cookie is present.
 */
export const youtubePublishOAuthCookie = 'social-youtube-oauth'

export class YouTubePublishConnectError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const access = { overrideAccess: true, depth: 0 } as const

function configuration(): YouTubeConfig {
  const config = youtubeConfiguration()
  if (!config)
    throw new YouTubePublishConnectError('YouTube OAuth is unavailable on this installation.', 503)
  return config
}

const relationId = (value: unknown): string =>
  String((value as { id?: unknown })?.id ?? value ?? '')

/**
 * Completes the OAuth callback: exchanges the code for a grant carrying
 * BOTH scopes, verifies the authorized channel against the installation
 * allowlist (inside `YouTubeMetadata.channel`), and writes the refresh
 * token onto the site's YouTube social account. The account's
 * capability state follows provider truth — with the operator upload
 * flags off it stays `manual-handoff`, and the adapter will not send.
 */
export async function completeYouTubePublishConnect(
  payload: Payload,
  input: { siteId: string; code: string; verifier: string },
) {
  const config = configuration()
  const client = new YouTubeMetadata(config)
  const grant = await client.exchange(input.code, input.verifier, youtubePublishScopes)
  if (!grant.refreshToken)
    throw new YouTubePublishConnectError(
      'Google did not return a refresh token for this connection. Reconnect and approve offline access.',
      502,
    )
  const channel = await client.channel(grant)
  const connectionReference = `enc:${encryptSecret(
    JSON.stringify({ refreshToken: grant.refreshToken }),
  )}`
  const truth = getProviderCapabilityTruth('youtube')
  const capabilityState =
    truth.mode === 'manual-handoff'
      ? 'manual-handoff'
      : truth.mode === 'unavailable'
        ? 'unavailable'
        : 'available'
  const now = new Date().toISOString()
  const diagnostics = {
    mode: truth.mode,
    connectedVia: 'oauth',
    scopes: [...youtubePublishScopes],
    status: 'healthy',
    connectedAt: now,
    lastError: null,
  }
  const existing = await payload.find({
    collection: 'social-accounts',
    ...access,
    limit: 1,
    where: {
      and: [
        { site: { equals: input.siteId } },
        { network: { equals: 'youtube' } },
        { externalAccountId: { equals: channel.id } },
      ],
    },
  })
  const found = existing.docs[0]
  const account = found
    ? await payload.update({
        collection: 'social-accounts',
        id: found.id,
        ...access,
        data: {
          capabilityState,
          capabilities: truth.capabilities,
          credentialHealth: 'healthy',
          connectionReference,
          lastVerifiedAt: now,
          diagnostics,
        } as never,
      })
    : await payload.create({
        collection: 'social-accounts',
        ...access,
        data: {
          site: input.siteId,
          displayName: `YouTube (${channel.id})`,
          network: 'youtube',
          actorType: 'site',
          externalAccountId: channel.id,
          capabilityState,
          capabilities: truth.capabilities,
          credentialHealth: 'healthy',
          connectionReference,
          lastVerifiedAt: now,
          diagnostics,
        } as never,
      })
  return { accountId: String(account.id), channelId: channel.id, capabilityState }
}

/**
 * Disconnects a YouTube publishing account. The local envelope is
 * always cleared first — a local disconnect never depends on Google
 * answering — then the grant is revoked at Google when a token exists.
 * `providerRevoked` reports the provider outcome honestly: true when
 * Google confirmed the revocation, false when it could not be
 * completed (the local connection is gone either way), null when there
 * was no token to revoke.
 */
export async function disconnectYouTubePublishAccount(
  payload: Payload,
  input: { accountId: string },
) {
  const account = await payload.findByID({
    collection: 'social-accounts',
    id: input.accountId,
    ...access,
    disableErrors: true,
  })
  if (!account || account.network !== 'youtube')
    throw new YouTubePublishConnectError('YouTube account not found.', 404)
  const siteId = relationId(account.site)
  const credentials = credentialsForSocialAccount(
    typeof account.connectionReference === 'string' ? account.connectionReference : null,
  )
  const refreshToken =
    typeof credentials?.refreshToken === 'string' ? credentials.refreshToken : null
  await payload.update({
    collection: 'social-accounts',
    id: input.accountId,
    ...access,
    data: {
      connectionReference: null,
      credentialHealth: 'revoked',
      capabilityState: 'unavailable',
      diagnostics: {
        ...((account.diagnostics as Record<string, unknown> | null) ?? {}),
        disconnectedAt: new Date().toISOString(),
        reason: 'Operator disconnected the YouTube publishing connection.',
      },
    } as never,
  })
  let providerRevoked: boolean | null = null
  if (refreshToken) {
    const config = youtubeConfiguration()
    if (config) {
      try {
        await new YouTubeMetadata(config).revoke(refreshToken)
        providerRevoked = true
      } catch {
        providerRevoked = false
      }
    }
  }
  return { disconnected: true, providerRevoked, siteId }
}
