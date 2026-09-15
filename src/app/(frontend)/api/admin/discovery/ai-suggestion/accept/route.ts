import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { acceptSeoAiSuggestion } from '@/modules/public/ai-boundary-suggestions'

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
