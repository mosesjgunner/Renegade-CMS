import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor } from '@/modules/community/service'
import { exportModerationCaseAudit } from '@/modules/community/abuse-triage'
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? 'default'
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (!actor.isStaff && !actor.isModerator)
    return Response.json({ error: 'Moderation privileges required' }, { status: 403 })
  const cases = await exportModerationCaseAudit(payload, siteId)
  if (url.searchParams.get('format') !== 'csv') return Response.json({ audit: cases })
  const keys = [
    'case_id',
    'target_type',
    'target_id',
    'status',
    'priority',
    'rule_categories',
    'sla_deadline',
    'opened_at',
    'disposition',
    'event_type',
    'event_payload',
    'audit_created_at',
  ]
  const csv = [
    keys.join(','),
    ...cases.map((row) =>
      keys.map((k) => JSON.stringify((row as Record<string, unknown>)[k] ?? '')).join(','),
    ),
  ].join('\n')
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="moderation-cases.csv"',
    },
  })
}
