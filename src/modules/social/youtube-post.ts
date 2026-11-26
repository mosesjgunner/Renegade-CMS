import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { youtubeChannelId } from '../creator-studio/video-providers'
import { youtubeUploadSettings } from './adapters/youtube'
import { YouTubePublishConnectError } from './youtube-publish-connect'

const access = { overrideAccess: true, depth: 0 } as const
const relationId = (value: unknown): string =>
  String((value as { id?: unknown })?.id ?? value ?? '')

/**
 * The "Post to YouTube" action for a finished Studio video: creates a
 * social draft + YouTube variant bound to the media asset, with the
 * upload settings (channel, title, privacy, audience, compliance)
 * captured at post time. It deliberately stops at `draft` — the
 * existing review → approve → schedule flow remains the only path to
 * dispatch, so posting is always an explicit, approved action and
 * never automatic. No parallel posting path is created.
 */
export async function createYouTubePostDraft(
  payload: Payload,
  input: {
    siteId: string
    mediaAssetId: string
    title: string
    description: string
    privacy: 'private' | 'unlisted' | 'public'
    madeForKids: 'yes' | 'no'
    complianceConfirmed: boolean
    accountId?: string
    createdById?: string
  },
) {
  const accounts = await payload.find({
    collection: 'social-accounts',
    ...access,
    limit: 10,
    where: {
      and: [
        { site: { equals: input.siteId } },
        { network: { equals: 'youtube' } },
        ...(input.accountId ? [{ id: { equals: input.accountId } }] : []),
      ],
    },
  })
  const candidates = accounts.docs.filter(
    (account) =>
      account.credentialHealth === 'healthy' &&
      Boolean(account.connectionReference) &&
      youtubeChannelId.test(String(account.externalAccountId ?? '')),
  )
  if (!candidates.length)
    throw new YouTubePublishConnectError(
      'Connect a YouTube channel for this site before posting.',
      409,
    )
  if (candidates.length > 1 && !input.accountId)
    throw new YouTubePublishConnectError(
      'More than one YouTube channel is connected to this site; choose which one to post to.',
      400,
    )
  const account = candidates[0]
  const asset = await payload.findByID({
    collection: 'media-assets',
    id: input.mediaAssetId,
    ...access,
    disableErrors: true,
  })
  if (!asset || relationId(asset.site) !== input.siteId || asset.kind !== 'video')
    throw new YouTubePublishConnectError('That finished video was not found on this site.', 404)
  const settings = youtubeUploadSettings({
    channelId: String(account.externalAccountId),
    title: input.title,
    privacy: input.privacy,
    complianceConfirmed: input.complianceConfirmed,
    madeForKids: input.madeForKids,
  })
  if (!settings)
    throw new YouTubePublishConnectError(
      'Set the destination channel, title, privacy, audience and compliance confirmation.',
      400,
    )
  const draft = await payload.create({
    collection: 'social-drafts',
    ...access,
    data: {
      site: input.siteId,
      title: settings.title,
      status: 'draft',
      requiresReview: true,
      provenance: { source: 'youtube-post-action', mediaAssetId: String(asset.id) },
      ...(input.createdById ? { createdBy: input.createdById } : {}),
    } as never,
  })
  const variant = await payload.create({
    collection: 'social-network-variants',
    ...access,
    data: {
      draft: String(draft.id),
      account: String(account.id),
      label: 'YouTube',
      network: 'youtube',
      text: input.description,
      attachments: [String(asset.id)],
      youtubeUpload: settings,
      status: 'draft',
      idempotencyKey: randomUUID(),
    } as never,
  })
  return {
    draftId: String(draft.id),
    variantId: String(variant.id),
    accountId: String(account.id),
    channelId: String(account.externalAccountId),
  }
}
