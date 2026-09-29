import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'
import { loadConfig } from '../core/config'
import { migrations } from '../../migrations'
import { buildOperationsDiagnostics, type OperationsDiagnostics } from '../operations/diagnostics'
import { capabilityPresentationState } from './progressive-disclosure'

type ContentRow = {
  id: string
  title?: string
  status?: string
  canonicalPath?: string
  updatedAt?: string
  publishedAt?: string
  contentType?: string
}

type ModerationItem = {
  id: string
  title?: string
  moderationState?: string
  canonicalPath?: string
}

type OrderItem = {
  id: string
  orderNumber?: string
  state?: string
  totalAmountMinor?: string
  currency?: string
}

type PodJobItem = {
  id: string
  providerKey?: string
  state?: string
}

const label = (row: ContentRow) => row.title?.trim() || 'Untitled draft'
const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : 'No date'

export default async function PublisherDashboard({ initPageResult }: AdminViewServerProps) {
  const payload = initPageResult.req.payload
  const role = String(initPageResult.req.user?.role ?? '')
  const params = new URLSearchParams(initPageResult.req.url?.split('?')[1] ?? '')
  const siteId = params.get('siteId') ?? undefined
  const siteQuery = siteId ? `?siteId=${encodeURIComponent(siteId)}` : ''
  const scopedWhere = (where: Record<string, unknown> = {}) =>
    siteId ? { and: [{ site: { equals: siteId } }, where] } : where
  const assignedSiteIDs = (
    (
      initPageResult.req.user as unknown as
        | { adminSites?: Array<string | { id?: string | number }> }
        | undefined
    )?.adminSites ?? []
  ).map((site) => String(typeof site === 'object' ? site.id : site))
  if (role === 'staff' && (!siteId || !assignedSiteIDs.includes(siteId))) {
    return (
      <main className="gutter--left gutter--right">
        <h1>Publisher Dashboard</h1>
        <p>Select an assigned site to view its work.</p>
      </main>
    )
  }
  const config = loadConfig()

  // 1. Fetch core content & redirects
  const [draftsRes, scheduledRes, publishedRes, redirectsRes] = await Promise.all([
    payload
      .find({
        collection: 'content',
        where: scopedWhere({ status: { in: ['draft', 'review', 'approved'] } }) as never,
        sort: '-updatedAt',
        limit: 6,
        depth: 0,
        req: initPageResult.req,
      } as never)
      .catch(() => ({ docs: [], totalDocs: 0 })),
    payload
      .find({
        collection: 'content',
        where: scopedWhere({ status: { equals: 'scheduled' } }) as never,
        sort: 'publishedAt',
        limit: 6,
        depth: 0,
        req: initPageResult.req,
      } as never)
      .catch(() => ({ docs: [], totalDocs: 0 })),
    payload
      .find({
        collection: 'content',
        where: scopedWhere({ status: { in: ['published', 'updated'] } }) as never,
        sort: '-publishedAt',
        limit: 6,
        depth: 0,
        req: initPageResult.req,
      } as never)
      .catch(() => ({ docs: [], totalDocs: 0 })),
    payload
      .find({
        collection: 'public-redirects',
        where: scopedWhere({ enabled: { equals: true } }) as never,
        limit: 1,
        depth: 0,
        req: initPageResult.req,
      } as never)
      .catch(() => ({ docs: [], totalDocs: 0 })),
  ])

  // 2. Fetch diagnostics for system, jobs, backup & provider health
  let diagnostics: OperationsDiagnostics | null = null
  try {
    diagnostics = await buildOperationsDiagnostics(payload, config, {
      expectedMigrations: migrations.map((migration) => migration.name),
    })
    if (role === 'staff' && siteId) {
      const eventCount = await payload.find({
        collection: 'execution-events',
        where: { and: [{ site: { equals: siteId } }, { state: { equals: 'dead-letter' } }] },
        limit: 0,
        depth: 0,
        req: initPageResult.req,
      } as never)
      diagnostics = {
        ...diagnostics,
        jobs: { ...diagnostics.jobs, failed: eventCount.totalDocs ?? 0 },
      }
    }
  } catch {
    // Graceful fallback if database connection or diagnostics are limited
  }

  // 3. Check for moderation items requiring attention
  let flaggedDiscussions: ModerationItem[] = []
  try {
    const res = await payload.find({
      collection: 'discussions',
      where: scopedWhere({ moderationState: { not_equals: 'clear' } }) as never,
      limit: 5,
      depth: 0,
      req: initPageResult.req,
    } as never)
    flaggedDiscussions = (res.docs as unknown as ModerationItem[]) || []
  } catch {
    // Community module may be disabled
  }

  // 4. Check for commerce orders & fulfillment jobs
  let pendingOrders: OrderItem[] = []
  let alertPodJobs: PodJobItem[] = []
  try {
    const ordersRes = await payload.find({
      collection: 'orders',
      where: scopedWhere({ state: { in: ['paid', 'processing'] } }) as never,
      limit: 5,
      depth: 0,
      req: initPageResult.req,
    } as never)
    pendingOrders = (ordersRes.docs as unknown as OrderItem[]) || []

    const podRes = await payload.find({
      collection: 'pod-jobs',
      where: scopedWhere({ state: { in: ['on_hold', 'failed', 'exception'] } }) as never,
      limit: 5,
      depth: 0,
      req: initPageResult.req,
    } as never)
    alertPodJobs = (podRes.docs as unknown as PodJobItem[]) || []
  } catch {
    // Commerce module may be disabled
  }

  const failedJobsCount = diagnostics?.jobs?.failed ?? 0
  const isOwner = initPageResult.req.user?.role === 'owner'
  const isAdministrator = initPageResult.req.user?.role === 'administrator'
  const isFreshInstall = (publishedRes.totalDocs ?? 0) === 0
  let recentAnalyticsEvents = 0
  let analyticsReadiness = 'Unavailable'
  if (initPageResult.req.user?.role === 'owner') {
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const analytics = await payload.find({
        collection: 'analytics-events',
        where: { occurredAt: { greater_than_equal: since } },
        limit: 0,
        req: initPageResult.req,
      } as never)
      recentAnalyticsEvents = Number(analytics.totalDocs ?? 0)
      analyticsReadiness = 'Available'
    } catch {
      // Analytics may be disabled in this deployment profile.
    }
  }
  return (
    <main
      className="gutter--left gutter--right"
      style={{ maxWidth: 1180, margin: '0 auto', paddingBottom: '3rem' }}
    >
      <header style={{ marginTop: '1.5rem', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Publisher Dashboard</h1>
        <p style={{ color: '#9ca3af', fontSize: '1.05rem', margin: 0 }}>
          Central command for publishing, media, community, commerce, and system health.
        </p>
      </header>

      {/* Quick Action Navigation Bar */}
      <nav
        aria-label="Quick Actions"
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '2rem',
          padding: '1rem',
          backgroundColor: 'var(--theme-elevation-50, #18181b)',
          borderRadius: '8px',
          border: '1px solid var(--theme-elevation-150, #27272a)',
        }}
      >
        <Link href={`/admin/posts${siteQuery}`} style={{ fontWeight: 600 }}>
          + Create Post
        </Link>
        <span style={{ color: '#52525b' }}>·</span>
        <Link href={`/admin/pages${siteQuery}`} style={{ fontWeight: 600 }}>
          + Create Page
        </Link>
        <span style={{ color: '#52525b' }}>·</span>
        <Link href={`/admin/media-library${siteQuery}`} style={{ fontWeight: 600 }}>
          + Upload Media
        </Link>
        <span style={{ color: '#52525b' }}>·</span>
        <Link href={`/admin/navigation${siteQuery}`} style={{ fontWeight: 600 }}>
          Menus & Navigation
        </Link>
        <span style={{ color: '#52525b' }}>·</span>
        <Link href={`/admin/workflow${siteQuery}`} style={{ fontWeight: 600 }}>
          Editorial Workflow
        </Link>
        <span style={{ color: '#52525b' }}>·</span>
        <Link href={`/admin/providers${siteQuery}`} style={{ fontWeight: 600 }}>
          Providers & Connections
        </Link>
        <span style={{ color: '#52525b' }}>·</span>
        <Link
          href="/"
          target="_blank"
          rel="noreferrer"
          style={{ fontWeight: 600, marginLeft: 'auto', color: '#38bdf8' }}
        >
          View Public Site ↗
        </Link>
      </nav>

      {/* Operational State Strip */}
      <section
        aria-label="System & Operational Status"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <StatusCard
          href={isOwner ? `/admin/capabilities${siteQuery}` : undefined}
          label="Database"
          value={diagnostics?.database?.status ?? 'Unavailable'}
        />
        <StatusCard
          href={isOwner ? `/admin/capabilities${siteQuery}` : undefined}
          label="Background Worker"
          value={diagnostics?.worker?.status === 'healthy' ? 'Active' : 'Unavailable'}
        />
        <StatusCard
          href={isOwner ? `/admin/capabilities${siteQuery}` : undefined}
          label="Job Failures"
          value={failedJobsCount > 0 ? `${failedJobsCount} Failed` : '0 Failures'}
        />
        <StatusCard
          href={isOwner ? `/admin/capabilities${siteQuery}` : undefined}
          label="Backup Health"
          value={
            diagnostics?.backup?.status === 'healthy'
              ? 'Current'
              : diagnostics?.backup?.status === 'failed'
                ? 'Failed'
                : diagnostics?.backup?.status === 'not_configured'
                  ? 'Not configured'
                  : 'Unknown'
          }
        />
        <StatusCard
          href={`/admin/redirects${siteQuery}`}
          label="Active Redirects"
          value={`${redirectsRes.totalDocs ?? 0} Protected`}
        />
        <StatusCard
          href={`/admin/providers${siteQuery}`}
          label="Monitored Provider Records"
          value={
            role === 'staff' ? 'Open provider status' : `${diagnostics?.providers.length ?? 0}`
          }
        />
        {(isOwner || isAdministrator) && (
          <StatusCard
            href={`/admin/${isOwner ? 'capabilities' : 'migration'}${siteQuery}`}
            label="System & Migration State"
            value={`${diagnostics?.migrations.status ?? 'Unavailable'} migrations; ${diagnostics?.mediaStorage.status ?? 'Unknown'} storage`}
          />
        )}
        {initPageResult.req.user?.role === 'owner' && (
          <StatusCard
            href={`/admin/telemetry${siteQuery}`}
            label="Analytics Events (30 days)"
            value={`${analyticsReadiness}; ${recentAnalyticsEvents} events`}
          />
        )}
      </section>

      {/* System Runtime, Migrations, Worker & Backup Governance for Owner & Administrator */}
      {(isOwner || isAdministrator) && diagnostics && (
        <section
          style={{
            marginBottom: '2rem',
            padding: '1.25rem',
            backgroundColor: 'var(--theme-elevation-50, #18181b)',
            borderRadius: '8px',
            border: '1px solid var(--theme-elevation-150, #27272a)',
          }}
          aria-labelledby="system-governance-heading"
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '1rem',
              borderBottom: '1px solid var(--theme-elevation-150, #27272a)',
              paddingBottom: '0.75rem',
            }}
          >
            <div>
              <h2
                id="system-governance-heading"
                style={{ fontSize: '1.2rem', margin: 0, fontWeight: 700 }}
              >
                System Runtime, Migrations &amp; Backup Governance
              </h2>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#a1a1aa' }}>
                Operational profile, schema synchronization, worker health, and verified
                backup/restore coverage.
              </p>
            </div>
            {isOwner && (
              <Link
                href={`/admin/capabilities${siteQuery}`}
                style={{
                  fontSize: '0.8125rem',
                  color: '#38bdf8',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Capability Center →
              </Link>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem',
            }}
          >
            {/* Version & Deployment Profile */}
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'var(--theme-elevation-100, #27272a)',
                borderRadius: '6px',
                border: '1px solid var(--theme-elevation-150, #3f3f46)',
              }}
            >
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem 0', color: '#f3f4f6' }}>
                Application &amp; Profile
              </h3>
              <p style={{ margin: '3px 0', fontSize: '0.8125rem' }}>
                <strong>App Version:</strong> <code>{diagnostics.version.app}</code>
              </p>
              <p style={{ margin: '3px 0', fontSize: '0.8125rem' }}>
                <strong>Profile:</strong>{' '}
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: '#065f46',
                    color: '#6ee7b7',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                  }}
                >
                  [{diagnostics.version.deploymentProfile?.toUpperCase() ?? 'STANDARD'}]
                </span>
              </p>
              <p style={{ margin: '3px 0', fontSize: '0.8125rem' }}>
                <strong>Schema Version:</strong>{' '}
                <code>{diagnostics.version.schemaVersion ?? '1.0.0'}</code>
              </p>
              <p style={{ margin: '3px 0', fontSize: '0.8125rem', color: '#a1a1aa' }}>
                <strong>Build SHA:</strong>{' '}
                <code>{diagnostics.version.buildSha ?? 'Unavailable (not injected at build)'}</code>
              </p>
              <p
                style={{
                  fontSize: '0.75rem',
                  color: '#9ca3af',
                  marginTop: '0.5rem',
                  lineHeight: 1.4,
                }}
              >
                {diagnostics.version.deploymentProfile === 'Lean'
                  ? 'Lean profile: Minimal publishing floor active. Dormant background workers & heavy extensions to maximize resource efficiency.'
                  : 'Standard profile: Full-featured operations enabled, including background worker, print-on-demand fulfillment, cart/checkout, audience campaigns, and analytics.'}
              </p>
            </div>

            {/* Database & Migrations */}
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'var(--theme-elevation-100, #27272a)',
                borderRadius: '6px',
                border: '1px solid var(--theme-elevation-150, #3f3f46)',
              }}
            >
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem 0', color: '#f3f4f6' }}>
                Database &amp; Migrations
              </h3>
              <p style={{ margin: '3px 0', fontSize: '0.8125rem' }}>
                <strong>Database Health:</strong>{' '}
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor:
                      diagnostics.database.status === 'healthy' ? '#065f46' : '#991b1b',
                    color: diagnostics.database.status === 'healthy' ? '#6ee7b7' : '#fca5a5',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                  }}
                >
                  [{diagnostics.database.status.toUpperCase()}]
                </span>
              </p>
              <p style={{ margin: '3px 0', fontSize: '0.8125rem' }}>
                <strong>Migration Status:</strong>{' '}
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor:
                      diagnostics.migrations.status === 'current' ? '#065f46' : '#92400e',
                    color: diagnostics.migrations.status === 'current' ? '#6ee7b7' : '#fde68a',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                  }}
                >
                  [{diagnostics.migrations.status.toUpperCase()}]
                </span>
              </p>
              <p style={{ margin: '3px 0', fontSize: '0.8125rem' }}>
                <strong>Applied Migrations:</strong>{' '}
                {diagnostics.migrations.status === 'unavailable'
                  ? 'Unavailable'
                  : `${diagnostics.migrations.applied} of ${diagnostics.migrations.expected}`}
              </p>
              {diagnostics.migrations.missing.length > 0 ? (
                <div
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    color: '#fca5a5',
                  }}
                >
                  <strong>Condition:</strong> {diagnostics.migrations.missing.length} unapplied
                  migration(s).
                  <br />
                  <strong>Next Action:</strong> Run <code>npm run db:migrate</code> in host
                  terminal.
                </div>
              ) : (
                <p style={{ fontSize: '0.75rem', color: '#4ade80', marginTop: '0.5rem' }}>
                  ✓ All registered migrations applied. Schema is in sync.
                </p>
              )}
            </div>

            {/* Worker Process & Job Queues */}
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'var(--theme-elevation-100, #27272a)',
                borderRadius: '6px',
                border: '1px solid var(--theme-elevation-150, #3f3f46)',
              }}
            >
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem 0', color: '#f3f4f6' }}>
                Worker &amp; Job Queues
              </h3>
              <p style={{ margin: '3px 0', fontSize: '0.8125rem' }}>
                <strong>Worker Status:</strong>{' '}
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor:
                      diagnostics.worker.status === 'healthy' ? '#065f46' : '#92400e',
                    color: diagnostics.worker.status === 'healthy' ? '#6ee7b7' : '#fde68a',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                  }}
                >
                  [{diagnostics.worker.status.toUpperCase()}]
                </span>
              </p>
              <p style={{ margin: '3px 0', fontSize: '0.8125rem' }}>
                <strong>Module Profile / Job Backend:</strong> {diagnostics.runtime.moduleProfile} /{' '}
                {diagnostics.runtime.jobBackend}
              </p>
              <p style={{ margin: '3px 0', fontSize: '0.8125rem' }}>
                <strong>Heartbeat:</strong>{' '}
                {diagnostics.worker.ageMs !== null
                  ? `${Math.round(diagnostics.worker.ageMs / 1000)}s ago`
                  : 'No heartbeat recorded'}
              </p>
              <p style={{ margin: '3px 0', fontSize: '0.8125rem' }}>
                <strong>Media Storage:</strong> {diagnostics.mediaStorage.driver} —{' '}
                {diagnostics.mediaStorage.status}
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.5rem',
                  marginTop: '0.5rem',
                  textAlign: 'center',
                }}
              >
                <div style={{ padding: '4px', background: '#18181b', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>Queued</div>
                  <div style={{ fontWeight: 700 }}>{diagnostics.jobs.queued}</div>
                </div>
                <div style={{ padding: '4px', background: '#18181b', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>Running</div>
                  <div style={{ fontWeight: 700 }}>{diagnostics.jobs.running}</div>
                </div>
                <div style={{ padding: '4px', background: '#18181b', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>Failed</div>
                  <div
                    style={{
                      fontWeight: 700,
                      color: diagnostics.jobs.failed ? '#ef4444' : 'inherit',
                    }}
                  >
                    {diagnostics.jobs.failed}
                  </div>
                </div>
              </div>
              {diagnostics.worker.status === 'unavailable' && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.4rem',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid #f59e0b',
                    borderRadius: '4px',
                    color: '#fde68a',
                    fontSize: '0.7rem',
                  }}
                >
                  <strong>Condition:</strong> Worker heartbeat absent (&gt;45s).
                  <br />
                  <strong>Next Action:</strong> Run <code>npm run jobs:worker</code> or verify
                  Docker container.
                </div>
              )}
            </div>

            {/* Backup Coverage & Isolated Restore Instructions */}
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'var(--theme-elevation-100, #27272a)',
                borderRadius: '6px',
                border: '1px solid var(--theme-elevation-150, #3f3f46)',
              }}
            >
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem 0', color: '#f3f4f6' }}>
                Backup &amp; Restore Governance
              </h3>
              <p style={{ margin: '3px 0', fontSize: '0.8125rem' }}>
                <strong>Backup Status:</strong>{' '}
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor:
                      diagnostics.backup.status === 'healthy' ? '#065f46' : '#92400e',
                    color: diagnostics.backup.status === 'healthy' ? '#6ee7b7' : '#fde68a',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                  }}
                >
                  [{diagnostics.backup.status.toUpperCase()}]
                </span>
              </p>
              <p style={{ margin: '3px 0', fontSize: '0.75rem', color: '#d1d5db' }}>
                <strong>Last Backup Record:</strong>{' '}
                {diagnostics.backup.lastSuccessfulAt ?? 'None recorded on this host'}
              </p>
              {diagnostics.backup.archive ? (
                <p role="status" style={{ margin: '3px 0', fontSize: '0.75rem', color: '#d1d5db' }}>
                  {diagnostics.backup.verified
                    ? 'Checksum verification succeeded at backup time.'
                    : 'Archive metadata recorded; checksum status unavailable.'}{' '}
                  {diagnostics.backup.archive.files} files, {diagnostics.backup.archive.bytes}{' '}
                  bytes: <code>{diagnostics.backup.archive.path}</code>
                </p>
              ) : (
                <p role="status" style={{ margin: '3px 0', fontSize: '0.75rem', color: '#d1d5db' }}>
                  No successful archive is recorded. Run the backup command and retain its output
                  directory.
                </p>
              )}
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                <details>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#7dd3fc' }}>
                    View Included &amp; Excluded Data Scope
                  </summary>
                  <div style={{ marginTop: '0.4rem', paddingLeft: '0.5rem' }}>
                    <div style={{ fontWeight: 600, color: '#6ee7b7', marginTop: '0.2rem' }}>
                      Included Data:
                    </div>
                    <ul style={{ margin: '2px 0 6px 12px', padding: 0, color: '#d1d5db' }}>
                      <li>
                        PostgreSQL dump (<code>database.dump</code> via <code>pg_dump -Fc</code>)
                      </li>
                      <li>
                        Media Library assets (<code>media.tar.gz</code>)
                      </li>
                      <li>
                        Non-secret installation metadata &amp; SHA-256 <code>manifest.json</code>
                      </li>
                    </ul>
                    <div style={{ fontWeight: 600, color: '#fca5a5', marginTop: '0.2rem' }}>
                      Excluded Data:
                    </div>
                    <ul style={{ margin: '2px 0 0 12px', padding: 0, color: '#a1a1aa' }}>
                      <li>
                        Environment secrets (<code>.env</code>, <code>PAYLOAD_SECRET</code>, DB
                        passwords)
                      </li>
                      <li>
                        Provider credentials &amp; API keys (encrypted provider records in the DB
                        dump are included; environment secrets are excluded)
                      </li>
                      <li>
                        Ephemeral upload staging (<code>.upload-sessions</code>)
                      </li>
                    </ul>
                  </div>
                </details>

                <details style={{ marginTop: '0.4rem' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#f59e0b' }}>
                    View Restore &amp; Rehearsal Commands
                  </summary>
                  <div
                    style={{
                      marginTop: '0.4rem',
                      paddingLeft: '0.5rem',
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                    }}
                  >
                    <div style={{ color: '#38bdf8', marginBottom: '2px' }}>Backup command:</div>
                    <div
                      style={{
                        background: '#18181b',
                        padding: '4px',
                        borderRadius: '3px',
                        wordBreak: 'break-all',
                      }}
                    >
                      npm.cmd run backup:operational -- --output &lt;dir&gt;
                      --maintenance-window-confirmed
                    </div>
                    <div style={{ color: '#f59e0b', margin: '4px 0 2px 0' }}>Isolated restore:</div>
                    <div
                      style={{
                        background: '#18181b',
                        padding: '4px',
                        borderRadius: '3px',
                        wordBreak: 'break-all',
                      }}
                    >
                      npm.cmd run restore:operational -- --archive &lt;dir&gt; --target-version
                      &lt;version&gt; --isolated --authorize-restore --env-file .env.restore
                    </div>
                    <div style={{ color: '#34d399', margin: '4px 0 2px 0' }}>
                      Dry-run rehearsal:
                    </div>
                    <div
                      style={{
                        background: '#18181b',
                        padding: '4px',
                        borderRadius: '3px',
                        wordBreak: 'break-all',
                      }}
                    >
                      npm.cmd run restore:rehearsal -- --archive &lt;dir&gt; --target-version
                      &lt;version&gt; --source-url &lt;source&gt; --restored-url
                      http://127.0.0.1:3300 --public-path &lt;path&gt; --media-path &lt;media&gt;
                      --env-file .env.restore
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Critical Alert Banners */}
      {failedJobsCount > 0 && (
        <section
          role="alert"
          style={{
            marginBottom: '2rem',
            padding: '1.25rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: '8px',
          }}
        >
          <h2 style={{ fontSize: '1.15rem', color: '#f87171', margin: '0 0 0.5rem 0' }}>
            ⚠️ Action Required: {failedJobsCount} Background Job{failedJobsCount === 1 ? '' : 's'}{' '}
            Failed
          </h2>
          <p style={{ margin: '0 0 0.75rem 0' }}>
            Background job failures may delay scheduled releases, webhook delivery, or media
            processing.
          </p>
          {isOwner && (
            <Link
              href={`/admin/capabilities${siteQuery}`}
              style={{
                display: 'inline-block',
                padding: '0.4rem 0.8rem',
                backgroundColor: '#ef4444',
                color: '#fff',
                borderRadius: '4px',
                fontWeight: 600,
                textDecoration: 'none',
                fontSize: '0.875rem',
              }}
            >
              Review in Capability Center →
            </Link>
          )}
          {!isOwner && (
            <p style={{ marginBottom: 0 }}>Ask the site owner to review failed background jobs.</p>
          )}
        </section>
      )}

      {flaggedDiscussions.length > 0 && (
        <section
          role="alert"
          style={{
            marginBottom: '2rem',
            padding: '1.25rem',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
          }}
        >
          <h2 style={{ fontSize: '1.15rem', color: '#fbbf24', margin: '0 0 0.5rem 0' }}>
            🛡️ Moderation Queue: {flaggedDiscussions.length} Community Item
            {flaggedDiscussions.length === 1 ? '' : 's'} Flagged
          </h2>
          <p style={{ margin: '0 0 0.75rem 0' }}>
            Member discussions or posts have been reported or quarantined and require staff triage.
          </p>
          <Link
            href={`/admin/moderation${siteQuery}`}
            style={{
              display: 'inline-block',
              padding: '0.4rem 0.8rem',
              backgroundColor: '#f59e0b',
              color: '#000',
              borderRadius: '4px',
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            Open Moderation Queue →
          </Link>
        </section>
      )}

      {role !== 'staff' && diagnostics?.providers.length === 0 && (
        <section aria-label="Provider status" style={{ marginBottom: '1rem' }}>
          <StatusCard
            href={`/admin/providers${siteQuery}`}
            label="Providers"
            value="No configured providers"
          />
        </section>
      )}

      {/* Empty Install Guide / Starter Checklist */}
      {isFreshInstall && (
        <section
          aria-label="Starter Site Checklist"
          style={{
            marginBottom: '2.5rem',
            padding: '1.5rem',
            backgroundColor: 'var(--theme-elevation-100, #27272a)',
            borderRadius: '8px',
            border: '1px solid var(--theme-elevation-200, #3f3f46)',
          }}
        >
          <h2 style={{ fontSize: '1.3rem', margin: '0 0 0.5rem 0' }}>
            🚀 Starter Site Configuration Checklist
          </h2>
          <p style={{ color: '#d1d5db', marginBottom: '1.25rem' }}>
            Welcome to your new sovereign Renegade CMS site. Complete these essential steps to make
            your site public and recognizable.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            <div
              style={{
                padding: '1rem',
                borderRadius: '6px',
                backgroundColor: 'var(--theme-elevation-50, #18181b)',
                border: '1px solid var(--theme-elevation-150, #27272a)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                1. Site Branding & Theme
              </div>
              <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0 0 0.75rem 0' }}>
                Set your site title, tagline, logo, color palette, and default SEO metadata.
              </p>
              <span style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
                Settings editor unavailable in this build.
              </span>
            </div>

            <div
              style={{
                padding: '1rem',
                borderRadius: '6px',
                backgroundColor: 'var(--theme-elevation-50, #18181b)',
                border: '1px solid var(--theme-elevation-150, #27272a)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                2. Media & Brand Assets
              </div>
              <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0 0 0.75rem 0' }}>
                Upload logos, hero graphics, and photography. Use miniPaint for fast in-browser
                edits.
              </p>
              <Link
                href={`/admin/media-library${siteQuery}`}
                style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8' }}
              >
                Open Media Library →
              </Link>
            </div>

            <div
              style={{
                padding: '1rem',
                borderRadius: '6px',
                backgroundColor: 'var(--theme-elevation-50, #18181b)',
                border: '1px solid var(--theme-elevation-150, #27272a)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                3. Publish First Article & Page
              </div>
              <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0 0 0.75rem 0' }}>
                Create your first long-form post and essential landing pages (About, Contact).
              </p>
              <span style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
                Create the first draft in Posts or Pages.
              </span>
            </div>

            <div
              style={{
                padding: '1rem',
                borderRadius: '6px',
                backgroundColor: 'var(--theme-elevation-50, #18181b)',
                border: '1px solid var(--theme-elevation-150, #27272a)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>4. Navigation Menus</div>
              <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0 0 0.75rem 0' }}>
                Structure your header and footer navigation clusters so visitors can navigate
                easily.
              </p>
              <Link
                href={`/admin/navigation${siteQuery}`}
                style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8' }}
              >
                Customize Menus →
              </Link>
            </div>

            <div
              style={{
                padding: '1rem',
                borderRadius: '6px',
                backgroundColor: 'var(--theme-elevation-50, #18181b)',
                border: '1px solid var(--theme-elevation-150, #27272a)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                5. External Connections & AI
              </div>
              <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0 0 0.75rem 0' }}>
                Connect merchant gateways, email transports, social channels, and AI helpers.
              </p>
              <Link
                href={`/admin/providers${siteQuery}`}
                style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8' }}
              >
                Manage Providers →
              </Link>
            </div>

            <div
              style={{
                padding: '1rem',
                borderRadius: '6px',
                backgroundColor: 'var(--theme-elevation-50, #18181b)',
                border: '1px solid var(--theme-elevation-150, #27272a)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                6. Verify Search & Quality
              </div>
              <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0 0 0.75rem 0' }}>
                Inspect your generated sitemap.xml, robots.txt, and run an automated quality audit.
              </p>
              <Link
                href={`/admin/indexing${siteQuery}`}
                style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8' }}
              >
                Review Search Indexing →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Editorial & Publishing Work Queues */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2.5rem',
        }}
      >
        {/* Recent Drafts */}
        <section
          style={{
            padding: '1.25rem',
            backgroundColor: 'var(--theme-elevation-50, #18181b)',
            borderRadius: '8px',
            border: '1px solid var(--theme-elevation-150, #27272a)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Recent Drafts & Reviews</h2>
            <Link
              href={`/admin/posts${siteQuery}`}
              style={{ fontSize: '0.8rem', color: '#38bdf8' }}
            >
              View all ({draftsRes.totalDocs ?? 0})
            </Link>
          </div>
          {draftsRes.docs.length > 0 ? (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              {(draftsRes.docs as ContentRow[]).map((row) => (
                <li
                  key={row.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid var(--theme-elevation-100, #27272a)',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{label(row)}</span>
                    <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                      {row.status} · Updated {date(row.updatedAt)}
                    </div>
                  </div>
                  <Link
                    href={`/admin/${row.contentType === 'page' ? 'pages' : 'posts'}${siteQuery}`}
                    style={{ fontSize: '0.8rem', color: '#38bdf8' }}
                  >
                    Open editor
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#a1a1aa', fontSize: '0.875rem', margin: 0 }}>
              No active drafts. Create a post or page to begin editorial review.
            </p>
          )}
        </section>

        {/* Scheduled Content */}
        <section
          style={{
            padding: '1.25rem',
            backgroundColor: 'var(--theme-elevation-50, #18181b)',
            borderRadius: '8px',
            border: '1px solid var(--theme-elevation-150, #27272a)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Scheduled Releases</h2>
            <Link
              href={`/admin/workflow${siteQuery}`}
              style={{ fontSize: '0.8rem', color: '#38bdf8' }}
            >
              View workflow ({scheduledRes.totalDocs ?? 0})
            </Link>
          </div>
          {scheduledRes.docs.length > 0 ? (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              {(scheduledRes.docs as ContentRow[]).map((row) => (
                <li
                  key={row.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid var(--theme-elevation-100, #27272a)',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{label(row)}</span>
                    <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                      Scheduled for: {date(row.publishedAt)}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(56, 189, 248, 0.1)',
                      color: '#38bdf8',
                    }}
                  >
                    Scheduled
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#a1a1aa', fontSize: '0.875rem', margin: 0 }}>
              Nothing scheduled. Set a publish date on any approved post to schedule it.
            </p>
          )}
        </section>

        {/* Recently Published */}
        <section
          style={{
            padding: '1.25rem',
            backgroundColor: 'var(--theme-elevation-50, #18181b)',
            borderRadius: '8px',
            border: '1px solid var(--theme-elevation-150, #27272a)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Recently Published</h2>
            <Link
              href="/"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.8rem', color: '#38bdf8' }}
            >
              View live site ↗
            </Link>
          </div>
          {publishedRes.docs.length > 0 ? (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              {(publishedRes.docs as ContentRow[]).map((row) => (
                <li
                  key={row.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid var(--theme-elevation-100, #27272a)',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{label(row)}</span>
                    <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                      Published {date(row.publishedAt ?? row.updatedAt)}
                    </div>
                  </div>
                  {row.canonicalPath ? (
                    <Link
                      href={row.canonicalPath}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: '0.8rem', color: '#38bdf8' }}
                    >
                      View ↗
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#a1a1aa', fontSize: '0.875rem', margin: 0 }}>
              No published items yet. Follow the starter checklist to publish your first post.
            </p>
          )}
        </section>
      </div>

      {/* Commerce & Operations Summary */}
      {(pendingOrders.length > 0 ||
        alertPodJobs.length > 0 ||
        (isFreshInstall && diagnostics !== null)) && (
        <section
          style={{
            marginBottom: '2.5rem',
            padding: '1.25rem',
            backgroundColor: 'var(--theme-elevation-50, #18181b)',
            borderRadius: '8px',
            border: '1px solid var(--theme-elevation-150, #27272a)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Commerce & Fulfillment Operations</h2>
            <Link
              href={`${pendingOrders.length > 0 ? '/admin/commerce' : '/admin/catalog'}${siteQuery}`}
              style={{ fontSize: '0.8rem', color: '#38bdf8' }}
            >
              Open Commerce Command Center →
            </Link>
          </div>
          {pendingOrders.length === 0 && alertPodJobs.length === 0 ? (
            <p style={{ margin: 0, color: '#a1a1aa' }}>
              No commerce work is pending. Add a product or configure a payment provider to begin.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>
                  Orders Needing Fulfillment
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>
                  {pendingOrders.length} Order{pendingOrders.length === 1 ? '' : 's'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>POD Jobs Alert / On Hold</div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    marginTop: '0.2rem',
                    color: alertPodJobs.length > 0 ? '#fbbf24' : '#4ade80',
                  }}
                >
                  {alertPodJobs.length} Job{alertPodJobs.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Quick Navigation to 16 Primary Admin Centers */}
      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '1rem' }}>
          Sovereign Administration Centers
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <Link
            href={`/admin/posts${siteQuery}`}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: 'var(--theme-elevation-50, #18181b)',
              border: '1px solid var(--theme-elevation-100, #27272a)',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontWeight: 600 }}>📝 Publishing</div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
              Posts, pages, sections & taxonomy
            </div>
          </Link>
          <Link
            href={`/admin/media-library${siteQuery}`}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: 'var(--theme-elevation-50, #18181b)',
              border: '1px solid var(--theme-elevation-100, #27272a)',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontWeight: 600 }}>🖼️ Media Library</div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
              DAM, podcasts, video & miniPaint
            </div>
          </Link>
          <Link
            href={`/admin/navigation${siteQuery}`}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: 'var(--theme-elevation-50, #18181b)',
              border: '1px solid var(--theme-elevation-100, #27272a)',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontWeight: 600 }}>🧭 Presentation</div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
              Menus, page layouts & themes
            </div>
          </Link>
          <Link
            href={`/admin/indexing${siteQuery}`}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: 'var(--theme-elevation-50, #18181b)',
              border: '1px solid var(--theme-elevation-100, #27272a)',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontWeight: 600 }}>🔍 Discovery</div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
              Search, redirects & quality scans
            </div>
          </Link>
          <Link
            href={`/admin/workflow${siteQuery}`}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: 'var(--theme-elevation-50, #18181b)',
              border: '1px solid var(--theme-elevation-100, #27272a)',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontWeight: 600 }}>📋 Editorial Workflow</div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
              Team review queues & releases
            </div>
          </Link>
          <Link
            href={`/admin/social${siteQuery}`}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: 'var(--theme-elevation-50, #18181b)',
              border: '1px solid var(--theme-elevation-100, #27272a)',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontWeight: 600 }}>📣 Distribution</div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
              Multi-channel social publishing
            </div>
          </Link>
          <Link
            href={`/admin/audience${siteQuery}`}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: 'var(--theme-elevation-50, #18181b)',
              border: '1px solid var(--theme-elevation-100, #27272a)',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontWeight: 600 }}>👥 Audience</div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
              Subscribers, lists & newsletters
            </div>
          </Link>
          <Link
            href={`/admin/moderation${siteQuery}`}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: 'var(--theme-elevation-50, #18181b)',
              border: '1px solid var(--theme-elevation-100, #27272a)',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontWeight: 600 }}>🛡️ Community</div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
              Forums, discussions & moderation
            </div>
          </Link>
          <Link
            href={`/admin/commerce${siteQuery}`}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: 'var(--theme-elevation-50, #18181b)',
              border: '1px solid var(--theme-elevation-100, #27272a)',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontWeight: 600 }}>💳 Commerce</div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
              Catalog, orders, fundraising & POD
            </div>
          </Link>
          {isOwner && (
            <Link
              href={`/admin/telemetry${siteQuery}`}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                backgroundColor: 'var(--theme-elevation-50, #18181b)',
                border: '1px solid var(--theme-elevation-100, #27272a)',
                textDecoration: 'none',
              }}
            >
              <div style={{ fontWeight: 600 }}>📊 Analytics</div>
              <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
                Privacy telemetry & experiments
              </div>
            </Link>
          )}
          <Link
            href={`/admin/providers${siteQuery}`}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: 'var(--theme-elevation-50, #18181b)',
              border: '1px solid var(--theme-elevation-100, #27272a)',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontWeight: 600 }}>🔌 Providers</div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
              Connections, AI Studio & webhooks
            </div>
          </Link>
          {(isOwner || isAdministrator) && (
            <Link
              href={isOwner ? `/admin/capabilities${siteQuery}` : `/admin/migration${siteQuery}`}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                backgroundColor: 'var(--theme-elevation-50, #18181b)',
                border: '1px solid var(--theme-elevation-100, #27272a)',
                textDecoration: 'none',
              }}
            >
              <div style={{ fontWeight: 600 }}>⚙️ Maintenance</div>
              <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
                {isOwner
                  ? 'Capabilities, diagnostics & migrations'
                  : 'Review import and migration runs'}
              </div>
            </Link>
          )}
        </div>
      </section>
    </main>
  )
}

function StatusCard({ href, label, value }: { href?: string; label: string; value: string }) {
  const content = (
    <>
      <span
        style={{
          display: 'block',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          color: '#a1a1aa',
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: 600, marginTop: '0.25rem' }}>
        {value}
      </span>
    </>
  )
  const style = {
    display: 'block',
    padding: '0.85rem 1rem',
    borderRadius: '6px',
    backgroundColor: 'var(--theme-elevation-50, #18181b)',
    border: '1px solid var(--theme-elevation-150, #27272a)',
    color: 'inherit',
    textDecoration: 'none',
  } as const
  return href ? (
    <Link href={href} style={style}>
      {content}
    </Link>
  ) : (
    <div style={style}>{content}</div>
  )
}
