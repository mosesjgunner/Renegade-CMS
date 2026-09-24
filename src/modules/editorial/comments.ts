import { randomUUID } from 'node:crypto'

export type CommentTarget = 'body' | 'media' | 'seo' | 'layout'
export type CommentStatus = 'open' | 'addressed' | 'resolved'

export interface ReviewComment {
  id: string
  articleId: string
  articleTitle: string
  revisionSequence: number
  target: CommentTarget
  targetAnchor?: string | null
  authorId: string
  authorName: string
  authorRole: string
  content: string
  status: CommentStatus
  resolutionNote?: string | null
  resolvedBy?: string | null
  resolvedAt?: string | null
  directLink: string
  createdAt: string
  updatedAt: string
}

export interface RevisionComparisonDiff {
  articleId: string
  fromRevision: number
  toRevision: number
  titleChanged: boolean
  fromTitle?: string
  toTitle?: string
  summaryChanged: boolean
  fromSummary?: string
  toSummary?: string
  bodyChanged: boolean
  bodyChangesSummary?: string
  mediaChanged: boolean
  mediaChangesSummary?: string
  seoChanged: boolean
  seoChangesSummary?: string
  layoutChanged: boolean
  layoutChangesSummary?: string
  overallChanged: boolean
  differences: Array<{
    field: string
    category: CommentTarget | 'general'
    fromValue: unknown
    toValue: unknown
    description: string
  }>
}

// In-memory store for comments across editorial sessions
const commentsStore = new Map<string, ReviewComment>()

export function createReviewComment(input: {
  articleId: string
  articleTitle?: string
  revisionSequence: number
  target: CommentTarget
  targetAnchor?: string | null
  authorId: string
  authorName: string
  authorRole: string
  content: string
  now?: string
}): ReviewComment {
  const now = input.now ?? new Date().toISOString()
  const id = `comment-${randomUUID().slice(0, 8)}`
  const articleTitle = input.articleTitle || `Item #${input.articleId}`

  const comment: ReviewComment = {
    id,
    articleId: input.articleId,
    articleTitle,
    revisionSequence: input.revisionSequence,
    target: input.target,
    targetAnchor: input.targetAnchor ?? null,
    authorId: input.authorId,
    authorName: input.authorName,
    authorRole: input.authorRole,
    content: input.content,
    status: 'open',
    resolutionNote: null,
    resolvedBy: null,
    resolvedAt: null,
    directLink: `/admin/workflow?tab=comments&articleId=${encodeURIComponent(input.articleId)}&commentId=${encodeURIComponent(id)}&focus=${encodeURIComponent(input.target)}`,
    createdAt: now,
    updatedAt: now,
  }

  commentsStore.set(id, comment)
  return comment
}

export function resolveReviewComment(
  commentId: string,
  resolvedBy: { id: string; name?: string; role?: string },
  resolutionNote?: string,
  now = new Date().toISOString(),
): ReviewComment {
  const comment = commentsStore.get(commentId)
  if (!comment) {
    throw new Error(`Review comment with ID "${commentId}" not found.`)
  }

  comment.status = 'resolved'
  comment.resolvedBy = resolvedBy.name || resolvedBy.id
  comment.resolvedAt = now
  comment.resolutionNote = resolutionNote ?? 'Resolved by reviewer'
  comment.updatedAt = now

  commentsStore.set(commentId, comment)
  return comment
}

export function markCommentAddressed(
  commentId: string,
  now = new Date().toISOString(),
): ReviewComment {
  const comment = commentsStore.get(commentId)
  if (!comment) {
    throw new Error(`Review comment with ID "${commentId}" not found.`)
  }

  comment.status = 'addressed'
  comment.updatedAt = now
  commentsStore.set(commentId, comment)
  return comment
}

export function getCommentsForArticle(articleId: string): ReviewComment[] {
  return Array.from(commentsStore.values()).filter((c) => c.articleId === articleId)
}

export function getUnresolvedComments(filter?: {
  articleId?: string
  target?: CommentTarget
}): ReviewComment[] {
  return Array.from(commentsStore.values()).filter((c) => {
    if (c.status === 'resolved') return false
    if (filter?.articleId && c.articleId !== filter.articleId) return false
    if (filter?.target && c.target !== filter.target) return false
    return true
  })
}

export function getAllComments(): ReviewComment[] {
  return Array.from(commentsStore.values())
}

export function clearCommentsStore(): void {
  commentsStore.clear()
}

