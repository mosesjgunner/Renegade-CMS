import {
  assertArray,
  assertChecksumSha256,
  assertNonEmptyString,
  assertRecord,
  assertString,
  assertVersion1,
  coerceInput,
  isRecord,
  requireField,
} from './validation'

/**
 * ProjectBundleManifest v1 — schema only in POD-00.
 *
 * This is the manifest inside a portable Podcast Studio project bundle.
 * POD-19 implements bundle export/import against this schema; POD-00 only
 * defines and validates it, so later prompts build on a settled shape.
 */

export type ProjectBundleContent = {
  kind: string
  id: string
  path: string
  checksumSha256: string
}

export type ProjectBundlePermission = {
  role: string
  capabilities: string[]
}

export type ProjectBundleManifest = {
  version: 1
  bundleId: string
  createdAt: string
  show: {
    id: string
    title: string
  }
  contents: ProjectBundleContent[]
  permissionsManifest: ProjectBundlePermission[]
  /** Optional mapping from bundle-local ids to install-local ids, filled in on import. */
  idMapping?: Record<string, string>
}

export const parseProjectBundleManifest = (value: unknown): ProjectBundleManifest => {
  const manifest = coerceInput(value, 'ProjectBundleManifest')
  assertVersion1(manifest, 'ProjectBundleManifest')
  assertNonEmptyString(
    requireField(manifest, 'bundleId', 'ProjectBundleManifest'),
    'ProjectBundleManifest.bundleId',
  )
  assertNonEmptyString(
    requireField(manifest, 'createdAt', 'ProjectBundleManifest'),
    'ProjectBundleManifest.createdAt',
  )

  const show = assertRecord(
    requireField(manifest, 'show', 'ProjectBundleManifest'),
    'ProjectBundleManifest.show',
  )
  assertNonEmptyString(requireField(show, 'id', 'ProjectBundleManifest.show'), 'show.id')
  assertString(requireField(show, 'title', 'ProjectBundleManifest.show'), 'show.title')

  const contents = assertArray(
    requireField(manifest, 'contents', 'ProjectBundleManifest'),
    'ProjectBundleManifest.contents',
  )
  contents.forEach((entry, index) => {
    const label = `ProjectBundleManifest.contents[${index}]`
    const content = assertRecord(entry, label)
    assertNonEmptyString(requireField(content, 'kind', label), `${label}.kind`)
    assertNonEmptyString(requireField(content, 'id', label), `${label}.id`)
    assertNonEmptyString(requireField(content, 'path', label), `${label}.path`)
    assertChecksumSha256(requireField(content, 'checksumSha256', label), `${label}.checksumSha256`)
  })

  const permissions = assertArray(
    requireField(manifest, 'permissionsManifest', 'ProjectBundleManifest'),
    'ProjectBundleManifest.permissionsManifest',
  )
  permissions.forEach((entry, index) => {
    const label = `ProjectBundleManifest.permissionsManifest[${index}]`
    const permission = assertRecord(entry, label)
    assertNonEmptyString(requireField(permission, 'role', label), `${label}.role`)
    const capabilities = assertArray(
      requireField(permission, 'capabilities', label),
      `${label}.capabilities`,
    )
    capabilities.forEach((capability, capabilityIndex) => {
      if (typeof capability !== 'string' || !capability.trim())
        throw new Error(`${label}.capabilities[${capabilityIndex}] must be a non-empty string.`)
    })
  })

  if (manifest.idMapping !== undefined) {
    if (!isRecord(manifest.idMapping))
      throw new Error('ProjectBundleManifest.idMapping must be an object when present.')
    for (const [from, to] of Object.entries(manifest.idMapping))
      if (typeof to !== 'string' || !to)
        throw new Error(`ProjectBundleManifest.idMapping["${from}"] must be a non-empty string.`)
  }

  return manifest as unknown as ProjectBundleManifest
}

export const assertProjectBundleManifest = (value: unknown): ProjectBundleManifest =>
  parseProjectBundleManifest(value)

/** Serializes a validated bundle manifest to JSON; the parser accepts this string directly. */
export const serializeProjectBundleManifest = (manifest: ProjectBundleManifest): string =>
  JSON.stringify(manifest, null, 2)
