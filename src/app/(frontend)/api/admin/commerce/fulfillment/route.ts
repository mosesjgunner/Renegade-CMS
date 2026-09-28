/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { canManageAdminSite } from '@/modules/admin/site-access'

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'staff'].includes(String(user?.role))

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const db: any = payload
  const auth = await payload.auth({ headers: request.headers })
  if (!staffOnly(auth.user)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })

  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  if (auth.user?.role === 'staff' && !siteId)
    return NextResponse.json({ error: 'Choose an assigned site.' }, { status: 400 })
  if (siteId && !canManageAdminSite(auth.user, siteId))
    return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })

  const where = siteId ? { site: { equals: siteId } } : undefined

  const [jobs, manualPackages, connections] = await Promise.all([
    db.find({
      collection: 'pod-jobs',
      where,
      limit: 100,
      sort: '-createdAt',
      depth: 1,
      overrideAccess: true,
    }),
    db.find({
      collection: 'manual-fulfillment-packages',
      where,
      limit: 100,
      sort: '-createdAt',
      depth: 1,
      overrideAccess: true,
    }),
    db.find({
      collection: 'pod-connections',
      where,
      limit: 50,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    }),
  ])

  return NextResponse.json({
    jobs: jobs.docs,
    manualPackages: manualPackages.docs,
    connections: connections.docs,
  })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const db: any = payload
  const auth = await payload.auth({ headers: request.headers })
  if (!staffOnly(auth.user)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })

  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  if (auth.user?.role === 'staff' && !siteId)
    return NextResponse.json({ error: 'Choose an assigned site.' }, { status: 400 })
  if (siteId && !canManageAdminSite(auth.user, siteId))
    return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as {
    action?: 'release-hold' | 'retry-job' | 'acknowledge-manual' | 'ship-manual'
    jobId?: string
    packageId?: string
    carrier?: string
    trackingNumber?: string
  }

  const actorId = String((auth.user as any)?.id ?? '')
  const now = new Date().toISOString()

  if (body.action === 'release-hold') {
    const jobId = String(body.jobId ?? '')
    if (!jobId) return NextResponse.json({ error: 'jobId is required.' }, { status: 400 })

    const job: any = await db
      .findByID({
        collection: 'pod-jobs',
        id: jobId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (!job) return NextResponse.json({ error: 'POD job not found.' }, { status: 404 })

    const jobSite = typeof job.site === 'object' ? job.site?.id : job.site
    if (!canManageAdminSite(auth.user, jobSite) || (siteId && String(jobSite) !== siteId))
      return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })

    if (job.state !== 'on_hold')
      return NextResponse.json({ error: 'Job is not on hold.' }, { status: 409 })

    const audit = Array.isArray(job.auditTrail) ? job.auditTrail : []
    const updated = await db.update({
      collection: 'pod-jobs',
      id: job.id,
      data: {
        state: 'created',
        releasedAt: now,
        auditTrail: [
          ...audit,
          {
            timestamp: now,
            action: 'hold_released',
            actor: actorId,
            previousState: job.state,
            newState: 'created',
          },
        ],
      },
      overrideAccess: true,
    })

    return NextResponse.json({ job: updated })
  }

  if (body.action === 'retry-job') {
    const jobId = String(body.jobId ?? '')
    if (!jobId) return NextResponse.json({ error: 'jobId is required.' }, { status: 400 })

    const job: any = await db
      .findByID({
        collection: 'pod-jobs',
        id: jobId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (!job) return NextResponse.json({ error: 'POD job not found.' }, { status: 404 })

    const jobSite = typeof job.site === 'object' ? job.site?.id : job.site
    if (!canManageAdminSite(auth.user, jobSite) || (siteId && String(jobSite) !== siteId))
      return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })

    if (!['failed', 'exception'].includes(job.state))
      return NextResponse.json({ error: 'Only failed jobs can be retried.' }, { status: 409 })

    const audit = Array.isArray(job.auditTrail) ? job.auditTrail : []
    const updated = await db.update({
      collection: 'pod-jobs',
      id: job.id,
      data: {
        state: 'created',
        attemptCount: Number(job.attemptCount ?? 0) + 1,
        lastError: null,
        auditTrail: [
          ...audit,
          {
            timestamp: now,
            action: 'job_retried',
            actor: actorId,
            previousState: job.state,
            newState: 'created',
          },
        ],
      },
      overrideAccess: true,
    })

    return NextResponse.json({ job: updated })
  }

  if (body.action === 'acknowledge-manual') {
    const packageId = String(body.packageId ?? '')
    if (!packageId) return NextResponse.json({ error: 'packageId is required.' }, { status: 400 })

    const pkg: any = await db
      .findByID({
        collection: 'manual-fulfillment-packages',
        id: packageId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (!pkg) return NextResponse.json({ error: 'Manual package not found.' }, { status: 404 })

    const pkgSite = typeof pkg.site === 'object' ? pkg.site?.id : pkg.site
    if (!canManageAdminSite(auth.user, pkgSite) || (siteId && String(pkgSite) !== siteId))
      return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })

    const audit = Array.isArray(pkg.auditTrail) ? pkg.auditTrail : []
    const updated = await db.update({
      collection: 'manual-fulfillment-packages',
      id: pkg.id,
      data: {
        status: 'acknowledged',
        acknowledgement: {
          acknowledgedBy: actorId,
          acknowledgedAt: now,
        },
        auditTrail: [
          ...audit,
          {
            timestamp: now,
            action: 'package_acknowledged',
            actor: actorId,
          },
        ],
      },
      overrideAccess: true,
    })

    return NextResponse.json({ package: updated })
  }

  if (body.action === 'ship-manual') {
    const packageId = String(body.packageId ?? '')
    const carrier = String(body.carrier ?? 'USPS').trim()
    const trackingNumber = String(body.trackingNumber ?? '').trim()
    if (!packageId || !trackingNumber)
      return NextResponse.json(
        { error: 'packageId and trackingNumber are required.' },
        { status: 400 },
      )

    const pkg: any = await db
      .findByID({
        collection: 'manual-fulfillment-packages',
        id: packageId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (!pkg) return NextResponse.json({ error: 'Manual package not found.' }, { status: 404 })

    const pkgSite = typeof pkg.site === 'object' ? pkg.site?.id : pkg.site
    if (!canManageAdminSite(auth.user, pkgSite) || (siteId && String(pkgSite) !== siteId))
      return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })

    const audit = Array.isArray(pkg.auditTrail) ? pkg.auditTrail : []
    const trackingUrl = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`
    const updated = await db.update({
      collection: 'manual-fulfillment-packages',
      id: pkg.id,
      data: {
        status: 'shipped',
        externalFulfillment: {
          carrier,
          trackingNumber,
          trackingUrl,
          shippedAt: now,
        },
        auditTrail: [
          ...audit,
          {
            timestamp: now,
            action: 'package_shipped',
            actor: actorId,
            carrier,
            trackingNumber,
          },
        ],
      },
      overrideAccess: true,
    })

    return NextResponse.json({ package: updated })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
