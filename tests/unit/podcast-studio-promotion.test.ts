/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-18 (POD-REQ-38/39/40): promotion through shared systems —
 * service-level proof over an in-memory Payload fake (the real
 * Payload/Postgres journey is tests/integration/pod18-promotion).
 *
 * Covered: publish-with-promotion enqueues exactly ONE social item
 * (one social-draft + one variant per destination account) with the
 * correct content (title + excerpt + canonical URL + chapter
 * artwork); opt-out and default-off enqueue none; the stored
 * per-episode opt-in flag drives publish; re-enqueue is idempotent;
 * a foreign-site account is refused; newsletter composition creates
 * a DRAFT email-messages issue carrying the canonical URL and never
 * a scheduled/sent one; the audiogram join refuses unaccepted
 * highlight drafts and resolves accepted ones; oEmbed JSON shape;
 * locked embed state carries no audio URL at markup level.
 */
import { describe, expect, it } from 'vitest'

import { publishEpisode, recordEpisodeApproval } from '../../src/modules/podcast-studio/production'
import {
  buildSocialPromotionText,
  composeEpisodeNewsletterDraft,
  createAudiogramForAcceptedHighlight,
  enqueueEpisodeSocialPromotion,
  episodePromotionStatus,
  resolveAcceptedHighlight,
} from '../../src/modules/podcast-studio/promotion'
import {
  buildEmbedIframeHtml,
  buildOEmbedResponse,
  episodeEmbedState,
  episodeSlugFromEmbedRequestUrl,
  oEmbedDiscoveryLinks,
} from '../../src/modules/podcast-studio/embed'

const ORIGIN = 'https://podcast.example.test'

const matches = (doc: any, where: any): boolean => {
  if (!where) return true
  return Object.entries(where).every(([field, cond]: [string, any]) => {
    const value = doc[field]
    const id = value && typeof value === 'object' ? String(value.id) : String(value ?? '')
    if (cond?.equals !== undefined) return id === String(cond.equals)
    if (cond?.in !== undefined) return cond.in.map(String).includes(id)
    return true
  })
}

function fakeStore(seed: Record<string, any[]>) {
  const db: Record<string, any[]> = structuredClone(seed)
  let seq = 0
  const store: any = {
    db,
    async find({ collection, where, sort, limit }: any) {
      let docs = (db[collection] ?? []).filter((doc) => matches(doc, where))
      if (sort === '-decidedAt')
        docs = [...docs].sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt)))
      if (typeof limit === 'number') docs = docs.slice(0, limit)
      return { docs }
    },
    async findByID({ collection, id }: any) {
      const doc = (db[collection] ?? []).find((entry) => String(entry.id) === String(id))
      if (!doc) throw new Error('not found')
      return doc
    },
    async create({ collection, data }: any) {
      const doc = { id: `${collection}-${++seq}`, ...data }
      ;(db[collection] ??= []).push(doc)
      return doc
    },
    async update({ collection, id, data }: any) {
      const doc = (db[collection] ?? []).find((entry) => String(entry.id) === String(id))
      Object.assign(doc, data)
      return doc
    },
  }
  return store
}

const baseSeed = () => ({
  'podcast-shows': [
    { id: 'show-1', site: 'site-1', slug: 'the-show', title: 'The Show', artwork: 'art-show' },
  ],
  'podcast-episodes': [
    {
      id: 'ep-1',
      site: 'site-1',
      show: 'show-1',
      slug: 'episode-one',
      title: 'Episode One',
      description: 'A great episode about promotion wiring and shared systems.',
      status: 'draft',
      productionState: 'review',
      audio: 'audio-1',
      artwork: 'art-episode',
    },
  ],
  'podcast-episode-approvals': [] as any[],
  'social-accounts': [
    { id: 'acct-1', site: 'site-1', network: 'mastodon', displayName: 'Show Mastodon' },
  ],
  'social-drafts': [] as any[],
  'social-network-variants': [] as any[],
  'social-queue-items': [] as any[],
  'email-messages': [] as any[],
  'podcast-assist-drafts': [] as any[],
})

const approve = (store: any) =>
  recordEpisodeApproval(store, { episodeId: 'ep-1', approver: 'staff-1', decision: 'approved' })

