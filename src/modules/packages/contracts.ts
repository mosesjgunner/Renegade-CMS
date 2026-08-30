import { createHash } from 'node:crypto'

import { satisfies, valid, validRange } from 'semver'

import { checksum } from '../portability/contracts'

/** Data-only interchange format for presentation and starter-content packages. */
export const PACKAGE_FORMAT_VERSION = 1 as const
export const PACKAGE_CORE_VERSION = '0.1.0'
export const PACKAGE_SCHEMA_VERSION = '1.0.0'
export const PACKAGE_MAX_FILES = 200
export const PACKAGE_MAX_FILE_BYTES = 2 * 1024 * 1024
export const PACKAGE_MAX_TOTAL_BYTES = 16 * 1024 * 1024

export type PackageType = 'theme' | 'template' | 'block-preset' | 'starter-site'
export type PackageResourceKind = 'theme' | 'layout' | 'preset' | 'content' | 'media-metadata'
export type PackageResource = {
  id: string
  kind: PackageResourceKind
  path: string
  bytes: number
  checksum: string
}
export type PackageManifest = {
  format: 'renegade-package'
  formatVersion: typeof PACKAGE_FORMAT_VERSION
  key: string
  name: string
  author: string
  version: string
  compatibleCore: string
  compatibleSchema: string
  type: PackageType
  includedResources: readonly PackageResource[]
  dependencies: readonly string[]
  requiredCapabilities: readonly string[]
  optionalCapabilities: readonly string[]
  license: { identifier: string; url?: string }
  integrity: { algorithm: 'sha256'; archive: string; resources: Record<string, string> }
}
export type PackageFile = { path: string; contents: string }
export type PackageArchive = { manifest: PackageManifest; files: readonly PackageFile[] }
export type PackageEnvironment = {
  coreVersion?: string
  schemaVersion?: string
  capabilities?: readonly string[]
  installed?: readonly Pick<PackageManifest, 'key' | 'version'>[]
}
export type PackageInspection = {
  manifest: PackageManifest
  compatible: boolean
  errors: readonly string[]
  warnings: readonly string[]
  preview: readonly { id: string; kind: PackageResourceKind; path: string }[]
}

const executableExtension =
  /\.(?:[cm]?[jt]sx?|node|wasm|exe|dll|so|dylib|sh|bat|cmd|ps1|php|py|rb|jar|class)$/i
const safePackagePath = (path: string) =>
  path.length > 0 &&
  path.length <= 180 &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  !path.split('/').some((part) => !part || part === '.' || part === '..') &&
  !executableExtension.test(path)
const fileChecksum = (contents: string) =>
  `sha256:${createHash('sha256').update(contents, 'utf8').digest('hex')}`
const archiveDigest = (
  manifest: Omit<PackageManifest, 'integrity'>,
  files: readonly PackageFile[],
) =>
  checksum({
    manifest,
    files: files.map((file) => ({ path: file.path, checksum: fileChecksum(file.contents) })),
  })

export function createPackageArchive(
  input: Omit<PackageManifest, 'format' | 'formatVersion' | 'includedResources' | 'integrity'> & {
    files: readonly (Omit<PackageResource, 'bytes' | 'checksum'> & { contents: string })[]
  },
): PackageArchive {
  const files = input.files.map(({ path, contents }) => ({ path, contents }))
  const includedResources = input.files.map(({ id, kind, path, contents }) => ({
    id,
    kind,
    path,
    bytes: Buffer.byteLength(contents, 'utf8'),
    checksum: fileChecksum(contents),
  }))
  const unsigned = {
    format: 'renegade-package' as const,
    formatVersion: PACKAGE_FORMAT_VERSION,
    key: input.key,
    name: input.name,
    author: input.author,
    version: input.version,
    compatibleCore: input.compatibleCore,
    compatibleSchema: input.compatibleSchema,
    type: input.type,
    includedResources,
    dependencies: input.dependencies,
    requiredCapabilities: input.requiredCapabilities,
    optionalCapabilities: input.optionalCapabilities,
    license: input.license,
  }
  return {
    manifest: {
      ...unsigned,
      integrity: {
        algorithm: 'sha256',
        archive: archiveDigest(unsigned, files),
        resources: Object.fromEntries(
          includedResources.map((resource) => [resource.path, resource.checksum]),
        ),
      },
    },
    files,
  }
}

