import { access, constants } from 'node:fs/promises'
import { backupStatusFromMedia } from './backup'
import { getMigrations, type Payload } from 'payload'
import { CapabilityLifecycleService, type CapabilityLifecycle } from '../core/capabilities'
import type { AppConfig } from '../core/config'
import { configuredSecretValues, redact } from '../core/logging'
import { selectEmailDeliveryAdapter, type EmailDeliveryHealth } from '../email/delivery'

export const DIAGNOSTICS_MAX_FAILED_JOBS = 25
export const DIAGNOSTICS_MAX_SUPPORT_BUNDLE_BYTES = 64 * 1024
export const DEFAULT_WORKER_HEARTBEAT_MAX_AGE_MS = 45_000
export type DiagnosticStatus = 'healthy' | 'degraded' | 'unhealthy_core'
type Job = {
  id: string
  taskSlug?: string
  createdAt?: string
  updatedAt?: string
  completedAt?: string
  processing?: boolean
  hasError?: boolean
  totalTried?: number
  error?: unknown
  queue?: string
  concurrencyKey?: string
  log?: Array<{ state?: string; error?: unknown }>
}
type ExperimentDiagnostic = { id: string; state?: string }
type ExperimentVariantDiagnostic = {
  experiment?: string | { id?: string }
  isControl?: boolean
  registeredComponent?: string
}
type Provider = {
  id: string
  label?: string
  providerKey?: string
  status?: string
  credentialHealth?: string
  lastVerifiedAt?: string
  updatedAt?: string
}
export type OperationsDiagnostics = {
  generatedAt: string
  status: DiagnosticStatus
  version: { app: string; buildSha: string | null }
  database: { status: 'healthy' | 'unavailable' }
  migrations: {
    status: 'current' | 'behind' | 'unavailable'
    applied: number
    expected: number
    missing: string[]
  }
  web: { status: 'healthy'; observedAt: string }
  worker: { status: 'healthy' | 'unavailable'; observedAt: string | null; ageMs: number | null }
  jobs: {
    queued: number
    running: number
    failed: number
    oldestPendingAt: string | null
    recentFailures: FailedJobDiagnostic[]
  }
  capabilities: readonly CapabilityLifecycle[]
  providers: Array<{
    id: string
    label: string
    providerKey: string
    status: 'healthy' | 'degraded'
    observedAt: string | null
  }>
  quality?: { lastScanAt: string | null; lastScanStatus: string | null; openIssues: number }
  email: EmailDeliveryHealth
  mediaStorage: { status: 'healthy' | 'unavailable'; driver: string }
  backup: {
    status: 'not_configured' | 'healthy' | 'failed'
    lastSuccessfulAt: string | null
    lastFailureAt: string | null
  }
}
export type FailedJobDiagnostic = {
  id: string
  taskName: string
  timestamps: { createdAt: string | null; updatedAt: string | null; completedAt: string | null }
  attemptCount: number
  error: string | null
  correlation: { jobId: string; queue: string | null; idempotencyKey: string | null }
}
export type DiagnosticsDependencies = {
  now?: () => Date
  checkMediaStorage?: () => Promise<void>
  expectedMigrations?: readonly string[]
}
type DiagnosticsPayload = Pick<Payload, 'find' | 'db'>
const docs = (value: unknown) => (value as { docs?: unknown[] }).docs ?? []
const iso = (value: unknown) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null
const safe = (value: unknown) => {
  const result = redact(value, configuredSecretValues())
  return (typeof result === 'string' ? result : JSON.stringify(result)).slice(0, 500)
}
export const isOperator = (user: { role?: string } | null | undefined) => user?.role === 'owner'
export function jobFailureDiagnostic(job: Job): FailedJobDiagnostic {
  const log = [...(job.log ?? [])].reverse().find((entry) => entry.state === 'failed')
  return {
    id: job.id,
    taskName: job.taskSlug ?? 'unknown',
    timestamps: {
      createdAt: iso(job.createdAt),
      updatedAt: iso(job.updatedAt),
      completedAt: iso(job.completedAt),
    },
    attemptCount: job.totalTried ?? 0,
    error: log?.error || job.error ? safe(log?.error ?? job.error) : null,
    correlation: {
      jobId: job.id,
      queue: job.queue ?? null,
      idempotencyKey: job.concurrencyKey ?? null,
    },
  }
}
export async function buildOperationsDiagnostics(
  payload: DiagnosticsPayload,
  config: AppConfig,
  deps: DiagnosticsDependencies = {},
): Promise<OperationsDiagnostics> {
  const now = deps.now?.() ?? new Date()
  const expected = deps.expectedMigrations ?? []
  try {
    const [
      ledger,
      heartbeatResult,
      allResult,
      failedResult,
      socialResult,
      qualityScanResult,
      qualityIssueResult,
      merchantResult,
      experimentResult,
      experimentVariantResult,
    ] = await Promise.all([
      getMigrations({ payload: payload as Payload }),
      payload.find({
        collection: 'payload-jobs',
        where: { taskSlug: { equals: 'operations-heartbeat' } },
        sort: '-completedAt',
        limit: 1,
        depth: 0,
      } as never),
      payload.find({
        collection: 'payload-jobs',
        limit: 250,
        depth: 0,
        sort: 'createdAt',
      } as never),
      payload.find({
        collection: 'payload-jobs',
        where: { hasError: { equals: true } },
        sort: '-updatedAt',
        limit: DIAGNOSTICS_MAX_FAILED_JOBS,
        depth: 0,
      } as never),
      payload.find({ collection: 'social-accounts', limit: 100, depth: 0 } as never),
      payload.find({
        collection: 'quality-scans',
        sort: '-completedAt',
        limit: 1,
        depth: 0,
      } as never),
      payload.find({
        collection: 'quality-issues',
        where: { status: { in: ['open', 'uncertain'] } },
        limit: 1,
        depth: 0,
      } as never),
      payload.find({ collection: 'merchant-connections', limit: 100, depth: 0 } as never),
      payload.find({ collection: 'experiments', limit: 100, depth: 0 } as never),
      payload.find({ collection: 'experiment-variants', limit: 500, depth: 0 } as never),
    ])
    const names = new Set(ledger.existingMigrations.map((item) => item.name))
    const missing = expected.filter((name) => !names.has(name))
    const all = docs(allResult) as Job[]
    const failed = docs(failedResult) as Job[]
    const pending = all.filter((job) => !job.completedAt && !job.hasError)
    const heartbeat = docs(heartbeatResult)[0] as Job | undefined
    const observedAt = iso(heartbeat?.completedAt) ?? iso(heartbeat?.updatedAt)
    const ageMs = observedAt ? now.getTime() - Date.parse(observedAt) : null
    const workerHealthy =
      ageMs !== null &&
      ageMs <=
        Number(process.env.WORKER_HEARTBEAT_MAX_AGE_MS ?? DEFAULT_WORKER_HEARTBEAT_MAX_AGE_MS)
    const providers = [
      ...(docs(socialResult) as Provider[]),
      ...(docs(merchantResult) as Provider[]),
    ].map((item) => ({
      id: item.id,
      label: item.label ?? item.id,
      providerKey: item.providerKey ?? `social.${item.label ?? 'account'}`,
      status: ['degraded', 'disabled', 'expired', 'invalid', 'revoked', 'not-configured'].includes(
        item.status ?? item.credentialHealth ?? '',
      )
        ? ('degraded' as const)
        : ('healthy' as const),
      observedAt: iso(item.lastVerifiedAt) ?? iso(item.updatedAt),
    }))
    const experimentDefinitions = docs(experimentResult) as ExperimentDiagnostic[]
    const experimentVariants = docs(experimentVariantResult) as ExperimentVariantDiagnostic[]
    const runningExperiments = experimentDefinitions.filter((item) => item.state === 'running')
    const invalidExperiments = runningExperiments.filter((experiment) => {
      const variants = experimentVariants.filter(
        (variant) =>
          (typeof variant.experiment === 'string' ? variant.experiment : variant.experiment?.id) ===
          experiment.id,
      )
      return !variants.some((variant) => variant.isControl && variant.registeredComponent)
    })
    const experiments = {
      status: invalidExperiments.length ? ('degraded' as const) : ('healthy' as const),
      running: runningExperiments.length,
      invalid: invalidExperiments.length,
    }
    const email = await selectEmailDeliveryAdapter(config).health()
    let mediaStorage: OperationsDiagnostics['mediaStorage']
    try {
      await (deps.checkMediaStorage ?? (() => access(config.storage.mediaDir, constants.W_OK)))()
      mediaStorage = { status: 'healthy', driver: config.storage.driver }
    } catch {
      mediaStorage = { status: 'unavailable', driver: config.storage.driver }
    }
    const lastScan = docs(qualityScanResult)[0] as
      | { completedAt?: string; status?: string }
      | undefined
    const quality = {
      lastScanAt: iso(lastScan?.completedAt),
      lastScanStatus: lastScan?.status ?? null,
      openIssues: Number((qualityIssueResult as { totalDocs?: number }).totalDocs ?? 0),
    }
    const capabilities = new CapabilityLifecycleService({
      profile: 'Standard',

      coreVersion: config.version,
      schemaVersion: '1.0.0',
      evidence: { 'experiences.experiments': { health: experiments.status } },
      workers: Object.fromEntries(
        ['media.processing', 'social.distribution', 'quality.scanning'].map((key) => [
          key,
          workerHealthy ? 'healthy' : 'unavailable',
        ]),
      ),
    }).read(now.toISOString())
    const degraded =
      !workerHealthy ||
      missing.length > 0 ||
      mediaStorage.status === 'unavailable' ||
      email.status === 'degraded' ||
      providers.some((item) => item.status === 'degraded') ||
      experiments.status === 'degraded'
    return {
      generatedAt: now.toISOString(),
      status: degraded ? 'degraded' : 'healthy',
      version: { app: config.version, buildSha: config.buildSha ?? null },
      database: { status: 'healthy' },
      migrations: {
        status: missing.length ? 'behind' : 'current',
        applied: names.size,
        expected: expected.length,
        missing,
      },
      web: { status: 'healthy', observedAt: now.toISOString() },
      worker: { status: workerHealthy ? 'healthy' : 'unavailable', observedAt, ageMs },
      jobs: {
        queued: pending.filter((job) => !job.processing).length,
        running: pending.filter((job) => job.processing).length,
        failed: failed.length,
        oldestPendingAt: pending[0] ? iso(pending[0].createdAt) : null,
        recentFailures: failed.slice(0, DIAGNOSTICS_MAX_FAILED_JOBS).map(jobFailureDiagnostic),
      },
      capabilities,
      quality,
      providers,
      email,
      mediaStorage,
      backup: backupDiagnostic(await backupStatusFromMedia(config.storage.mediaDir)),
    }
  } catch {
    return {
      generatedAt: now.toISOString(),
      status: 'unhealthy_core',
      version: { app: config.version, buildSha: config.buildSha ?? null },
      database: { status: 'unavailable' },
      migrations: {
        status: 'unavailable',
        applied: 0,
        expected: expected.length,
        missing: [...expected],
      },
      web: { status: 'healthy', observedAt: now.toISOString() },
      worker: { status: 'unavailable', observedAt: null, ageMs: null },
      jobs: { queued: 0, running: 0, failed: 0, oldestPendingAt: null, recentFailures: [] },
      capabilities: [],
      providers: [],
      email: {
        provider: config.email.mode,
        status: config.email.mode === 'disabled' ? 'disabled' : 'degraded',
      },
      mediaStorage: { status: 'unavailable', driver: config.storage.driver },
      backup: { status: 'not_configured', lastSuccessfulAt: null, lastFailureAt: null },
      quality: { lastScanAt: null, lastScanStatus: null, openIssues: 0 },
    }
  }
}
function backupDiagnostic(value: unknown): OperationsDiagnostics['backup'] {
  if (!value || typeof value !== 'object')
    return { status: 'not_configured', lastSuccessfulAt: null, lastFailureAt: null }
  const status = (value as { status?: unknown }).status
  const successful = iso((value as { lastSuccessfulAt?: unknown }).lastSuccessfulAt)
  const failed = iso((value as { lastFailureAt?: unknown }).lastFailureAt)
  return {
    status: status === 'healthy' || status === 'failed' ? status : 'not_configured',
    lastSuccessfulAt: successful,
    lastFailureAt: failed,
  }
}

export function createSupportBundle(diagnostics: OperationsDiagnostics, config: AppConfig) {
  const bundle = redact(
    {
      format: 'renegade-support-bundle/v1',
      generatedAt: diagnostics.generatedAt,
      diagnostics,
      logExcerpts: [],
      configuration: {
        storage: { driver: config.storage.driver },
        email: { mode: config.email.mode, secure: config.email.secure },
        proxyMode: config.proxyMode,
        warnings: config.warnings,
      },
    },
    configuredSecretValues(),
  )
  const text = JSON.stringify(bundle)
  if (text.length <= DIAGNOSTICS_MAX_SUPPORT_BUNDLE_BYTES) return text
  return JSON.stringify({
    format: 'renegade-support-bundle/v1',
    generatedAt: diagnostics.generatedAt,
    truncated: true,
    status: diagnostics.status,
    version: diagnostics.version,
    database: diagnostics.database,
    configuration: {
      storage: { driver: config.storage.driver },
      email: { mode: config.email.mode },
    },
  })
}
