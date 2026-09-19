import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import {
  approveRelease,
  cancelRelease,
  evaluatePreflight,
  getReleaseDetail,
  pinArtifact,
  retryRelease,
  scheduleRelease,
  submitReleaseForReview,
  unpinArtifact,
  waiveGateRule,
  executeRelease,
  rollbackRelease,
} from '@/modules/releases/service'

type Args = { params: Promise<{ id: string }> }

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'publisher', 'staff'].includes(String(user?.role))

export async function GET(request: Request, { params }: Args) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    if (!staffOnly(auth.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const { id } = await params
    const release = await getReleaseDetail(payload, id)
    return NextResponse.json({ release })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request, { params }: Args) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    if (!staffOnly(auth.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const action = body.action
    const actor = {
      id: String(auth.user?.id || 'system'),
      role: String(auth.user?.role || 'publisher'),
    }

    switch (action) {
      case 'pin-artifact': {
        const updated = await pinArtifact(payload, id, body.artifact, actor.id)
        return NextResponse.json({ release: updated })
      }
      case 'unpin-artifact': {
        const updated = await unpinArtifact(payload, id, body.artifactId, actor.id)
        return NextResponse.json({ release: updated })
      }
      case 'evaluate-gates': {
        const snapshot = await evaluatePreflight(payload, id, { actor })
        return NextResponse.json({ snapshot })
      }
      case 'waive-gate': {
        const snapshot = await waiveGateRule(payload, id, {
          ruleId: body.ruleId,
          reason: body.reason,
          expiresAt: body.expiresAt,
          actor,
        })
        return NextResponse.json({ snapshot })
      }
      case 'submit-review': {
        const updated = await submitReleaseForReview(payload, id, actor.id)
        return NextResponse.json({ release: updated })
      }
      case 'approve': {
        const updated = await approveRelease(payload, id, actor, body.comment)
        return NextResponse.json({ release: updated })
      }
      case 'schedule': {
        const updated = await scheduleRelease(payload, {
          releaseId: id,
          scheduledFor: body.scheduledFor,
          timeZone: body.timeZone || 'UTC',
          actorId: actor.id,
          idempotencyKey: body.idempotencyKey || `mut-${id}-${Date.now()}`,
        })
        return NextResponse.json({ release: updated })
      }
      case 'execute': {
        const result = await executeRelease(payload, {
          releaseId: id,
          actorId: actor.id,
          workerId: body.workerId || 'admin-manual',
        })
        return NextResponse.json({ result })
      }
      case 'retry': {
        const result = await retryRelease(payload, {
          releaseId: id,
          actorId: actor.id,
          workerId: body.workerId || 'admin-manual',
        })
        return NextResponse.json({ result })
      }
      case 'cancel': {
        const updated = await cancelRelease(payload, id, actor.id, body.reason)
        return NextResponse.json({ release: updated })
      }
      case 'rollback': {
        const result = await rollbackRelease(payload, {
          releaseId: id,
          actorId: actor.id,
          reason: body.reason || 'Operator requested release rollback',
        })
        return NextResponse.json({ result })
      }
      default:
        return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 },
    )
  }
}
