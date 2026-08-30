import type { Capability, Iso8601Instant } from '../core/contracts'
import type { ExtensionManifest, ResourceBudget } from './contracts'
import { validateEnable, validateExtensionManifest } from './registry'

export type ExtensionLifecycleState =
  | 'discovered'
  | 'compatible'
  | 'incompatible'
  | 'installed'
  | 'disabled'
  | 'enabled'
  | 'degraded'
  | 'update-available'
  | 'failed'
export type ExtensionSource = 'local-deployment' | 'trusted-package'
export type ExtensionHealth = { status: 'healthy' | 'degraded' | 'failed'; detail?: string }
export type ExtensionLifecycleHooks = {
  onEnable?: () => Promise<void>
  onDisable?: () => Promise<void>
  health?: () => Promise<ExtensionHealth>
  migrate?: (ownership: ExtensionManifest['migrations']) => Promise<void>
  onUninstall?: (policy: ExtensionManifest['uninstall']) => Promise<void>
}
export type DiscoveredExtension = {
  manifest: ExtensionManifest
  source: ExtensionSource
  trusted: boolean
  restartRequired?: boolean
  hooks?: ExtensionLifecycleHooks
}
export type ExtensionRecord = {
  manifest: ExtensionManifest
  source: ExtensionSource
  state: ExtensionLifecycleState
  diagnostics: readonly string[]
  permissionsReviewed: readonly string[]
  restartRequired: boolean
  health: ExtensionHealth | null
  installedAt: Iso8601Instant | null
  updatedVersion: string | null
}
export type ExtensionLifecycleEnvironment = {
  coreVersion: string
  schemaVersion: string
  grantedPermissions: readonly string[]
  now?: () => Iso8601Instant
}
export type UninstallResult = { removed: boolean; requiredAction: ExtensionManifest['uninstall'] }

/** Server-only coordinator: discovery accepts deployed metadata; it never downloads or dynamically loads code. */
export class ExtensionLifecycleService {
  private readonly discovered = new Map<string, DiscoveredExtension>()
  private readonly state = new Map<string, ExtensionRecord>()
  constructor(private readonly environment: ExtensionLifecycleEnvironment) {}

