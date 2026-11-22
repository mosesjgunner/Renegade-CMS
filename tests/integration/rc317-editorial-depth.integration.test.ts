/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-17 — editorial depth: the deciding journeys.
 *
 * #2  series + citations + book chapter, published and read back
 *     through the public resolvers.
 * #3  taxonomy changes propagate into public readback; draft and
 *     cross-site relations stay out.
 * #7  Harper grammar: check → persisted issues → dismiss/accept →
 *     persisted revision; stale suggestions refuse to apply.
 * #22 offline: register → durable re-open → conflicted submit →
 *     idempotent replay → keep-mine resolution; happy-path submit
 *     and submit-review never publish.
 * #20 change proposals: persisted paragraph diff, editor-only
 *     decision, fast-forward acceptance as a draft revision.
 * #24 one calendar readback spanning editorial, campaign, social
 *     and newsletter sources for one site — and only that site.
 * #21 presence + checkpoint re-evidence on real Postgres records.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  acceptGrammarSuggestion,
  dismissGrammarSuggestion,
  GrammarError,
  listGrammarIssues,
  runGrammarCheck,
} from '../../src/modules/editorial/grammar'
import {
  getOfflineDraft,
  listOfflineDrafts,
  OfflineDraftError,
  registerOfflineDraft,
  resolveOfflineConflict,
  submitOfflineMutation,
} from '../../src/modules/editorial/offline-drafts'
import {
  ChangeProposalError,
  createChangeProposal,
  decideChangeProposal,
  getChangeProposal,
} from '../../src/modules/editorial/change-proposals'
import {
  createEditorialArticle,
  loadBundleByArticleId,
  loadPublishedArticleBySlug,
  requestEditorialReview,
  decideEditorialReview,
  saveEditorialDraft,
  scheduleEditorialPublication,
} from '../../src/modules/editorial/persistence'
import { importMarkdownToRichText } from '../../src/modules/editorial/markdown'
import { listUnifiedCalendar, rescheduleCalendarSource } from '../../src/modules/calendar/service'
import {
  activePresence,
  checkpointCollaborativeDraft,
  heartbeatPresence,
  leavePresence,
} from '../../src/modules/collaboration/realtime'
import { isReleasedChapter } from '../../src/modules/media/books'
import { socialHash } from '../../src/modules/social/contracts'
import { encryptSecret } from '../../src/modules/social/security'
import { seed } from '../../src/scripts/seed'
import { buildRc2World, teardownRc2World, type Rc2World } from '../fixtures/rc2-world'

let payload: Payload
let world: Rc2World
const unique = randomUUID().slice(0, 8)

const author = { id: 'rc317-author', role: 'author' } as const
const editor = { id: 'rc317-editor', role: 'editor' } as const
const publisher = { id: 'rc317-publisher', role: 'publisher' } as const

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String((value as any).id)
  return String(value)
}

const findOne = async (collection: string, where: Record<string, unknown>, depth = 0) => {
  const result = (await payload.find({
    collection,
    where,
    depth,
    limit: 1,
    overrideAccess: true,
  } as never)) as { docs: Record<string, any>[] }
  expect(result.docs[0]).toBeTruthy()
  return result.docs[0]
}

const create = async (collection: string, data: Record<string, unknown>) =>
  (payload as any).create({ collection, data, overrideAccess: true })

let site: Record<string, any>
let publication: Record<string, any>
let seededAuthor: Record<string, any>
let section: Record<string, any>
let category: Record<string, any>
let tag: Record<string, any>
let source: Record<string, any>
let staffUser: Record<string, any>

async function makeArticle(input: {
  title: string
  slug: string
  markdown: string
  extra?: Record<string, unknown>
}): Promise<{ articleId: string; contentId: string; revisionId: string }> {
  const created = await createEditorialArticle(payload, {
    siteId: site.id,
    publicationId: publication.id,
    title: input.title,
    slug: input.slug,
    canonicalPath: `/articles/${input.slug}`,
    summary: `${input.title} summary.`,
    authorIds: [seededAuthor.id],
    sectionIds: [section.id],
    categoryIds: [category.id],
    tagIds: [tag.id],
    actor: author,
    sourceMarkdown: input.markdown,
    now: new Date().toISOString(),
    ...(input.extra ?? {}),
  } as never)
  return {
    articleId: String(created.article.id),
    contentId: idOf((created.article as any).content),
    revisionId: idOf((created.article as any).currentRevision),
  }
}

