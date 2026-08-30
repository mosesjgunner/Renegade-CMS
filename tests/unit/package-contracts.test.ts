import { describe, expect, it } from 'vitest'

import {
  createPackageArchive,
  inspectPackage,
  isEligiblePackageExport,
  PACKAGE_MAX_FILE_BYTES,
} from '../../src/modules/packages/contracts'
import { referencePackages } from '../../src/modules/packages/reference-packages'

const input = {
  key: 'example.reading',
  name: 'Example reading',
  author: 'Example',
  version: '1.0.0',
  compatibleCore: '^0.1.0',
  compatibleSchema: '^1.0.0',
  type: 'template' as const,
  dependencies: [],
  requiredCapabilities: [],
  optionalCapabilities: ['media.processing'],
  license: { identifier: 'MIT' },
  files: [
    {
      id: 'layout',
      kind: 'layout' as const,
      path: 'templates/reading.json',
      contents: '{"blocks":[]}',
    },
  ],
}

describe('presentation package contracts', () => {
  it('inspects versioned data-only manifests and first-party examples', () => {
    const archive = createPackageArchive(input)
    expect(inspectPackage(archive).compatible).toBe(true)
    expect(inspectPackage(archive).warnings[0]).toContain('Optional capability')
    expect(referencePackages.every((item) => inspectPackage(item).compatible)).toBe(true)
    expect(isEligiblePackageExport('theme')).toBe(false)
    expect(isEligiblePackageExport('starter-site')).toBe(true)
  })
  it('rejects invalid manifests, traversal, executable smuggling, bombs, and corrupted archives', () => {
    const archive = createPackageArchive(input)
    expect(
      inspectPackage({ ...archive, manifest: { ...archive.manifest, version: 'nope' } }).errors,
    ).toContain('Invalid package version.')
    expect(
      inspectPackage(
        createPackageArchive({ ...input, files: [{ ...input.files[0], path: '../escape.json' }] }),
      ).errors.join(' '),
    ).toContain('Unsafe package path')
    expect(
      inspectPackage(
        createPackageArchive({
          ...input,
          files: [{ ...input.files[0], path: 'templates/run.js' }],
        }),
      ).errors.join(' '),
    ).toContain('Unsafe package path')
    expect(
      inspectPackage(
        createPackageArchive({
          ...input,
          files: [{ ...input.files[0], contents: 'x'.repeat(PACKAGE_MAX_FILE_BYTES + 1) }],
        }),
      ).errors.join(' '),
    ).toContain('size limit')
    expect(
      inspectPackage({
        ...archive,
        files: [{ ...archive.files[0], contents: '{"blocks":["tampered"]}' }],
      }).errors.join(' '),
    ).toContain('integrity')
  })
  it('reports dependency, capability, and core/schema compatibility failures before install', () => {
    const archive = createPackageArchive({
      ...input,
      dependencies: ['example.base'],
      requiredCapabilities: ['media.processing'],
    })
    expect(
      inspectPackage(archive, { coreVersion: '2.0.0', schemaVersion: '2.0.0' }).errors.join(' '),
    ).toMatch(/incompatible|Missing/)
  })
})
