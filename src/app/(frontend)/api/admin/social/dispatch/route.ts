import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'publisher', 'staff'].includes(String(user?.role))

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    if (!staffOnly(auth.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const body = (await request.json()) as {
      title?: string
      baseCopy?: string
      canonicalUrl?: string
      imageUrl?: string
      targetAccountIds?: string[]
      variants?: Array<{
        accountId: string
        network: string
        customCopy?: string
        isOverridden?: boolean
        platformSettings?: Record<string, unknown>
      }>
    }

    if (!body.baseCopy && !body.variants?.length) {
      return NextResponse.json(
        { error: 'Post must contain base copy or variants.' },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        error:
          'Composer dispatch is deferred for RC. Create and approve persisted Social Drafts and pin them to a coordinated release.',
      },
      { status: 410 },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Social dispatch failed.' },
      { status: 500 },
    )
  }
}