async function publishArticle(articleId: string, slug: string): Promise<void> {
  await requestEditorialReview(payload, {
    articleId,
    actor: author,
    now: new Date().toISOString(),
  })
  await decideEditorialReview(payload, {
    articleId,
    actor: editor,
    approved: true,
    now: new Date().toISOString(),
  })
  const key = `rc317-schedule-${slug}`
  await scheduleEditorialPublication(payload, {
    articleId,
    actor: publisher,
    // Due immediately: the publish job only executes a due schedule.
    scheduledFor: new Date(Date.now() - 60_000).toISOString(),
    timeZone: 'America/Chicago',
    idempotencyKey: key,
    now: new Date().toISOString(),
  })
  const job = await findOne('scheduled-publish-jobs', { idempotencyKey: { equals: key } })
  await payload.jobs.runByID({ id: idOf(job.job), silent: true } as never)
  const published = await loadPublishedArticleBySlug(payload, slug)
  expect(published.preview).toBe(false)
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  world = await buildRc2World(payload)
  site = await findOne('sites', { slug: { equals: 'demo-publication' } })
  // Several sites have a 'main' publication; pin the one on this site.
  publication = await findOne('publications', {
    slug: { equals: 'main' },
    site: { equals: site.id },
  })
  seededAuthor = await findOne('authors', { slug: { equals: 'river-morgan' } })
  section = await findOne('sections', { slug: { equals: 'notes' } })
  category = await findOne('categories', { slug: { equals: 'field-reports' } })
  tag = await findOne('tags', { slug: { equals: 'demo' } })
  source = await findOne('sources', {
    url: { equals: 'https://example.test/source/demo-report' },
  })
  staffUser = await findOne('users', { email: { equals: 'river@example.test' } })
})

afterAll(async () => {
  if (world) await teardownRc2World(payload, world)
  await payload?.db.destroy?.()
})

describe('RC3-17 #2 — series, citations and book readback', () => {
  it('publishes a cited series article and reads citations, series and relations back publicly', async () => {
    const series = await create('series', {
      site: site.id,
      publication: publication.id,
      name: `Harbor Series ${unique}`,
      slug: `harbor-series-${unique}`,
    })
    const related = await makeArticle({
      title: `Related Field Note ${unique}`,
      slug: `rc317-related-${unique}`,
      markdown: ['# Related note', '', 'A related published note.'].join('\n'),
    })
    await publishArticle(related.articleId, `rc317-related-${unique}`)

    const draftOnly = await makeArticle({
      title: `Unpublished Sibling ${unique}`,
      slug: `rc317-draft-sibling-${unique}`,
      markdown: ['# Draft sibling', '', 'Never published.'].join('\n'),
    })

    const main = await makeArticle({
      title: `Series Lead ${unique}`,
      slug: `rc317-series-lead-${unique}`,
      markdown: ['# Series lead', '', 'The lead article body.', '', 'Closing line.'].join('\n'),
      extra: {
        seriesIds: [series.id],
        relatedContentIds: [related.contentId, draftOnly.contentId],
        sourceReferences: [
          {
            sourceReferenceId: 'src-1',
            sourceId: source.id,
            bibliographyKey: 'REF-1',
            locator: 'p. 3',
          },
        ],
        citations: [
          {
            id: 'citation-b',
            sourceReferenceId: 'src-1',
            anchor: { nodeKey: 'b', offsetStart: 0, offsetEnd: 1 },
          },
          {
            id: 'citation-a',
            sourceReferenceId: 'src-1',
            anchor: { nodeKey: 'a', offsetStart: 0, offsetEnd: 1 },
          },
        ],
      },
    })
    await publishArticle(main.articleId, `rc317-series-lead-${unique}`)

    const readback = await loadPublishedArticleBySlug(payload, `rc317-series-lead-${unique}`)
    expect(readback.citations.map((citation) => citation.ordinal)).toEqual([1, 2])
    expect(readback.citations.map((citation) => citation.citationId)).toEqual([
      'citation-a',
      'citation-b',
    ])
    expect(readback.citations[0].sourceTitle).toBeTruthy()
    expect(readback.taxonomy.series).toContain(`Harbor Series ${unique}`)
    const relatedTitles = readback.relatedContent.map((entry) => entry.title)
    expect(relatedTitles).toContain(`Related Field Note ${unique}`)
    // The draft sibling is related in the editor but must not leak publicly.
    expect(relatedTitles).not.toContain(`Unpublished Sibling ${unique}`)
  })

  it('reads back a published book chapter and withholds an unreleased one', async () => {
    const book = await create('books', {
      site: site.id,
      title: `Ledger Book ${unique}`,
      slug: `ledger-book-${unique}`,
      status: 'published',
      visibility: 'public',
    })
    const part = await create('book-parts', {
      book: book.id,
      title: 'Part One',
      displayOrder: 1,
    })
    const released = await create('book-chapters', {
      book: book.id,
      part: part.id,
      title: 'Opening Chapter',
      slug: `opening-${unique}`,
      canonicalPath: `/books/ledger-book-${unique}/opening-${unique}`,
      displayOrder: 1,
      status: 'published',
      publishedAt: '2026-01-01T00:00:00.000Z',
    })
    const embargoed = await create('book-chapters', {
      book: book.id,
      part: part.id,
      title: 'Embargoed Chapter',
      slug: `embargoed-${unique}`,
      canonicalPath: `/books/ledger-book-${unique}/embargoed-${unique}`,
      displayOrder: 2,
      status: 'published',
      releaseAt: '2999-01-01T00:00:00.000Z',
    })
    // The public reader's own gate decides what a visitor may open.
    expect(isReleasedChapter(released)).toBe(true)
    expect(isReleasedChapter(embargoed)).toBe(false)
    const chapters = (await payload.find({
      collection: 'book-chapters',
      where: { book: { equals: book.id } },
      overrideAccess: true,
      limit: 10,
    } as never)) as { docs: Record<string, any>[] }
    const visible = chapters.docs.filter((chapter) => isReleasedChapter(chapter))
    expect(visible.map((chapter) => chapter.title)).toEqual(['Opening Chapter'])
  })
})

