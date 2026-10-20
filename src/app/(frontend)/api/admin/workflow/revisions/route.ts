import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { restoreEditorialRevision } from '@/modules/editorial/persistence'
import { checkOperatorRecordAccess } from '@/modules/operations/operator-grants'

export const runtime = 'nodejs'

type Revision = {
  id: string
  sequence: number
  reason?: string | null
  createdAt?: string | null
  document?: { plainTextProjection?: string | null }
}

async function resolveHistory(request: Request, contentId: string) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (
    !auth.user ||
    !['owner', 'administrator', 'staff'].includes(String(auth.user.role)) ||
    !(await checkOperatorRecordAccess(payload, auth.user, 'content', contentId))
  ) {
    return { error: NextResponse.json({ error: 'Staff site access required.' }, { status: 403 }) }
  }
  const related = await payload.find({
    collection: 'article-family-content',
    where: { content: { equals: contentId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const article = related.docs[0]
  return { payload, user: auth.user, article }
}

export async function GET(request: Request) {
  const contentId = new URL(request.url).searchParams.get('contentId')?.trim() ?? ''
  if (!contentId) {
    return NextResponse.json({ error: 'contentId is required.' }, { status: 400 })
  }
  const resolved = await resolveHistory(request, contentId)
  if (resolved.error) return resolved.error
  if (!resolved.article) return NextResponse.json({ currentRevision: null, revisions: [] })
  const result = await resolved.payload!.find({
    collection: 'revision-records',
    where: { article: { equals: resolved.article.id } },
    sort: '-sequence',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const revisions = (result.docs as Revision[]).map((revision) => ({
    id: revision.id,
    sequence: revision.sequence,
    reason: revision.reason,
    createdAt: revision.createdAt,
    excerpt: revision.document?.plainTextProjection?.slice(0, 160) ?? '',
  }))
  const currentRevision =
    typeof resolved.article.currentRevision === 'string'
      ? resolved.article.currentRevision
      : ((resolved.article.currentRevision as { id?: string } | null)?.id ?? null)
  return NextResponse.json({ currentRevision, revisions })
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    contentId?: unknown
    revisionId?: unknown
  } | null
  const contentId = typeof body?.contentId === 'string' ? body.contentId.trim() : ''
  const revisionId = typeof body?.revisionId === 'string' ? body.revisionId.trim() : ''
  if (!contentId || !revisionId) {
    return NextResponse.json({ error: 'contentId and revisionId are required.' }, { status: 400 })
  }
  const resolved = await resolveHistory(request, contentId)
  if (resolved.error) return resolved.error
  if (!resolved.article) {
    return NextResponse.json({ error: 'No saved revisions found.' }, { status: 404 })
  }
  const target = await resolved.payload!.count({
    collection: 'revision-records',
    where: { and: [{ id: { equals: revisionId } }, { article: { equals: resolved.article.id } }] },
    overrideAccess: true,
  })
  if (target.totalDocs !== 1) {
    return NextResponse.json({ error: 'Revision not found for this content.' }, { status: 404 })
  }
  const currentRevision =
    typeof resolved.article.currentRevision === 'string'
      ? resolved.article.currentRevision
      : (resolved.article.currentRevision as { id?: string } | null)?.id
  if (revisionId === currentRevision) {
    return NextResponse.json({ error: 'This revision is already current.' }, { status: 409 })
  }
  try {
    const restored = await restoreEditorialRevision(resolved.payload!, {
      articleId: String(resolved.article.id),
      revisionId,
      actor: {
        id: String(resolved.user!.id),
        role: String(resolved.user!.role) === 'staff' ? 'editor' : 'publisher',
      },
      actorUserId: String(resolved.user!.id),
    })
    return NextResponse.json({
      ok: true,
      sequence: restored.article.currentRevisionSequence,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Revision restore failed.' },
      {
        status: [409, 423].includes(Number((error as { status?: number }).status))
          ? Number((error as { status: number }).status)
          : 400,
      },
    )
  }
}