  discover(candidate: DiscoveredExtension): ExtensionRecord {
    const diagnostics = [
      ...validateExtensionManifest(candidate.manifest),
      ...this.compatibility(candidate.manifest),
    ]
    const record: ExtensionRecord = {
      manifest: candidate.manifest,
      source: candidate.source,
      state: diagnostics.length ? 'incompatible' : 'compatible',
      diagnostics,
      permissionsReviewed: [],
      restartRequired: Boolean(candidate.restartRequired),
      health: null,
      installedAt: null,
      updatedVersion: null,
    }
    this.discovered.set(candidate.manifest.key, candidate)
    this.state.set(candidate.manifest.key, record)
    return record
  }
  reviewPermissions(key: string, approved: readonly string[]): ExtensionRecord {
    const record = this.require(key),
      requested = record.manifest.permissions
    const reviewed = [...new Set(approved.filter((permission) => requested.includes(permission)))]
    const denied = requested
      .filter((permission) => !reviewed.includes(permission))
      .map((permission) => `permission denied: ${permission}`)
    return this.save({
      ...record,
      permissionsReviewed: reviewed,
      diagnostics: [
        ...record.diagnostics.filter((item) => !item.startsWith('permission denied:')),
        ...denied,
      ],
    })
  }
  install(key: string): ExtensionRecord {
    const candidate = this.candidate(key),
      record = this.require(key),
      issues = this.activationIssues(candidate.manifest, false)
    if (!candidate.trusted)
      return this.save({
        ...record,
        state: 'incompatible',
        diagnostics: [
          ...issues,
          'installation refused: executable extensions must be explicitly trusted server deployments.',
        ],
      })
    if (issues.length) return this.save({ ...record, state: 'incompatible', diagnostics: issues })
    return this.save({ ...record, state: 'installed', diagnostics: [], installedAt: this.now() })
  }
  async enable(key: string): Promise<ExtensionRecord> {
    const candidate = this.candidate(key),
      record = this.require(key)
    if (!['installed', 'disabled', 'degraded', 'update-available'].includes(record.state))
      return this.save({
        ...record,
        state: 'failed',
        diagnostics: ['extension must be installed before activation.'],
      })
    const issues = this.activationIssues(candidate.manifest, true)
    if (issues.length) return this.save({ ...record, state: 'disabled', diagnostics: issues })
    try {
      await candidate.hooks?.migrate?.(candidate.manifest.migrations)
      await candidate.hooks?.onEnable?.()
      return this.save({
        ...record,
        state: 'enabled',
        diagnostics: [],
        health: { status: 'healthy' },
      })
    } catch (error) {
      return this.save({
        ...record,
        state: 'failed',
        diagnostics: [`activation failed: ${safeError(error)}`],
        health: { status: 'failed' },
      })
    }
  }
  async disable(key: string): Promise<ExtensionRecord> {
    const candidate = this.candidate(key),
      record = this.require(key)
    try {
      await candidate.hooks?.onDisable?.()
      return this.save({ ...record, state: 'disabled', health: null })
    } catch (error) {
      return this.save({
        ...record,
        state: 'degraded',
        diagnostics: [`disable failed: ${safeError(error)}`],
        health: { status: 'degraded' },
      })
    }
  }
  async checkHealth(key: string): Promise<ExtensionRecord> {
    const candidate = this.candidate(key),
      record = this.require(key)
    if (!['enabled', 'degraded'].includes(record.state)) return record
    try {
      const health = (await candidate.hooks?.health?.()) ?? { status: 'healthy' as const }
      return this.save({
        ...record,
        state: health.status === 'healthy' ? 'enabled' : 'degraded',
        health,
        diagnostics: health.detail ? [health.detail] : [],
      })
    } catch (error) {
      const detail = safeError(error)
      return this.save({
        ...record,
        state: 'degraded',
        health: { status: 'degraded', detail },
        diagnostics: [`health check failed: ${detail}`],
      })
    }
  }
  markUpdateAvailable(key: string, version: string): ExtensionRecord {
    const record = this.require(key)
    return this.save({ ...record, state: 'update-available', updatedVersion: version })
  }
  async uninstall(
    key: string,
    options: { confirmDelete?: boolean; exported?: boolean } = {},
  ): Promise<UninstallResult> {
    const candidate = this.candidate(key),
      record = this.require(key),
      policy = record.manifest.uninstall
    if (record.state === 'enabled') await this.disable(key)
    if (policy === 'delete-confirmed' && !options.confirmDelete)
      throw new Error('Uninstall requires explicit delete confirmation.')
    if (policy === 'export' && !options.exported)
      throw new Error('Uninstall requires a completed export.')
    await candidate.hooks?.onUninstall?.(policy)
    this.state.delete(key)
    this.discovered.delete(key)
    return { removed: true, requiredAction: policy }
  }
  records(): readonly ExtensionRecord[] {
    return [...this.state.values()]
  }
  budget(key: string): ResourceBudget {
    return this.require(key).manifest.budget
  }
  capabilities(key: string): readonly Capability[] {
    return this.require(key).manifest.provides.map((key) => ({
      key,
      support: 'supported',
      observedAt: this.now(),
    }))
  }
  private compatibility(manifest: ExtensionManifest) {
    return validateEnable(
      manifest,
      [],
      this.environment.coreVersion,
      this.environment.schemaVersion,
    ).filter((issue) => !issue.startsWith('missing dependency:'))
  }
  private activationIssues(manifest: ExtensionManifest, enabledDependencies: boolean) {
    const reviewed = this.state.get(manifest.key)?.permissionsReviewed ?? []
    const installed = this.records()
      .filter(
        (record) =>
          record.manifest.key !== manifest.key &&
          !['discovered', 'compatible', 'incompatible'].includes(record.state),
      )
      .map((record) => record.manifest)
    return [
      ...validateEnable(
        manifest,
        installed,
        this.environment.coreVersion,
        this.environment.schemaVersion,
      ),
      ...manifest.permissions
        .filter((permission) => !this.environment.grantedPermissions.includes(permission))
        .map((permission) => `permission denied: ${permission}`),
      ...manifest.permissions
        .filter((permission) => !reviewed.includes(permission))
        .map((permission) => `permission not reviewed: ${permission}`),
      ...(enabledDependencies
        ? manifest.dependencies
            .filter((key) => this.state.get(key)?.state !== 'enabled')
            .map((key) => `dependency not enabled: ${key}`)
        : []),
    ]
  }
  private require(key: string) {
    const record = this.state.get(key)
    if (!record) throw new Error(`Unknown extension: ${key}`)
    return record
  }
  private candidate(key: string) {
    const candidate = this.discovered.get(key)
    if (!candidate) throw new Error(`Unknown extension: ${key}`)
    return candidate
  }
  private save(record: ExtensionRecord) {
    this.state.set(record.manifest.key, record)
    return record
  }
  private now() {
    return (this.environment.now ?? (() => new Date().toISOString()))()
  }
}
const safeError = (error: unknown) =>
  String(error).replace(/(bearer|token|secret|password)[=: ]+[^\s,]+/gi, '$1=[REDACTED]')
