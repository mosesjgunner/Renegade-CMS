import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { acceptSeoAiSuggestion } from '@/modules/public/ai-boundary-suggestions'
import { canManageAdminSite } from '@/modules/admin/site-access'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as {
      contentId: string
      suggestedTitle?: string | null
      suggestedDescription?: string | null
    }

    if (!body.contentId) {
      return NextResponse.json({ error: 'contentId is required.' }, { status: 400 })
    }
    const content = await payload
      .findByID({ collection: 'content', id: body.contentId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!content || !canManageAdminSite(auth.user, content.site))
      return NextResponse.json({ error: 'Content site access denied.' }, { status: 403 })

    const result = await acceptSeoAiSuggestion(payload, body.contentId, {
      suggestedTitle: body.suggestedTitle,
      suggestedDescription: body.suggestedDescription,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: result.message })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Accept suggestion failed.' },
      { status: 400 },
    )
  }
}
