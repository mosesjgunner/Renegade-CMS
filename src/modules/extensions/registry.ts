import { satisfies, valid, validRange } from 'semver'

import type { Capability, Iso8601Instant } from '../core/contracts'
import type {
  CapabilityKey,
  ConnectionRecord,
  ExtensionManifest,
  ProviderAdapter,
} from './contracts'

const extensionLabel = (manifest: ExtensionManifest) =>
  `Extension ${JSON.stringify(manifest.key)} version ${JSON.stringify(manifest.version)}`

/**
 * Validates manifest metadata without loading extension code. SemVer's default
 * prerelease policy is intentional: stable ranges exclude prereleases unless a
 * prerelease comparator is explicitly present in the requested range.
 */
export function validateExtensionManifest(manifest: ExtensionManifest): string[] {
  const label = extensionLabel(manifest)
  const issues: string[] = []

  if (!valid(manifest.version)) {
    issues.push(`${label} has an invalid extension version; expected a valid semantic version.`)
  }

  for (const [field, range] of [
    ['compatibleCore', manifest.compatibleCore],
    ['compatibleSchema', manifest.compatibleSchema],
  ] as const) {
    if (!validRange(range)) {
      issues.push(`${label} has an invalid ${field} range ${JSON.stringify(range)}.`)
    }
  }

  return issues
}

const compatibilityIssue = (
  manifest: ExtensionManifest,
  target: 'core' | 'schema',
  version: string,
  range: string,
) => {
  const field = target === 'core' ? 'compatibleCore' : 'compatibleSchema'
  const label = extensionLabel(manifest)

  if (!valid(version)) {
    return `${label} cannot be evaluated against ${target} version ${JSON.stringify(version)}; it is not a valid semantic version (requested ${field} range ${JSON.stringify(range)}).`
  }

  // `satisfies` deliberately excludes prereleases from normal stable ranges.
  return satisfies(version, range)
    ? null
    : `${label} is incompatible with ${target} version ${JSON.stringify(version)}; requested ${field} range ${JSON.stringify(range)} does not include it.`
}

export function validateEnable(
  manifest: ExtensionManifest,
  installed: readonly ExtensionManifest[],
  core: string,
  schema: string,
): string[] {
  const keys = new Set(installed.map((item) => item.key))
  const manifestIssues = validateExtensionManifest(manifest)
  const issues = [
    ...manifestIssues,
    ...(manifestIssues.some((issue) => issue.includes('compatibleCore'))
      ? []
      : [compatibilityIssue(manifest, 'core', core, manifest.compatibleCore)].filter(
          (issue): issue is string => issue !== null,
        )),
    ...(manifestIssues.some((issue) => issue.includes('compatibleSchema'))
      ? []
      : [compatibilityIssue(manifest, 'schema', schema, manifest.compatibleSchema)].filter(
          (issue): issue is string => issue !== null,
        )),
    ...manifest.dependencies
      .filter((key) => !keys.has(key))
      .map((key) => `missing dependency: ${key}`),
    ...manifest.conflicts.filter((key) => keys.has(key)).map((key) => `conflict: ${key}`),
  ]
  return issues
}
export class CapabilityRegistry {
  constructor(private readonly adapters: readonly ProviderAdapter[]) {}
  available(connections: readonly ConnectionRecord[], now: Iso8601Instant): readonly Capability[] {
    return connections.flatMap((connection) =>
      connection.status === 'active' && (!connection.expiresAt || connection.expiresAt > now)
        ? connection.capabilities
        : [],
    )
  }
  has(key: CapabilityKey, connections: readonly ConnectionRecord[], now: Iso8601Instant) {
    return this.available(connections, now).some(
      (item) => item.key === key && item.support === 'supported',
    )
  }
  adapter(key: string) {
    return this.adapters.find((adapter) => adapter.contract.key === key)
  }
}
export function redactDiagnostic(error: unknown): string {
  return String(error).replace(/(bearer|token|secret|password)[=: ]+[^\s,]+/gi, '$1=[REDACTED]')
}
export async function testConnection(
  adapter: ProviderAdapter,
  connection: ConnectionRecord,
  now: Iso8601Instant,
): Promise<ConnectionRecord> {
  try {
    const result = await adapter.test(connection)
    return {
      ...connection,
      status: 'active',
      capabilities: result.capabilities,
      lastHealthCheckAt: now,
      lastError: null,
    }
  } catch (error) {
    return {
      ...connection,
      status: 'invalid',
      lastHealthCheckAt: now,
      lastError: {
        code: 'expired_credentials',
        message: redactDiagnostic(error),
        retryable: false,
      },
    }
  }
}
