import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  createReviewComment,
  resolveReviewComment,
  markCommentAddressed,
  getCommentsForArticle,
  getUnresolvedComments,
  compareEditorialRevisions,
  type CommentTarget,
} from '@/modules/editorial/comments'
import { canManageAdminSite } from '@/modules/admin/site-access'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const articleId = url.searchParams.get('articleId') || undefined
  const target = (url.searchParams.get('target') as CommentTarget) || undefined
  const all = url.searchParams.get('all') === 'true'

  if (!articleId && auth.user.role === 'staff')
    return NextResponse.json(
      { error: 'An article in an assigned site is required.' },
      { status: 400 },
    )
  if (articleId) {
    const article = await payload
      .findByID({
        collection: 'article-family-content',
        id: articleId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    const articleSiteValue = (article as unknown as { site?: string | { id?: string } } | null)
      ?.site
    const articleSite =
      typeof articleSiteValue === 'string' ? articleSiteValue : articleSiteValue?.id
    if (!article || !canManageAdminSite(auth.user, articleSite))
      return NextResponse.json({ error: 'Article site access denied.' }, { status: 403 })
  }

  if (articleId && all) {
    const comments = getCommentsForArticle(articleId)
    return NextResponse.json({ comments })
  }

  const comments = getUnresolvedComments({ articleId, target })
  return NextResponse.json({ comments })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { action } = body

    if (action === 'create') {
      const article = await payload
        .findByID({
          collection: 'article-family-content',
          id: String(body.articleId ?? ''),
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)
      const articleSiteValue = (article as unknown as { site?: string | { id?: string } } | null)
        ?.site
      const articleSite =
        typeof articleSiteValue === 'string' ? articleSiteValue : articleSiteValue?.id
      if (!article || !canManageAdminSite(auth.user, articleSite))
        return NextResponse.json({ error: 'Article site access denied.' }, { status: 403 })
    }

    if (action === 'create') {
      const comment = createReviewComment({
        articleId: body.articleId,
        articleTitle: body.articleTitle,
        revisionSequence: body.revisionSequence || 1,
        target: body.target,
        targetAnchor: body.targetAnchor,
        authorId: String(auth.user.id),
        authorName: auth.user.email || 'Staff Reviewer',
        authorRole: String(auth.user.role),
        content: body.content,
      })
      return NextResponse.json({ success: true, comment })
    }

    if (action === 'resolve') {
      const existing = getCommentsForArticle(String(body.articleId ?? '')).find(
        (item) => item.id === String(body.commentId),
      )
      if (!existing)
        return NextResponse.json({ error: 'Review comment not found.' }, { status: 404 })
      const article = await payload
        .findByID({
          collection: 'article-family-content',
          id: existing.articleId,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)
      const articleSiteValue = (article as unknown as { site?: string | { id?: string } } | null)
        ?.site
      const articleSite =
        typeof articleSiteValue === 'string' ? articleSiteValue : articleSiteValue?.id
      if (!article || !canManageAdminSite(auth.user, articleSite))
        return NextResponse.json({ error: 'Article site access denied.' }, { status: 403 })
      const comment = resolveReviewComment(
        body.commentId,
        { id: String(auth.user.id), name: auth.user.email, role: String(auth.user.role) },
        body.resolutionNote,
      )
      return NextResponse.json({ success: true, comment })
    }

    if (action === 'addressed') {
      const existing = getCommentsForArticle(String(body.articleId ?? '')).find(
        (item) => item.id === String(body.commentId),
      )
      if (!existing)
        return NextResponse.json({ error: 'Review comment not found.' }, { status: 404 })
      const article = await payload
        .findByID({
          collection: 'article-family-content',
          id: existing.articleId,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)
      const articleSiteValue = (article as unknown as { site?: string | { id?: string } } | null)
        ?.site
      const articleSite =
        typeof articleSiteValue === 'string' ? articleSiteValue : articleSiteValue?.id
      if (!article || !canManageAdminSite(auth.user, articleSite))
        return NextResponse.json({ error: 'Article site access denied.' }, { status: 403 })
      const comment = markCommentAddressed(body.commentId)
      return NextResponse.json({ success: true, comment })
    }

    if (action === 'compare') {
      const articleId = String(body.revisionA?.articleId ?? '')
      const article = articleId
        ? await payload
            .findByID({
              collection: 'article-family-content',
              id: articleId,
              depth: 0,
              overrideAccess: true,
            })
            .catch(() => null)
        : null
      const site = (article as unknown as { site?: string | { id?: string } } | null)?.site
      const siteId = typeof site === 'string' ? site : site?.id
      if (!article || !canManageAdminSite(auth.user, siteId))
        return NextResponse.json({ error: 'Article site access denied.' }, { status: 403 })
      const diff = compareEditorialRevisions(body.revisionA, body.revisionB)
      return NextResponse.json({ success: true, diff })
    }

    return NextResponse.json({ error: `Unknown action: "${action}"` }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Comment operation failed.' },
      { status: 400 },
    )
  }
}
