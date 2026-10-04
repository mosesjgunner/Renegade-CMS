import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { createEditorialPreviewToken } from '@/modules/editorial/persistence'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role)))
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  const origin = new URL(request.url)
  origin.host = request.headers.get('host') ?? origin.host
  if (request.headers.get('origin') !== origin.origin)
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 })
  try {
    const { id } = (await request.json()) as { id?: string }
    if (typeof id !== 'string' || !id)
      return NextResponse.json({ error: 'Saved content is required.' }, { status: 400 })
    const content = await payload.findByID({
      collection: 'content',
      id,
      depth: 0,
      overrideAccess: false,
      user,
    })
    if (!['article', 'page'].includes(content.contentType))
      return NextResponse.json({ error: 'Article or page preview required.' }, { status: 400 })
    const result = await payload.find({
      collection: 'article-family-content',
      where: { content: { equals: id } },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user,
    })
    const article = result.docs[0]
    if (!article?.currentRevision)
      return NextResponse.json({ error: 'Save a body before previewing.' }, { status: 409 })
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const preview = await createEditorialPreviewToken(payload, {
      articleId: String(article.id),
      revisionId:
        typeof article.currentRevision === 'string'
          ? article.currentRevision
          : String(article.currentRevision.id),
      createdBy: String(user.id),
      expiresAt,
    })
    return NextResponse.json(
      { url: `/preview/article/${preview.token}`, expiresAt },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return NextResponse.json({ error: 'Content preview is unavailable.' }, { status: 404 })
  }
}
