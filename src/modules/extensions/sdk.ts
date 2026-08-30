import type { ExtensionManifest, ProviderAdapter } from './contracts'
import { EXTENSION_CONTRACT_VERSION } from './contracts'
import type { ExtensionLifecycleHooks } from './lifecycle'

export type ExtensionJob<Input extends Record<string, unknown> = Record<string, unknown>> = {
  slug: string
  input: Input
  queue: string
  run: (input: Input) => Promise<void>
}
export type ExtensionMigration = { version: string; up: () => Promise<void> }
export type ExtensionDefinition = {
  manifest: ExtensionManifest
  hooks?: ExtensionLifecycleHooks
  jobs?: readonly ExtensionJob[]
  migrations?: readonly ExtensionMigration[]
}
/** Authoring helper for reviewed, server-deployed extensions. */
export function defineExtension(definition: ExtensionDefinition): ExtensionDefinition {
  return {
    ...definition,
    manifest: {
      ...definition.manifest,
      contractVersion: definition.manifest.contractVersion ?? EXTENSION_CONTRACT_VERSION,
      migrations: {
        ...definition.manifest.migrations,
        versions:
          definition.migrations?.map((migration) => migration.version) ??
          definition.manifest.migrations.versions,
      },
    },
  }
}
export const defineConfigSchema = (version: number, jsonSchema: Record<string, unknown>) => ({
  version,
  jsonSchema,
})
export const registerCapabilities = <T extends readonly ExtensionManifest['provides'][number][]>(
  capabilities: T,
) => capabilities
export const defineProviderAdapter = (adapter: ProviderAdapter): ProviderAdapter => adapter
export const defineExtensionJob = <Input extends Record<string, unknown>>(
  job: ExtensionJob<Input>,
) => job
export const defineExtensionMigration = (migration: ExtensionMigration) => migration
export const extensionTestEnvironment = () => ({
  coreVersion: '0.1.0',
  schemaVersion: '1.0.0',
  grantedPermissions: [] as readonly string[],
  now: () => '2026-08-29T00:00:00.000Z',
})
