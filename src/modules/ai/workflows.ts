import type { Payload } from 'payload'
import { extractPlainText } from '../editorial/presentation'
import type { AiContext, AiTaskKey } from './contracts'
import { relationId } from './connections'

export const AI_WORKFLOW_TASKS = [
  'editor.improve-selection',
  'intelligence.metadata-seo',
  'media.alt-text',
  'distribution.copy-variants',
] as const satisfies readonly AiTaskKey[]
export type AiWorkflowTask = (typeof AI_WORKFLOW_TASKS)[number]
type Doc = Record<string, unknown> & { id: string }

function exactTextNodeCount(value: unknown, selection: string): number {
  if (!value || typeof value !== 'object') return 0
  if (Array.isArray(value))
    return value.reduce((n, item) => n + exactTextNodeCount(item, selection), 0)
  const node = value as Record<string, unknown>
  return (
    (node.type === 'text' && node.text === selection ? 1 : 0) +
    Object.values(node).reduce<number>((n, item) => n + exactTextNodeCount(item, selection), 0)
  )
}

function replaceExactTextNode(value: unknown, selection: string, replacement: string): unknown {
  if (Array.isArray(value))
    return value.map((item) => replaceExactTextNode(item, selection, replacement))
  if (!value || typeof value !== 'object') return value
  const node = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(node).map(([key, item]) => [
      key,
      key === 'text' && node.type === 'text' && item === selection
        ? replacement
        : replaceExactTextNode(item, selection, replacement),
    ]),
  )
}

export type AiWorkflowTarget = {
  task: AiWorkflowTask
  collection: 'content' | 'media-assets' | 'social-network-variants'
  doc: Doc
  siteId: string
  publicationId: string | null
  original: unknown
  context: AiContext
  updatedAt: string
}

export async function loadAiWorkflowTarget(
  payload: Payload,
  task: AiWorkflowTask,
  id: string,
  selection?: string,
): Promise<AiWorkflowTarget> {
  if (task === 'editor.improve-selection' || task === 'intelligence.metadata-seo') {
    const doc = (await payload.findByID({
      collection: 'content',
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Doc
    if (!['article', 'page'].includes(String(doc.contentType)))
      throw new Error('Choose an article or page.')
    if (['published', 'scheduled', 'updated'].includes(String(doc.status)))
      throw new Error('Create a draft revision before requesting AI changes to published work.')
    const siteId = relationId(doc.site)
    const publicationId = relationId(doc.publication) || null
    const bodyText = extractPlainText(doc.body).slice(0, 18_000)
    if (task === 'editor.improve-selection') {
      if (!selection || selection.length > 8_000 || exactTextNodeCount(doc.body, selection) !== 1)
        throw new Error('Select one complete text node in the current draft.')
      return {
        task,
        collection: 'content',
        doc,
        siteId,
        publicationId,
        original: selection,
        updatedAt: String(doc.updatedAt),
        context: {
          articleId: id,
          revisionId: relationId(doc.currentRevision) || undefined,
          selection,
          article: bodyText,
        },
      }
    }
    return {
      task,
      collection: 'content',
      doc,
      siteId,
      publicationId,
      original: {
        title: doc.seoTitle ?? doc.title,
        description: doc.seoDescription ?? doc.summary ?? doc.excerpt ?? '',
      },
      updatedAt: String(doc.updatedAt),
      context: {
        articleId: id,
        revisionId: relationId(doc.currentRevision) || undefined,
        article: `TITLE: ${String(doc.title)}\nSUMMARY: ${String(doc.summary ?? '')}\nBODY: ${bodyText}`,
      },
    }
  }
  if (task === 'media.alt-text') {
    const doc = (await payload.findByID({
      collection: 'media-assets',
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Doc
    if (!['image', 'cover', 'thumbnail', 'graphic'].includes(String(doc.kind)))
      throw new Error('Alt text suggestions require an image asset.')
    return {
      task,
      collection: 'media-assets',
      doc,
      siteId: relationId(doc.site),
      publicationId: relationId(doc.publication) || null,
      original: { altText: String(doc.altText ?? '') },
      updatedAt: String(doc.updatedAt),
      context: {
        articleId: id,
        article: `IMAGE METADATA ONLY (no image pixels were inspected):\nTITLE: ${String(doc.title ?? '')}\nCAPTION: ${String(doc.caption ?? '')}\nDESCRIPTION: ${String(doc.description ?? '')}`,
      },
    }
  }
  const doc = (await payload.findByID({
    collection: 'social-network-variants' as never,
    id,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (doc.status !== 'draft')
    throw new Error('Only draft distribution variants can receive AI copy.')
  const draft = (await payload.findByID({
    collection: 'social-drafts' as never,
    id: relationId(doc.draft),
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (draft.status !== 'draft') throw new Error('The distribution draft must be in draft state.')
  const siteId = relationId(draft.site)
  let source = ''
  if (draft.sourceContent) {
    const content = (await payload.findByID({
      collection: 'content',
      id: relationId(draft.sourceContent),
      depth: 0,
      overrideAccess: true,
    })) as unknown as Doc
    if (
      relationId(content.site) !== siteId ||
      content.status !== 'published' ||
      content.visibility !== 'public'
    )
      throw new Error('Distribution source must be public, published content from this site.')
    source = `SOURCE TITLE: ${String(content.title)}\nSOURCE SUMMARY: ${String(content.summary ?? content.excerpt ?? '')}`
  }
  return {
    task,
    collection: 'social-network-variants',
    doc,
    siteId,
    publicationId: relationId(draft.publication) || null,
    original: { text: String(doc.text ?? '') },
    updatedAt: String(doc.updatedAt),
    context: {
      articleId: relationId(draft.sourceContent) || undefined,
      article: `DISTRIBUTION DRAFT: ${String(draft.title)}\nCURRENT COPY: ${String(doc.text ?? '')}\n${source}`,
    },
  }
}

export function aiWorkflowUpdate(
  target: AiWorkflowTarget,
  output: unknown,
  variantIndex = 0,
): Record<string, unknown> {
  if (target.task === 'editor.improve-selection') {
    if (
      typeof output !== 'string' ||
      !output.trim() ||
      exactTextNodeCount(target.doc.body, String(target.original)) !== 1
    )
      throw new Error('Writer proposal no longer matches the draft.')
    return { body: replaceExactTextNode(target.doc.body, String(target.original), output.trim()) }
  }
  if (target.task === 'intelligence.metadata-seo') {
    const value = output as { title: string; description: string }
    if (!value?.title || !value?.description) throw new Error('SEO proposal is incomplete.')
    return { seoTitle: value.title, seoDescription: value.description }
  }
  if (target.task === 'media.alt-text') {
    const value = output as { altText: string }
    if (!value?.altText) throw new Error('Alt text proposal is incomplete.')
    return { altText: value.altText }
  }
  const value = output as { variants: string[] }
  if (!Number.isInteger(variantIndex) || !value?.variants?.[variantIndex])
    throw new Error('Choose a proposed copy variant.')
  return { text: value.variants[variantIndex] }
}
