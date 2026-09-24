import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request) {
  const payload: any = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user)
    return NextResponse.json({ error: 'Sign in to update supporter privacy.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  if (!['public', 'anonymous', 'private'].includes(body.visibilityPreference))
    return NextResponse.json({ error: 'Invalid privacy preference.' }, { status: 400 })
  const supporters = await payload.find({
    collection: 'supporters',
    where: { member: { equals: String((auth.user as any).id) } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  for (const supporter of supporters.docs as any[])
    await payload.update({
      collection: 'supporters',
      id: supporter.id,
      data: { visibilityPreference: body.visibilityPreference },
      overrideAccess: true,
    })
  return NextResponse.json({
    updated: supporters.docs.length,
    visibilityPreference: body.visibilityPreference,
  })
}
