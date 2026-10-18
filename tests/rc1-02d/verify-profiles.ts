import assert from 'node:assert/strict'
import { loadConfig } from '@/modules/core/config'
import { registeredPayloadDomains } from '@/modules/payload-domains'
import {
  POSTGRES_FUNCTION_ARG_LIMIT,
  gatePayloadRegistrations,
  parseEnabledModules,
  floorCollectionSlugs,
  OPTIONAL_MODULES,
} from '@/modules/module-registry'
import { isRegisteredCollection } from '@/modules/public/registered-collections'
import { GET as cartGet } from '@/app/(frontend)/api/commerce/cart/route'
import { GET as threadsGet } from '@/app/(frontend)/api/community/threads/route'
import { GET as postsGet } from '@/app/(frontend)/api/community/posts/route'
import { GET as commentsGet } from '@/app/(frontend)/api/community/comments/route'
import { getPayload } from 'payload'
import config from '@/payload.config'

async function run() {
  const isLeanCheck = process.argv.includes('--lean') || process.env.RENEGADE_MODULES !== 'all'
  const isAllCheck = process.argv.includes('--all')

  const fullRegistrations = registeredPayloadDomains(
    loadConfig({
      DATABASE_URL: process.env.DATABASE_URL!,
      PAYLOAD_SECRET: process.env.PAYLOAD_SECRET!,
      APP_URL: process.env.APP_URL!,
    }),
  )
  const floorSlugs = floorCollectionSlugs(fullRegistrations)

  if (isLeanCheck) {
    console.log('Running 02D Module Profiles: Lean / Default Verification & Safe Unavailable States...')

    // 1. Lean / Default Profile
    console.log('1. Testing Profile 1: Lean / Default (~66 collections)...')
    const leanDefault = gatePayloadRegistrations(fullRegistrations, { enabled: new Set() })
    assert(leanDefault.collections.length < 100, 'Lean default must stay well below 100')
    assert(leanDefault.collections.length > 50, 'Lean default must contain core baseline')
    assert.equal(leanDefault.collections.length, floorSlugs.length)

    // 2. Safe Unavailable HTTP 503 States when optional modules are not mounted
    console.log('2. Verifying Safe Unavailable HTTP 503 Degradation...')

    // Commerce Cart route
    const cartReq = new Request('http://localhost:38905/api/commerce/cart')
    const cartRes = await cartGet(cartReq)
    assert.equal(cartRes.status, 503, 'Disabled commerce cart route must return HTTP 503')
    const cartBody = await cartRes.json()
    assert.equal(cartBody.error, 'Commerce cart service is unavailable.')

    // Community Threads route
    const threadsReq = new Request('http://localhost:38905/api/community/threads?siteId=test-site')
    const threadsRes = await threadsGet(threadsReq)
    assert.equal(threadsRes.status, 503, 'Disabled community threads route must return HTTP 503')
    const threadsBody = await threadsRes.json()
    assert.equal(threadsBody.error, 'Community discussions service is unavailable.')

    // Community Posts route
    const postsReq = new Request('http://localhost:38905/api/community/posts?discussionId=test-disc&siteId=test-site')
    const postsRes = await postsGet(postsReq)
    assert.equal(postsRes.status, 503, 'Disabled community posts route must return HTTP 503')
    const postsBody = await postsRes.json()
    assert.equal(postsBody.error, 'Community discussions service is unavailable.')

    // Community Comments route
    const commentsReq = new Request('http://localhost:38905/api/community/comments?discussionId=test-disc&siteId=test-site')
    const commentsRes = await commentsGet(commentsReq)
    assert.equal(commentsRes.status, 503, 'Disabled community comments route must return HTTP 503')
    const commentsBody = await commentsRes.json()
    assert.equal(commentsBody.error, 'Community discussions service is unavailable.')

    // 3. Standard / Default Profile
    console.log('3. Testing Profile 2: Standard / Default...')
    const standardDefault = gatePayloadRegistrations(fullRegistrations, {
      enabled: parseEnabledModules(''),
    })
    assert.equal(standardDefault.collections.length, floorSlugs.length)

    console.log('PASS 02D Profiles (Lean/Default & Standard/Default): Safe unavailable degradation confirmed.')
    process.exit(0)
  }

  if (isAllCheck) {
    console.log('Running 02D Module Profiles: Standard / All and Lean / All Verification...')

    // 4. Standard / All Profile
    console.log('4. Testing Profile 3: Standard / All (207+ collections, lockDocuments safe)...')
    const standardAll = gatePayloadRegistrations(fullRegistrations, {
      enabled: parseEnabledModules('all'),
      warn: () => {},
    })
    assert.equal(standardAll.collections.length, fullRegistrations.collections.length)
    assert(standardAll.collections.length > 200, 'Standard all must register full 207+ collections')

    const lockableCount = standardAll.collections.filter((c) => c.lockDocuments !== false).length
    assert(
      lockableCount < POSTGRES_FUNCTION_ARG_LIMIT,
      `Lockable collections (${lockableCount}) must stay below PostgreSQL function arg limit (${POSTGRES_FUNCTION_ARG_LIMIT})`,
    )

    // Check Payload runtime collections under all modules
    const payload = await getPayload({ config })
    assert.equal(isRegisteredCollection(payload, 'carts'), true, 'Carts must be registered in all-modules profile')
    assert.equal(isRegisteredCollection(payload, 'forums'), true, 'Forums must be registered in all-modules profile')
    assert.equal(isRegisteredCollection(payload, 'discussions'), true, 'Discussions must be registered in all-modules profile')

    // 5. Lean / All Profile
    console.log('5. Testing Profile 4: Supported Lean / All...')
    const leanAll = gatePayloadRegistrations(fullRegistrations, {
      enabled: new Set(OPTIONAL_MODULES.map((m) => m.id)),
      warn: () => {},
    })
    assert.equal(leanAll.collections.length, fullRegistrations.collections.length)
    const leanLockable = leanAll.collections.filter((c) => c.lockDocuments !== false).length
    assert(leanLockable < POSTGRES_FUNCTION_ARG_LIMIT)

    console.log('PASS 02D Profiles (Standard/All & Lean/All): Full module suites and PostgreSQL lock safety confirmed.')
    process.exit(0)
  }
}

run().catch((err) => {
  console.error('FAIL in verify-profiles:', err)
  process.exit(1)
})
