import config from '@payload-config'
import { getPayload } from 'payload'
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
  const body = (await request.json()) as { targetRevision?: number; publish?: boolean }
  if (typeof body.targetRevision !== 'number') {
    return NextResponse.json(
      { error: 'A valid targetRevision number is required.' },
      { status: 400 },
    )
  }
  try {
    const rolledBack = await rollbackLayout(payload, {
      layoutId: id,
      targetRevision: body.targetRevision,
      publish: body.publish,
    })
    return NextResponse.json({ layout: rolledBack })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
