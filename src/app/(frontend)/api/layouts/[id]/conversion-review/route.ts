import { checkOperatorRecordAccess } from '@/modules/operations/operator-grants'
import {
  ConversionReviewError,
  readConversionReview,
  recordConversionReviewDecision,
  type ConversionReviewDecisionKind,
} from '@/modules/portability/legacy-migration/conversion-review'
import config from '@payload-config'
import { createLocalReq, getPayload } from 'payload'
import { NextResponse } from 'next/server'

type Args = { params: Promise<{ id: string }> }
const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function GET(request: Request, { params }: Args) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user))
    return NextResponse.json({ error: 'Layout editing requires staff access.' }, { status: 403 })
  const id = (await params).id
  if (!(await checkOperatorRecordAccess(payload, auth.user, 'page-layouts', id)))
    return NextResponse.json({ error: 'Layout access denied.' }, { status: 403 })
  const req = await createLocalReq({ user: auth.user ?? undefined }, payload)
  const record = await payload.findByID({
    collection: 'page-layouts',
    id,
    depth: 0,
    req,
    overrideAccess: false,
  })
  return NextResponse.json({ review: readConversionReview(record as never) })
}

export async function POST(request: Request, { params }: Args) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user))
    return NextResponse.json({ error: 'Layout editing requires staff access.' }, { status: 403 })
  const id = (await params).id
  if (!(await checkOperatorRecordAccess(payload, auth.user, 'page-layouts', id)))
    return NextResponse.json({ error: 'Layout access denied.' }, { status: 403 })
  const body = (await request.json()) as {
    location?: string
    decision?: ConversionReviewDecisionKind
    replacementBlockId?: string
  }
  if (!body.location || !body.decision)
    return NextResponse.json({ error: 'A location and a decision are required.' }, { status: 400 })
  const req = await createLocalReq({ user: auth.user ?? undefined }, payload)
  try {
    const review = await recordConversionReviewDecision(payload, {
      layoutId: id,
      user: auth.user,
      req,
      location: body.location,
      decision: body.decision,
      replacementBlockId: body.replacementBlockId,
    })
    return NextResponse.json({ review })
  } catch (error) {
    if (error instanceof ConversionReviewError) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    throw error
  }
}
