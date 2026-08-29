import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import { CapabilityLifecycleService } from '../core/capabilities'
import { loadConfig } from '../core/config'
import { migrations } from '../../migrations'
import { buildOperationsDiagnostics, isOperator } from '../operations/diagnostics'
import { capabilityPresentationState, operationalOverview } from './progressive-disclosure'

const capabilityRoutes: Record<string, { label: string; href: string; description: string }> = {
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
  const enabled: Record<string, boolean> = {
    'media.processing': configured?.mediaProcessing ?? false,
    'social.distribution': configured?.socialDistribution ?? false,
    'audience.transactional-email': configured?.transactionalEmail ?? false,
    'commerce.checkout': configured?.commerceCheckout ?? false,
    'analytics.reporting': configured?.analyticsReporting ?? false,
    'experiences.experiments': configured?.experiments ?? false,
    'quality.scanning': configured?.qualityScanning ?? false,
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
      <p>
        Core publishing stays focused. Optional systems remain installed and can be enabled here
        without removing their records.
      </p>
      <p>
        <Link href="/admin/globals/site-settings">Configure optional capabilities</Link> ·{' '}
        <Link href="/admin/operations">Operational overview</Link>
      </p>
      <section style={{ marginTop: 28 }}>
        <h2>Optional capabilities</h2>
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
                    <strong className={`status ${statusClass(state)}`}>{state}</strong>
                  </p>
                  <p>
                    {state === 'disabled' ? (
                      <Link href="/admin/globals/site-settings">Enable or configure</Link>
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
          <Link href="/connections">Connections, AI & providers</Link>
        </p>
      </section>
      <section style={{ marginTop: 32 }}>
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
