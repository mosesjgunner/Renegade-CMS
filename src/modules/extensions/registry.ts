import type { Capability, Iso8601Instant } from '../core/contracts'
import type {
  CapabilityKey,
  ConnectionRecord,
  ExtensionManifest,
  ProviderAdapter,
} from './contracts'

const compatible = (range: string, version: string) =>
  range === '*' ||
  range === version ||
  (range.startsWith('^') && version.split('.').slice(0, 1)[0] === range.slice(1).split('.')[0])
export function validateEnable(
  manifest: ExtensionManifest,
  installed: readonly ExtensionManifest[],
  core: string,
  schema: string,
): string[] {
  const keys = new Set(installed.map((item) => item.key))
  const issues = [
    ...(compatible(manifest.compatibleCore, core) ? [] : ['incompatible core']),
    ...(compatible(manifest.compatibleSchema, schema) ? [] : ['incompatible schema']),
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
