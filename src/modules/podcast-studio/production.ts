/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this boundary. */
/**
 * POD-04 (POD-REQ-09, POD-REQ-10, POD-REQ-37): podcast production
 * management + the publish path.
 *
 * Production states live on podcast-episodes.productionState and are
 * driven ONLY through this module's guarded state machine, which keeps
 * the existing public `status` in sync:
 *
 *   productionState published → status 'published'  (feed-visible)
 *   productionState withdrawn → status 'unavailable' (feed-invisible:
 *                               the public feed route only renders
 *                               episodes with status published/updated)
 *   productionState scheduled → status 'scheduled'
 *   everything else           → status 'draft'
 *
 * Approvals: Workflow #19's approval machinery
 * (EditorialWorkflow.decideReview via src/modules/editorial) is bound
 * to article/content bundles loaded by article id — it has no
 * primitive that records an approval against an arbitrary record such
 * as a podcast episode. POD-04 therefore records approvals in the
 * minimal `podcast-episode-approvals` collection (episode, approver,
 * decision, decidedAt); the latest decision wins and publish refuses
 * to proceed without a latest decision of `approved`, throwing the
 * named PodcastApprovalRequiredError. This is stated plainly here and
 * in the POD-04 handoff: the approval record is new and minimal, not a
 * reuse of Workflow #19.
 *
 * Recording sessions are entries in the EXISTING calendar module's
 * `calendar-entries` collection — no parallel calendar. The entry
 * links back to the episode through its `structuredData` JSON (the
 * collection's `references` relation does not include
 * podcast-episodes, and changing that shared relation is out of
 * scope); `listRecordingSessions` reads that link back.
 *
 * Guests: the guest book (podcast-guests + podcast-guest-appearances)
 * is production data. The feed's podcast:person path is untouched —
 * episode.guests → authors still feeds it (POD-01). A guest-book
 * record may optionally link to an author record; nothing reads the
 * link automatically.
 */
import { assertIanaTimeZone } from '../calendar/contracts'

export const PODCAST_GUEST_COLLECTION = 'podcast-guests'
export const PODCAST_GUEST_APPEARANCE_COLLECTION = 'podcast-guest-appearances'
export const PODCAST_EPISODE_APPROVAL_COLLECTION = 'podcast-episode-approvals'

export const PRODUCTION_STATES = [
  'idea',
  'scripted',
  'scheduled-record',
  'recorded',
  'editing',
  'review',
  'scheduled',
  'published',
  'withdrawn',
] as const
export type ProductionState = (typeof PRODUCTION_STATES)[number]

export const PRODUCTION_TRANSITIONS: Record<ProductionState, readonly ProductionState[]> = {
  idea: ['scripted', 'scheduled-record', 'recorded', 'withdrawn'],
  scripted: ['scheduled-record', 'recorded', 'editing', 'withdrawn'],
  'scheduled-record': ['recorded', 'scripted', 'idea', 'withdrawn'],
  recorded: ['editing', 'review', 'withdrawn'],
  editing: ['review', 'recorded', 'withdrawn'],
  review: ['scheduled', 'published', 'editing', 'withdrawn'],
  scheduled: ['published', 'review', 'withdrawn'],
  published: ['withdrawn'],
  withdrawn: ['published', 'editing', 'idea'],
}

export const isProductionState = (value: unknown): value is ProductionState =>
  typeof value === 'string' && (PRODUCTION_STATES as readonly string[]).includes(value)

export const canTransitionProduction = (from: ProductionState, to: ProductionState): boolean =>
  from === to || (PRODUCTION_TRANSITIONS[from]?.includes(to) ?? false)

/** The public status a production state keeps in sync (see header). */
export function publicStatusForProductionState(state: ProductionState): string {
  if (state === 'published') return 'published'
  if (state === 'withdrawn') return 'unavailable'
  if (state === 'scheduled') return 'scheduled'
  return 'draft'
}

export class PodcastProductionError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'PodcastProductionError'
    this.code = code
  }
}

