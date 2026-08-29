import { describe, expect, it } from 'vitest'

import {
  AgentToolRuntime,
  RENEGRADE_TOOL_MANIFESTS,
} from '../../src/modules/extensions/agent-runtime'
import {
  developmentEmailAdapter,
  localFilesystemAdapter,
} from '../../src/modules/extensions/reference-adapters'
import {
  CapabilityRegistry,
  testConnection,
  validateExtensionManifest,
  validateEnable,
} from '../../src/modules/extensions/registry'
import type { ConnectionRecord, ExtensionManifest } from '../../src/modules/extensions/contracts'
import { PROFILE_GUIDANCE, recommendProfile } from '../../src/modules/extensions/profiles'

const manifest = (key: `${string}.${string}`, core = '^0.1.0'): ExtensionManifest => ({
  key,
  version: '1.0.0',
  family: 'module',
  compatibleCore: core,
  compatibleSchema: '^1.0.0',
  dependencies: [],
  conflicts: [],
  provides: [],
  requires: [],
  permissions: [],
  configSchema: { version: 1, jsonSchema: {} },
  migrations: { owner: key, versions: [] },
  failureMode: 'degraded',
  dataOwner: key,
  exportOwner: key,
  retention: 'shared-policy-required',
  uninstall: 'retain',
  budget: {
    baseline: 'none',
    peak: 'none',
    separateWorker: false,
    externalProvider: false,
    concurrency: 1,
    degradedMode: 'unavailable',
  },
})
const connection = (
  providerKey: string,
  capability: 'email.transactional' | 'storage.object',
): ConnectionRecord => ({
  id: 'connection-1',
  siteId: 'site-1',
  providerKey,
  externalAccountId: 'development',
  label: 'Development',
  status: 'configured',
  encryptedSecretRef: 'vault://connection-1',
  scopes: [],
  expiresAt: null,
  refreshMetadata: null,
  capabilities: [{ key: capability, support: 'supported', observedAt: '2026-08-24T00:00:00.000Z' }],
  lastHealthCheckAt: null,
  lastError: null,
  auditEventIds: [],
})

