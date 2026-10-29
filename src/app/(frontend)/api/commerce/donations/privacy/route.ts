import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { currentMember, readMemberSession } from '@/modules/identity/member-identity'

export async function PATCH(request: Request) {
  const payload: any = await getPayload({ config })
  const sessionToken = readMemberSession(request.headers)
  let memberId = sessionToken ? await currentMember(payload as never, sessionToken) : null
  if (!memberId) {
    const auth = await payload.auth({ headers: request.headers }).catch(() => null)
    if (auth?.user) {
      memberId = (auth.user as any).member
        ? typeof (auth.user as any).member === 'object'
          ? (auth.user as any).member.id
          : String((auth.user as any).member)
        : String(auth.user.id)
    }
  }
  if (!memberId)
    return NextResponse.json({ error: 'Sign in to update supporter privacy.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  if (!['public', 'anonymous', 'private'].includes(body.visibilityPreference))
    return NextResponse.json({ error: 'Invalid privacy preference.' }, { status: 400 })
  const supporters = await payload.find({
    collection: 'supporters',
    where: { member: { equals: String(memberId) } },
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
