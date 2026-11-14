import { describe, expect, it, vi } from 'vitest'
import { buildArticlePresentation, loadBundleByArticleId } from '@/modules/editorial/persistence'

const richDoc = (text: string) => ({
  format: 'payload-lexical',
  schemaVersion: 1,
  document: { root: { type: 'root', children: [] } },
  canonicalHash: `hash-${text}`,
  plainTextProjection: text,
  unknownNodePolicy: 'preserve',
})

const companion = {
  id: 'companion-1',
  content: 'content-1',
  lifecycle: 'published',
  currentRevision: 'rev-current',
  latestPublishedRevision: 'rev-published',
  sourceReferences: [],
}
const content = {
  id: 'content-1',
  site: 'site-1',
  contentType: 'article',
  title: 'Titled',
  canonicalPath: '/articles/titled',
  commentsPolicy: 'closed',
}
const revisions: Record<string, Record<string, unknown>> = {
  'rev-current': { id: 'rev-current', document: richDoc('current body') },
  'rev-published': { id: 'rev-published', document: richDoc('published body') },
  'rev-old': { id: 'rev-old', document: richDoc('old body') },
}

function stubPayload() {
  const find = vi.fn(async ({ collection }: { collection: string }) => {
    if (collection === 'revision-records') return { docs: Object.values(revisions) }
    return { docs: [] }
  })
  const findByID = vi.fn(async ({ collection, id }: { collection: string; id: string }) => {
    if (collection === 'article-family-content' && id === 'companion-1') return companion
    if (collection === 'content' && id === 'content-1') return content
    if (collection === 'revision-records') return revisions[id] ?? null
    return null
  })
  return { payload: { find, findByID } as never, find, findByID }
}

const revisionFindCalls = (find: ReturnType<typeof vi.fn>) =>
  find.mock.calls.filter((c) => (c[0] as { collection: string }).collection === 'revision-records')

/**
 * Perf Pass 0 lane 02: the presentation path must fetch exactly the one
 * selected revision by id — never the limit-100 revision scan the bundle
 * loader performs for workflow/history callers.
 */
describe('presentation renders exactly one revision', () => {
  it('public rendering selects the latest published revision without scanning revisions', async () => {
    const { payload, find } = stubPayload()
    const presentation = await buildArticlePresentation(payload, {
      articleId: 'companion-1',
    })
    expect(presentation.bodyText).toBe('published body')
    expect(revisionFindCalls(find)).toHaveLength(0)
  })

  it('preview selects the current revision', async () => {
    const { payload, find } = stubPayload()
    const presentation = await buildArticlePresentation(payload, {
      articleId: 'companion-1',
      preview: true,
    })
    expect(presentation.bodyText).toBe('current body')
    expect(revisionFindCalls(find)).toHaveLength(0)
  })

  it('an explicit revision id wins over both defaults', async () => {
    const { payload } = stubPayload()
    const presentation = await buildArticlePresentation(payload, {
      articleId: 'companion-1',
      revisionId: 'rev-old',
    })
    expect(presentation.bodyText).toBe('old body')
  })

  it('a missing selected revision throws the same error as before', async () => {
    const { payload } = stubPayload()
    await expect(
      buildArticlePresentation(payload, {
        articleId: 'companion-1',
        revisionId: 'rev-gone',
      }),
    ).rejects.toThrow('Requested revision does not exist.')
  })

  it('the bundle loader still returns the full revision list for workflow callers', async () => {
    const { payload, find } = stubPayload()
    const bundle = await loadBundleByArticleId(payload, 'companion-1')
    expect(bundle.revisions).toHaveLength(3)
    expect(revisionFindCalls(find)).toHaveLength(1)
  })
})
