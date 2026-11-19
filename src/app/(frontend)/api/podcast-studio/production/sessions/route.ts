/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import {
  listRecordingSessions,
  scheduleRecordingSession,
} from '@/modules/podcast-studio/production'
import { episodeContext, privateJson, productionErrorResponse, readJson } from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-04 recording sessions, backed by the existing calendar module
 * (calendar-entries) — no parallel calendar.
 *
 * GET  ?episodeId= — the episode's recording-session entries.
 * POST { episodeId, startsAt, endsAt?, timeZone?, title? } — create a
 *      session entry linked to the episode; an episode still in
 *      idea/scripted moves to scheduled-record.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const episodeId = url.searchParams.get('episodeId') ?? ''
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  const sessions = await listRecordingSessions(payload as never, episodeId)
  return privateJson({
    sessions: sessions.map((entry: any) => ({
      id: String(entry.id),
      title: entry.title,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt ?? null,
      timeZone: entry.timeZone,
      status: entry.status,
    })),
  })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const episodeId = typeof body.episodeId === 'string' ? body.episodeId : ''
  const startsAt = typeof body.startsAt === 'string' ? body.startsAt : ''
  if (!startsAt) return privateJson({ error: 'startsAt is required.' }, 400)
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  try {
    const entry = await scheduleRecordingSession(payload as never, {
      episodeId,
      startsAt,
      endsAt: typeof body.endsAt === 'string' ? body.endsAt : null,
      timeZone: typeof body.timeZone === 'string' ? body.timeZone : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
      actorId: String(context.user.id),
    })
    return privateJson(
      {
        id: String(entry.id),
        title: entry.title,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt ?? null,
        timeZone: entry.timeZone,
        status: entry.status,
      },
      201,
    )
  } catch (error) {
    if (error instanceof Error && /time zone/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return productionErrorResponse(error)
  }
}
