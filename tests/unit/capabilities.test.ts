import { describe, expect, it } from 'vitest'

import { CapabilityLifecycleService } from '../../src/modules/core/capabilities'
import type { CapabilityLifecycleSource } from '../../src/modules/core/capabilities'
import type { ConnectionRecord, ProviderContract } from '../../src/modules/extensions/contracts'

const connection = (status: ConnectionRecord['status'] = 'active'): ConnectionRecord => ({
  id: 'email-1',
  siteId: 'site-1',
  providerKey: 'email.example',
  externalAccountId: 'one',
  label: 'Email',
  status,
  encryptedSecretRef: 'vault://email-1',
  scopes: [],
  expiresAt: null,
  refreshMetadata: null,
  capabilities: [
    { key: 'email.transactional', support: 'supported', observedAt: '2026-08-28T00:00:00.000Z' },
  ],
  lastHealthCheckAt: '2026-08-28T00:00:00.000Z',
  lastError: null,
  auditEventIds: [],
})
const manifest = (core = '^0.1.0'): ProviderContract => ({
  key: 'email.example',
  version: '1.0.0',
  family: 'provider',
  compatibleCore: core,
  compatibleSchema: '^1.0.0',
  dependencies: [],
  conflicts: [],
  provides: ['email.transactional'],
  requires: [],
  permissions: [],
  configSchema: { version: 1, jsonSchema: {} },
  migrations: { owner: 'email.example', versions: [] },
  failureMode: 'degraded',
  dataOwner: 'renegade',
  exportOwner: 'renegade',
  retention: 'shared-policy-required',
  uninstall: 'retain',
  budget: {
    baseline: 'none',
    peak: 'none',
    separateWorker: false,
    externalProvider: true,
    concurrency: 1,
    degradedMode: 'retry',
  },
  group: 'Email',
  contractVersion: 1,
  authorization: { modes: [], minimumScopes: [] },
  rateLimits: { idempotency: 'supported' },
  ownership: { canonicalData: 'renegade', remoteData: 'provider', portability: 'portable' },
  disconnect: { revokeRemote: false, preserveCanonicalData: true, callbackOwner: 'email.example' },
})
type LifecycleOverrides = Omit<
  CapabilityLifecycleSource,
  'profile' | 'coreVersion' | 'schemaVersion'
>
const lifecycle = (overrides: LifecycleOverrides = {}) =>
  new CapabilityLifecycleService({
    profile: 'Standard',
    coreVersion: '0.1.0',
    schemaVersion: '1.0.0',
    ...overrides,
  })

