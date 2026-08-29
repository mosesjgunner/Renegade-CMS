import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'

import { loadConfig } from './modules/core/config'
import {
  applyCoreGlobalGroups,
  applyProgressiveDisclosure,
} from './modules/admin/progressive-disclosure'
import { registeredPayloadDomains } from './modules/payload-domains'
import { seed } from './scripts/seed'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const config = loadConfig()
const domainRegistrations = registeredPayloadDomains(config)
const users = domainRegistrations.collections.find(({ slug }) => slug === 'users')

if (!users) throw new Error('Identity domain must register the users collection')

export default buildConfig({
  admin: {
    user: users.slug,
    importMap: { baseDir: dirname },
    components: {
      beforeNavLinks: ['./modules/admin/CapabilityCenterLink'],
      views: {
        capabilities: { Component: './modules/admin/CapabilityCenter', path: '/capabilities' },
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
  editor: lexicalEditor(),
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
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
