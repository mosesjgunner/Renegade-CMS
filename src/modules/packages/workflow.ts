import type { PackageArchive, PackageEnvironment, PackageManifest } from './contracts'
import { inspectPackage } from './contracts'

export type PackageActor = { role?: string | null }
export type InstalledPackage = {
  manifest: PackageManifest
  archive: PackageArchive
  active: boolean
  installedAt: string
  createdResourceKeys: readonly string[]
}
export interface PackageStore {
  getPackage(key: string): Promise<InstalledPackage | null>
  savePackage(value: InstalledPackage): Promise<void>
  deletePackage(key: string): Promise<void>
  getResource(key: string): Promise<unknown | null>
  createResource(key: string, value: unknown): Promise<void>
  deleteResource(key: string): Promise<void>
  listPackages(): Promise<readonly InstalledPackage[]>
}
const assertAdmin = (actor: PackageActor) => {
  if (actor.role !== 'owner') throw new Error('Only privileged administrators can manage packages.')
}
const resourceKey = (manifest: PackageManifest, id: string) => `package:${manifest.key}:${id}`

export async function installPackage(
  archive: PackageArchive,
  store: PackageStore,
  actor: PackageActor,
  environment: PackageEnvironment = {},
): Promise<InstalledPackage> {
  assertAdmin(actor)
  const inspection = inspectPackage(archive, {
    ...environment,
    installed: (await store.listPackages()).map(({ manifest }) => manifest),
  })
  if (!inspection.compatible) throw new Error(inspection.errors.join(' '))
  if (await store.getPackage(archive.manifest.key))
    throw new Error('Package is already installed; uninstall it before installing a new version.')
  const createdResourceKeys: string[] = []
  for (const resource of archive.manifest.includedResources) {
    const key = resourceKey(archive.manifest, resource.id)
    if (await store.getResource(key)) throw new Error(`Package resource collision: ${key}`)
    const file = archive.files.find((item) => item.path === resource.path)
    if (!file) throw new Error(`Missing package resource: ${resource.path}`)
    // Package bytes are JSON data only; templates compose existing registered blocks.
    let data: unknown
    try {
      data = JSON.parse(file.contents)
    } catch {
      throw new Error(`Package resource must be JSON: ${resource.path}`)
    }
    await store.createResource(key, data)
    createdResourceKeys.push(key)
  }
  const installed: InstalledPackage = {
    manifest: archive.manifest,
    archive,
    active: false,
    installedAt: new Date().toISOString(),
    createdResourceKeys,
  }
  await store.savePackage(installed)
  return installed
}

export async function setPackageActive(
  key: string,
  active: boolean,
  store: PackageStore,
  actor: PackageActor,
): Promise<InstalledPackage> {
  assertAdmin(actor)
  const installed = await store.getPackage(key)
  if (!installed) throw new Error('Package is not installed.')
  if (active && !['theme', 'template', 'block-preset'].includes(installed.manifest.type))
    throw new Error('Starter-site packages are imported, not activated.')
  const next = { ...installed, active }
  await store.savePackage(next)
  return next
}

/** Removal only deletes resources whose deterministic package keys are still owned by the package. */
export async function removePackage(
  key: string,
  store: PackageStore,
  actor: PackageActor,
): Promise<void> {
  assertAdmin(actor)
  const installed = await store.getPackage(key)
  if (!installed) throw new Error('Package is not installed.')
  if (installed.active) throw new Error('Deactivate the package before removal.')
  for (const resource of installed.createdResourceKeys) await store.deleteResource(resource)
  await store.deletePackage(key)
}

/** Keeps rendering available if an installed/active theme disappears. */
export function activeThemeOrFallback(
  activeThemeKey: string | null | undefined,
  installed: readonly InstalledPackage[],
  fallback = 'neutral-starter',
) {
  return installed.some(
    (item) => item.active && item.manifest.type === 'theme' && item.manifest.key === activeThemeKey,
  )
    ? activeThemeKey!
    : fallback
}
