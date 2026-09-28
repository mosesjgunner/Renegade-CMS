import ThemeCenter from './ThemeCenter'
import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import { CapabilityLifecycleService } from '../core/capabilities'
import { loadConfig } from '../core/config'
import { migrations } from '../../migrations'
import { buildOperationsDiagnostics, isOperator } from '../operations/diagnostics'
import { capabilityPresentationState, operationalOverview } from './progressive-disclosure'
import { canManageAdminSite } from './site-access'

const capabilityRoutes: Record<string, { label: string; href: string; description: string }> = {
  'core.publishing': {
    label: 'Core publishing',
    href: '/admin/collections/content',
    description: 'Local public reading and publishing foundations.',
  },
  'editorial.workflow': {
    label: 'Editorial workflow',
    href: '/admin/collections/content',
    description: 'Draft, review, revision, and release workflow.',
  },
  'media.processing': {
    label: 'Advanced media',
    href: '/admin/collections/media-derivatives',
    description: 'Derivatives, DAM workflow, and processing.',
  },
  'social.distribution': {
    label: 'Social scheduling',
    href: '/admin/collections/social-accounts',
    description: 'Connected accounts, drafts, and publishing queue.',
  },
  'audience.transactional-email': {
    label: 'Audience delivery',
    href: '/admin/collections/subscribers',
    description: 'Subscribers and email delivery operations.',
  },
  'commerce.checkout': {
    label: 'Commerce & POS',
    href: '/admin/collections/products',
    description: 'Products, payments, orders, and point of sale.',
  },
  'analytics.reporting': {
    label: 'Advanced analytics',
    href: '/admin/collections/analytics-rollups',
    description: 'Analytics rollups, goals, and reports.',
  },
  'experiences.experiments': {
    label: 'Experiments',
    href: '/admin/collections/experiments',
    description: 'Controlled experiences and analysis.',
  },
  'quality.scanning': {
    label: 'Quality Center',
    href: '/admin/collections/quality-scans',
    description: 'Policies, scans, issues, and waivers.',
  },
  'networking.federation': {
    label: 'Optional network',
    href: '/admin/collections/network-relationships',
    description: 'Remote discovery, relationships, moderation, inboxes, and delivery diagnostics.',
  },
}

const statusClass = (status: string) =>
  status === 'healthy' ? 'success' : status === 'degraded' ? 'warning' : 'neutral'

