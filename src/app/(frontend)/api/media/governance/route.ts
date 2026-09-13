import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import {
  assertMediaPermission,
  bulkMediaOperation,
  createPublicMediaIncidents,
  duplicateMediaCandidates,
  mediaGovernanceDashboard,
  MediaWorkflowError,
  reconcileMediaUsages,
  reviewDuplicateMedia,
  undoBulkMediaOperation,
} from '@/modules/media/workflow'

export const runtime = 'nodejs'

/** Staff-only issue queue. It returns IDs only, never hidden asset metadata. */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const siteId = new URL(request.url).searchParams.get('siteId') ?? ''
    await assertMediaPermission(
      payload,
      auth.user as never,
      { kind: 'site', siteId },
      'content.read',
    )
    return NextResponse.json({ dashboard: await mediaGovernanceDashboard(payload, siteId) })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Media governance unavailable.' },
      { status },
    )
  }
}

/** All governance mutations are explicit staff actions; anonymous callers never receive asset facts. */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const siteId = String(body.siteId ?? '')
    const scope = { kind: 'site' as const, siteId }
    const action = String(body.action ?? '')
    await assertMediaPermission(payload, auth.user as never, scope, 'content.edit')
    if (action === 'bulk')
      return NextResponse.json({ report: await bulkMediaOperation(payload, auth.user as never, {
        scope, action: body.operation as never, assetIds: Array.isArray(body.assetIds) ? body.assetIds.map(String) : [],
        tagIds: Array.isArray(body.tagIds) ? body.tagIds.map(String) : undefined,
        collectionIds: Array.isArray(body.collectionIds) ? body.collectionIds.map(String) : undefined,
        metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata as never : undefined,
      }) })
    if (action === 'undo')
      return NextResponse.json({ report: await undoBulkMediaOperation(payload, auth.user as never, {
        scope, operations: Array.isArray(body.operations) ? body.operations as never : [],
      }) })
    if (action === 'duplicates')
      return NextResponse.json({ candidates: await duplicateMediaCandidates(payload, siteId) })
    if (action === 'review-duplicate')
      return NextResponse.json({ review: await reviewDuplicateMedia(payload, auth.user as never, {
        scope, checksum: String(body.checksum ?? ''), keepId: String(body.keepId ?? ''),
        discardIds: Array.isArray(body.discardIds) ? body.discardIds.map(String) : [],
        action: body.reviewAction === 'merge' ? 'merge' : 'keep', reason: typeof body.reason === 'string' ? body.reason : undefined,
      }) })
    if (action === 'reconcile') {
      const reconciliation = await reconcileMediaUsages(payload, siteId)
      const incidents = await createPublicMediaIncidents(payload, siteId)
      return NextResponse.json({ reconciliation, incidents })
    }
    throw new MediaWorkflowError('Unknown governance operation.')
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Media governance operation failed.' },
      { status },
    )
  }
}
