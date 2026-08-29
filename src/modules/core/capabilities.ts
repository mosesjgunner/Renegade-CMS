import { validateEnable } from '../extensions/registry'
import type { ConnectionRecord, ExtensionManifest, ResourceProfile } from '../extensions/contracts'
import { PROFILE_GUIDANCE } from '../extensions/profiles'

/** A non-secret, derived view of a capability's lifecycle. */
export type CapabilityStatus =
  | 'disabled'
  | 'available'
  | 'configuring'
  | 'healthy'
  | 'degraded'
  | 'misconfigured'
  | 'unavailable'

export type CapabilityReasonCode =
  | 'feature_intentionally_disabled'
  | 'capability_not_installed'
  | 'missing_configuration'
  | 'invalid_configuration'
  | 'missing_provider'
  | 'credential_expired'
  | 'provider_unavailable'
  | 'worker_unavailable'
  | 'dependency_incompatible'
  | 'core_database_unavailable'

export type CapabilityLifecycle = {
  key: string
  domainId: string
  required: boolean
  exists: boolean
  enabled: boolean
  configuration: 'complete' | 'incomplete' | 'invalid' | 'not-required'
  status: CapabilityStatus
  reason: { code: CapabilityReasonCode; detail: string } | null
}

export type CapabilityDefinition = {
  key: string
  domainId: string
  required: boolean
  configurationRequired?: boolean
  providerCapability?: string
  requiresWorker?: boolean
}

/**
 * Maps registered optional domains to the capabilities they expose. This is a
 * catalog, not feature-flag state: canonical settings and connection health are
 * supplied as evidence to the read model.
 */
export const CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] = [
  { key: 'core.publishing', domainId: 'core', required: true },
  { key: 'media.processing', domainId: 'media', required: false, requiresWorker: true },
  {
    key: 'social.distribution',
    domainId: 'social',
    required: false,
    providerCapability: 'social.publish.text',
    requiresWorker: true,
  },
  {
    key: 'audience.transactional-email',
    domainId: 'audience',
    required: false,
    providerCapability: 'email.transactional',
  },
  {
    key: 'commerce.checkout',
    domainId: 'commerce',
    required: false,
    providerCapability: 'payments.checkout.one_time',
  },
  { key: 'analytics.reporting', domainId: 'analytics', required: false },
  { key: 'experiences.experiments', domainId: 'experiences', required: false },
  { key: 'quality.scanning', domainId: 'quality', required: false, requiresWorker: true },
]

export type CapabilityEvidence = {
  exists?: boolean
  enabled?: boolean
  configuration?: 'complete' | 'incomplete' | 'invalid'
  /** Operational evidence is read here, never persisted here. */
  health?: 'healthy' | 'degraded' | 'unavailable'
}

export type CapabilityLifecycleSource = {
  profile: ResourceProfile
  coreVersion: string
  schemaVersion: string
  manifests?: readonly ExtensionManifest[]
  connections?: readonly ConnectionRecord[]
  evidence?: Readonly<Record<string, CapabilityEvidence>>
  workers?: Readonly<Record<string, 'healthy' | 'unavailable'>>
  definitions?: readonly CapabilityDefinition[]
}

const reason = (code: CapabilityReasonCode, detail: string) => ({ code, detail })

const activeProvider = (connection: ConnectionRecord, capability: string, now: string) =>
  connection.status === 'active' &&
  (!connection.expiresAt || connection.expiresAt > now) &&
  connection.capabilities.some((item) => item.key === capability && item.support === 'supported')

/** Stable read-only lifecycle service for operations diagnostics and admin UI. */
export class CapabilityLifecycleService {
  constructor(private readonly source: CapabilityLifecycleSource) {}

  read(now = new Date().toISOString()): readonly CapabilityLifecycle[] {
    return (this.source.definitions ?? CAPABILITY_DEFINITIONS).map((definition) =>
      this.evaluate(definition, now),
    )
  }

  readiness(now = new Date().toISOString()) {
    const capabilities = this.read(now)
    const blocking = capabilities.filter(
      (capability) => capability.required && !['healthy', 'available'].includes(capability.status),
    )
    return { status: blocking.length ? 'not_ready' : 'ready', capabilities, blocking }
  }

  private evaluate(definition: CapabilityDefinition, now: string): CapabilityLifecycle {
    const evidence = this.source.evidence?.[definition.key] ?? {}
    const exists = evidence.exists ?? true
    const enabled = evidence.enabled ?? true
    const configuration: CapabilityLifecycle['configuration'] = definition.configurationRequired
      ? (evidence.configuration ?? 'incomplete')
      : (evidence.configuration ?? 'not-required')
    const base = { ...definition, exists, enabled, configuration }

    if (!exists)
      return {
        ...base,
        status: 'unavailable',
        reason: reason('capability_not_installed', 'Capability is not installed.'),
      }
    if (!enabled)
      return {
        ...base,
        status: 'disabled',
        reason: reason('feature_intentionally_disabled', 'Feature is intentionally disabled.'),
      }
    if (configuration === 'invalid')
      return {
        ...base,
        status: 'misconfigured',
        reason: reason('invalid_configuration', 'Configuration is invalid.'),
      }
    if (configuration === 'incomplete')
      return {
        ...base,
        status: 'configuring',
        reason: reason('missing_configuration', 'Required configuration is missing.'),
      }

    const manifests = this.source.manifests ?? []
    const incompatible = manifests.some(
      (manifest) =>
        manifest.provides.includes(definition.providerCapability as never) &&
        validateEnable(manifest, manifests, this.source.coreVersion, this.source.schemaVersion)
          .length,
    )
    if (incompatible)
      return {
        ...base,
        status: 'misconfigured',
        reason: reason('dependency_incompatible', 'An extension dependency is incompatible.'),
      }

    if (definition.requiresWorker && this.source.workers?.[definition.key] === 'unavailable')
      return {
        ...base,
        status: 'degraded',
        reason: reason('worker_unavailable', 'Required worker is unavailable.'),
      }
    if (definition.requiresWorker && !PROFILE_GUIDANCE[this.source.profile].allowedHeavyWork)
      return { ...base, status: 'available', reason: null }

    if (definition.providerCapability) {
      const providers = (this.source.connections ?? []).filter((connection) =>
        connection.capabilities.some((item) => item.key === definition.providerCapability),
      )
      if (!providers.length)
        return {
          ...base,
          status: 'unavailable',
          reason: reason('missing_provider', 'No provider supports this capability.'),
        }
      if (
        providers.some(
          (connection) =>
            connection.status === 'expired' || connection.lastError?.code === 'expired_credentials',
        )
      )
        return {
          ...base,
          status: 'degraded',
          reason: reason('credential_expired', 'Provider credentials have expired.'),
        }
      if (
        !providers.some((connection) =>
          activeProvider(connection, definition.providerCapability!, now),
        )
      )
        return {
          ...base,
          status: 'degraded',
          reason: reason('provider_unavailable', 'Configured provider is unavailable.'),
        }
    }

    if (evidence.health === 'unavailable')
      return {
        ...base,
        status: 'unavailable',
        reason: reason('core_database_unavailable', 'Required core database is unavailable.'),
      }
    if (evidence.health === 'degraded')
      return {
        ...base,
        status: 'degraded',
        reason: reason('provider_unavailable', 'Dependency is degraded.'),
      }
    return {
      ...base,
      status:
        definition.providerCapability || evidence.health === 'healthy' ? 'healthy' : 'available',
      reason: null,
    }
  }
}
