import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { approveWinner } from '@/modules/experiences/contracts'
import { getActivePublicExperiment } from '@/modules/experiences/public-experiment'

const isOperator = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'staff'].includes(String(user?.role))

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })

  if (!isOperator(auth.user)) {
    return NextResponse.json({ error: 'Staff access required for experiment decisions.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    experimentId?: string
    selectedVariantId?: string
    reason?: string
    siteId?: string
  }

  if (!body.experimentId || !body.selectedVariantId || !body.reason?.trim()) {
    return NextResponse.json(
      { error: 'experimentId, selectedVariantId, and a documented decision reason are required.' },
      { status: 400 },
    )
  }

  const experiment = await getActivePublicExperiment(payload, body.siteId)
  if (!experiment.variants.some((v) => v.id === body.selectedVariantId)) {
    return NextResponse.json(
      { error: `Variant ${body.selectedVariantId} is not a valid variant of this experiment.` },
      { status: 400 },
    )
  }

  // Contract validation: requires human approval and valid state
  try {
    approveWinner({
      state: experiment.state,
      selectedVariantId: body.selectedVariantId,
      humanApproved: true,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid experiment decision.' },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const actorId = String(auth.user?.id ?? 'system-operator')

  // Persist immutable human approval in experiment-decisions ledger
  await payload.create({
    collection: 'experiment-decisions',
    data: {
      experiment: experiment.dbId,
      selectedVariant: body.selectedVariantId,
      decision: 'winner-selected',
      reason: body.reason.trim(),
      actor: actorId,
      decidedAt: now,
      approvalRequired: true,
      approvedBy: actorId,
      approvedAt: now,
    },
    overrideAccess: true,
  } as never)

  // Update experiment state if record exists in experiments collection
  try {
    await payload.update({
      collection: 'experiments',
      where: { id: { equals: experiment.dbId } },
      data: {
        state: 'winner-selected',
        stoppedAt: now,
      },
      overrideAccess: true,
    } as never)
  } catch {
    // Non-blocking update
  }

  return NextResponse.json({
    success: true,
    state: 'winner-selected',
    experimentId: body.experimentId,
    selectedVariantId: body.selectedVariantId,
    approvedBy: actorId,
    decidedAt: now,
    reason: body.reason.trim(),
  })
}
