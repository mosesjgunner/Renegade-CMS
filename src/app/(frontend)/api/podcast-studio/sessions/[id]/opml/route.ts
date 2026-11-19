/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { hashOpmlContent, rundownToOpml } from '@/modules/podcast-studio/opml'
import { applySessionOperationToRecord } from '@/modules/podcast-studio/sessions'
import {
  privateJson,
  readJson,
  recordView,
  sessionContext,
  studioSessionErrorResponse,
} from '../../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POD-05 rundown OPML for one studio session (POD-REQ-12).
 *
 * GET  — export the rundown as OPML (`X-Rundown-Source-Hash` carries
 *        the content hash of the document served).
 * POST { opml } — import an OPML document as the rundown; the source
 *        hash is recorded on the session for the conflict guard.
 * POST { action: 'export', targetText, force? } — guarded export:
 *        409 with `conflict` when the target changed since import
 *        (never a silent overwrite) unless `force` is set.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { id } = await params
  const context = await sessionContext(payload, request, id)
  if ('error' in context) return context.error
  const opml = rundownToOpml(context.record.session)
  return new NextResponse(opml, {
    status: 200,
    headers: {
      'Content-Type': 'text/x-opml; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Rundown-Source-Hash': hashOpmlContent(opml),
    },
  })
}

export async function POST(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { id } = await params
  const context = await sessionContext(payload, request, id)
  if ('error' in context) return context.error
  const body = await readJson(request)
  try {
    if (body.action === 'export') {
      const { record, applied } = await applySessionOperationToRecord(payload as never, id, {
        op: 'export-opml',
        targetText: typeof body.targetText === 'string' ? body.targetText : null,
        force: body.force === true,
      })
      if (applied.conflict) {
        return privateJson(
          { ok: false, error: 'opml-conflict', conflict: applied.conflict, ...recordView(record) },
          409,
        )
      }
      return privateJson({ ok: true, opml: applied.opml, ...recordView(record) })
    }
    if (typeof body.opml !== 'string' || !body.opml) {
      return privateJson({ error: 'POST requires an `opml` document or an export action.' }, 400)
    }
    const { record, applied } = await applySessionOperationToRecord(payload as never, id, {
      op: 'import-opml',
      opml: body.opml,
    })
    return privateJson({ ok: applied.ok, ...recordView(record) })
  } catch (error) {
    return studioSessionErrorResponse(error)
  }
}
