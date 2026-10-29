/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  const grant = await resolveOperatorGrantContext(payload, auth.user)
  if (!grant.authorized) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  if (body.kind !== undefined && !['payments', 'subscriptions'].includes(body.kind))
    return NextResponse.json({ error: 'Unsupported reconciliation kind.' }, { status: 400 })
  const requestedSiteId =
    (typeof body?.siteId === 'string' && body.siteId) ||
    new URL(request.url).searchParams.get('siteId') ||
    undefined
  if (
    requestedSiteId &&
    !grant.isGlobalOwner &&
    !grant.authorizedSiteIds.includes(requestedSiteId)
  ) {
    return NextResponse.json(
      { error: 'Forbidden. You do not have operator access to this site.' },
      { status: 403 },
    )
  }
  const scopes = requestedSiteId
    ? [requestedSiteId]
    : grant.isGlobalOwner
      ? [undefined]
      : grant.authorizedSiteIds
  if (!scopes.length) return NextResponse.json({ error: 'No authorized sites.' }, { status: 403 })
  const jobs = []
  for (const siteId of scopes) {
    const job = await (payload.jobs as any).queue({
      task:
        body.kind === 'subscriptions'
          ? 'commerce-reconcile-subscriptions'
          : 'commerce-reconcile-payments',
      input: siteId ? { siteId } : {},
      queue: 'commerce',
    })
    jobs.push(String(job.id))
  }
  return NextResponse.json({ queued: true, jobId: jobs[0], jobIds: jobs }, { status: 202 })
}