export class PodcastApprovalRequiredError extends PodcastProductionError {
  constructor(episodeId: string) {
    super(
      'PODCAST_APPROVAL_REQUIRED',
      `Episode ${episodeId} cannot publish: no recorded approval. An episode in review needs a podcast-episode-approvals record with decision "approved" (the latest decision wins) before the publish transition.`,
    )
    this.name = 'PodcastApprovalRequiredError'
  }
}

export class PodcastGuestConsentError extends PodcastProductionError {
  constructor(showId: string, guestId: string, missingAppearanceIds: string[]) {
    super(
      'PODCAST_GUEST_CONSENT_REQUIRED',
      `Guest ${guestId} cannot be admitted to show ${showId}: consent is missing for appearance(s) ${missingAppearanceIds.join(', ') || '(no appearance on this show)'} and the show's guestConsentPolicy is "block". Record consent on the appearance first.`,
    )
    this.name = 'PodcastGuestConsentError'
  }
}

export type ProductionStore = {
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

const loadEpisode = async (payload: ProductionStore, episodeId: string): Promise<any> => {
  const episode = await payload
    .findByID({
      collection: 'podcast-episodes',
      id: episodeId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  if (!episode) {
    throw new PodcastProductionError(
      'PODCAST_EPISODE_NOT_FOUND',
      `Podcast episode ${episodeId} was not found.`,
    )
  }
  return episode
}

const episodeState = (episode: any): ProductionState =>
  isProductionState(episode.productionState) ? episode.productionState : 'idea'

/**
 * The publish guards (POD-REQ-09/37), shared by the state machine and
 * publishEpisode: audio present, episode in review or scheduled, and a
 * recorded approval whose latest decision is `approved`.
 */
export async function assertEpisodePublishable(
  payload: ProductionStore,
  episode: any,
): Promise<void> {
  const state = episodeState(episode)
  if (state !== 'review' && state !== 'scheduled') {
    throw new PodcastProductionError(
      'PODCAST_PUBLISH_STATE_INVALID',
      `Episode ${String(episode.id)} cannot publish from production state "${state}": it must be in review or scheduled.`,
    )
  }
  if (!relationId(episode.audio)) {
    throw new PodcastProductionError(
      'PODCAST_PUBLISH_AUDIO_MISSING',
      `Episode ${String(episode.id)} cannot publish: no audio asset is attached.`,
    )
  }
  const approval = await latestEpisodeApproval(payload, String(episode.id))
  if (!approval || approval.decision !== 'approved') {
    throw new PodcastApprovalRequiredError(String(episode.id))
  }
}

/** The latest approval decision recorded for an episode, or null. */
export async function latestEpisodeApproval(
  payload: ProductionStore,
  episodeId: string,
): Promise<any | null> {
  const result = await payload.find({
    collection: PODCAST_EPISODE_APPROVAL_COLLECTION,
    where: { episode: { equals: episodeId } },
    sort: '-decidedAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  return result.docs[0] ?? null
}

/** Records an approval decision for an episode (latest decision wins). */
export async function recordEpisodeApproval(
  payload: ProductionStore,
  input: {
    episodeId: string
    approver: string
    decision: 'approved' | 'rejected' | 'changes-requested'
    note?: string
    decidedAt?: string
  },
): Promise<any> {
  await loadEpisode(payload, input.episodeId)
  if (!input.approver) {
    throw new PodcastProductionError(
      'PODCAST_APPROVER_REQUIRED',
      'An approval decision must name its approver.',
    )
  }
  return payload.create({
    collection: PODCAST_EPISODE_APPROVAL_COLLECTION,
    data: {
      episode: input.episodeId,
      approver: input.approver,
      decision: input.decision,
      note: input.note ?? null,
      decidedAt: input.decidedAt ?? new Date().toISOString(),
    },
    overrideAccess: true,
  } as never)
}

async function applyProductionState(
  payload: ProductionStore,
  episode: any,
  to: ProductionState,
): Promise<any> {
  const data: Record<string, unknown> = {
    productionState: to,
    status: publicStatusForProductionState(to),
  }
  if (to === 'published') {
    const existing = episode.publishedAt ? new Date(String(episode.publishedAt)) : null
    data.publishedAt =
      existing && !Number.isNaN(existing.getTime()) && existing.getTime() <= Date.now()
        ? existing.toISOString()
        : new Date().toISOString()
  }
  return payload.update({
    collection: 'podcast-episodes',
    id: String(episode.id),
    data,
    overrideAccess: true,
  } as never)
}

/**
 * The guarded state-machine walk: validates the transition against
 * PRODUCTION_TRANSITIONS, enforces the publish guards when the target
 * is `published`, and writes productionState + the synced public
 * status in one update. Used by the staff API and the tests.
 */
export async function transitionProductionState(
  payload: ProductionStore,
  episodeId: string,
  to: ProductionState,
  _options: { by?: string } = {},
): Promise<any> {
  if (!isProductionState(to)) {
    throw new PodcastProductionError(
      'PODCAST_PRODUCTION_STATE_UNKNOWN',
      `Unknown production state "${String(to)}".`,
    )
  }
  const episode = await loadEpisode(payload, episodeId)
  const from = episodeState(episode)
  if (!canTransitionProduction(from, to)) {
    throw new PodcastProductionError(
      'PODCAST_PRODUCTION_TRANSITION_INVALID',
      `Episode ${episodeId} cannot move from production state "${from}" to "${to}". Allowed from "${from}": ${PRODUCTION_TRANSITIONS[from].join(', ')}.`,
    )
  }
  if (to === 'published' && from !== 'published') {
    await assertEpisodePublishable(payload, episode)
  }
  if (from === to) return episode
  return applyProductionState(payload, episode, to)
}

/**
 * POD-REQ-37 publish path: validates the state machine + approval +
 * audio, then sets the episode published with publishedAt through the
 * existing collections — the POD-01 feed builder picks it up on the
 * next request because its public status is `published`.
 */
export async function publishEpisode(
  payload: ProductionStore,
  episodeId: string,
  options: {
    by?: string
    /**
     * POD-18 promotion opt-in for THIS publish. When omitted, the
     * episode's own `promotion.socialOptIn` flag decides — default
     * OFF, so an ordinary publish enqueues nothing.
     */
    promoteSocial?: boolean
    socialAccountIds?: string[]
    origin?: string
  } = {},
): Promise<any> {
  const episode = await loadEpisode(payload, episodeId)
  const from = episodeState(episode)
  if (from === 'published') return episode
  if (!canTransitionProduction(from, 'published')) {
    throw new PodcastProductionError(
      'PODCAST_PRODUCTION_TRANSITION_INVALID',
      `Episode ${episodeId} cannot move from production state "${from}" to "published". Allowed from "${from}": ${PRODUCTION_TRANSITIONS[from].join(', ')}.`,
    )
  }
  await assertEpisodePublishable(payload, episode)
  void options.by
  const published = await applyProductionState(payload, episode, 'published')
  const promoteSocial = options.promoteSocial ?? episode.promotion?.socialOptIn === true
  if (!promoteSocial) return published
  // POD-18: enqueue episode promotion through the EXISTING social
  // distribution system (promotion.ts adapter over social-drafts /
  // social-network-variants). A promotion failure never unpublishes
  // the episode — it is recorded on the episode's promotion state.
  const { enqueueEpisodeSocialPromotion, recordEpisodePromotion } = await import('./promotion')
  const origin = options.origin ?? process.env.APP_URL ?? 'http://localhost:3000'
  try {
    const result = await enqueueEpisodeSocialPromotion(payload as never, {
      episodeId,
      origin,
      accountIds: options.socialAccountIds,
    })
    if (result.enqueued) {
      return recordEpisodePromotion(payload as never, episodeId, {
        socialOptIn: true,
        socialDraftId: result.draftId,
        socialStatus: 'queued',
        socialEnqueuedAt: new Date().toISOString(),
        socialError: null,
      })
    }
    return recordEpisodePromotion(payload as never, episodeId, {
      socialOptIn: true,
      socialStatus: 'not-enqueued',
      socialError: result.reason ?? 'not-enqueued',
    })
  } catch (error) {
    return recordEpisodePromotion(payload as never, episodeId, {
      socialOptIn: true,
      socialStatus: 'failed',
      socialError: error instanceof Error ? error.message : String(error),
    }).catch(() => published)
  }
}

/**
 * POD-REQ-37: swap an episode's audio for a different media asset. The
 * episode GUID is never touched (the podcast-episodes beforeChange
 * hook also pins it to the original), and the enclosure byte count /
 * MIME type are refreshed from the new asset so the next feed build
 * advertises the new enclosure length.
 */
export async function replaceEpisodeAudio(
  payload: ProductionStore,
  episodeId: string,
  mediaAssetId: string,
): Promise<any> {
  const episode = await loadEpisode(payload, episodeId)
  const asset = await payload
    .findByID({
      collection: 'media-assets',
      id: mediaAssetId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  if (!asset) {
    throw new PodcastProductionError(
      'PODCAST_AUDIO_ASSET_NOT_FOUND',
      `Media asset ${mediaAssetId} was not found.`,
    )
  }
  if (relationId(asset.site) && relationId(asset.site) !== relationId(episode.site)) {
    throw new PodcastProductionError(
      'PODCAST_AUDIO_ASSET_SITE_MISMATCH',
      `Media asset ${mediaAssetId} belongs to a different site than episode ${episodeId}.`,
    )
  }
  return payload.update({
    collection: 'podcast-episodes',
    id: episodeId,
    data: {
      audio: mediaAssetId,
      enclosureBytes: Number(asset.sizeBytes ?? 0) || null,
      enclosureMimeType: asset.mimeType ? String(asset.mimeType) : null,
    },
    overrideAccess: true,
  } as never)
}

/** POD-REQ-37: withdraw a published episode — it leaves the feed on the next request; the GUID is preserved. */
export async function withdrawEpisode(
  payload: ProductionStore,
  episodeId: string,
  _options: { by?: string } = {},
): Promise<any> {
  const episode = await loadEpisode(payload, episodeId)
  const from = episodeState(episode)
  if (from === 'withdrawn') return episode
  if (!canTransitionProduction(from, 'withdrawn')) {
    throw new PodcastProductionError(
      'PODCAST_PRODUCTION_TRANSITION_INVALID',
      `Episode ${episodeId} cannot be withdrawn from production state "${from}".`,
    )
  }
  return applyProductionState(payload, episode, 'withdrawn')
}

/** POD-REQ-37: restore a withdrawn episode to published, GUID and publishedAt untouched. */
export async function restoreEpisode(
  payload: ProductionStore,
  episodeId: string,
  _options: { by?: string } = {},
): Promise<any> {
  const episode = await loadEpisode(payload, episodeId)
  const from = episodeState(episode)
  if (from !== 'withdrawn') {
    throw new PodcastProductionError(
      'PODCAST_PRODUCTION_TRANSITION_INVALID',
      `Episode ${episodeId} cannot be restored from production state "${from}": only a withdrawn episode restores.`,
    )
  }
  return applyProductionState(payload, episode, 'published')
}

/** Production board (POD-REQ-09): a show's episodes grouped by production state. */
export async function productionBoard(
  payload: ProductionStore,
  showId: string,
): Promise<{
  showId: string
  counts: Record<ProductionState, number>
  byState: Record<ProductionState, any[]>
}> {
  const result = await payload.find({
    collection: 'podcast-episodes',
    where: { show: { equals: showId } },
    sort: 'createdAt',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  } as never)
  const byState = Object.fromEntries(
    PRODUCTION_STATES.map((state) => [state, [] as any[]]),
  ) as Record<ProductionState, any[]>
  for (const episode of result.docs) {
    byState[episodeState(episode)].push(episode)
  }
  const counts = Object.fromEntries(
    PRODUCTION_STATES.map((state) => [state, byState[state].length]),
  ) as Record<ProductionState, number>
  return { showId, counts, byState }
}

/**
 * Creates a recording-session entry for an episode in the existing
 * calendar module's `calendar-entries` collection, and moves the
 * episode to `scheduled-record` when it is still in idea/scripted.
 * The entry links back via structuredData (see header note).
 */
export async function scheduleRecordingSession(
  payload: ProductionStore,
  input: {
    episodeId: string
    startsAt: string
    endsAt?: string | null
    timeZone?: string
    title?: string
    actorId?: string
  },
): Promise<any> {
  const episode = await loadEpisode(payload, input.episodeId)
  const timeZone = input.timeZone ?? 'UTC'
  assertIanaTimeZone(timeZone)
  if (Number.isNaN(new Date(input.startsAt).getTime())) {
    throw new PodcastProductionError(
      'PODCAST_SESSION_START_INVALID',
      'A recording session needs a valid start instant.',
    )
  }
  if (input.endsAt && new Date(input.endsAt) < new Date(input.startsAt)) {
    throw new PodcastProductionError(
      'PODCAST_SESSION_RANGE_INVALID',
      'A recording session must end after it starts.',
    )
  }
  const showId = relationId(episode.show)
  const entry = await payload.create({
    collection: 'calendar-entries',
    data: {
      site: relationId(episode.site),
      publication: relationId(episode.publication) || null,
      space: relationId(episode.space) || null,
      owner: relationId(episode.owner) || null,
      title: input.title ?? `Recording: ${String(episode.title)}`,
      startsAt: new Date(input.startsAt).toISOString(),
      endsAt: input.endsAt ? new Date(input.endsAt).toISOString() : null,
      timeZone,
      status: 'scheduled',
      visibility: 'private',
      structuredData: {
        source: 'podcast-studio',
        kind: 'recording-session',
        episodeId: String(episode.id),
        showId,
        actorId: input.actorId ?? null,
      },
    },
    overrideAccess: true,
  } as never)
  const state = episodeState(episode)
  if (state === 'idea' || state === 'scripted') {
    await transitionProductionState(payload, String(episode.id), 'scheduled-record')
  }
  return entry
}

/** Recording sessions recorded for an episode, newest first. */
export async function listRecordingSessions(
  payload: ProductionStore,
  episodeId: string,
): Promise<any[]> {
  // The episode link lives in the entry's structuredData JSON; filter
  // in memory so the query shape does not depend on JSON-path support.
  const all = await payload.find({
    collection: 'calendar-entries',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  } as never)
  return (all.docs as any[])
    .filter(
      (entry) =>
        entry.structuredData?.kind === 'recording-session' &&
        String(entry.structuredData?.episodeId ?? '') === episodeId,
    )
    .sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt)))
}

/** Creates a guest-book record for a site. */
export async function createPodcastGuest(
  payload: ProductionStore,
  input: {
    siteId: string
    name: string
    email?: string
    contact?: unknown
    bio?: string
    links?: unknown
    authorId?: string
  },
): Promise<any> {
  if (!input.name?.trim()) {
    throw new PodcastProductionError('PODCAST_GUEST_NAME_REQUIRED', 'A guest needs a name.')
  }
  return payload.create({
    collection: PODCAST_GUEST_COLLECTION,
    data: {
      site: input.siteId,
      name: input.name,
      email: input.email ?? null,
      contact: input.contact ?? null,
      bio: input.bio ?? null,
      links: input.links ?? null,
      author: input.authorId ?? null,
    },
    overrideAccess: true,
  } as never)
}

/** Links a guest to an episode with prep notes/questions; consent starts unrecorded. */
export async function addGuestAppearance(
  payload: ProductionStore,
  input: {
    guestId: string
    episodeId: string
    role?: string
    prepNotes?: string
    questions?: unknown
  },
): Promise<any> {
  const guest = await payload
    .findByID({
      collection: PODCAST_GUEST_COLLECTION,
      id: input.guestId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  if (!guest) {
    throw new PodcastProductionError(
      'PODCAST_GUEST_NOT_FOUND',
      `Podcast guest ${input.guestId} was not found.`,
    )
  }
  const episode = await loadEpisode(payload, input.episodeId)
  if (relationId(guest.site) !== relationId(episode.site)) {
    throw new PodcastProductionError(
      'PODCAST_GUEST_SITE_MISMATCH',
      `Guest ${input.guestId} belongs to a different site than episode ${input.episodeId}.`,
    )
  }
  return payload.create({
    collection: PODCAST_GUEST_APPEARANCE_COLLECTION,
    data: {
      guest: input.guestId,
      episode: input.episodeId,
      role: input.role ?? 'guest',
      prepNotes: input.prepNotes ?? null,
      questions: input.questions ?? null,
    },
    overrideAccess: true,
  } as never)
}

/** Records consent on one appearance. */
export async function recordGuestConsent(
  payload: ProductionStore,
  appearanceId: string,
  input: { consentBy: string; consentScope: string; releaseUrl?: string; consentAt?: string },
): Promise<any> {
  if (!input.consentBy || !input.consentScope) {
    throw new PodcastProductionError(
      'PODCAST_CONSENT_FIELDS_REQUIRED',
      'Recording consent requires consentBy and consentScope.',
    )
  }
  return payload.update({
    collection: PODCAST_GUEST_APPEARANCE_COLLECTION,
    id: appearanceId,
    data: {
      consentAt: input.consentAt ?? new Date().toISOString(),
      consentBy: input.consentBy,
      consentScope: input.consentScope,
      releaseUrl: input.releaseUrl ?? null,
    },
    overrideAccess: true,
  } as never)
}

export type GuestAdmission = {
  ready: boolean
  policy: 'off' | 'warn' | 'block'
  warnings: string[]
  missingAppearanceIds: string[]
}

/**
 * Pure admission evaluation (POD-REQ-10): given the show's consent
 * policy and the guest's appearances on that show's episodes, decide
 * whether the guest may be admitted. An appearance with no consentAt
 * is "missing"; a guest with no appearance on the show at all is also
 * missing (nothing on file). `off` never flags, `warn` flags but
 * admits, `block` refuses.
 */
export function evaluateGuestAdmission(
  policy: unknown,
  appearances: Array<{ id: string; consentAt?: unknown }>,
): GuestAdmission {
  const resolved = policy === 'off' || policy === 'block' ? policy : 'warn'
  const missingAppearanceIds = appearances
    .filter((appearance) => !appearance.consentAt)
    .map((appearance) => String(appearance.id))
  const noAppearanceOnFile = appearances.length === 0
  const missing = missingAppearanceIds.length > 0 || noAppearanceOnFile
  const warnings =
    missing && resolved !== 'off'
      ? [
          noAppearanceOnFile && missingAppearanceIds.length === 0
            ? 'Guest has no appearance (and no consent) on file for this show.'
            : `Consent is missing for appearance(s): ${missingAppearanceIds.join(', ')}.`,
        ]
      : []
  return {
    ready: !(missing && resolved === 'block'),
    policy: resolved,
    warnings,
    missingAppearanceIds,
  }
}

/**
 * POD-REQ-10 admission hook — consumed later by POD-10 (guest
 * sessions). Loads the guest's appearances on episodes of `show` and
 * applies the show's guestConsentPolicy: `block` + missing consent
 * throws PodcastGuestConsentError; `warn` returns the admission with
 * warnings; `off` admits silently.
 */
/** Loads and evaluates a guest's admission for a show, without throwing. */
export async function getGuestAdmission(
  payload: ProductionStore,
  show: any,
  guestId: string,
): Promise<GuestAdmission> {
  const episodes = await payload.find({
    collection: 'podcast-episodes',
    where: { show: { equals: String(show.id) } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  } as never)
  const episodeIds = new Set(episodes.docs.map((episode: any) => String(episode.id)))
  const appearances = await payload.find({
    collection: PODCAST_GUEST_APPEARANCE_COLLECTION,
    where: { guest: { equals: guestId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  } as never)
  const onShow = (appearances.docs as any[]).filter((appearance) =>
    episodeIds.has(relationId(appearance.episode)),
  )
  return evaluateGuestAdmission(show.guestConsentPolicy, onShow)
}

export async function assertGuestAdmissionReady(
  payload: ProductionStore,
  show: any,
  guestId: string,
): Promise<GuestAdmission> {
  const admission = await getGuestAdmission(payload, show, guestId)
  if (!admission.ready) {
    throw new PodcastGuestConsentError(String(show.id), guestId, admission.missingAppearanceIds)
  }
  return admission
}
