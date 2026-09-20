import { NextResponse, type NextRequest } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { convertLocalToUtc } from '@/modules/calendar/timezone'
import { evaluateScheduleRules } from '@/modules/calendar/dependencies'
import {
  scheduleEditorialPublication,
  cancelScheduledPublication,
} from '@/modules/editorial/persistence'
import type { EditorialActor } from '@/modules/editorial/workflow'

type Doc = Record<string, any>

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String(value.id)
  return String(value ?? '')
}

export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const body = await req.json()
    const {
      action,
      sourceId,
      sourceType = 'article',
      startsAt,
      timeZone = 'America/Chicago',
      expectedSequence,
      actorUserId = 'user-publisher-1',
      actorRole = 'publisher',
      reason,
      policy = 'block',
    } = body

    if (!sourceId) {
      return NextResponse.json({ error: 'sourceId is required.' }, { status: 400 })
    }

    const actor: EditorialActor = { id: actorUserId, role: actorRole as EditorialActor['role'] }

    if (action === 'cancel') {
      if (sourceType === 'article') {
        const idempotencyKey = `cancel-cal-${sourceId}-${Date.now()}`
        await cancelScheduledPublication(payload, {
          articleId: sourceId,
          actor,
          idempotencyKey,
          reason,
          actorUserId,
        })
        return NextResponse.json({ ok: true, message: `Schedule cancelled for ${sourceId}.` })
      }
    }

    if (action === 'schedule' || action === 'reschedule') {
      if (!startsAt) {
        return NextResponse.json(
          { error: 'startsAt is required for schedule/reschedule.' },
          { status: 400 },
        )
      }

      // 1. Timezone conversion with DST handling
      const tzResult = convertLocalToUtc(startsAt, timeZone, {
        nonexistentHandling: 'advance',
        ambiguousPreference: 'earlier',
      })

      // 2. Fetch target item for concurrency & dependency check
      if (sourceType === 'article') {
        const article = (await payload.findByID({
          collection: 'article-family-content',
          id: sourceId,
          depth: 1,
          overrideAccess: true,
        })) as Doc

        if (!article) {
          return NextResponse.json(
            { error: `Article "${sourceId}" was not found.` },
            { status: 404 },
          )
        }

        // Optimistic concurrency protection
        const currentSequence = Number(article.currentRevisionSequence ?? 1)
        if (expectedSequence !== undefined && expectedSequence !== currentSequence) {
          return NextResponse.json(
            {
              error: 'Optimistic Concurrency Conflict',
              message: `The item has been updated by another user (expected revision sequence ${expectedSequence}, current is ${currentSequence}).`,
              currentSequence,
            },
            { status: 409 },
          )
        }

        // Evaluate schedule dependency rules
        const evalResult = evaluateScheduleRules(
          {
            id: sourceId,
            title: String(article.title ?? 'Untitled'),
            status: String(article.status ?? 'draft'),
            scheduledFor: tzResult.utcInstant,
            siteId: idOf(article.site),
            publicationId: article.publication ? idOf(article.publication) : null,
          },
          [],
          { policy: policy as 'block' | 'warn' },
        )

        if (!evalResult.allowed) {
          return NextResponse.json(
            {
              error: 'Schedule Validation Failed',
              violations: evalResult.violations,
            },
            { status: 422 },
          )
        }

        // Execute Schedule Persistence
        const idempotencyKey = `sched-cal-${sourceId}-${Date.now()}`
        await scheduleEditorialPublication(payload, {
          articleId: sourceId,
          scheduledFor: tzResult.utcInstant,
          timeZone: tzResult.timeZone,
          actor,
          idempotencyKey,
          actorUserId,
        })

        // Log calendar audit
        await payload.create({
          collection: 'calendar-entry-audits',
          data: {
            action: action === 'reschedule' ? 'calendar.rescheduled' : 'calendar.scheduled',
            actor: actorUserId,
            before: { scheduledFor: article.scheduledFor, timeZone: article.timeZone },
            after: {
              scheduledFor: tzResult.utcInstant,
              timeZone: tzResult.timeZone,
              localFormatted: tzResult.localFormatted,
            },
            createdAt: new Date().toISOString(),
          },
          overrideAccess: true,
        } as never)

        return NextResponse.json({
          ok: true,
          scheduledForUtc: tzResult.utcInstant,
          timeZone: tzResult.timeZone,
          localFormatted: tzResult.localFormatted,
          isDst: tzResult.isDst,
          wasNonexistent: tzResult.wasNonexistent,
          isAmbiguous: tzResult.isAmbiguous,
        })
      }
    }

    return NextResponse.json(
      { error: `Unsupported action "${action}" or sourceType "${sourceType}".` },
      { status: 400 },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
