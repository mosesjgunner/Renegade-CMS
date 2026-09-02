import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor, RelationshipFeature } from '@payloadcms/richtext-lexical'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'

import { loadConfig } from './modules/core/config'
import {
  applyCoreGlobalGroups,
  applyProgressiveDisclosure,
} from './modules/admin/progressive-disclosure'
import { registeredPayloadDomains } from './modules/payload-domains'
import { gatePayloadRegistrations, parseEnabledModules } from './modules/module-registry'
import { seed } from './scripts/seed'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const config = loadConfig()
// Register the lean floor by default; optional modules are switched on via
// RENEGADE_MODULES. See src/modules/module-registry.ts for the full contract.
const domainRegistrations = gatePayloadRegistrations(registeredPayloadDomains(config), {
  enabled: parseEnabledModules(process.env.RENEGADE_MODULES),
  allowUnsafeCollectionCount: process.env.RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT === 'true',
})
const users = domainRegistrations.collections.find(({ slug }) => slug === 'users')

if (!users) throw new Error('Identity domain must register the users collection')

export default buildConfig({
  admin: {
    user: users.slug,
    importMap: { baseDir: dirname },
    components: {
      beforeNavLinks: ['./modules/admin/PublishingLinks', './modules/admin/CapabilityCenterLink'],
      views: {
        capabilities: { Component: './modules/admin/CapabilityCenter', path: '/capabilities' },
        security: { Component: './modules/admin/SecurityCenter', path: '/security' },
        posts: { Component: './modules/admin/PublishingCenter', path: '/posts' },
        pages: { Component: './modules/admin/PublishingCenter', path: '/pages' },
      },
    },
  },
  bin: [
    { key: 'seed', scriptPath: path.resolve(dirname, 'scripts/seed.ts') },
    {
      key: 'recover-installation',
      scriptPath: path.resolve(dirname, 'scripts/recover-installation.ts'),
    },
  ],
  collections: applyProgressiveDisclosure(domainRegistrations.collections),
  globals: applyCoreGlobalGroups(domainRegistrations.globals),
  db: postgresAdapter({
    idType: 'uuid',
    migrationDir: path.resolve(dirname, 'migrations'),
    pool: { connectionString: config.databaseUrl },
    push: false,
  }),
  cors: [config.appUrl],
  csrf: [config.appUrl],
  editor: lexicalEditor({
    // Default Lexical supplies headings, paragraphs, links, lists and quotes.
    // This explicit allow-list is the safe inline-reference contract for PUB-02.
    features: ({ defaultFeatures }) => [
      ...defaultFeatures,
      RelationshipFeature({ enabledCollections: ['media-assets', 'content'] }),
    ],
  }),
  endpoints: [],
  jobs: {
    access: {
      cancel: ({ req }) => req.user?.role === 'owner',
      queue: ({ req }) => req.user?.role === 'owner',
      run: ({ req }) => req.user?.role === 'owner',
    },
    deleteJobOnComplete: false,
    enableConcurrencyControl: true,
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      admin: {
        ...defaultJobsCollection.admin,
        group: 'System',
        hidden: true,
      },
    }),
    processingOrder: 'createdAt',
    tasks: domainRegistrations.tasks,
  },
  onInit: async (payload) => {
    if (process.env.SEED_ON_INIT === 'true') await seed(payload)
  },
  secret: config.payloadSecret,
  serverURL: config.appUrl,
  // autoGenerate is off so a floor/default build never rewrites the committed
  // full-set payload-types.ts to the gated subset. Types are (re)generated
  // explicitly via `npm run generate:types`, which forces RENEGADE_MODULES=all
  // so the checked-in types always describe every collection in the codebase.
  typescript: { autoGenerate: false, outputFile: path.resolve(dirname, 'payload-types.ts') },
})