describe('RC3-17 #3 — taxonomy propagation', () => {
  it('propagates a series rename into published readback and keeps cross-site relations out', async () => {
    const series = await create('series', {
      site: site.id,
      publication: publication.id,
      name: `Before Rename ${unique}`,
      slug: `rename-series-${unique}`,
    })
    const article = await makeArticle({
      title: `Rename Watch ${unique}`,
      slug: `rc317-rename-watch-${unique}`,
      markdown: ['# Rename watch', '', 'Body.'].join('\n'),
      extra: { seriesIds: [series.id] },
    })
    await publishArticle(article.articleId, `rc317-rename-watch-${unique}`)
    const before = await loadPublishedArticleBySlug(payload, `rc317-rename-watch-${unique}`)
    expect(before.taxonomy.series).toContain(`Before Rename ${unique}`)

    await (payload as any).update({
      collection: 'series',
      id: series.id,
      data: { name: `After Rename ${unique}` },
      overrideAccess: true,
    })
    const after = await loadPublishedArticleBySlug(payload, `rc317-rename-watch-${unique}`)
    expect(after.taxonomy.series).toContain(`After Rename ${unique}`)
    expect(after.taxonomy.series).not.toContain(`Before Rename ${unique}`)

    // A relation pointing at another site's content must never surface.
    const foreignResult = (await payload.find({
      collection: 'content',
      where: { site: { equals: world.siteB.siteId } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    } as never)) as { docs: Record<string, any>[] }
    const foreignContentId = foreignResult.docs[0] ? String(foreignResult.docs[0].id) : ''
    if (foreignContentId && foreignContentId !== article.contentId) {
      await (payload as any).update({
        collection: 'content',
        id: article.contentId,
        data: { relatedContent: [foreignContentId] },
        overrideAccess: true,
      })
      const guarded = await loadPublishedArticleBySlug(payload, `rc317-rename-watch-${unique}`)
      expect(guarded.relatedContent.map((entry) => entry.id)).not.toContain(foreignContentId)
    }
  })
})

describe('RC3-17 #7 — Harper grammar path', () => {
  it('checks with the real engine, persists issues, and applies an accepted suggestion as a draft revision', async () => {
    const article = await makeArticle({
      title: `Grammar Watch ${unique}`,
      slug: `rc317-grammar-${unique}`,
      markdown: [
        '# Grammar watch',
        '',
        'Teh editor reviewed the draft carefully.',
        '',
        'The the closing line stays.',
      ].join('\n'),
    })
    const before = await loadBundleByArticleId(payload, article.articleId)
    const beforeHash = String((before.article as any).documentHash)

    const check = await runGrammarCheck(payload, { articleId: article.articleId, actor: author })
    expect(check.documentHash).toBe(beforeHash)
    expect(check.issues.length).toBeGreaterThanOrEqual(2)
    const kinds = check.issues.map((issue) => issue.lintKind)
    expect(kinds).toContain('Typo')
    expect(check.issues.every((issue) => issue.suggestions[0]?.providerKey === 'harper')).toBe(true)

    // Persisted readback — not just the return value.
    const persisted = await listGrammarIssues(payload, { articleId: article.articleId })
    expect(persisted.length).toBe(check.issues.length)
    expect(persisted.every((issue) => issue.status === 'open')).toBe(true)
    expect(persisted.every((issue) => issue.documentHash === beforeHash)).toBe(true)

    // A check never mutates the document.
    const untouched = await loadBundleByArticleId(payload, article.articleId)
    expect(String((untouched.article as any).documentHash)).toBe(beforeHash)

    // Dismiss one issue; a dismissed suggestion can no longer be accepted.
    const repetition = persisted.find((issue) => issue.lintKind === 'Repetition')
    expect(repetition).toBeTruthy()
    const dismissed = await dismissGrammarSuggestion(payload, {
      suggestionId: repetition!.suggestions[0].id,
      actor: author,
    })
    expect(dismissed.status).toBe('rejected')
    const dismissedIssues = await listGrammarIssues(payload, {
      articleId: article.articleId,
      status: 'dismissed',
    })
    expect(dismissedIssues.map((issue) => issue.id)).toContain(repetition!.id)
    await expect(
      acceptGrammarSuggestion(payload, {
        suggestionId: repetition!.suggestions[0].id,
        actor: author,
        actorUserId: staffUser.id,
      }),
    ).rejects.toMatchObject({ code: 'GRAMMAR_ALREADY_DECIDED' })

    // Accept the spelling fix — it lands as a new DRAFT revision.
    const spelling = persisted.find(
      (issue) => issue.lintKind === 'Typo' && issue.id !== repetition!.id,
    )
    expect(spelling).toBeTruthy()
    const accepted = await acceptGrammarSuggestion(payload, {
      suggestionId: spelling!.suggestions[0].id,
      actor: author,
      actorUserId: staffUser.id,
    })
    expect(accepted.suggestion.status).toBe('accepted')
    expect(accepted.revisionId).toBeTruthy()
    const afterAccept = await loadBundleByArticleId(payload, article.articleId)
    expect(idOf((afterAccept.article as any).currentRevision)).toBe(accepted.revisionId)
    expect((afterAccept.article as any).document.plainTextProjection).toContain(
      'The editor reviewed the draft carefully.',
    )
    expect((afterAccept.article as any).document.plainTextProjection).not.toContain('Teh editor')
    // Grammar acceptance is a draft save — never a publication.
    expect((afterAccept.article as any).latestPublishedRevision ?? null).toBeNull()
    const resolved = await listGrammarIssues(payload, {
      articleId: article.articleId,
      status: 'resolved',
    })
    expect(resolved.map((issue) => issue.id)).toContain(spelling!.id)
  })

  it('refuses to apply a suggestion after the document moved (stale)', async () => {
    const article = await makeArticle({
      title: `Grammar Stale ${unique}`,
      slug: `rc317-grammar-stale-${unique}`,
      markdown: ['# Stale watch', '', 'Teh second article has a typo.'].join('\n'),
    })
    const check = await runGrammarCheck(payload, { articleId: article.articleId, actor: author })
    expect(check.issues.length).toBeGreaterThanOrEqual(1)
    const bundle = await loadBundleByArticleId(payload, article.articleId)
    const moved = importMarkdownToRichText(
      ['# Stale watch', '', 'A human rewrote this paragraph entirely.'].join('\n'),
    ).document
    await saveEditorialDraft(payload, {
      articleId: article.articleId,
      actor: editor,
      document: moved,
      baseRevisionId: idOf((bundle.article as any).currentRevision),
      mutationId: `rc317-human-edit-${unique}`,
      now: new Date().toISOString(),
    })
    const error = await acceptGrammarSuggestion(payload, {
      suggestionId: check.issues[0].suggestions[0].id,
      actor: author,
      actorUserId: staffUser.id,
    }).catch((caught) => caught)
    expect(error).toBeInstanceOf(GrammarError)
    expect((error as GrammarError).code).toBe('GRAMMAR_STALE')
    const stale = await listGrammarIssues(payload, {
      articleId: article.articleId,
      status: 'stale',
    })
    expect(stale.map((issue) => issue.id)).toContain(check.issues[0].id)
    // The human's text survived untouched.
    const after = await loadBundleByArticleId(payload, article.articleId)
    expect((after.article as any).document.plainTextProjection).toContain(
      'A human rewrote this paragraph entirely.',
    )
  })
})

describe('RC3-17 #22 — offline drafts and reconcile', () => {
  it('survives a concurrent server edit: conflict, idempotent replay, keep-mine resolution', async () => {
    const article = await makeArticle({
      title: `Offline Watch ${unique}`,
      slug: `rc317-offline-${unique}`,
      markdown: ['# Offline watch', '', 'Server base paragraph.'].join('\n'),
    })
    const localDocument = importMarkdownToRichText(
      [
        '# Offline watch',
        '',
        'Server base paragraph.',
        '',
        'Offline addition from the train.',
      ].join('\n'),
    ).document
    const draft = await registerOfflineDraft(payload, {
      articleId: article.articleId,
      deviceId: 'device-train',
      actor: author,
      document: localDocument,
    })
    expect(draft.status).toBe('local-only')
    expect(draft.baseRevisionId).toBe(article.revisionId)

    // Durable re-open: a fresh read returns the local document intact.
    const reopened = await getOfflineDraft(payload, draft.id)
    expect(reopened?.document.plainTextProjection).toContain('Offline addition from the train.')
    const listed = await listOfflineDrafts(payload, article.articleId)
    expect(listed.map((entry) => entry.id)).toContain(draft.id)

    // The server moves while the editor is offline.
    const serverDocument = importMarkdownToRichText(
      ['# Offline watch', '', 'Server base paragraph, edited at the desk.'].join('\n'),
    ).document
    await saveEditorialDraft(payload, {
      articleId: article.articleId,
      actor: editor,
      document: serverDocument,
      baseRevisionId: article.revisionId,
      mutationId: `rc317-desk-edit-${unique}`,
      now: new Date().toISOString(),
    })

    const conflicted = await submitOfflineMutation(payload, {
      draftId: draft.id,
      mutationType: 'save-draft',
      idempotencyKey: `rc317-off-submit-${unique}`,
      actor: author,
      actorUserId: staffUser.id,
    })
    expect(conflicted.status).toBe('conflicted')
    const afterConflict = await loadBundleByArticleId(payload, article.articleId)
    expect((afterConflict.article as any).document.plainTextProjection).toContain(
      'edited at the desk',
    )
    expect((afterConflict.article as any).document.plainTextProjection).not.toContain(
      'Offline addition',
    )
    expect((await getOfflineDraft(payload, draft.id))?.status).toBe('conflicted')

    // Replaying the same key returns the recorded mutation — no double apply.
    const replay = await submitOfflineMutation(payload, {
      draftId: draft.id,
      mutationType: 'save-draft',
      idempotencyKey: `rc317-off-submit-${unique}`,
      actor: author,
      actorUserId: staffUser.id,
    })
    expect(replay.id).toBe(conflicted.id)
    expect(replay.status).toBe('conflicted')

    // Keep-mine resolution re-bases the local document onto the server head.
    const resolved = await resolveOfflineConflict(payload, {
      draftId: draft.id,
      strategy: 'keep-mine',
      idempotencyKey: `rc317-off-resolve-${unique}`,
      actor: author,
      actorUserId: staffUser.id,
    })
    expect(resolved.status).toBe('accepted')
    expect(resolved.mutationType).toBe('resolve-conflict')
    const afterResolve = await loadBundleByArticleId(payload, article.articleId)
    expect((afterResolve.article as any).document.plainTextProjection).toContain(
      'Offline addition from the train.',
    )
    expect((await getOfflineDraft(payload, draft.id))?.status).toBe('submitted')
    // Still a draft — offline sync never publishes.
    expect((afterResolve.article as any).latestPublishedRevision ?? null).toBeNull()
  })

  it('applies a clean submit and a submit-review without publishing', async () => {
    const article = await makeArticle({
      title: `Offline Clean ${unique}`,
      slug: `rc317-offline-clean-${unique}`,
      markdown: ['# Offline clean', '', 'Base text.'].join('\n'),
    })
    const localDocument = importMarkdownToRichText(
      ['# Offline clean', '', 'Base text, extended offline.'].join('\n'),
    ).document
    const draft = await registerOfflineDraft(payload, {
      articleId: article.articleId,
      deviceId: 'device-home',
      actor: author,
      document: localDocument,
    })
    const applied = await submitOfflineMutation(payload, {
      draftId: draft.id,
      mutationType: 'save-draft',
      idempotencyKey: `rc317-clean-submit-${unique}`,
      actor: author,
      actorUserId: staffUser.id,
    })
    expect(applied.status).toBe('accepted')
    const afterApply = await loadBundleByArticleId(payload, article.articleId)
    expect(idOf((afterApply.article as any).currentRevision)).not.toBe(article.revisionId)
    expect((afterApply.article as any).document.plainTextProjection).toContain('extended offline.')

    const reviewDocument = importMarkdownToRichText(
      ['# Offline clean', '', 'Base text, extended offline.', '', 'Ready for review.'].join('\n'),
    ).document
    const reviewDraft = await registerOfflineDraft(payload, {
      articleId: article.articleId,
      deviceId: 'device-home',
      actor: author,
      document: reviewDocument,
    })
    const reviewed = await submitOfflineMutation(payload, {
      draftId: reviewDraft.id,
      mutationType: 'submit-review',
      idempotencyKey: `rc317-clean-review-${unique}`,
      actor: author,
      actorUserId: staffUser.id,
    })
    expect(reviewed.status).toBe('accepted')
    const bundle = await loadBundleByArticleId(payload, article.articleId)
    expect((bundle.article as any).latestPublishedRevision ?? null).toBeNull()
    expect((bundle.article as any).document.plainTextProjection).toContain('Ready for review.')
  })

  it('rejects a mutation with an empty idempotency key', async () => {
    const article = await makeArticle({
      title: `Offline Guard ${unique}`,
      slug: `rc317-offline-guard-${unique}`,
      markdown: ['# Guard', '', 'Base.'].join('\n'),
    })
    const draft = await registerOfflineDraft(payload, {
      articleId: article.articleId,
      deviceId: 'device-guard',
      actor: author,
      document: importMarkdownToRichText(['# Guard', '', 'Base plus.'].join('\n')).document,
    })
    const error = await submitOfflineMutation(payload, {
      draftId: draft.id,
      mutationType: 'save-draft',
      idempotencyKey: '',
      actor: author,
      actorUserId: staffUser.id,
    }).catch((caught) => caught)
    expect(error).toBeInstanceOf(OfflineDraftError)
    expect((error as OfflineDraftError).code).toBe('OFFLINE_IDEMPOTENCY_KEY_REQUIRED')
  })
})

describe('RC3-17 #20 — change proposals (bounded git-like slice)', () => {
  it('persists a paragraph diff and applies acceptance as a draft revision, fast-forward only', async () => {
    const article = await makeArticle({
      title: `Proposal Watch ${unique}`,
      slug: `rc317-proposal-${unique}`,
      markdown: [
        '# Proposal watch',
        '',
        'First paragraph stays.',
        '',
        'Second paragraph old.',
      ].join('\n'),
    })
    const proposedDocument = importMarkdownToRichText(
      ['# Proposal watch', '', 'First paragraph stays.', '', 'Second paragraph rewritten.'].join(
        '\n',
      ),
    ).document
    const proposal = await createChangeProposal(payload, {
      articleId: article.articleId,
      actor: author,
      proposedDocument,
    })
    expect(proposal.status).toBe('proposed')
    expect(proposal.baseRevisionId).toBe(article.revisionId)
    const changed = proposal.diff.filter((entry) => entry.kind === 'changed')
    expect(changed).toHaveLength(1)
    expect(changed[0].before).toContain('Second paragraph old.')
    expect(changed[0].after).toContain('Second paragraph rewritten.')
    // The diff is persisted, not just returned.
    const persisted = await getChangeProposal(payload, proposal.id)
    expect(persisted?.diff).toEqual(proposal.diff)

    // Authors propose; editors decide.
    await expect(
      decideChangeProposal(payload, {
        proposalId: proposal.id,
        decision: 'accepted',
        actor: author,
        actorUserId: staffUser.id,
      }),
    ).rejects.toMatchObject({ code: 'CHANGE_SET_FORBIDDEN' })

    const decided = await decideChangeProposal(payload, {
      proposalId: proposal.id,
      decision: 'accepted',
      actor: editor,
      actorUserId: staffUser.id,
    })
    expect(decided.status).toBe('accepted')
    expect(decided.appliedRevisionId).toBeTruthy()
    const bundle = await loadBundleByArticleId(payload, article.articleId)
    expect(idOf((bundle.article as any).currentRevision)).toBe(decided.appliedRevisionId)
    expect((bundle.article as any).document.plainTextProjection).toContain(
      'Second paragraph rewritten.',
    )
    expect((bundle.article as any).latestPublishedRevision ?? null).toBeNull()
    // A decided proposal cannot be decided again.
    await expect(
      decideChangeProposal(payload, {
        proposalId: proposal.id,
        decision: 'rejected',
        actor: editor,
        actorUserId: staffUser.id,
      }),
    ).rejects.toMatchObject({ code: 'CHANGE_SET_ALREADY_DECIDED' })
  })

  it('marks a proposal conflicted when the base moved, and rejection writes nothing', async () => {
    const article = await makeArticle({
      title: `Proposal Race ${unique}`,
      slug: `rc317-proposal-race-${unique}`,
      markdown: ['# Race', '', 'Original line.'].join('\n'),
    })
    const proposal = await createChangeProposal(payload, {
      articleId: article.articleId,
      actor: author,
      proposedDocument: importMarkdownToRichText(['# Race', '', 'Proposed line.'].join('\n'))
        .document,
    })
    await saveEditorialDraft(payload, {
      articleId: article.articleId,
      actor: editor,
      document: importMarkdownToRichText(['# Race', '', 'Someone else edited first.'].join('\n'))
        .document,
      baseRevisionId: article.revisionId,
      mutationId: `rc317-race-edit-${unique}`,
      now: new Date().toISOString(),
    })
    const conflicted = await decideChangeProposal(payload, {
      proposalId: proposal.id,
      decision: 'accepted',
      actor: editor,
      actorUserId: staffUser.id,
    })
    expect(conflicted.status).toBe('conflicted')
    const bundle = await loadBundleByArticleId(payload, article.articleId)
    expect((bundle.article as any).document.plainTextProjection).toContain(
      'Someone else edited first.',
    )
    expect((bundle.article as any).document.plainTextProjection).not.toContain('Proposed line.')

    const rejected = await createChangeProposal(payload, {
      articleId: article.articleId,
      actor: author,
      proposedDocument: importMarkdownToRichText(
        ['# Race', '', 'A change that will be rejected.'].join('\n'),
      ).document,
    })
    const revisionBefore = idOf((bundle.article as any).currentRevision)
    const decidedRejected = await decideChangeProposal(payload, {
      proposalId: rejected.id,
      decision: 'rejected',
      actor: editor,
      actorUserId: staffUser.id,
    })
    expect(decidedRejected.status).toBe('rejected')
    const after = await loadBundleByArticleId(payload, article.articleId)
    expect(idOf((after.article as any).currentRevision)).toBe(revisionBefore)

    // A no-op proposal is recorded honestly: its diff is all-unchanged.
    const noop = await createChangeProposal(payload, {
      articleId: article.articleId,
      actor: author,
      proposedDocument: importMarkdownToRichText(
        ['# Race', '', 'Someone else edited first.'].join('\n'),
      ).document,
    })
    expect(noop.diff.every((entry) => entry.kind === 'unchanged')).toBe(true)
    expect(noop.status).toBe('proposed')
  })
})

describe('RC3-17 #24 — unified scheduling calendar', () => {
  it('projects editorial, campaign, social and newsletter schedules for one site only', async () => {
    // Editorial: an approved article with a scheduled publication job.
    const scheduled = await makeArticle({
      title: `Calendar Editorial ${unique}`,
      slug: `rc317-cal-editorial-${unique}`,
      markdown: ['# Calendar editorial', '', 'Scheduled body.'].join('\n'),
    })
    await requestEditorialReview(payload, {
      articleId: scheduled.articleId,
      actor: author,
      now: new Date().toISOString(),
    })
    await decideEditorialReview(payload, {
      articleId: scheduled.articleId,
      actor: editor,
      approved: true,
      now: new Date().toISOString(),
    })
    await scheduleEditorialPublication(payload, {
      articleId: scheduled.articleId,
      actor: publisher,
      scheduledFor: '2027-03-01T15:00:00.000Z',
      timeZone: 'America/Chicago',
      idempotencyKey: `rc317-cal-job-${unique}`,
      now: new Date().toISOString(),
    })

    // Campaign: a scheduled content release.
    const release = await create('content-releases', {
      site: site.id,
      title: `Calendar Release ${unique}`,
      status: 'scheduled',
      scheduledFor: '2027-03-02T15:00:00.000Z',
      timeZone: 'UTC',
    })

    // Social: account → draft → variant → queue item.
    const account = await create('social-accounts', {
      site: site.id,
      network: 'bluesky',
      actorType: 'site',
      displayName: `RC317 Calendar ${unique}`,
      externalAccountId: `rc317-cal-${unique}`,
      credentialHealth: 'healthy',
      connectionReference: `enc:${encryptSecret(
        JSON.stringify({ identifier: `rc317-${unique}`, appPassword: 'pw' }),
      )}`,
    })
    const draft = await create('social-drafts', {
      site: site.id,
      title: `Calendar social ${unique}`,
      status: 'approved',
      canonicalUrl: 'https://example.test/calendar',
    })
    const text = `Calendar social post ${unique}`
    const linkUrl = 'https://example.test/calendar'
    const variant = await create('social-network-variants', {
      draft: draft.id,
      account: account.id,
      network: 'bluesky',
      label: 'bluesky',
      text,
      linkUrl,
      status: 'approved',
      approvalHash: socialHash({ network: 'bluesky', text, linkUrl, attachments: [] }),
      idempotencyKey: `rc317-variant-${unique}`,
    })
    const queue = await create('social-queue-items', {
      variant: variant.id,
      account: account.id,
      scheduledFor: '2027-03-03T15:00:00.000Z',
      timeZone: 'UTC',
      status: 'scheduled',
      idempotencyKey: `rc317-queue-${unique}`,
    })

    // Newsletter: a scheduled email message.
    const message = await create('email-messages', {
      site: site.id,
      subject: `Calendar Newsletter ${unique}`,
      blocks: [],
      kind: 'bulk',
      scheduledFor: '2027-03-04T15:00:00.000Z',
    })

    const entries = await listUnifiedCalendar(payload, { siteId: String(site.id) })
    const editorialEntry = entries.find(
      (entry) => entry.sourceType === 'content' && entry.title === `Calendar Editorial ${unique}`,
    )
    expect(editorialEntry).toBeTruthy()
    expect(
      entries.some(
        (entry) => entry.sourceType === 'content-release' && entry.sourceId === String(release.id),
      ),
    ).toBe(true)
    const socialEntry = entries.find(
      (entry) => entry.sourceType === 'social-queue-item' && entry.sourceId === String(queue.id),
    )
    expect(socialEntry).toBeTruthy()
    expect(
      entries.some(
        (entry) => entry.sourceType === 'newsletter' && entry.sourceId === String(message.id),
      ),
    ).toBe(true)
    expect(entries.every((entry) => entry.siteId === String(site.id))).toBe(true)

    // Another site's calendar contains none of these sources.
    const other = await listUnifiedCalendar(payload, { siteId: world.siteB.siteId })
    const otherIds = new Set(other.map((entry) => entry.sourceId))
    expect(otherIds.has(String(release.id))).toBe(false)
    expect(otherIds.has(String(queue.id))).toBe(false)
    expect(otherIds.has(String(message.id))).toBe(false)

    // Rescheduling writes the canonical source; the readback reflects it.
    await rescheduleCalendarSource(payload, {
      entry: socialEntry!,
      startsAt: '2027-03-10T15:00:00.000Z',
      timeZone: 'UTC',
      actorId: 'rc317-editor',
      mutationId: `rc317-cal-move-${unique}`,
    })
    const moved = await listUnifiedCalendar(payload, { siteId: String(site.id) })
    const movedSocial = moved.find((entry) => entry.sourceId === String(queue.id))
    expect(movedSocial?.startsAt).toBe('2027-03-10T15:00:00.000Z')
  })
})

describe('RC3-17 #21 — presence and checkpoint re-evidence', () => {
  it('tracks two editors’ presence in Postgres and checkpoints through the editorial core', async () => {
    const scope = { kind: 'site', siteId: world.siteA.siteId } as const
    const articleId = world.siteA.draftArticleId
    for (const memberId of [world.siteA.owner.memberId, world.siteA.editor.memberId]) {
      await create('team-memberships', {
        member: memberId,
        scopeKind: 'site',
        site: world.siteA.siteId,
        scopeKey: `site:${world.siteA.siteId}`,
        status: 'active',
        role: 'administrator',
        grants: [],
      })
    }
    const store = payload as never
    await heartbeatPresence(store, {
      memberId: world.siteA.owner.memberId,
      scope,
      articleId,
      clientId: 'rc317-client-owner-1',
      mode: 'editing',
      ttlSeconds: 120,
    })
    await heartbeatPresence(store, {
      memberId: world.siteA.editor.memberId,
      scope,
      articleId,
      clientId: 'rc317-client-editor-1',
      mode: 'viewing',
      ttlSeconds: 120,
    })
    const presence = (await payload.find({
      collection: 'realtime-presence',
      where: { article: { equals: articleId } },
      overrideAccess: true,
      limit: 20,
    } as never)) as { docs: Record<string, any>[] }
    const active = activePresence(presence.docs)
    const activeMembers = active.map((entry) => idOf(entry.member))
    expect(activeMembers).toContain(world.siteA.owner.memberId)
    expect(activeMembers).toContain(world.siteA.editor.memberId)

    await leavePresence(store, {
      memberId: world.siteA.editor.memberId,
      scope,
      articleId,
      clientId: 'rc317-client-editor-1',
    })
    const afterLeave = (await payload.find({
      collection: 'realtime-presence',
      where: { article: { equals: articleId } },
      overrideAccess: true,
      limit: 20,
    } as never)) as { docs: Record<string, any>[] }
    expect(activePresence(afterLeave.docs).map((entry) => idOf(entry.member))).not.toContain(
      world.siteA.editor.memberId,
    )

    // Checkpoint: the collaborative save path is the editorial core itself.
    const article = await makeArticle({
      title: `Checkpoint Watch ${unique}`,
      slug: `rc317-checkpoint-${unique}`,
      markdown: ['# Checkpoint', '', 'Before checkpoint.'].join('\n'),
    })
    await create('team-memberships', {
      member: world.siteA.owner.memberId,
      scopeKind: 'site',
      site: site.id,
      scopeKey: `site:${site.id}`,
      status: 'active',
      role: 'administrator',
      grants: [],
    })
    const saved = await checkpointCollaborativeDraft(payload, store, {
      memberId: world.siteA.owner.memberId,
      scope: { kind: 'site', siteId: String(site.id) },
      articleId: article.articleId,
      actor: editor,
      actorUserId: staffUser.id,
      document: importMarkdownToRichText(['# Checkpoint', '', 'After checkpoint.'].join('\n'))
        .document,
      baseRevisionId: article.revisionId,
      mutationId: `rc317-checkpoint-${unique}`,
    })
    expect(idOf((saved as any).article.currentRevision)).not.toBe(article.revisionId)
    const events = (await payload.find({
      collection: 'realtime-events',
      where: { article: { equals: article.articleId } },
      overrideAccess: true,
      limit: 10,
    } as never)) as { docs: Record<string, any>[] }
    expect(events.docs.some((event) => event.kind === 'draft.checkpointed')).toBe(true)
  })
})
