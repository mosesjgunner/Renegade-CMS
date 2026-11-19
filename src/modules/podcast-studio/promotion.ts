/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this boundary. */
/**
 * POD-18 (POD-REQ-38/39/40): promotion through the platform's SHARED
 * systems — integration only, no new distribution engine.
 *
 * Social: the social module (src/modules/social) has NO programmatic
 * enqueue service — its only creation path is the inline logic of the
 * admin drafts route (POST /api/admin/social/drafts, action
 * 'create-draft'), which creates a `social-drafts` record plus one
 * `social-network-variants` record per destination account, in the
 * social system's own collections, under its own rules (destinations
 * are not the canonical store; credentials live on the owner's
 * social-accounts, never here). This module is the minimal adapter
 * over that same persistence shape: it creates exactly that draft +
 * variants, with the route's tenant discipline (every destination
 * account must belong to the episode's site — TA-P1-1). Approval,
 * scheduling and the actual provider dispatch stay with the social
 * system (approve → schedule creates `social-queue-items` and queues
 * the `social-publish` job); a promotion draft is therefore ENQUEUED
 * into the distribution pipeline as a draft awaiting the operator's
 * existing review, never auto-approved or auto-sent. Status read-back
 * (`episodePromotionStatus`) reports the social system's own states.
 *
 * Newsletter: the audience system has no compose service either — a
 * newsletter is an `email-messages` record (kind 'bulk', status
 * 'draft') with validated EmailBlock content. The adapter creates
 * exactly that, DRAFT ONLY (never review/scheduled/sent), carrying
 * the episode's canonical URL in a button + content card (both are
 * validated to be absolute http(s) URLs by the audience contracts).
 *
 * Audiograms: POD-14 already delivered the join — an accepted
 * highlight feeds POD-13's audiogram profile through
 * `createAudiogramFromHighlight`, producing a media asset recorded on
 * a podcast-assist-drafts row linked to the episode. This module adds
 * only the promotion-facing entry point that starts from an ACCEPTED
 * highlight draft (POD-14's explicit-accept rule) and delegates.
 *
 * Per-episode opt-in lives in the episode's `promotion` json:
 * `{ socialOptIn?: boolean, socialDraftId?, socialStatus?,
 *    socialEnqueuedAt?, socialError?, newsletterDraftId?,
 *    newsletterComposedAt? }` — default OFF: nothing is enqueued for
 * an episode unless the flag (or the publish call's option) says so.
 */
import { validateEmailBlocks, type EmailBlock } from '../audience/contracts'
import { createAudiogramFromHighlight } from './intelligence/service'
import type { HighlightClip } from './intelligence/assists'

export const SOCIAL_DRAFTS_COLLECTION = 'social-drafts'
export const SOCIAL_VARIANTS_COLLECTION = 'social-network-variants'
export const SOCIAL_ACCOUNTS_COLLECTION = 'social-accounts'
export const SOCIAL_QUEUE_COLLECTION = 'social-queue-items'
export const NEWSLETTER_MESSAGES_COLLECTION = 'email-messages'

export class PodcastPromotionError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'PodcastPromotionError'
    this.code = code
  }
}

export type PromotionStore = {
  find(args: any): Promise<{ docs: any[] }>
  findByID(args: any): Promise<any>
  create(args: any): Promise<any>
  update(args: any): Promise<any>
}

const relationId = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id ?? '')
      : ''