describe('capability lifecycle', () => {
  it('reports disabled capability with a deterministic reason', () => {
    const item = lifecycle({
      definitions: [{ key: 'optional', domainId: 'social', required: false }],
      evidence: { optional: { enabled: false } },
    }).read()[0]
    expect(item).toMatchObject({
      status: 'disabled',
      reason: { code: 'feature_intentionally_disabled' },
    })
  })
  it('reports configured provider capability as healthy', () => {
    const item = lifecycle({
      definitions: [
        {
          key: 'email',
          domainId: 'audience',
          required: false,
          providerCapability: 'email.transactional',
        },
      ],
      connections: [connection()],
      manifests: [manifest()],
      evidence: { email: { enabled: true } },
    }).read()[0]
    expect(item.status).toBe('healthy')
  })
  it('reports missing required configuration without exposing configuration values', () => {
    const item = lifecycle({
      definitions: [
        { key: 'optional', domainId: 'social', required: false, configurationRequired: true },
      ],
      evidence: { optional: { enabled: true } },
    }).read()[0]
    expect(item).toMatchObject({ status: 'configuring', reason: { code: 'missing_configuration' } })
  })
  it('keeps an unhealthy optional provider distinct from readiness', () => {
    const service = lifecycle({
      definitions: [
        {
          key: 'email',
          domainId: 'audience',
          required: false,
          providerCapability: 'email.transactional',
        },
        { key: 'core.publishing', domainId: 'core', required: true },
      ],
      connections: [connection('invalid')],
      evidence: { email: { enabled: true } },
    })
    expect(service.read()[0]).toMatchObject({
      status: 'degraded',
      reason: { code: 'provider_unavailable' },
    })
    expect(service.readiness().status).toBe('ready')
  })
  it('reports incompatible extensions deterministically', () => {
    const item = lifecycle({
      definitions: [
        {
          key: 'email',
          domainId: 'audience',
          required: false,
          providerCapability: 'email.transactional',
        },
      ],
      connections: [connection()],
      manifests: [manifest('^2.0.0')],
      evidence: { email: { enabled: true } },
    }).read()[0]
    expect(item).toMatchObject({
      status: 'misconfigured',
      reason: { code: 'dependency_incompatible' },
    })
  })
  it('recovers from degraded to healthy when provider health recovers', () => {
    const source = {
      definitions: [
        {
          key: 'email',
          domainId: 'audience',
          required: false,
          providerCapability: 'email.transactional',
        },
      ],
      connections: [connection('invalid')],
      evidence: { email: { enabled: true } },
    }
    expect(lifecycle(source).read()[0].status).toBe('degraded')
    expect(lifecycle({ ...source, connections: [connection()] }).read()[0].status).toBe('healthy')
  })
  it('reports an unavailable worker as a deterministic optional degradation', () => {
    const item = lifecycle({
      definitions: [
        { key: 'media.processing', domainId: 'media', required: false, requiresWorker: true },
      ],
      workers: { 'media.processing': 'unavailable' },
      evidence: { 'media.processing': { enabled: true } },
    }).read()[0]
    expect(item).toMatchObject({
      status: 'degraded',
      readiness: 'degraded',
      requiresWorker: true,
      reason: { code: 'worker_unavailable' },
    })
  })
  it('keeps the canonical registry discoverable without activating optional capabilities', () => {
    const items = lifecycle().read()
    expect(items.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'core.publishing',
        'editorial.workflow',
        'media.processing',
        'audience.transactional-email',
        'social.distribution',
        'commerce.checkout',
        'ai.assistance',
        'analytics.reporting',
        'experiences.experiments',
        'quality.scanning',
        'portability.import-export',
        'extensions.connections',
        'networking.federation',
        'collaboration.realtime',
      ]),
    )
    expect(items.find((item) => item.key === 'media.processing')).toMatchObject({
      status: 'disabled',
      readiness: 'disabled',
    })
  })
  it('distinguishes a missing provider credential from provider degradation', () => {
    const item = lifecycle({
      definitions: [
        { key: 'ai', domainId: 'ai', required: false, providerCapability: 'ai.text.rewrite' },
      ],
      evidence: { ai: { enabled: true } },
    }).read()[0]
    expect(item).toMatchObject({ readiness: 'credential-required', requiresExternalProvider: true })
  })
  it('keeps lean installations from activating heavy worker work while standard reports a healthy worker', () => {
    const definitions = [{ key: 'media', domainId: 'media', required: false, requiresWorker: true }]
    expect(
      new CapabilityLifecycleService({
        profile: 'Lean',
        coreVersion: '0.1.0',
        schemaVersion: '1.0.0',
        definitions,
        evidence: { media: { enabled: true } },
      }).read()[0],
    ).toMatchObject({ status: 'available', readiness: 'available' })
    expect(
      lifecycle({
        definitions,
        evidence: { media: { enabled: true } },
        workers: { media: 'healthy' },
      }).read()[0],
    ).toMatchObject({ status: 'healthy', readiness: 'enabled' })
  })
  it('blocks readiness when required core publishing loses its database dependency', () => {
    const service = lifecycle({
      definitions: [{ key: 'core.publishing', domainId: 'core', required: true }],
      evidence: { 'core.publishing': { health: 'unavailable' } },
    })
    expect(service.readiness()).toMatchObject({
      status: 'not_ready',
      blocking: [{ reason: { code: 'core_database_unavailable' } }],
    })
  })
})
