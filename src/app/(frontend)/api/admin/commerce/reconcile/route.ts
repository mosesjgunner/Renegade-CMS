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
  const scopes = grant.isGlobalOwner ? [undefined] : grant.authorizedSiteIds
  if (!scopes.length) return NextResponse.json({ error: 'No authorized sites.' }, { status: 403 })
  const jobs = []
  for (const siteId of scopes) {
    const job = await (payload.jobs as any).queue({
      task: 'commerce-reconcile-payments',
      input: siteId ? { siteId } : {},
      queue: 'commerce',
    })
    jobs.push(String(job.id))
  }
  return NextResponse.json({ queued: true, jobId: jobs[0], jobIds: jobs }, { status: 202 })
}