/**
 * Compares two article revisions across body, media, SEO, and layout.
 */
export function compareEditorialRevisions(
  revA: Record<string, unknown>,
  revB: Record<string, unknown>,
): RevisionComparisonDiff {
  const differences: RevisionComparisonDiff['differences'] = []

  const fromSeq = (revA.revisionSequence as number) ?? (revA.versionNumber as number) ?? 1
  const toSeq = (revB.revisionSequence as number) ?? (revB.versionNumber as number) ?? 2
  const articleId =
    (revA.articleId as string) ??
    (revB.articleId as string) ??
    (revA.id as string) ??
    (revB.id as string) ??
    'unknown'

  // Title check
  const titleChanged = revA.title !== revB.title
  if (titleChanged) {
    differences.push({
      field: 'title',
      category: 'general',
      fromValue: revA.title,
      toValue: revB.title,
      description: `Title modified from "${revA.title}" to "${revB.title}"`,
    })
  }

  // Summary check
  const summaryChanged = revA.summary !== revB.summary
  if (summaryChanged) {
    differences.push({
      field: 'summary',
      category: 'general',
      fromValue: revA.summary,
      toValue: revB.summary,
      description: 'Summary / excerpt updated',
    })
  }

  // Body content check
  const bodyA = typeof revA.body === 'string' ? revA.body : JSON.stringify(revA.body ?? '')
  const bodyB = typeof revB.body === 'string' ? revB.body : JSON.stringify(revB.body ?? '')
  const bodyChanged = bodyA !== bodyB
  if (bodyChanged) {
    differences.push({
      field: 'body',
      category: 'body',
      fromValue: `length: ${bodyA.length}`,
      toValue: `length: ${bodyB.length}`,
      description: `Body content revised (${Math.abs(bodyB.length - bodyA.length)} chars ${bodyB.length > bodyA.length ? 'added' : 'removed'})`,
    })
  }

  // Media check
  const mediaA = JSON.stringify(revA.media ?? revA.heroImage ?? revA.featuredImage ?? {})
  const mediaB = JSON.stringify(revB.media ?? revB.heroImage ?? revB.featuredImage ?? {})
  const mediaChanged = mediaA !== mediaB
  if (mediaChanged) {
    differences.push({
      field: 'media',
      category: 'media',
      fromValue: mediaA,
      toValue: mediaB,
      description: 'Media selections, alt texts, or captions modified',
    })
  }

  // SEO check
  const seoA = JSON.stringify({
    title: revA.seoTitle ?? revA.metaTitle,
    desc: revA.seoDescription ?? revA.metaDescription,
    ogImage: revA.ogImage,
  })
  const seoB = JSON.stringify({
    title: revB.seoTitle ?? revB.metaTitle,
    desc: revB.seoDescription ?? revB.metaDescription,
    ogImage: revB.ogImage,
  })
  const seoChanged = seoA !== seoB
  if (seoChanged) {
    differences.push({
      field: 'seo',
      category: 'seo',
      fromValue: seoA,
      toValue: seoB,
      description: 'SEO title, description, or social preview updated',
    })
  }

  // Layout check
  const layoutA = JSON.stringify(revA.layout ?? revA.template ?? revA.slots ?? {})
  const layoutB = JSON.stringify(revB.layout ?? revB.template ?? revB.slots ?? {})
  const layoutChanged = layoutA !== layoutB
  if (layoutChanged) {
    differences.push({
      field: 'layout',
      category: 'layout',
      fromValue: layoutA,
      toValue: layoutB,
      description: 'Presentation template, slots, or layout blocks adjusted',
    })
  }

  return {
    articleId,
    fromRevision: fromSeq,
    toRevision: toSeq,
    titleChanged,
    fromTitle: revA.title as string | undefined,
    toTitle: revB.title as string | undefined,
    summaryChanged,
    fromSummary: revA.summary as string | undefined,
    toSummary: revB.summary as string | undefined,
    bodyChanged,
    bodyChangesSummary: bodyChanged ? 'Body copy modified' : undefined,
    mediaChanged,
    mediaChangesSummary: mediaChanged ? 'Hero/supporting media changed' : undefined,
    seoChanged,
    seoChangesSummary: seoChanged ? 'SEO metadata changed' : undefined,
    layoutChanged,
    layoutChangesSummary: layoutChanged ? 'Layout configuration updated' : undefined,
    overallChanged: differences.length > 0,
    differences,
  }
}
