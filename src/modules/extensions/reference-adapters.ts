import type { ProviderAdapter, ProviderContract } from './contracts'
const base = (
  key: `${string}.${string}`,
  group: ProviderContract['group'],
  provides: ProviderContract['provides'],
): ProviderContract => ({
  key,
  version: '1.0.0',
  family: 'provider',
  compatibleCore: '^0.1.0',
  compatibleSchema: '^1.0.0',
  dependencies: [],
  conflicts: [],
  provides,
  requires: [],
  permissions: ['connections.manage'],
  configSchema: { version: 1, jsonSchema: { type: 'object' } },
  migrations: { owner: key, versions: [] },
  failureMode: 'degraded',
  dataOwner: 'renegade',
  exportOwner: 'renegade',
  retention: 'shared-policy-required',
  uninstall: 'retain',
  budget: {
    baseline: 'negligible',
    peak: 'one request',
    separateWorker: false,
    externalProvider: false,
    concurrency: 2,
    degradedMode: 'capability unavailable; canonical records remain readable',
  },
  group,
  contractVersion: 1,
  authorization: { modes: ['configuration'], minimumScopes: [] },
  rateLimits: { idempotency: 'supported' },
  ownership: {
    canonicalData: 'renegade',
    remoteData: 'provider',
    portability: 'export canonical references; never remote secrets',
  },
  disconnect: { revokeRemote: false, preserveCanonicalData: true, callbackOwner: key },
})
export const localFilesystemAdapter: ProviderAdapter = {
  contract: base('storage.local-filesystem', 'Media', ['storage.object']),
  async test() {
    return {
      capabilities: [
        { key: 'storage.object', support: 'supported', observedAt: new Date().toISOString() },
      ],
    }
  },
  async execute({ capability, payload }) {
    if (capability !== 'storage.object') throw new Error('unsupported capability')
    return { accepted: true, objectKey: payload.objectKey }
  },
}
export const developmentEmailAdapter: ProviderAdapter = {
  contract: base('email.development', 'Email', ['email.transactional']),
  async test() {
    return {
      capabilities: [
        { key: 'email.transactional', support: 'supported', observedAt: new Date().toISOString() },
      ],
    }
  },
  async execute({ capability, payload }) {
    if (capability !== 'email.transactional') throw new Error('unsupported capability')
    return { accepted: true, delivery: 'development-sink', messageId: payload.idempotencyKey }
  },
}