/** Supported Payload custom view; authorization remains collection/global access. */
export default async function CapabilityCenter({ initPageResult }: AdminViewServerProps) {
  const req = initPageResult.req
  if (!isOperator(req.user)) {
    return (
      <main className="gutter--left gutter--right">
        <h1>Capability Center</h1>
        <p>Owner access is required.</p>
      </main>
    )
  }

  const config = loadConfig()
  const diagnostics = await buildOperationsDiagnostics(req.payload, config, {
    expectedMigrations: migrations.map((migration) => migration.name),
  })
  const settings = (await req.payload.findGlobal({ slug: 'site-settings', req, depth: 0 })) as {
    adminExperience?: {
      optionalCapabilities?: {
        mediaProcessing?: boolean
        socialDistribution?: boolean
        transactionalEmail?: boolean
        commerceCheckout?: boolean
        analyticsReporting?: boolean
        experiments?: boolean
        qualityScanning?: boolean
      }
    }
  }
  const configured = settings.adminExperience?.optionalCapabilities
  const siteIDs = (
    (req.user as unknown as { adminSites?: Array<string | { id?: string | number }> } | undefined)
      ?.adminSites ?? []
  ).map((site) => String(typeof site === 'object' ? site.id : site))
  const siteId = new URLSearchParams(req.url?.split('?')[1] ?? '').get('siteId') ?? undefined
  const activeSiteID =
    siteId ?? (req.user?.role === 'staff' && siteIDs.length === 1 ? siteIDs[0] : undefined)
  if (
    req.user?.role === 'staff' &&
    (!activeSiteID || !canManageAdminSite(req.user, activeSiteID))
  ) {
    return (
      <main className="gutter--left gutter--right">
        <h1>Capability Center</h1>
        <p>Select an assigned site to view its capability state.</p>
      </main>
    )
  }
  const enabled: Record<string, boolean> = {
    'media.processing': configured?.mediaProcessing ?? false,
    'social.distribution': configured?.socialDistribution ?? false,
    'audience.transactional-email': configured?.transactionalEmail ?? false,
    'commerce.checkout': configured?.commerceCheckout ?? false,
    'analytics.reporting': configured?.analyticsReporting ?? false,
    'experiences.experiments': configured?.experiments ?? false,
    'quality.scanning': configured?.qualityScanning ?? false,
    'networking.federation': config.networking.enabled,
  }
  const capabilities = new CapabilityLifecycleService({
    profile: 'Standard',
    coreVersion: config.version,
    schemaVersion: '1.0.0',
    evidence: Object.fromEntries(
      diagnostics.capabilities.map((item) => [
        item.key,
        { enabled: enabled[item.key] ?? item.required },
      ]),
    ),
    workers: Object.fromEntries(
      diagnostics.capabilities
        .filter((item) => item.reason?.code === 'worker_unavailable')
        .map((item) => [item.key, 'unavailable']),
    ),
  }).read()

  return (
    <main className="gutter--left gutter--right" style={{ maxWidth: 1180, margin: '0 auto' }}>
      <h1>Capability Center</h1>
      <ThemeCenter />
      <p>
        Core publishing stays focused. Optional systems remain installed and can be enabled here
        without removing their records.
      </p>
      <p>
        <Link
          href={`/admin/globals/site-settings${activeSiteID ? `?siteId=${encodeURIComponent(activeSiteID)}` : ''}`}
        >
          Configure optional capabilities
        </Link>{' '}
        · <Link href="#operational-overview">Operational overview</Link>
      </p>
      <section style={{ marginTop: 28 }} aria-labelledby="runtime-identity-heading">
        <h2 id="runtime-identity-heading">Runtime Identity and Deployment Profile</h2>
        <p role="note">
          These values come from the running application and migration ledger. Missing build or
          backup evidence is shown as unavailable and is not inferred from source code.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            marginTop: 12,
          }}
        >
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>Application & Profile</h3>
            <p style={{ margin: '4px 0' }}>
              <strong>Version:</strong> {diagnostics.version.app}
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>Deployment Profile:</strong>{' '}
              <strong className="status neutral">
                {diagnostics.version.deploymentProfile ?? 'Standard'}
              </strong>
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>Module Profile:</strong> {diagnostics.runtime.moduleProfile}
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>Job Backend:</strong> {diagnostics.runtime.jobBackend}
            </p>
            <p style={{ margin: '4px 0', fontSize: '0.8125rem' }}>
              <strong>Media Storage:</strong> {diagnostics.mediaStorage.driver} —{' '}
              {diagnostics.mediaStorage.status}
            </p>
            <p style={{ margin: '4px 0', fontSize: '0.8125rem' }}>
              <strong>Media Storage:</strong> {diagnostics.mediaStorage.driver} —{' '}
              {diagnostics.mediaStorage.status}
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>Schema Version:</strong> {diagnostics.version.schemaVersion ?? '1.0.0'}
            </p>
            <p style={{ margin: '4px 0', fontSize: '0.8125rem', color: '#d4d4d8' }}>
              <strong>Build SHA:</strong>{' '}
              <code>{diagnostics.version.buildSha ?? 'Unavailable (not injected at build)'}</code>
            </p>
            <p style={{ fontSize: '0.8125rem', marginTop: 8, color: '#d4d4d8' }}>
              {diagnostics.runtime.moduleProfile === 'floor'
                ? 'Only the required module floor is registered.'
                : `Registered module profile: ${diagnostics.runtime.moduleProfile}. Use observed capability and worker states below to determine availability.`}
            </p>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>Database & Migrations</h3>
            <p style={{ margin: '4px 0' }}>
              <strong>Status:</strong>{' '}
              <strong
                className={`status ${statusClass(diagnostics.migrations.status === 'current' ? 'healthy' : 'degraded')}`}
              >
                {diagnostics.migrations.status.toUpperCase()}
              </strong>
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>Applied Migrations:</strong>{' '}
              {diagnostics.migrations.status === 'unavailable'
                ? 'Unavailable'
                : `${diagnostics.migrations.applied} of ${diagnostics.migrations.expected}`}
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>Database Health:</strong>{' '}
              <strong className={`status ${statusClass(diagnostics.database.status)}`}>
                {diagnostics.database.status}
              </strong>
            </p>
            {diagnostics.migrations.missing.length > 0 ? (
              <div
                style={{
                  marginTop: 8,
                  padding: 8,
                  backgroundColor: '#fef2f2',
                  border: '1px solid #f87171',
                  borderRadius: 4,
                  color: '#991b1b',
                  fontSize: '0.8125rem',
                }}
              >
                <strong>Condition:</strong> {diagnostics.migrations.missing.length} unapplied
                migration(s): {diagnostics.migrations.missing.slice(0, 3).join(', ')}
                {diagnostics.migrations.missing.length > 3 ? '...' : ''}.<br />
                <strong>Next Action:</strong> Run <code>npm run db:migrate</code> or{' '}
                <code>npm run db:status</code> in the host terminal.
              </div>
            ) : (
              <p role="status" style={{ fontSize: '0.8125rem', marginTop: 8 }}>
                {diagnostics.migrations.status === 'current'
                  ? 'All migrations registered in this build are applied.'
                  : 'Migration state could not be verified. Run npm.cmd run db:status and check database connectivity.'}
              </p>
            )}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>Worker & Job Queues</h3>
            <p style={{ margin: '4px 0' }}>
              <strong>Worker Process:</strong>{' '}
              <strong className={`status ${statusClass(diagnostics.worker.status)}`}>
                {diagnostics.worker.status.toUpperCase()}
              </strong>
            </p>
            <p style={{ margin: '4px 0', fontSize: '0.8125rem' }}>
              <strong>Heartbeat:</strong>{' '}
              {diagnostics.worker.ageMs !== null
                ? `${Math.round(diagnostics.worker.ageMs / 1000)}s ago`
                : 'No heartbeat recorded'}
            </p>
            <p style={{ margin: '4px 0', fontSize: '0.8125rem' }}>
              <strong>Job Counts:</strong> {diagnostics.jobs.queued} queued,{' '}
              {diagnostics.jobs.running} running, {diagnostics.jobs.failed} failed.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                marginTop: 8,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  padding: 6,
                  background: 'var(--theme-elevation-100, #27272a)',
                  borderRadius: 4,
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Queued</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 'bold' }}>
                  {diagnostics.jobs.queued}
                </div>
              </div>
              <div
                style={{
                  padding: 6,
                  background: 'var(--theme-elevation-100, #27272a)',
                  borderRadius: 4,
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Running</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 'bold' }}>
                  {diagnostics.jobs.running}
                </div>
              </div>
              <div
                style={{
                  padding: 6,
                  background: 'var(--theme-elevation-100, #27272a)',
                  borderRadius: 4,
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Failed</div>
                <div
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: 'bold',
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
                  marginTop: 8,
                  padding: 8,
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 4,
                  color: '#92400e',
                  fontSize: '0.75rem',
                }}
              >
                <strong>Condition:</strong> Worker process heartbeat absent (&gt;45s).
                <br />
                <strong>Next Action:</strong> Run <code>npm run jobs:worker</code> or verify Docker
                container <code>renegade-worker</code>.
              </div>
            )}
          </div>
        </div>

        {diagnostics.jobs.recentFailures.length > 0 && (
          <div className="card" style={{ marginTop: 16, padding: 16 }}>
            <h3 style={{ fontSize: '1rem', color: '#ef4444', marginBottom: 8 }}>
              Recent Job Failures ({diagnostics.jobs.recentFailures.length})
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
                <caption className="sr-only">
                  Recent failed background jobs, condition, and next action
                </caption>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--theme-elevation-200, #3f3f46)',
                      textAlign: 'left',
                    }}
                  >
                    <th style={{ padding: '6px 8px' }}>Task</th>
                    <th style={{ padding: '6px 8px' }}>Attempts</th>
                    <th style={{ padding: '6px 8px' }}>Failed At</th>
                    <th style={{ padding: '6px 8px' }}>Condition</th>
                    <th style={{ padding: '6px 8px' }}>Next Action</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostics.jobs.recentFailures.slice(0, 5).map((f) => (
                    <tr
                      key={f.id}
                      style={{ borderBottom: '1px solid var(--theme-elevation-150, #27272a)' }}
                    >
                      <td style={{ padding: '6px 8px' }}>
                        <code>{f.taskName}</code>
                      </td>
                      <td style={{ padding: '6px 8px' }}>{f.attemptCount}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {f.timestamps.completedAt ?? f.timestamps.updatedAt ?? 'N/A'}
                      </td>
                      <td
                        style={{
                          padding: '6px 8px',
                          maxWidth: 260,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {f.error ?? 'Unspecified worker error'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <Link href={`/admin/collections/payload-jobs/${encodeURIComponent(f.id)}`}>
                          Inspect in admin
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section style={{ marginTop: 28 }} aria-labelledby="backup-governance-heading">
        <h2 id="backup-governance-heading">
          Operational Backup Coverage & Isolated Restore Instructions
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
            marginTop: 12,
          }}
        >
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>Backup Coverage Scope</h3>
            <p style={{ margin: '4px 0' }}>
              <strong>Status:</strong>{' '}
              <strong className={`status ${statusClass(diagnostics.backup.status)}`}>
                {diagnostics.backup.status.toUpperCase()}
              </strong>
            </p>
            <p style={{ margin: '4px 0', fontSize: '0.8125rem' }}>
              <strong>Last Archive Check Recorded:</strong>{' '}
              {diagnostics.backup.lastSuccessfulAt ?? 'None recorded on this host'}
            </p>
            {diagnostics.backup.archive ? (
              <p role="status" style={{ margin: '4px 0', fontSize: '0.8125rem' }}>
                <strong>
                  {diagnostics.backup.verified
                    ? 'Archive checksum-verified at backup time'
                    : 'Archive metadata recorded'}
                  :
                </strong>{' '}
                {diagnostics.backup.archive.createdAt}; {diagnostics.backup.archive.files} files,{' '}
                {diagnostics.backup.archive.bytes} bytes.{' '}
                <code>{diagnostics.backup.archive.path}</code>
              </p>
            ) : (
              <p role="status" style={{ margin: '4px 0', fontSize: '0.8125rem' }}>
                No verified archive is recorded in this installation. Run the backup command below
                and retain its output directory; this status does not confirm that an archive
                exists.
              </p>
            )}
            {diagnostics.backup.lastFailureAt && (
              <p style={{ margin: '4px 0', fontSize: '0.8125rem', color: '#ef4444' }}>
                <strong>Last Failure:</strong> {diagnostics.backup.lastFailureAt}
              </p>
            )}

            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: '0.8125rem' }}>
                Included Data (Comprehensive Archive):
              </strong>
              <ul
                style={{
                  margin: '4px 0 10px 18px',
                  padding: 0,
                  fontSize: '0.8125rem',
                  color: '#d1d5db',
                }}
              >
                <li>
                  PostgreSQL Relational Dump: <code>database.dump</code> (custom format via{' '}
                  <code>pg_dump -Fc</code>)
                </li>
                <li>
                  Media Library Assets: <code>media.tar.gz</code> (uploads &amp; local derivatives)
                </li>
                <li>
                  Database records including DB extensions, capabilities, site settings, themes,
                  encrypted provider credentials, and user/account data. Environment configuration
                  is summarized without secret values in the manifest.
                </li>
                <li>
                  Checksum Manifest: <code>manifest.json</code> with SHA-256 for all components
                </li>
              </ul>

              <strong style={{ fontSize: '0.8125rem' }}>
                Excluded Data (Security &amp; Cleanliness Boundary):
              </strong>
              <ul
                style={{
                  margin: '4px 0 0 18px',
                  padding: 0,
                  fontSize: '0.8125rem',
                  color: '#9ca3af',
                }}
              >
                <li>
                  Environment files and secret values (including <code>.env</code>,{' '}
                  <code>PAYLOAD_SECRET</code>, database passwords, and API keys); provide separate
                  target configuration during restore.
                </li>
                <li>
                  Ephemeral Upload Sessions: <code>.upload-sessions</code> staging directory
                </li>
                <li>
                  Rebuildable Caches: Next.js build cache, diagnostics status, worker lease locks
                </li>
              </ul>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>
              Lifecycle Commands & Isolated Restore
            </h3>
            <p style={{ fontSize: '0.8125rem', color: '#d4d4d8', marginBottom: 8 }}>
              Operational backups require a confirmed maintenance window to quiesce containers and
              guarantee atomic consistency across DB and media.
            </p>
            <p role="note" style={{ fontSize: '0.8125rem' }}>
              Restore validates checksums, loads the archive only into an isolated empty target,
              checks referential integrity before adding constraints, and refuses unresolved
              references. Repair the source data and create a fresh archive before expecting the
              current restore to complete.
            </p>

            <div
              style={{
                background: 'var(--theme-elevation-100, #18181b)',
                border: '1px solid var(--theme-elevation-200, #27272a)',
                padding: 10,
                borderRadius: 6,
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8' }}>
                1. CREATE OPERATIONAL BACKUP:
              </div>
              <code
                style={{
                  fontSize: '0.75rem',
                  display: 'block',
                  marginTop: 4,
                  whiteSpace: 'pre-wrap',
                }}
              >
                npm.cmd run backup:operational -- --output &lt;dir&gt;
                --maintenance-window-confirmed --manifest-output &lt;path-to-json&gt;
              </code>
            </div>

            <div
              style={{
                background: 'var(--theme-elevation-100, #18181b)',
                border: '1px solid var(--theme-elevation-200, #27272a)',
                padding: 10,
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f59e0b' }}>
                2. ISOLATED RESTORE PROCEDURE:
              </div>
              <p style={{ fontSize: '0.75rem', margin: '4px 0', color: '#d1d5db' }}>
                Restore requires isolated Compose target to prevent overwriting live production:
              </p>
              <code
                style={{
                  fontSize: '0.75rem',
                  display: 'block',
                  marginTop: 4,
                  whiteSpace: 'pre-wrap',
                }}
              >
                npm.cmd run restore:operational -- --archive &lt;backup-dir&gt; --target-version
                &lt;version&gt; --isolated --authorize-restore --env-file .env.restore
              </code>
              <p style={{ fontSize: '0.75rem', margin: '6px 0 2px 0', color: '#a1a1aa' }}>
                Or run an automated zero-risk dry-run rehearsal:
              </p>
              <code style={{ fontSize: '0.75rem', display: 'block', marginTop: 2 }}>
                npm.cmd run restore:rehearsal -- --archive &lt;backup-dir&gt; --target-version
                &lt;version&gt; --source-url &lt;source-url&gt; --restored-url http://127.0.0.1:3300
                --public-path &lt;path&gt; --media-path &lt;media-file-path&gt; --env-file
                .env.restore
              </code>
            </div>

            <ol
              style={{ margin: '10px 0 0 16px', padding: 0, fontSize: '0.75rem', color: '#9ca3af' }}
            >
              <li>
                Verifies SHA-256 component checksums against <code>manifest.json</code>
              </li>
              <li>Requires a fresh isolated Docker Compose target and separate credentials</li>
              <li>
                Provide target environment configuration separately; credentials never enter the
                archive
              </li>
              <li>
                Restores PostgreSQL schema and table data via <code>pg_restore</code>
              </li>
              <li>
                Extracts media assets and checks <code>/health/ready</code>; rehearsal compares
                source and restored HTML and media checksums
              </li>
            </ol>
          </div>
        </div>
      </section>
      <section style={{ marginTop: 28 }}>
        <h2>Capability readiness</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {capabilities
            .filter((item) => !item.required)
            .map((capability) => {
              const item = capabilityRoutes[capability.key]
              if (!item) return null
              const state = capabilityPresentationState(capability)
              return (
                <article key={capability.key} className="card" style={{ padding: 16 }}>
                  <h3>{item.label}</h3>
                  <p>{item.description}</p>
                  <p>
                    {capability.requiresExternalProvider ? 'External provider required. ' : ''}
                    {capability.requiresWorker ? 'Worker-backed. ' : ''}
                  </p>
                  <p>
                    <strong className={`status ${statusClass(state)}`}>{state}</strong>
                  </p>
                  <p>
                    {state === 'disabled' ? (
                      <Link
                        href={`/admin/globals/site-settings${activeSiteID ? `?siteId=${encodeURIComponent(activeSiteID)}` : ''}`}
                      >
                        Enable or configure
                      </Link>
                    ) : (
                      <Link href={item.href}>Open {item.label}</Link>
                    )}
                  </p>
                  {capability.reason ? <small>{capability.reason.detail}</small> : null}
                </article>
              )
            })}
        </div>
      </section>
      <section style={{ marginTop: 32 }}>
        <h2>Further optional tools</h2>
        <p>
          These remain available to authorized operators and are intentionally outside everyday
          publishing navigation.
        </p>
        <p>
          <Link href="/admin/collections/content-releases">Coordinated releases</Link> ·{' '}
          <Link href="/admin/collections/calendar-entries">Calendar operations</Link> ·{' '}
          <Link href="/admin/collections/members">Enterprise identity & federation</Link> ·{' '}
          <Link href="/admin/providers">Connections, AI & providers</Link> ·{' '}
          <Link href="/admin/migration">Legacy Migration</Link> ·{' '}
          <Link href="/admin/security">Security Center</Link>
        </p>
      </section>
      <section style={{ marginTop: 32 }} id="operational-overview">
        <h2>Operational overview</h2>
        <p>Safe status only; credentials and provider secrets are never displayed.</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12,
          }}
        >
          {operationalOverview(diagnostics).map(([label, status]) => (
            <div key={label} className="card" style={{ padding: 14 }}>
              <strong>{label}</strong>
              <br />
              <span className={`status ${statusClass(status)}`}>{status}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
