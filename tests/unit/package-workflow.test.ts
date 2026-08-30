import { describe, expect, it } from 'vitest'

import { createPackageArchive } from '../../src/modules/packages/contracts'
import {
  activeThemeOrFallback,
  installPackage,
  removePackage,
  setPackageActive,
  type InstalledPackage,
  type PackageStore,
} from '../../src/modules/packages/workflow'

const archive = createPackageArchive({
  key: 'example.hero',
  name: 'Hero preset',
  author: 'Example',
  version: '1.0.0',
  compatibleCore: '^0.1.0',
  compatibleSchema: '^1.0.0',
  type: 'block-preset',
  dependencies: [],
  requiredCapabilities: [],
  optionalCapabilities: [],
  license: { identifier: 'MIT' },
  files: [
    {
      id: 'hero',
      kind: 'preset',
      path: 'presets/hero.json',
      contents: JSON.stringify({
        component: 'publisher.hero',
        componentVersion: 1,
        props: { title: 'Hello' },
      }),
    },
  ],
})
const memoryStore = (): PackageStore & { resources: Map<string, unknown> } => {
  const packages = new Map<string, InstalledPackage>(),
    resources = new Map<string, unknown>()
  return {
    resources,
    getPackage: async (key) => packages.get(key) ?? null,
    savePackage: async (value) => {
      packages.set(value.manifest.key, value)
    },
    deletePackage: async (key) => {
      packages.delete(key)
    },
    getResource: async (key) => resources.get(key) ?? null,
    createResource: async (key, value) => {
      resources.set(key, value)
    },
    deleteResource: async (key) => {
      resources.delete(key)
    },
    listPackages: async () => [...packages.values()],
  }
}

describe('package lifecycle', () => {
  it('is owner-only, collision-safe, activatable, and uninstall-safe', async () => {
    const store = memoryStore()
    await expect(installPackage(archive, store, { role: 'staff' })).rejects.toThrow('privileged')
    const installed = await installPackage(archive, store, { role: 'owner' })
    expect(installed.createdResourceKeys).toEqual(['package:example.hero:hero'])
    await expect(installPackage(archive, store, { role: 'owner' })).rejects.toThrow(
      'already installed',
    )
    await setPackageActive(archive.manifest.key, true, store, { role: 'owner' })
    await expect(removePackage(archive.manifest.key, store, { role: 'owner' })).rejects.toThrow(
      'Deactivate',
    )
    await setPackageActive(archive.manifest.key, false, store, { role: 'owner' })
    await removePackage(archive.manifest.key, store, { role: 'owner' })
    expect(store.resources.size).toBe(0)
  })
  it('falls back safely when the active presentation package is missing', async () => {
    const store = memoryStore()
    const theme = createPackageArchive({
      ...archive.manifest,
      type: 'theme',
      files: [{ id: 'theme', kind: 'theme', path: 'themes/example.json', contents: '{}' }],
    })
    const installed = await installPackage(theme, store, { role: 'owner' })
    const active = { ...installed, active: true }
    expect(activeThemeOrFallback('example.hero', [active])).toBe('example.hero')
    expect(activeThemeOrFallback('missing', [active])).toBe('neutral-starter')
  })
})
