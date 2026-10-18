import { withLayoutWriteLock } from '@/modules/presentation/layout-write-lock'
import { checkOperatorRecordAccess } from '@/modules/operations/operator-grants'
import config from '@payload-config'
import { createLocalReq, getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { rollbackLayout } from '@/modules/presentation/composition'

type Args = { params: Promise<{ id: string }> }
const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function POST(request: Request, { params }: Args) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json({ error: 'Rollback requires staff access.' }, { status: 403 })
  }
  const id = (await params).id
  if (!(await checkOperatorRecordAccess(payload, auth.user, 'page-layouts', id)))
    return NextResponse.json({ error: 'Layout access denied.' }, { status: 403 })
  const body = (await request.json()) as {
    targetRevision?: number
    publish?: boolean
    expectedRevision?: number
  }
  if (typeof body.targetRevision !== 'number') {
    return NextResponse.json(
      { error: 'A valid targetRevision number is required.' },
      { status: 400 },
    )
  }
  const targetRevision = body.targetRevision
  return withLayoutWriteLock(payload, id, async () => {
    const current = await payload.findByID({
      collection: 'page-layouts',
      id,
      depth: 0,
      overrideAccess: false,
      user: auth.user,
    })
    if (body.expectedRevision !== current.revision)
      return NextResponse.json({ error: 'Draft revision conflict.', current }, { status: 409 })
    try {
      const rolledBack = await rollbackLayout(payload, {
        layoutId: id,
        targetRevision,
        publish: body.publish,
        req: await createLocalReq({ user: auth.user ?? undefined }, payload),
      })
      const row = await payload.findByID({
        collection: 'page-layouts',
        id: rolledBack.id,
        depth: 0,
        overrideAccess: false,
        user: auth.user,
      })
      return NextResponse.json({ layout: row })
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 })
    }
  })
}
