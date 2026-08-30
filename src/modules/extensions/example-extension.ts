import { defineConfigSchema, defineExtension, registerCapabilities } from './sdk'
/** Tiny in-tree example; it proves the contract and adds no product behaviour. */
export const exampleExtension = defineExtension({
  manifest: {
    key: 'example.health-check',
    version: '1.0.0',
    family: 'module',
    compatibleCore: '^0.1.0',
    compatibleSchema: '^1.0.0',
    dependencies: [],
    conflicts: [],
    provides: registerCapabilities(['grammar.local.check']),
    requires: [],
    permissions: [],
    configSchema: defineConfigSchema(1, { type: 'object', additionalProperties: false }),
    migrations: { owner: 'example.health-check', versions: [] },
    failureMode: 'degraded',
    dataOwner: 'example.health-check',
    exportOwner: 'example.health-check',
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
  },
  hooks: { health: async () => ({ status: 'healthy' }) },
})