describe('POD-18 social promotion (adapter over the social system)', () => {
  it('builds the template: title + excerpt + canonical URL', () => {
    const text = buildSocialPromotionText(
      baseSeed()['podcast-episodes'][0],
      `${ORIGIN}/podcasts/episodes/episode-one`,
    )
    expect(text).toContain('Episode One')
    expect(text).toContain('A great episode about promotion')
    expect(text).toContain(`${ORIGIN}/podcasts/episodes/episode-one`)
  })

  it('publish with promotion enqueues exactly one item with correct content', async () => {
    const store = fakeStore(baseSeed())
    await approve(store)
    const published = await publishEpisode(store, 'ep-1', {
      promoteSocial: true,
      origin: ORIGIN,
    })
    expect(published.productionState).toBe('published')
    expect(store.db['social-drafts']).toHaveLength(1)
    const draft = store.db['social-drafts'][0]
    expect(draft.canonicalUrl).toBe(`${ORIGIN}/podcasts/episodes/episode-one`)
    expect(draft.provenance).toMatchObject({ source: 'podcast-episode', episodeId: 'ep-1' })
    expect(store.db['social-network-variants']).toHaveLength(1)
    const variant = store.db['social-network-variants'][0]
    expect(variant.network).toBe('mastodon')
    expect(variant.text).toContain('Episode One')
    expect(variant.text).toContain(`${ORIGIN}/podcasts/episodes/episode-one`)
    expect(variant.linkUrl).toBe(`${ORIGIN}/podcasts/episodes/episode-one`)
    expect(variant.attachments).toEqual(['art-episode'])
    // Status visible on the episode, from the social system's own state.
    expect(published.promotion).toMatchObject({
      socialOptIn: true,
      socialDraftId: draft.id,
      socialStatus: 'queued',
    })
    const status = await episodePromotionStatus(store, 'ep-1')
    expect(status.socialStatus).toBe('queued')
    expect(status.draftId).toBe(draft.id)
  })

  it('opt-out enqueues none, and the default (no option, no flag) enqueues none', async () => {
    const optedOut = fakeStore(baseSeed())
    await approve(optedOut)
    await publishEpisode(optedOut, 'ep-1', { promoteSocial: false, origin: ORIGIN })
    expect(optedOut.db['social-drafts']).toHaveLength(0)

    const byDefault = fakeStore(baseSeed())
    await approve(byDefault)
    const published = await publishEpisode(byDefault, 'ep-1', { origin: ORIGIN })
    expect(published.productionState).toBe('published')
    expect(byDefault.db['social-drafts']).toHaveLength(0)
    const status = await episodePromotionStatus(byDefault, 'ep-1')
    expect(status.socialStatus).toBe('not-enqueued')
  })

  it('the stored per-episode opt-in flag (default off) drives publish when no option is passed', async () => {
    const store = fakeStore(baseSeed())
    store.db['podcast-episodes'][0].promotion = { socialOptIn: true }
    await approve(store)
    await publishEpisode(store, 'ep-1', { origin: ORIGIN })
    expect(store.db['social-drafts']).toHaveLength(1)
  })

  it('re-enqueue is idempotent — still exactly one draft', async () => {
    const store = fakeStore(baseSeed())
    const first = await enqueueEpisodeSocialPromotion(store, { episodeId: 'ep-1', origin: ORIGIN })
    const second = await enqueueEpisodeSocialPromotion(store, { episodeId: 'ep-1', origin: ORIGIN })
    expect(first.enqueued).toBe(true)
    expect(second.draftId).toBe(first.draftId)
    expect(store.db['social-drafts']).toHaveLength(1)
    expect(store.db['social-network-variants']).toHaveLength(1)
  })

  it('refuses a destination account from another site (tenant discipline)', async () => {
    const store = fakeStore(baseSeed())
    store.db['social-accounts'].push({ id: 'acct-foreign', site: 'site-2', network: 'x' })
    await expect(
      enqueueEpisodeSocialPromotion(store, {
        episodeId: 'ep-1',
        origin: ORIGIN,
        accountIds: ['acct-foreign'],
      }),
    ).rejects.toMatchObject({ code: 'PODCAST_PROMOTION_ACCOUNT_SITE_MISMATCH' })
    expect(store.db['social-drafts']).toHaveLength(0)
  })

  it('with no destination accounts on the site, enqueues nothing and names the reason', async () => {
    const seed = baseSeed()
    seed['social-accounts'] = []
    const store = fakeStore(seed)
    const result = await enqueueEpisodeSocialPromotion(store, { episodeId: 'ep-1', origin: ORIGIN })
    expect(result).toMatchObject({ enqueued: false, reason: 'no-destination-accounts' })
    expect(store.db['social-drafts']).toHaveLength(0)
  })
})

