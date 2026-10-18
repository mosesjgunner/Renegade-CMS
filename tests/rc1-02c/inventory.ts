import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@/payload.config'

async function run() {
  if (
    process.env.RC1_02C_DISPOSABLE !== 'yes' ||
    new URL(process.env.DATABASE_URL!).pathname !== '/rc102c_release_acceptance'
  )
    throw new Error('Dedicated 02C environment required')
  const payload = await getPayload({ config })
  const views = []
  for (const [key, view] of Object.entries(payload.config.admin.components?.views || {})) {
    const sourcePath =
      typeof view.Component === 'string' ? `src/${view.Component.replace(/^\.\//, '')}.tsx` : ''
    const source = sourcePath ? await readFile(sourcePath, 'utf8') : ''
    views.push({
      key,
      route: `/admin${view.path === '/' ? '' : view.path}`,
      sourcePath,
      links: [...new Set([...source.matchAll(/href=["']([^"']+)["']/g)].map((match) => match[1]))],
      services: [
        ...new Set([...source.matchAll(/fetch\(["'`]([^"'`]+)["'`]/g)].map((match) => match[1])),
      ],
      buttons: [...source.matchAll(/<button\b/g)].length,
      disposition:
        key === 'redirects'
          ? 'Route CRUD, export/import and persisted state tested; UI journey separately logged'
          : 'Registered shipping view; UI controls require acceptance; registration is not a PASS',
    })
  }
  await writeFile(
    'docs/rc/evidence/rc1/18-pass/02C/route-inventory.json',
    JSON.stringify(
      {
        configuration:
          'Standard/all; test-auth=false; native controls subject to actual access functions',
        views,
        collections: payload.config.collections.map((collection) => ({
          slug: collection.slug,
          route: `/admin/collections/${collection.slug}`,
          hidden: collection.admin?.hidden === true,
          lockDocuments: collection.lockDocuments ?? true,
          controls: {
            create: collection.access?.create?.toString(),
            read: collection.access?.read?.toString(),
            update: collection.access?.update?.toString(),
            delete: collection.access?.delete?.toString(),
            bulkEditDisabled: collection.disableBulkEdit ?? false,
            bulkDeleteDisabled: collection.disableBulkDelete ?? false,
            defaultColumns: collection.admin?.defaultColumns,
            listSearchableFields: collection.admin?.listSearchableFields,
          },
          disposition:
            collection.admin?.hidden === true
              ? 'Hidden in navigation; API/access policy still shipping, no waiver'
              : 'Visible native CRUD/search/filter/pagination/bulk governed by listed access policy; UI acceptance unexecuted except named proof',
        })),
        globals: payload.config.globals.map((global) => ({
          slug: global.slug,
          route: `/admin/globals/${global.slug}`,
          updateAccess: global.access?.update?.toString(),
          disposition: 'Settings save/reload/locks require UI acceptance',
        })),
        providerBoundary:
          'No new deferrals. Disabled/setup-required states do not waive local adapter/error/retry/security proof. Remote federation is in scope for local independent-peer acceptance; only external bidirectional calendar sync remains excluded by RC1-SCOPE.',
      },
      null,
      2,
    ),
  )
  console.log(
    `Inventory: ${views.length} custom views, ${payload.config.collections.length} collections, ${payload.config.globals.length} globals`,
  )
  await payload.db.destroy?.()
}
run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
