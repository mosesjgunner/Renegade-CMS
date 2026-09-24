/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!['owner', 'administrator', 'staff'].includes(String((auth.user as any)?.role)))
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const job = await (payload.jobs as any).queue({
    task: 'commerce-reconcile-payments',
    input: {},
    queue: 'commerce',
  })
  return NextResponse.json({ queued: true, jobId: String(job.id) }, { status: 202 })
}
