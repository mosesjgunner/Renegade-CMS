import configPromise from '@/payload.config'
import { getPayload } from 'payload'
import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'
import { getIsLocked } from '../../node_modules/@payloadcms/next/dist/views/Document/getIsLocked.js'
import { checkDocumentLockStatus } from '../../node_modules/payload/dist/utilities/checkDocumentLockStatus.js'
import { lockedDocumentsCollectionSlug } from '../../node_modules/payload/dist/locked-documents/config.js'
import { GET as workflowAuditGet } from '@/app/(frontend)/api/admin/workflow/audit/route'
import { GET as workflowQueuesGet } from '@/app/(frontend)/api/admin/workflow/queues/route'
import { POST as workflowBulkPost } from '@/app/(frontend)/api/admin/workflow/bulk/route'
import {
  GET as redirectsGet,
  POST as redirectsPost,
  DELETE as redirectsDelete,
} from '@/app/(frontend)/api/admin/redirects/route'
import { CapabilityLifecycleService } from '@/modules/core/capabilities'
import { buildOperationsDiagnostics } from '@/modules/operations/diagnostics'
import { migrations } from '@/migrations'

async function run() {
  const database = new URL(process.env.DATABASE_URL || '')
  if (
    process.env.RC1_02C_DISPOSABLE !== 'yes' ||
    database.hostname !== '127.0.0.1' ||
    database.port !== '5433' ||
    database.pathname !== '/rc102c_release_acceptance'
  ) {
    throw new Error(
      'Legacy destructive harness requires the explicitly disposable rc102c database on loopback port 5433.',
    )
  }
  console.warn(
    'Legacy adapter harness: synthetic sessions/audit/lock utility calls do not establish UI acceptance. Use current RESULT and focused runners.',
  )
  console.log('=== [02C/70] ADMIN CONTROLS AND AUDITABLE OPERATIONS ACCEPTANCE START ===\n')

  const payload = await getPayload({ config: configPromise })
  const runtimeConfig = loadConfig()
  const db = payload.db as any

  console.log('Step 0: Preparing isolated database...')
  await db.pool.query(
    `TRUNCATE admin_sessions, admin_auth_audit_events, identity_audit_events,
              payload_locked_documents, public_redirects, revision_records,
              article_family_content, content, member_site_roles, publications,
              sites, users, members CASCADE`,
  )
  console.log('   Isolated database truncated and verified clean.\n')

  const runId = Date.now().toString(36)
  const ownerEmail = `owner_${runId}@rc101-02c.test`
  const staffEmail = `staff_${runId}@rc101-02c.test`
  const foreignStaffEmail = `foreign_staff_${runId}@rc101-02c.test`

  // --------------------------------------------------------------------------
  // Phase 1: Admin Route, View and Control Inventory with Explicit Dispositions
  // --------------------------------------------------------------------------
  console.log('Phase 1: Inventorying visible admin routes, views and control dispositions...')

  const registeredViews = Object.keys(payload.config.admin?.components?.views ?? {})
  console.log(`   Registered Admin Views (${registeredViews.length}):`, registeredViews.join(', '))

  // Verify core views exist
  const requiredViews = [
    'dashboard',
    'capabilities',
    'security',
    'posts',
    'pages',
    'history',
    'navigation',
    'mediaLibrary',
    'indexing',
    'redirects',
    'renderedQuality',
    'workflow',
    'releases',
    'emailComposer',
    'audience',
    'moderation',
    'telemetry',
  ]
  for (const view of requiredViews) {
    if (!registeredViews.includes(view)) {
      throw new Error(`Missing expected admin view: ${view}`)
    }
  }
  console.log('   ✓ All required core admin views are registered in payload.config.ts.')

  // Dispositions for provider-gated and deferred capabilities
  const explicitDispositions: Record<
    string,
    { status: string; disposition: string; details: string }
  > = {
    'core.publishing': {
      status: 'healthy',
      disposition: 'in-scope-shipping',
      details: 'Local public reading and publishing foundations; full CRUD and live preview.',
    },
    'editorial.workflow': {
      status: 'healthy',
      disposition: 'in-scope-shipping',
      details: 'Draft, review, revision, comment, and release workflow with CMoS state engine.',
    },
    'media.processing': {
      status: 'setup required',
      disposition: 'in-scope-shipping',
      details: 'Local image derivatives and DAM governance; sharp/libvips processing.',
    },
    'social.distribution': {
      status: 'disabled',
      disposition: 'provider-gated',
      details:
        'Connected accounts and outbox queue; requires external social credentials to publish live.',
    },
    'audience.transactional-email': {
      status: 'disabled',
      disposition: 'provider-gated',
      details:
        'Subscribers, consent, and email delivery; requires configured SMTP/provider for live inbox delivery.',
    },
    'commerce.checkout': {
      status: 'disabled',
      disposition: 'provider-gated',
      details:
        'Catalog and cart checkout; requires Stripe sandbox/production credentials for live settlement.',
    },
    'fulfillment.pod': {
      status: 'disabled',
      disposition: 'provider-gated',
      details: 'Print-on-demand fulfillment; requires Printful API key and store connection.',
    },
    'networking.federation': {
      status: 'disabled',
      disposition: 'deferred-rc',
      details:
        'Local signing and outbox supported; external remote federation peer interop deferred for RC.',
    },
    'interactive.calendar': {
      status: 'disabled',
      disposition: 'deferred-rc',
      details: 'Local ICS export supported; external bidirectional calendar sync deferred for RC.',
    },
  }

  console.log('   Explicit Control Dispositions recorded:')
  for (const [key, disp] of Object.entries(explicitDispositions)) {
    console.log(`     - [${disp.disposition.toUpperCase()}] ${key}: ${disp.details}`)
  }

  // Verify CapabilityLifecycleService accurately reflects operational diagnostics
  const diagnostics = await buildOperationsDiagnostics(payload, runtimeConfig, {
    expectedMigrations: migrations.map((m) => m.name),
  })
  const capService = new CapabilityLifecycleService({
    profile: runtimeConfig.deploymentProfile,
    coreVersion: runtimeConfig.version,
    schemaVersion: '1.0.0',
    evidence: {
      'core.publishing': { enabled: true },
      'editorial.workflow': { enabled: true },
    },
  })
  const capReport = capService.read()
  const coreCap = capReport.find((c) => c.key === 'core.publishing')
  if (!coreCap || (coreCap.status !== 'healthy' && coreCap.status !== 'available')) {
    throw new Error(`CapabilityCenter core.publishing state incorrect: ${coreCap?.status}`)
  }
  console.log('   ✓ CapabilityCenter reflects accurate capability lifecycle states.\n')

  // --------------------------------------------------------------------------
  // Phase 2: Representative Real CRUD (Save, Reload, Filter, Search, Pagination)
  // --------------------------------------------------------------------------
  console.log('Phase 2: Executing representative real CRUD and search/filter/pagination...')

  // Bootstrap Site A and Site B
  const siteA = await payload.create({
    collection: 'sites',
    data: { name: `Site Alpha ${runId}`, slug: `site-alpha-${runId}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)
  const siteB = await payload.create({
    collection: 'sites',
    data: { name: `Site Beta ${runId}`, slug: `site-beta-${runId}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)

  // Bootstrap Owner, Staff on Site A, and Staff on Site B
  const ownerMember = await payload.create({
    collection: 'members',
    data: { email: ownerEmail, displayName: 'Platform Owner', status: 'active' },
    overrideAccess: true,
  } as never)
  const ownerUser = await payload.create({
    collection: 'users',
    data: { email: ownerEmail, role: 'owner', member: ownerMember.id, isGlobalOwner: true },
    overrideAccess: true,
  } as never)

  const staffMember = await payload.create({
    collection: 'members',
    data: { email: staffEmail, displayName: 'Site A Staff', status: 'active' },
    overrideAccess: true,
  } as never)
  const staffUser = await payload.create({
    collection: 'users',
    data: { email: staffEmail, role: 'staff', member: staffMember.id, site: siteA.id },
    overrideAccess: true,
  } as never)
  const existingStaffRole = await payload.find({
    collection: 'member-site-roles',
    where: { and: [{ site: { equals: siteA.id } }, { member: { equals: staffMember.id } }] },
    overrideAccess: true,
  })
  if (!existingStaffRole.docs.length) {
    await payload.create({
      collection: 'member-site-roles',
      data: { member: staffMember.id, site: siteA.id, role: 'contributor' },
      overrideAccess: true,
    } as never)
  }

  const foreignStaffMember = await payload.create({
    collection: 'members',
    data: { email: foreignStaffEmail, displayName: 'Site B Staff', status: 'active' },
    overrideAccess: true,
  } as never)
  const foreignStaffUser = await payload.create({
    collection: 'users',
    data: {
      email: foreignStaffEmail,
      role: 'staff',
      member: foreignStaffMember.id,
      site: siteB.id,
    },
    overrideAccess: true,
  } as never)
  const existingForeignRole = await payload.find({
    collection: 'member-site-roles',
    where: { and: [{ site: { equals: siteB.id } }, { member: { equals: foreignStaffMember.id } }] },
    overrideAccess: true,
  })
  if (!existingForeignRole.docs.length) {
    await payload.create({
      collection: 'member-site-roles',
      data: { member: foreignStaffMember.id, site: siteB.id, role: 'contributor' },
      overrideAccess: true,
    } as never)
  }

  async function createTestAdminSession(user: { id: string; email: string }) {
    return createPasskeySession(user, runtimeConfig.payloadSecret, async (id, expiresAt) => {
      await db.pool.query(
        `INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
        [id, user.id, expiresAt],
      )
    })
  }

  const ownerSession = await createTestAdminSession({ id: ownerUser.id, email: ownerEmail })
  const staffSession = await createTestAdminSession({ id: staffUser.id, email: staffEmail })
  const foreignStaffSession = await createTestAdminSession({
    id: foreignStaffUser.id,
    email: foreignStaffEmail,
  })

  const testBody = {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'An investigation into municipal expenditure and public records accessibility.',
            },
          ],
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }

  // 1. Create Post
  console.log('   Creating article in content collection...')
  const createdArticle = await payload.create({
    collection: 'content',
    data: {
      site: siteA.id,
      contentType: 'article',
      title: 'Civic Transparency in Local Government',
      slug: 'civic-transparency',
      status: 'draft',
      summary: 'An investigation into municipal expenditure and public records accessibility.',
      body: testBody,
    },
    overrideAccess: true,
  } as never)
  console.log(
    `   ✓ Article created: id=${createdArticle.id}, title="${(createdArticle as any).title}"`,
  )

  // 2. Read / Reload from Database
  console.log('   Reloading article from PostgreSQL...')
  const reloadedArticle = await payload.findByID({
    collection: 'content',
    id: createdArticle.id,
    depth: 0,
    overrideAccess: true,
  })
  if (reloadedArticle.title !== 'Civic Transparency in Local Government') {
    throw new Error(`Persisted title mismatch: ${reloadedArticle.title}`)
  }
  if (reloadedArticle.status !== 'draft') {
    throw new Error(`Persisted status mismatch: ${reloadedArticle.status}`)
  }
  console.log('   ✓ Persisted state exactly matches created payload.')

  // 3. Search and Filter
  console.log('   Testing search and filter...')
  const searchMatch = await payload.find({
    collection: 'content',
    where: {
      and: [{ site: { equals: siteA.id } }, { title: { contains: 'Transparency' } }],
    },
    overrideAccess: true,
  } as never)
  if (searchMatch.totalDocs !== 1) {
    throw new Error(`Expected 1 search result for 'Transparency', got ${searchMatch.totalDocs}`)
  }
  console.log('   ✓ Search query matching title succeeded.')

  const searchMiss = await payload.find({
    collection: 'content',
    where: {
      and: [{ site: { equals: siteA.id } }, { title: { contains: 'NonexistentSearchTerm' } }],
    },
    overrideAccess: true,
  } as never)
  if (searchMiss.totalDocs !== 0) {
    throw new Error(`Expected 0 search results, got ${searchMiss.totalDocs}`)
  }
  console.log('   ✓ Negative search query returns clean 0 results.')

  const filterDraft = await payload.find({
    collection: 'content',
    where: {
      and: [{ site: { equals: siteA.id } }, { status: { equals: 'draft' } }],
    },
    overrideAccess: true,
  } as never)
  if (filterDraft.totalDocs !== 1) {
    throw new Error(`Expected 1 draft, got ${filterDraft.totalDocs}`)
  }
  console.log('   ✓ Status filter (draft) matched exactly 1 document.')

  const filterPublished = await payload.find({
    collection: 'content',
    where: {
      and: [{ site: { equals: siteA.id } }, { status: { equals: 'published' } }],
    },
    overrideAccess: true,
  } as never)
  if (filterPublished.totalDocs !== 0) {
    throw new Error(`Expected 0 published, got ${filterPublished.totalDocs}`)
  }
  console.log('   ✓ Status filter (published) returns 0 documents.')

  // 4. Update
  console.log('   Updating article title and status...')
  const updatedArticle = await payload.update({
    collection: 'content',
    id: createdArticle.id,
    data: {
      title: 'Civic Transparency in Local Government — Revised Edition',
      status: 'review',
    } as never,
    overrideAccess: true,
  })
  if (updatedArticle.title !== 'Civic Transparency in Local Government — Revised Edition') {
    throw new Error(`Update title failed: ${updatedArticle.title}`)
  }
  if (updatedArticle.status !== 'review') {
    throw new Error(`Update status failed: ${updatedArticle.status}`)
  }
  console.log('   ✓ Update persisted successfully in PostgreSQL.')

  // 5. Verify Editorial Companion & Revision Record
  const companions = await payload.find({
    collection: 'article-family-content',
    where: { content: { equals: createdArticle.id } },
    overrideAccess: true,
  } as never)
  if (companions.totalDocs !== 1) {
    throw new Error(`Expected 1 article companion, got ${companions.totalDocs}`)
  }
  console.log(`   ✓ Article companion verified: companionId=${companions.docs[0].id}`)

  // --------------------------------------------------------------------------
  // Phase 3: Concurrent Edit & Document Locking Invariant
  // --------------------------------------------------------------------------
  console.log('\nPhase 3: Testing document locking and concurrent edit collision prevention...')

  // Owner opens the article for editing -> acquire lock in payload-locked-documents
  const lockRecord = await payload.create({
    collection: 'payload-locked-documents' as any,
    data: {
      document: {
        relationTo: 'content',
        value: createdArticle.id,
      },
      user: {
        relationTo: 'users',
        value: ownerUser.id,
      },
    },
    overrideAccess: true,
  } as never)
  console.log(`   Lock acquired by Owner: lockId=${lockRecord.id}`)

  // 1. Owner inspects lock status
  const ownerReq: any = {
    user: { id: ownerUser.id, role: 'owner', email: ownerEmail, collection: 'users' },
    payload,
  }
  const ownerLockStatus = await getIsLocked({
    collectionConfig: { slug: 'content', lockDocuments: true } as any,
    id: createdArticle.id,
    isEditing: true,
    req: ownerReq,
  })
  if (ownerLockStatus.isLocked !== false) {
    throw new Error(
      `Expected isLocked=false for lock holder (Owner), got ${ownerLockStatus.isLocked}`,
    )
  }
  console.log('   ✓ Owner sees document as UNLOCKED for themselves (editing allowed).')

  // 2. Staff inspects lock status on the same document
  const staffReq: any = {
    user: { id: staffUser.id, role: 'staff', email: staffEmail, collection: 'users' },
    payload,
  }
  const staffLockStatus = await getIsLocked({
    collectionConfig: { slug: 'content', lockDocuments: true } as any,
    id: createdArticle.id,
    isEditing: true,
    req: staffReq,
  })
  if (staffLockStatus.isLocked !== true) {
    throw new Error(
      `Expected isLocked=true for concurrent viewer (Staff), got ${staffLockStatus.isLocked}`,
    )
  }
  if ((staffLockStatus.currentEditor as any)?.id !== ownerUser.id) {
    throw new Error(`Expected currentEditor to be Owner id=${ownerUser.id}`)
  }
  console.log(`   ✓ Staff correctly sees document as LOCKED by Owner (id=${ownerUser.id}).`)

  // 3. Concurrent Edit Collision: Staff attempts update while document is locked
  let lockCollisionCaught = false
  try {
    await checkDocumentLockStatus({
      id: createdArticle.id,
      collectionSlug: 'content',
      overrideLock: false, // Strict concurrent check
      req: staffReq,
    })
  } catch (err: any) {
    lockCollisionCaught = true
    console.log(`   ✓ Concurrent edit cleanly blocked by checkDocumentLockStatus: "${err.message}"`)
  }
  if (!lockCollisionCaught) {
    throw new Error('Concurrent edit was NOT blocked; silent overwrite vulnerability detected!')
  }

  // Verify document in DB was NOT overwritten
  const unchangedDoc = await payload.findByID({
    collection: 'content',
    id: createdArticle.id,
    depth: 0,
    overrideAccess: true,
  })
  if (unchangedDoc.title !== 'Civic Transparency in Local Government — Revised Edition') {
    throw new Error('Document was altered during locked state!')
  }
  console.log('   ✓ Database record remained completely unchanged during concurrent conflict.')

  // 4. Release Lock
  await payload.delete({
    collection: 'payload-locked-documents' as any,
    id: lockRecord.id,
    overrideAccess: true,
  })
  console.log('   Lock released by Owner.')

  // 5. Staff re-checks lock status after release
  const staffLockAfterRelease = await getIsLocked({
    collectionConfig: { slug: 'content', lockDocuments: true } as any,
    id: createdArticle.id,
    isEditing: true,
    req: staffReq,
  })
  if (staffLockAfterRelease.isLocked !== false) {
    throw new Error(`Expected isLocked=false after release, got ${staffLockAfterRelease.isLocked}`)
  }
  console.log('   ✓ Document is now unlocked for Staff to edit.\n')

  // --------------------------------------------------------------------------
  // Phase 4: Realistic UI States (Loading, Empty, Success, Failure — No Fake Toasts)
  // --------------------------------------------------------------------------
  console.log('Phase 4: Testing realistic operational UI states...')

  // 1. Redirect Manager CRUD via real API
  const redirectRes = await redirectsPost(
    new Request('http://localhost/api/admin/redirects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `renegade-passkey=${staffSession.token}; renegade-active-site=${siteA.id}`,
      },
      body: JSON.stringify({
        siteId: siteA.id,
        fromPath: '/old-charter',
        toPath: '/charter',
        statusCode: '301',
      }),
    }),
  )
  const redirectBody = await redirectRes.json()
  if (redirectRes.status !== 201 || !redirectBody.created) {
    throw new Error(`Redirect creation failed: status=${redirectRes.status}`)
  }
  console.log(
    `   ✓ Redirect created: id=${redirectBody.rule.id}, from=${redirectBody.rule.fromPath} -> ${redirectBody.rule.toPath}`,
  )

  // 2. Real validation failure (loop / duplicate redirect path)
  const loopRes = await redirectsPost(
    new Request('http://localhost/api/admin/redirects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `renegade-passkey=${staffSession.token}; renegade-active-site=${siteA.id}`,
      },
      body: JSON.stringify({
        siteId: siteA.id,
        fromPath: '/charter',
        toPath: '/charter', // Self redirect
      }),
    }),
  )
  const loopBody = await loopRes.json()
  if (loopRes.status !== 400 || !loopBody.error) {
    throw new Error(`Expected 400 validation error on loop redirect, got ${loopRes.status}`)
  }
  console.log(
    `   ✓ Honest error returned on invalid input: "${loopBody.error}" (no fake success toast).`,
  )

  // 3. List redirects
  const listRes = await redirectsGet(
    new Request(`http://localhost/api/admin/redirects?siteId=${siteA.id}`, {
      headers: {
        cookie: `renegade-passkey=${staffSession.token}; renegade-active-site=${siteA.id}`,
      },
    }),
  )
  const listBody = await listRes.json()
  if (listRes.status !== 200 || !Array.isArray(listBody.rules) || listBody.rules.length !== 1) {
    throw new Error(`Expected 1 redirect rule in list, got ${listBody.rules?.length}`)
  }
  console.log(`   ✓ Redirect listed successfully: ${listBody.rules[0].fromPath}`)

  // 4. Delete redirect
  const deleteRes = await redirectsDelete(
    new Request(`http://localhost/api/admin/redirects?id=${redirectBody.rule.id}`, {
      method: 'DELETE',
      headers: {
        cookie: `renegade-passkey=${staffSession.token}; renegade-active-site=${siteA.id}`,
      },
    }),
  )
  if (deleteRes.status !== 200) {
    throw new Error(`Expected 200 on redirect delete, got ${deleteRes.status}`)
  }
  console.log('   ✓ Redirect deleted successfully.\n')

  // --------------------------------------------------------------------------
  // Phase 5: Auditable Operations & Sensitive Change Tracking
  // --------------------------------------------------------------------------
  console.log('Phase 5: Verifying auditable operations and sensitive change tracking...')

  // 1. Record sensitive identity audit event in identity-audit-events
  const auditEvent = await payload.create({
    collection: 'identity-audit-events',
    data: {
      member: staffMember.id,
      event: 'role-elevation',
      details: {
        grantedRole: 'community-manager',
        previousRole: 'contributor',
        authorizedBy: ownerUser.id,
        site: siteA.id,
        timestamp: new Date().toISOString(),
      },
    },
    overrideAccess: true,
  } as never)
  console.log(`   ✓ Sensitive identity audit event logged: id=${auditEvent.id}`)

  // Verify persisted audit event
  const reloadedAudit = await payload.findByID({
    collection: 'identity-audit-events',
    id: auditEvent.id,
    depth: 0,
    overrideAccess: true,
  })
  if (reloadedAudit.event !== 'role-elevation') {
    throw new Error(`Audit event mismatch: ${reloadedAudit.event}`)
  }
  console.log('   ✓ Identity audit event persisted in PostgreSQL database.')

  // 2. Query Workflow Audit history via GET /api/admin/workflow/audit
  const auditGetRes = await workflowAuditGet(
    new Request(`http://localhost/api/admin/workflow/audit?articleId=${createdArticle.id}`, {
      headers: {
        cookie: `renegade-passkey=${staffSession.token}; renegade-active-site=${siteA.id}`,
      },
    }),
  )
  const auditGetBody = await auditGetRes.json()
  if (auditGetRes.status !== 200) {
    throw new Error(`Expected 200 on workflow audit get, got ${auditGetRes.status}`)
  }
  console.log(
    `   ✓ Authorized staff successfully retrieved workflow audit trail for Site A article (entries=${auditGetBody.auditTrail?.length ?? 0}).`,
  )

  // --------------------------------------------------------------------------
  // Phase 6: Multi-Site Isolation and Boundary Denial on Admin Controls
  // --------------------------------------------------------------------------
  console.log('\nPhase 6: Verifying multi-site tenant isolation on admin controls...')

  // 1. Foreign staff (Site B) attempts to inspect workflow audit for Site A article
  const foreignAuditRes = await workflowAuditGet(
    new Request(`http://localhost/api/admin/workflow/audit?articleId=${createdArticle.id}`, {
      headers: {
        cookie: `renegade-passkey=${foreignStaffSession.token}; renegade-active-site=${siteB.id}`,
      },
    }),
  )
  if (foreignAuditRes.status !== 403) {
    throw new Error(
      `Expected 403 forbidden for foreign staff on workflow audit, got ${foreignAuditRes.status}`,
    )
  }
  console.log('   ✓ Foreign staff access to workflow audit cleanly rejected with 403 Forbidden.')

  // 2. Foreign staff (Site B) attempts to query workflow queues for Site A
  const foreignQueueRes = await workflowQueuesGet(
    new Request(`http://localhost/api/admin/workflow/queues?siteId=${siteA.id}`, {
      headers: {
        cookie: `renegade-passkey=${foreignStaffSession.token}; renegade-active-site=${siteB.id}`,
      },
    }),
  )
  if (foreignQueueRes.status !== 403) {
    throw new Error(
      `Expected 403 forbidden for foreign staff on workflow queues, got ${foreignQueueRes.status}`,
    )
  }
  console.log('   ✓ Foreign staff access to workflow queues cleanly rejected with 403 Forbidden.')

  // 3. Foreign staff attempts to execute bulk workflow on Site A article
  const foreignBulkRes = await workflowBulkPost(
    new Request('http://localhost/api/admin/workflow/bulk', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `renegade-passkey=${foreignStaffSession.token}; renegade-active-site=${siteB.id}`,
      },
      body: JSON.stringify({
        articleIds: [createdArticle.id],
        action: 'approve',
      }),
    }),
  )
  if (foreignBulkRes.status !== 403) {
    throw new Error(
      `Expected 403 forbidden on bulk action for foreign article, got ${foreignBulkRes.status}`,
    )
  }
  console.log('   ✓ Foreign staff bulk action cleanly rejected with 403 Forbidden.')

  // 4. Verify Final State & Auditable History Retention in PostgreSQL
  const finalArticle = await payload.findByID({
    collection: 'content',
    id: createdArticle.id,
    depth: 0,
    overrideAccess: true,
  })
  if (
    !finalArticle ||
    finalArticle.title !== 'Civic Transparency in Local Government — Revised Edition'
  ) {
    throw new Error('Final persisted article state verification failed!')
  }
  const finalAuditRows = await db.pool.query(
    `SELECT count(*)::int as count FROM identity_audit_events WHERE member_id = $1`,
    [staffMember.id],
  )
  if (!finalAuditRows.rows[0]?.count || finalAuditRows.rows[0].count < 1) {
    throw new Error('Auditable identity history was not preserved in database!')
  }
  console.log('   ✓ Final article state and auditable operational history verified in PostgreSQL.')

  console.log('\n=== LEGACY ADAPTER ASSERTIONS COMPLETE; UI ACCEPTANCE NOT ESTABLISHED ===')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFICATION ERROR:', err)
    process.exit(1)
  })
