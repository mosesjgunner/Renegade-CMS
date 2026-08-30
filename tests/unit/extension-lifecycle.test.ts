import { describe, expect, it } from 'vitest'
import type { ExtensionManifest } from '../../src/modules/extensions/contracts'
import { ExtensionLifecycleService } from '../../src/modules/extensions/lifecycle'

const manifest = (
  key: `${string}.${string}`,
  overrides: Partial<ExtensionManifest> = {},
): ExtensionManifest => ({
  key,
  version: '1.0.0',
  family: 'module',
  compatibleCore: '^0.1.0',
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
  retention: 'module-owned',
  uninstall: 'retain',
  budget: {
    baseline: 'none',
    peak: 'none',
    separateWorker: false,
    externalProvider: false,
    concurrency: 1,
    degradedMode: 'unavailable',
  },
  ...overrides,
})
const service = (permissions: readonly string[] = []) =>
  new ExtensionLifecycleService({
    coreVersion: '0.1.0',
    schemaVersion: '1.0.0',
    grantedPermissions: permissions,
    now: () => '2026-08-29T00:00:00.000Z',
  })
describe('extension lifecycle', () => {
  it('discovers compatible manifests without loading code and refuses untrusted executable installation', () => {
    const lifecycle = service()
    expect(
      lifecycle.discover({
        manifest: manifest('example.safe'),
        source: 'local-deployment',
        trusted: false,
      }).state,
    ).toBe('compatible')
    expect(lifecycle.install('example.safe').state).toBe('incompatible')
  })
  it('checks compatibility, dependencies, conflicts, and visible permissions before activation', async () => {
    const lifecycle = service(['content.read'])
    lifecycle.discover({
      manifest: manifest('example.parent'),
      source: 'local-deployment',
      trusted: true,
    })
    lifecycle.install('example.parent')
    await lifecycle.enable('example.parent')
    lifecycle.discover({
      manifest: manifest('example.child', {
        dependencies: ['example.parent'],
        permissions: ['content.read'],
      }),
      source: 'local-deployment',
      trusted: true,
    })
    lifecycle.reviewPermissions('example.child', ['content.read'])
    lifecycle.install('example.child')
    expect((await lifecycle.enable('example.child')).state).toBe('enabled')
    lifecycle.discover({
      manifest: manifest('example.conflict', { conflicts: ['example.parent'] }),
      source: 'local-deployment',
      trusted: true,
    })
    expect(lifecycle.install('example.conflict').state).toBe('incompatible')
    lifecycle.discover({
      manifest: manifest('example.incompatible', { compatibleCore: '^2.0.0' }),
      source: 'local-deployment',
      trusted: true,
    })
    expect(
      lifecycle.records().find((record) => record.manifest.key === 'example.incompatible')?.state,
    ).toBe('incompatible')
  })
  it('degrades health failures without affecting another enabled extension', async () => {
    const lifecycle = service()
    lifecycle.discover({
      manifest: manifest('example.good'),
      source: 'local-deployment',
      trusted: true,
    })
    lifecycle.install('example.good')
    await lifecycle.enable('example.good')
    lifecycle.discover({
      manifest: manifest('example.bad'),
      source: 'local-deployment',
      trusted: true,
      hooks: {
        health: async () => {
          throw new Error('token=secret')
        },
      },
    })
    lifecycle.install('example.bad')
    await lifecycle.enable('example.bad')
    expect((await lifecycle.checkHealth('example.bad')).state).toBe('degraded')
    expect(
      lifecycle.records().find((record) => record.manifest.key === 'example.good')?.state,
    ).toBe('enabled')
  })
  it('fails a migration safely and requires declared uninstall policy confirmation', async () => {
    const lifecycle = service()
    lifecycle.discover({
      manifest: manifest('example.migration', {
        uninstall: 'delete-confirmed',
        migrations: { owner: 'example.migration', versions: ['001'] },
      }),
      source: 'local-deployment',
      trusted: true,
      hooks: {
        migrate: async () => {
          throw new Error('migration failed')
        },
      },
    })
    lifecycle.install('example.migration')
    expect((await lifecycle.enable('example.migration')).state).toBe('failed')
    await expect(lifecycle.uninstall('example.migration')).rejects.toThrow(
      'explicit delete confirmation',
    )
    await expect(
      lifecycle.uninstall('example.migration', { confirmDelete: true }),
    ).resolves.toMatchObject({ removed: true, requiredAction: 'delete-confirmed' })
  })
})