/** Reject invalid, executable, oversized, and tampered packages before any resource is parsed. */
export function inspectPackage(
  archive: PackageArchive,
  environment: PackageEnvironment = {},
): PackageInspection {
  const { manifest, files } = archive
  const errors: string[] = []
  const warnings: string[] = []
  if (manifest.format !== 'renegade-package' || manifest.formatVersion !== PACKAGE_FORMAT_VERSION)
    errors.push('Unsupported package format version.')
  if (!/^[a-z0-9][a-z0-9.-]{1,80}$/.test(manifest.key)) errors.push('Invalid package key.')
  if (!manifest.name.trim() || !manifest.author.trim())
    errors.push('Package name and author are required.')
  if (!valid(manifest.version)) errors.push('Invalid package version.')
  for (const [label, range] of [
    ['core', manifest.compatibleCore],
    ['schema', manifest.compatibleSchema],
  ] as const)
    if (!validRange(range)) errors.push(`Invalid compatible ${label} range.`)
  if (!manifest.license.identifier.trim()) errors.push('License metadata is required.')
  if (files.length !== manifest.includedResources.length || files.length > PACKAGE_MAX_FILES)
    errors.push('Invalid package file count.')
  const seen = new Set<string>()
  let total = 0
  for (const file of files) {
    const bytes = Buffer.byteLength(file.contents, 'utf8')
    total += bytes
    if (!safePackagePath(file.path)) errors.push(`Unsafe package path: ${file.path}`)
    if (seen.has(file.path)) errors.push(`Duplicate package path: ${file.path}`)
    seen.add(file.path)
    if (bytes > PACKAGE_MAX_FILE_BYTES) errors.push(`Package file exceeds size limit: ${file.path}`)
  }
  if (total > PACKAGE_MAX_TOTAL_BYTES) errors.push('Package exceeds total size limit.')
  const resources = new Map(manifest.includedResources.map((resource) => [resource.path, resource]))
  for (const file of files) {
    const resource = resources.get(file.path)
    if (!resource) errors.push(`File is absent from manifest: ${file.path}`)
    else if (
      resource.bytes !== Buffer.byteLength(file.contents, 'utf8') ||
      resource.checksum !== fileChecksum(file.contents)
    )
      errors.push(`Resource integrity mismatch: ${file.path}`)
  }
  if (
    manifest.includedResources.some(
      (resource) => !safePackagePath(resource.path) || !seen.has(resource.path),
    )
  )
    errors.push('Manifest resource paths do not match archive.')
  const unsigned: Omit<PackageManifest, 'integrity'> = { ...manifest }
  delete (unsigned as { integrity?: unknown }).integrity
  if (
    manifest.integrity.algorithm !== 'sha256' ||
    manifest.integrity.archive !== archiveDigest(unsigned, files)
  )
    errors.push('Package archive integrity mismatch.')
  const core = environment.coreVersion ?? PACKAGE_CORE_VERSION
  const schema = environment.schemaVersion ?? PACKAGE_SCHEMA_VERSION
  if (
    valid(core) &&
    validRange(manifest.compatibleCore) &&
    !satisfies(core, manifest.compatibleCore)
  )
    errors.push(`Package is incompatible with core ${core}.`)
  if (
    valid(schema) &&
    validRange(manifest.compatibleSchema) &&
    !satisfies(schema, manifest.compatibleSchema)
  )
    errors.push(`Package is incompatible with schema ${schema}.`)
  const installed = new Set((environment.installed ?? []).map((item) => item.key))
  for (const dependency of manifest.dependencies)
    if (!installed.has(dependency)) errors.push(`Missing dependency: ${dependency}`)
  const capabilities = new Set(environment.capabilities ?? [])
  for (const capability of manifest.requiredCapabilities)
    if (!capabilities.has(capability)) errors.push(`Missing required capability: ${capability}`)
  for (const capability of manifest.optionalCapabilities)
    if (!capabilities.has(capability))
      warnings.push(`Optional capability unavailable: ${capability}`)
  return {
    manifest,
    compatible: errors.length === 0,
    errors,
    warnings,
    preview: manifest.includedResources.map(({ id, kind, path }) => ({ id, kind, path })),
  }
}

export const isEligiblePackageExport = (type: PackageType) =>
  type === 'template' || type === 'block-preset' || type === 'starter-site'