const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`

/** The episode's canonical public URL (the same path the POD-01 feed links). */
export function episodeCanonicalUrl(origin: string, episode: { slug?: unknown }): string {
  return new URL(`/podcasts/episodes/${String(episode.slug ?? '')}`, origin).toString()
}

export function episodeExcerpt(episode: any, max = 240): string {
  const raw =
    (typeof episode.description === 'string' && episode.description) ||
    (typeof episode.body === 'string' && episode.body) ||
    ''
  return truncate(raw.replace(/\s+/g, ' ').trim(), max)
}

/** Social copy template: episode title + show-notes excerpt + episode URL. */
export function buildSocialPromotionText(episode: any, canonicalUrl: string): string {
  const excerpt = episodeExcerpt(episode)
  return [String(episode.title ?? ''), excerpt, canonicalUrl].filter(Boolean).join('\n\n')
}

/** Chapter artwork for promotion: the episode artwork, else the show's. */
export function episodeArtworkId(episode: any, show?: any): string {
  return relationId(episode.artwork) || relationId(show?.artwork) || ''
}

const loadEpisodeAndShow = async (payload: PromotionStore, episodeId: string) => {
  const episode = await payload
    .findByID({
      collection: 'podcast-episodes',
      id: episodeId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  if (!episode)
    throw new PodcastPromotionError(
      'PODCAST_EPISODE_NOT_FOUND',
      `Podcast episode ${episodeId} was not found.`,
    )
  const showId = relationId(episode.show)
  const show = showId
    ? await payload
        .findByID({
          collection: 'podcast-shows',
          id: showId,
          depth: 0,
          overrideAccess: true,
        } as never)
        .catch(() => null)
    : null
  return { episode, show }
}

export type SocialPromotionResult = {
  enqueued: boolean
  reason?: string
  draftId?: string
  variantIds?: string[]
  canonicalUrl?: string
}

/**
 * Enqueues ONE social promotion for an episode: one social-draft +
 * one variant per destination account of the episode's site (or the
 * explicitly named accounts, tenant-checked). Idempotent per episode:
 * an existing promotion draft for the episode is returned, never
 * duplicated. With no destination accounts on the site nothing is
 * created and the reason is named — destinations are the operator's
 * to connect, credentials stay on their install's social-accounts.
 */
export async function enqueueEpisodeSocialPromotion(
  payload: PromotionStore,
  input: { episodeId: string; origin: string; accountIds?: string[] },
): Promise<SocialPromotionResult> {
  const { episode, show } = await loadEpisodeAndShow(payload, input.episodeId)
  const siteId = relationId(episode.site)
  const canonicalUrl = episodeCanonicalUrl(input.origin, episode)

  const existing = await payload.find({
    collection: SOCIAL_DRAFTS_COLLECTION,
    where: { canonicalUrl: { equals: canonicalUrl } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  } as never)
  const prior = existing.docs.find(
    (doc: any) =>
      doc?.provenance?.source === 'podcast-episode' &&
      String(doc?.provenance?.episodeId) === String(episode.id),
  )
  if (prior) {
    const variants = await payload.find({
      collection: SOCIAL_VARIANTS_COLLECTION,
      where: { draft: { equals: String(prior.id) } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    } as never)
    return {
      enqueued: true,
      draftId: String(prior.id),
      variantIds: variants.docs.map((doc: any) => String(doc.id)),
      canonicalUrl,
    }
  }

  let accounts: any[]
  if (input.accountIds?.length) {
    accounts = []
    for (const accountId of input.accountIds) {
      const account = await payload
        .findByID({
          collection: SOCIAL_ACCOUNTS_COLLECTION,
          id: accountId,
          depth: 0,
          overrideAccess: true,
        } as never)
        .catch(() => null)
      if (!account || relationId(account.site) !== siteId) {
        throw new PodcastPromotionError(
          'PODCAST_PROMOTION_ACCOUNT_SITE_MISMATCH',
          `Social account ${accountId} does not belong to the episode's site.`,
        )
      }
      accounts.push(account)
    }
  } else {
    const found = await payload.find({
      collection: SOCIAL_ACCOUNTS_COLLECTION,
      where: { site: { equals: siteId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    } as never)
    accounts = found.docs
  }
  if (!accounts.length) return { enqueued: false, reason: 'no-destination-accounts', canonicalUrl }

  const text = buildSocialPromotionText(episode, canonicalUrl)
  const artworkId = episodeArtworkId(episode, show)
  const draft = await payload.create({
    collection: SOCIAL_DRAFTS_COLLECTION,
    data: {
      site: siteId,
      title: `Episode promotion: ${String(episode.title ?? '')}`,
      canonicalUrl,
      status: 'draft',
      requiresReview: true,
      provenance: {
        source: 'podcast-episode',
        episodeId: String(episode.id),
        showId: relationId(episode.show) || undefined,
      },
    },
    overrideAccess: true,
  } as never)

  const variantIds: string[] = []
  for (const account of accounts) {
    const variant = await payload.create({
      collection: SOCIAL_VARIANTS_COLLECTION,
      data: {
        draft: String(draft.id),
        account: String(account.id),
        label: `${String(account.network)} variant`,
        network: String(account.network),
        text,
        linkUrl: canonicalUrl,
        attachments: artworkId ? [artworkId] : [],
        status: 'draft',
        idempotencyKey: `podcast:${String(episode.id)}:${String(account.id)}`,
      },
      overrideAccess: true,
    } as never)
    variantIds.push(String(variant.id))
  }
  return { enqueued: true, draftId: String(draft.id), variantIds, canonicalUrl }
}

/**
 * The episode's promotion status, read from the social system's own
 * state: the draft status, mapped to the brief's vocabulary
 * (queued = in the pipeline awaiting/under dispatch, sent =
 * published, failed = failed/cancelled), plus any queue items.
 */
export async function episodePromotionStatus(payload: PromotionStore, episodeId: string) {
  const { episode } = await loadEpisodeAndShow(payload, episodeId)
  const promotion = (episode.promotion ?? {}) as Record<string, unknown>
  const draftId = promotion.socialDraftId ? String(promotion.socialDraftId) : ''
  if (!draftId) {
    return {
      optedIn: promotion.socialOptIn === true,
      socialStatus: promotion.socialStatus ? String(promotion.socialStatus) : 'not-enqueued',
      draftId: null as string | null,
      queueStatuses: [] as string[],
    }
  }
  const draft = await payload
    .findByID({
      collection: SOCIAL_DRAFTS_COLLECTION,
      id: draftId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  const variants = await payload.find({
    collection: SOCIAL_VARIANTS_COLLECTION,
    where: { draft: { equals: draftId } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  } as never)
  const variantIds = variants.docs.map((doc: any) => String(doc.id))
  const queue = variantIds.length
    ? await payload.find({
        collection: SOCIAL_QUEUE_COLLECTION,
        where: { variant: { in: variantIds } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      } as never)
    : { docs: [] }
  const raw = String(draft?.status ?? promotion.socialStatus ?? 'not-enqueued')
  const socialStatus =
    raw === 'published' || raw === 'partially-published'
      ? 'sent'
      : raw === 'failed' || raw === 'cancelled'
        ? 'failed'
        : ['draft', 'review', 'approved', 'scheduled', 'queued', 'publishing', 'unknown'].includes(
              raw,
            )
          ? 'queued'
          : raw
  return {
    optedIn: promotion.socialOptIn === true,
    socialStatus,
    draftStatus: raw,
    draftId,
    queueStatuses: queue.docs.map((doc: any) => String(doc.status)),
  }
}

/** Records promotion state on the episode's `promotion` json (merge, never clobber). */
export async function recordEpisodePromotion(
  payload: PromotionStore,
  episodeId: string,
  patch: Record<string, unknown>,
): Promise<any> {
  const { episode } = await loadEpisodeAndShow(payload, episodeId)
  return payload.update({
    collection: 'podcast-episodes',
    id: episodeId,
    data: { promotion: { ...((episode.promotion ?? {}) as Record<string, unknown>), ...patch } },
    overrideAccess: true,
  } as never)
}

export type NewsletterDraftResult = { created: boolean; messageId: string; canonicalUrl: string }

/**
 * Composes an episode's release notes into the newsletter system as a
 * DRAFT `email-messages` issue — title, notes, canonical-episode-URL
 * button + content card, artwork when present. Draft only: this
 * function never submits for review, schedules, or sends. Idempotent
 * per episode via the message idempotency key.
 */
export async function composeEpisodeNewsletterDraft(
  payload: PromotionStore,
  input: { episodeId: string; origin: string },
): Promise<NewsletterDraftResult> {
  const { episode, show } = await loadEpisodeAndShow(payload, input.episodeId)
  const canonicalUrl = episodeCanonicalUrl(input.origin, episode)
  const idempotencyKey = `podcast-newsletter:${String(episode.id)}`
  const existing = await payload.find({
    collection: NEWSLETTER_MESSAGES_COLLECTION,
    where: { idempotencyKey: { equals: idempotencyKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (existing.docs[0]) {
    return { created: false, messageId: String(existing.docs[0].id), canonicalUrl }
  }
  const artworkId = episodeArtworkId(episode, show)
  const notes = episodeExcerpt(episode, 1200)
  const blocks: EmailBlock[] = [
    { type: 'heading', text: String(episode.title ?? '') },
    ...(notes ? [{ type: 'text', text: notes } as EmailBlock] : []),
    {
      type: 'content-cards',
      cards: [
        {
          title: String(episode.title ?? ''),
          text: episodeExcerpt(episode) || undefined,
          href: canonicalUrl,
          ...(artworkId ? { imageAssetId: artworkId } : {}),
        },
      ],
    },
    { type: 'button', label: 'Listen to the episode', href: canonicalUrl },
  ]
  const blockErrors = validateEmailBlocks(blocks)
  if (blockErrors.length) {
    throw new PodcastPromotionError('PODCAST_NEWSLETTER_BLOCKS_INVALID', blockErrors.join(' '))
  }
  const message = await payload.create({
    collection: NEWSLETTER_MESSAGES_COLLECTION,
    data: {
      site: relationId(episode.site),
      subject: String(episode.title ?? ''),
      preheader: episodeExcerpt(episode, 140) || undefined,
      purpose: 'newsletter',
      channel: 'email',
      kind: 'bulk',
      status: 'draft',
      blocks,
      idempotencyKey,
      tracking: { source: 'podcast-episode', episodeId: String(episode.id), canonicalUrl },
    },
    overrideAccess: true,
  } as never)
  await recordEpisodePromotion(payload, input.episodeId, {
    newsletterDraftId: String(message.id),
    newsletterComposedAt: new Date().toISOString(),
  })
  return { created: true, messageId: String(message.id), canonicalUrl }
}

/**
 * The audiogram join, promotion-facing: resolves an ACCEPTED POD-14
 * highlight draft to its clip, refusing anything not accepted (the
 * POD-14 rule: drafts change nothing until explicitly accepted).
 */
export function resolveAcceptedHighlight(draft: any): HighlightClip {
  if (!draft || draft.kind !== 'highlight')
    throw new PodcastPromotionError(
      'PODCAST_HIGHLIGHT_DRAFT_INVALID',
      'Audiogram promotion requires a highlight assist draft.',
    )
  if (draft.state !== 'accepted')
    throw new PodcastPromotionError(
      'PODCAST_HIGHLIGHT_NOT_ACCEPTED',
      `Highlight draft "${String(draft.id)}" is "${String(draft.state)}", not accepted — accept it before rendering an audiogram.`,
    )
  const payloadData = (draft.payload ?? {}) as Record<string, unknown>
  const highlights = (payloadData.highlights ?? []) as any[]
  const clip = highlights[0]
  if (!clip || !(Number(clip.endSec) > Number(clip.startSec)))
    throw new PodcastPromotionError(
      'PODCAST_HIGHLIGHT_EMPTY',
      'The accepted highlight draft carries no usable clip range.',
    )
  return {
    startSec: Number(clip.startSec),
    endSec: Number(clip.endSec),
    label: String(clip.label ?? 'Highlight'),
    text: String(clip.text ?? ''),
    source: clip.source === 'marked-range' ? 'marked-range' : 'longest-segment',
  }
}

/**
 * Produces the promotion audiogram for an accepted highlight draft:
 * delegates to POD-14's `createAudiogramFromHighlight` (POD-13
 * audiogram profile → media asset → assist draft linked to the
 * episode, downloadable from the episode's asset list via
 * `listAssistDrafts`). POD-21: when the episode has a reviewed
 * transcript, the render is the captioned variant (burned-in
 * subtitles); the variant is recorded on the draft's provenance
 * (`captionsBurnedIn`). No new render code lives here.
 */
export async function createAudiogramForAcceptedHighlight(
  payload: PromotionStore,
  config: any,
  input: { draftId: string; projectId: string; createdBy?: string },
) {
  const draft = await payload
    .findByID({
      collection: 'podcast-assist-drafts',
      id: input.draftId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  const highlight = resolveAcceptedHighlight(draft)
  return createAudiogramFromHighlight(payload as never, config, {
    episodeId: relationId(draft.episode),
    projectId: input.projectId,
    highlight,
    createdBy: input.createdBy,
  })
}
