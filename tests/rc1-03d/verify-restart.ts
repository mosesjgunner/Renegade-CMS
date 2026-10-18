import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { PayloadLegacyMigrationStore } from '../../src/modules/portability/legacy-migration'

async function main() {
  console.log('--- RC1-03D: POST-RESTART STATE PERSISTENCE VERIFICATION ---')
  const payload = await getPayload({ config })
  const store = new PayloadLegacyMigrationStore(payload)

  const scratchDir = path.resolve(process.cwd(), 'scratch/rc103d-20261018')
  const stateRaw = await readFile(path.join(scratchDir, 'state.json'), 'utf8')
  const snapshot = JSON.parse(stateRaw) as {
    canonicalSiteId: string
    migratedSiteId: string
    canonicalContentCount: number
    migratedContentCount: number
    migratedCategoryCount: number
    quarantineCount: number
    exportRecordCount: number
    runId: string
  }

  console.log(`Checking snapshot for site: ${snapshot.canonicalSiteId} and migrated site: ${snapshot.migratedSiteId}...`)

  // 1. Verify Canonical Site & Publication
  const canonicalSite = await payload.findByID({
    collection: 'sites',
    id: snapshot.canonicalSiteId,
    overrideAccess: true,
  })
  if (!canonicalSite) throw new Error(`Canonical site ${snapshot.canonicalSiteId} missing after restart!`)
  console.log(`✓ Canonical site verified: ${canonicalSite.name}`)

  const canonicalContent = await payload.find({
    collection: 'content',
    where: { site: { equals: snapshot.canonicalSiteId } },
    overrideAccess: true,
  })
  if (canonicalContent.docs.length !== snapshot.canonicalContentCount) {
    throw new Error(`Canonical content count mismatch: expected ${snapshot.canonicalContentCount}, got ${canonicalContent.docs.length}`)
  }
  console.log(`✓ Canonical content records persisted: ${canonicalContent.docs.length}`)

  // 2. Verify Migrated Site & Categories & Content
  const migratedSite = await payload.findByID({
    collection: 'sites',
    id: snapshot.migratedSiteId,
    overrideAccess: true,
  })
  if (!migratedSite) throw new Error(`Migrated site ${snapshot.migratedSiteId} missing after restart!`)
  console.log(`✓ Migrated site verified: ${migratedSite.name}`)

  const migratedContent = await payload.find({
    collection: 'content',
    where: { site: { equals: snapshot.migratedSiteId } },
    overrideAccess: true,
  })
  if (migratedContent.docs.length !== snapshot.migratedContentCount) {
    throw new Error(`Migrated content count mismatch: expected ${snapshot.migratedContentCount}, got ${migratedContent.docs.length}`)
  }
  console.log(`✓ Migrated content records persisted: ${migratedContent.docs.length}`)

  const categories = await payload.find({
    collection: 'categories',
    where: { site: { equals: snapshot.migratedSiteId } },
    overrideAccess: true,
  })
  if (categories.docs.length !== snapshot.migratedCategoryCount) {
    throw new Error(`Category count mismatch: expected ${snapshot.migratedCategoryCount}, got ${categories.docs.length}`)
  }
  console.log(`✓ Categories persisted: ${categories.docs.length}`)

  // 3. Verify Quarantined Records
  const quarantineRecords = await store.getQuarantineRecords(snapshot.runId)
  if (quarantineRecords.length !== snapshot.quarantineCount) {
    throw new Error(`Quarantine count mismatch: expected ${snapshot.quarantineCount}, got ${quarantineRecords.length}`)
  }
  console.log(`✓ Quarantined records persisted in PostgreSQL: ${quarantineRecords.length}`)

  console.log('\n--- ALL RESTART PERSISTENCE CHECKS PASSED ---')
}

main().catch((err) => {
  console.error('\n❌ POST-RESTART VERIFICATION FAILED:', err)
  process.exit(1)
})