describe('POD-18 newsletter composition (draft only)', () => {
  it('creates a draft email-messages issue carrying the canonical URL, never sent', async () => {
    const store = fakeStore(baseSeed())
    const result = await composeEpisodeNewsletterDraft(store, { episodeId: 'ep-1', origin: ORIGIN })
    expect(result.created).toBe(true)
    expect(result.canonicalUrl).toBe(`${ORIGIN}/podcasts/episodes/episode-one`)
    expect(store.db['email-messages']).toHaveLength(1)
    const message = store.db['email-messages'][0]
    expect(message.status).toBe('draft')
    expect(message.kind).toBe('bulk')
    expect(message.subject).toBe('Episode One')
    const blocksJson = JSON.stringify(message.blocks)
    expect(blocksJson).toContain(`${ORIGIN}/podcasts/episodes/episode-one`)
    // Recorded on the episode; a second compose is idempotent.
    const episode = store.db['podcast-episodes'][0]
    expect(episode.promotion.newsletterDraftId).toBe(message.id)
    const again = await composeEpisodeNewsletterDraft(store, { episodeId: 'ep-1', origin: ORIGIN })
    expect(again.created).toBe(false)
    expect(store.db['email-messages']).toHaveLength(1)
  })
})

describe('POD-18 audiogram join (accepted highlight → POD-13 profile)', () => {
  it('resolves an accepted highlight draft to its clip', () => {
    const clip = resolveAcceptedHighlight({
      id: 'd-1',
      kind: 'highlight',
      state: 'accepted',
      payload: {
        highlights: [
          { startSec: 30, endSec: 75, label: 'Best bit', text: '…', source: 'marked-range' },
        ],
      },
    })
    expect(clip).toMatchObject({ startSec: 30, endSec: 75, label: 'Best bit' })
    expect(clip.endSec - clip.startSec).toBe(45) // inside the 30–60 s audiogram band
  })

  it('refuses unaccepted drafts and non-highlight drafts by name', async () => {
    expect(() =>
      resolveAcceptedHighlight({
        id: 'd-2',
        kind: 'highlight',
        state: 'draft',
        payload: { highlights: [] },
      }),
    ).toThrow(/not accepted/i)
    const store = fakeStore(baseSeed())
    store.db['podcast-assist-drafts'].push({
      id: 'd-3',
      kind: 'highlight',
      state: 'draft',
      episode: 'ep-1',
      payload: { highlights: [{ startSec: 0, endSec: 40, label: 'x', text: '' }] },
    })
    await expect(
      createAudiogramForAcceptedHighlight(store, undefined, { draftId: 'd-3', projectId: 'p-1' }),
    ).rejects.toMatchObject({ code: 'PODCAST_HIGHLIGHT_NOT_ACCEPTED' })
  })
})

describe('POD-18 embeds + oEmbed', () => {
  const published = {
    id: 'ep-1',
    slug: 'episode-one',
    title: 'Episode One',
    status: 'published',
    audio: 'audio-1',
    membersOnly: false,
  }

  it('oEmbed JSON shape: version/type/rich html iframe pointing at the embed route', () => {
    const doc = buildOEmbedResponse({ origin: ORIGIN, episode: published })
    expect(doc.version).toBe('1.0')
    expect(doc.type).toBe('rich')
    expect(doc.title).toBe('Episode One')
    expect(doc.html).toContain('<iframe')
    expect(doc.html).toContain(`${ORIGIN}/podcasts/episodes/episode-one/embed`)
    expect(doc.width).toBeGreaterThan(0)
    expect(doc.height).toBeGreaterThan(0)
  })

  it('locked embed: members-only state is locked and no audio URL appears in the oEmbed html', () => {
    const locked = { ...published, membersOnly: true }
    expect(episodeEmbedState(locked, { feedVisibility: 'public' })).toBe('locked')
    expect(episodeEmbedState(published, { feedVisibility: 'members' })).toBe('locked')
    const doc = buildOEmbedResponse({ origin: ORIGIN, episode: locked })
    expect(doc.html).not.toContain('/media/audio-1')
    expect(doc.html).not.toContain('audio-1')
    expect(buildEmbedIframeHtml(ORIGIN, locked)).not.toContain('/media/')
  })

  it('ready/unavailable states and slug parsing + discovery links', () => {
    expect(episodeEmbedState(published, { feedVisibility: 'public' })).toBe('ready')
    expect(episodeEmbedState({ ...published, status: 'draft' }, {})).toBe('unavailable')
    expect(episodeEmbedState({ ...published, audio: null, externalUrl: null }, {})).toBe(
      'unavailable',
    )
    expect(episodeSlugFromEmbedRequestUrl(`${ORIGIN}/podcasts/episodes/episode-one`)).toBe(
      'episode-one',
    )
    expect(episodeSlugFromEmbedRequestUrl(`${ORIGIN}/podcasts/episodes/episode-one/embed`)).toBe(
      'episode-one',
    )
    expect(episodeSlugFromEmbedRequestUrl(`${ORIGIN}/articles/nope`)).toBeNull()
    expect(episodeSlugFromEmbedRequestUrl('not a url')).toBeNull()
    const links = oEmbedDiscoveryLinks(ORIGIN, published)
    expect(links).toContain('application/json+oembed')
    expect(links).toContain('/api/oembed?url=')
  })
})
