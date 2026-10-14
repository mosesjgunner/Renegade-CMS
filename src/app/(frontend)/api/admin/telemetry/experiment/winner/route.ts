import config from '@payload-config'
import { createLocalReq, getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { approveWinner } from '@/modules/experiences/contracts'
import { getActivePublicExperiment } from '@/modules/experiences/public-experiment'
import { checkOperatorSiteAccess } from '@/modules/operations/operator-grants'
import { transactionPayload } from '@/modules/core/transaction-payload'

const isOperator = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'staff'].includes(String(user?.role))

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })

  if (!auth.user || !isOperator(auth.user)) {
    return NextResponse.json(
      { error: 'Staff access required for experiment decisions.' },
      { status: 403 },
    )
  }

  const body = (await request.json().catch(() => ({}))) as {
    experimentId?: string
    selectedVariantId?: string
    reason?: string
    siteId?: string
  }

  if (!body.siteId || !body.experimentId || !body.selectedVariantId || !body.reason?.trim()) {
    return NextResponse.json(
      {
        error:
          'siteId, experimentId, selectedVariantId, and a documented decision reason are required.',
      },
      { status: 400 },
    )
  }
  if (!(await checkOperatorSiteAccess(payload, auth.user, body.siteId)))
    return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })

  const experiment = await getActivePublicExperiment(payload, body.siteId)
  if (!experiment.dbId)
    return NextResponse.json(
      { error: 'No configured experiment exists for this site.' },
      { status: 404 },
    )
  const persisted = await payload
    .findByID({ collection: 'experiments', id: experiment.dbId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const experimentSite = typeof persisted?.site === 'object' ? persisted.site?.id : persisted?.site
  if (
    !persisted ||
    String(experimentSite) !== body.siteId ||
    ![experiment.id, experiment.dbId].includes(body.experimentId)
  )
    return NextResponse.json({ error: 'Experiment not found for this site.' }, { status: 404 })
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

  const transactionID = await payload.db.beginTransaction()
  if (transactionID === null || transactionID === undefined)
    return NextResponse.json(
      { error: 'Experiment decision transaction unavailable.' },
      { status: 503 },
    )
  const req = await createLocalReq({ user: auth.user }, payload)
  req.transactionID = transactionID
  const store = transactionPayload(payload, req)
  try {
    // Persist the human decision and resulting state in the same transaction.
    await store.create({
      collection: 'experiment-decisions',
      data: {
        site: body.siteId,
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

    await store.update({
      collection: 'experiments',
      id: experiment.dbId,
      data: {
        state: 'winner-selected',
        stoppedAt: now,
      },
      overrideAccess: true,
    } as never)
    await payload.db.commitTransaction(transactionID)
  } catch {
    await payload.db.rollbackTransaction(transactionID)
    return NextResponse.json(
      { error: 'Experiment decision was not completed. Review persisted state before retrying.' },
      { status: 503 },
    )
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