describe('extension kernel', () => {
  it('refuses incompatible modules before mutation and preserves unrelated capabilities', () => {
    expect(validateEnable(manifest('example.bad', '^2.0.0'), [], '0.1.0', '1.0.0')).toContain(
      'Extension "example.bad" version "1.0.0" is incompatible with core version "0.1.0"; requested compatibleCore range "^2.0.0" does not include it.',
    )
    expect(
      new CapabilityRegistry([developmentEmailAdapter, localFilesystemAdapter]).has(
        'email.transactional',
        [{ ...connection('email.development', 'email.transactional'), status: 'active' }],
        '2026-08-24T00:00:00.000Z',
      ),
    ).toBe(true)
  })
  it('tests and uses a reference adapter purely through its capability', async () => {
    const tested = await testConnection(
      developmentEmailAdapter,
      connection('email.development', 'email.transactional'),
      '2026-08-24T00:00:00.000Z',
    )
    expect(tested.status).toBe('active')
    expect(
      await developmentEmailAdapter.execute(
        {
          capability: 'email.transactional',
          payload: { idempotencyKey: 'a' },
          idempotencyKey: 'a',
        },
        tested,
      ),
    ).toMatchObject({ accepted: true })
    expect(
      new CapabilityRegistry([developmentEmailAdapter]).has(
        'email.transactional',
        [{ ...tested, status: 'disabled' }],
        '2026-08-24T00:00:00.000Z',
      ),
    ).toBe(false)
  })
  it('redacts credentials and isolates a failed provider', async () => {
    const broken = {
      ...developmentEmailAdapter,
      test: async () => {
        throw new Error('token=super-secret expired')
      },
    }
    const tested = await testConnection(
      broken,
      connection('email.development', 'email.transactional'),
      '2026-08-24T00:00:00.000Z',
    )
    expect(tested.status).toBe('invalid')
    expect(tested.lastError?.message).toContain('[REDACTED]')
  })
  it('proposes draft changes, pauses dangerous tools, and audits denials', async () => {
    const runtime = new AgentToolRuntime({
      'content.draft.propose_change': {
        manifest: RENEGRADE_TOOL_MANIFESTS[1],
        execute: async (input) => ({ proposal: input }),
      },
      'payments.refund': { manifest: RENEGRADE_TOOL_MANIFESTS[2], execute: async () => ({}) },
    })
    const initial = { id: 'run-1', agentId: 'agent-1', status: 'running' as const, toolCalls: [] }
    expect(
      (
        await runtime.invoke(initial, 'content.draft.propose_change', { id: 'draft-1' }, [
          'content.draft.propose',
        ])
      ).run.status,
    ).toBe('completed')
    expect(
      (
        await runtime.invoke(initial, 'payments.refund', { orderId: 'order-1' }, [
          'payments.refund',
        ])
      ).approval?.status,
    ).toBe('pending')
    expect((await runtime.invoke(initial, 'payments.refund', {}, [])).run.status).toBe('denied')
  })
  it('guides constrained hosts to Lean without altering canonical data', () => {
    expect(recommendProfile(1024)).toBe('Lean')
    expect(PROFILE_GUIDANCE.Lean.allowedHeavyWork).toBe(false)
  })
  it('uses standards-compliant semver ranges, including 0.x caret semantics', () => {
    expect(validateEnable(manifest('example.range', '1.4.2'), [], '1.4.2', '1.0.0')).toEqual([])
    expect(validateEnable(manifest('example.range', '1.4.2'), [], '1.4.3', '1.0.0')).not.toEqual([])
    expect(validateEnable(manifest('example.range', '^0.1.0'), [], '0.1.5', '1.0.0')).toEqual([])
    expect(validateEnable(manifest('example.range', '^0.2.0'), [], '0.1.5', '1.0.0')).not.toEqual(
      [],
    )
    expect(validateEnable(manifest('example.range', '^0.1.0'), [], '0.2.0', '1.0.0')).not.toEqual(
      [],
    )
    expect(validateEnable(manifest('example.range', '^1.2.0'), [], '1.4.2', '1.0.0')).toEqual([])
    expect(validateEnable(manifest('example.range', '^1.2.0'), [], '2.0.0', '1.0.0')).not.toEqual(
      [],
    )
    expect(validateEnable(manifest('example.range', '~1.4.0'), [], '1.4.9', '1.0.0')).toEqual([])
    expect(validateEnable(manifest('example.range', '~1.4.0'), [], '1.5.0', '1.0.0')).not.toEqual(
      [],
    )
    expect(
      validateEnable(manifest('example.range', '>=1.2.0 <2.0.0'), [], '1.9.9', '1.0.0'),
    ).toEqual([])
    expect(
      validateEnable(manifest('example.range', '>=1.2.0 <2.0.0'), [], '2.0.0', '1.0.0'),
    ).not.toEqual([])
    expect(validateEnable(manifest('example.range', '>=1.2.0'), [], '1.2.0', '1.0.0')).toEqual([])
    expect(validateEnable(manifest('example.range', '*'), [], '99.0.0', '1.0.0')).toEqual([])
  })
  it('rejects prereleases unless a manifest explicitly includes a prerelease comparator', () => {
    expect(
      validateEnable(manifest('example.stable', '^1.0.0'), [], '1.1.0-beta.1', '1.0.0'),
    ).not.toEqual([])
    expect(
      validateEnable(
        manifest('example.preview', '>=1.0.0-beta.1 <1.0.0'),
        [],
        '1.0.0-beta.2',
        '1.0.0',
      ),
    ).toEqual([])
  })
  it('rejects malformed manifest versions and ranges before compatibility activation', () => {
    expect(
      validateExtensionManifest({ ...manifest('example.invalid'), version: 'not-a-version' }),
    ).toContain(
      'Extension "example.invalid" version "not-a-version" has an invalid extension version; expected a valid semantic version.',
    )
    expect(
      validateExtensionManifest({ ...manifest('example.invalid'), compatibleCore: 'not-a-range' }),
    ).toContain(
      'Extension "example.invalid" version "1.0.0" has an invalid compatibleCore range "not-a-range".',
    )
    expect(
      validateEnable(
        { ...manifest('example.invalid'), compatibleSchema: 'not-a-range' },
        [],
        '1.0.0',
        '1.0.0',
      ),
    ).toContain(
      'Extension "example.invalid" version "1.0.0" has an invalid compatibleSchema range "not-a-range".',
    )
  })
  it('preserves dependency and conflict validation after manifest validation', () => {
    expect(
      validateEnable(
        { ...manifest('example.child'), dependencies: ['example.parent'] },
        [],
        '0.1.0',
        '1.0.0',
      ),
    ).toContain('missing dependency: example.parent')
    expect(
      validateEnable(
        { ...manifest('example.child'), conflicts: ['example.conflict'] },
        [manifest('example.conflict')],
        '0.1.0',
        '1.0.0',
      ),
    ).toContain('conflict: example.conflict')
  })
})
