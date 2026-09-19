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
      const comment = resolveReviewComment(
        body.commentId,
        { id: String(auth.user.id), name: auth.user.email, role: String(auth.user.role) },
        body.resolutionNote,
      )
      return NextResponse.json({ success: true, comment })
    }

    if (action === 'addressed') {
      const comment = markCommentAddressed(body.commentId)
      return NextResponse.json({ success: true, comment })
    }

    if (action === 'compare') {
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
