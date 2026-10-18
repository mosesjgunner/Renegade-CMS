import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import config from '@payload-config'
import { getPayload } from 'payload'
import pg from 'pg'
import {
  createEditorialPreviewToken,
  resolveEditorialPreviewToken,
  restoreEditorialRevision,
  loadPublishedArticleByPath,
} from '../../src/modules/editorial/persistence.js'
import { canRenderPublic, canDiscoverPublic } from '../../src/modules/public/contracts.js'
import { resolveDiscoveryDocument } from '../../src/modules/public/discovery.js'
import { getIsLocked } from '../../node_modules/@payloadcms/next/dist/views/Document/getIsLocked.js'
import { checkDocumentLockStatus } from '../../node_modules/payload/dist/utilities/checkDocumentLockStatus.js'

async function run() {
  console.log('--- RC1-03B / Rich Editor, Drafts, Preview & Revisions Acceptance ---')
  const payload = await getPayload({ config })
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URI })

  await mkdir('scratch/rc103b-20261018', { recursive: true })

  // =========================================================================
  // Phase 1: Setup Multi-Site, Publications, Authors & Users
  // =========================================================================
  console.log('\nPhase 1: Setting up multi-site infrastructure, publications, authors & actors...')
  const siteA = await payload.create({
    collection: 'sites',
    data: {
      name: 'Site Alpha',
      slug: 'site-alpha',
      host: 'alpha.rc103b.test',
      status: 'active',
      isDefault: true,
    } as any,
  })
  const siteB = await payload.create({
    collection: 'sites',
    data: {
      name: 'Site Beta',
      slug: 'site-beta',
      host: 'beta.rc103b.test',
      status: 'active',
      isDefault: false,
    } as any,
  })

  const pubA = await payload.create({
    collection: 'publications',
    data: {
      site: siteA.id,
      name: 'Publication Alpha',
      slug: 'pub-alpha',
    } as any,
  })
  const pubB = await payload.create({
    collection: 'publications',
    data: {
      site: siteB.id,
      name: 'Publication Beta',
      slug: 'pub-beta',
    } as any,
  })

  // Authors
  const authorJane = await payload.create({
    collection: 'authors',
    data: {
      displayName: 'Jane Author',
      slug: 'jane-author',
      bio: 'Investigative journalist specializing in public policy analysis.',
    } as any,
  })
  const authorMark = await payload.create({
    collection: 'authors',
    data: {
      displayName: 'Mark Columnist',
      slug: 'mark-columnist',
      bio: 'Senior economics editor and market analyst.',
    } as any,
  })

  // Actors
  const ownerUser = await payload.create({
    collection: 'users',
    data: {
      email: 'owner@rc103b.test',
      role: 'owner',
    } as any,
  })
  const staffAlphaUser = await payload.create({
    collection: 'users',
    data: {
      email: 'staff-alpha@rc103b.test',
      role: 'staff',
    } as any,
  })
  const staffAlphaMember = (
    await payload.find({
      collection: 'members',
      where: { email: { equals: 'staff-alpha@rc103b.test' } },
      depth: 0,
    })
  ).docs[0]
  await payload.create({
    collection: 'member-site-roles',
    data: {
      member: staffAlphaMember.id,
      site: siteA.id,
      role: 'contributor',
    },
  })

  const staffBetaUser = await payload.create({
    collection: 'users',
    data: {
      email: 'staff-beta@rc103b.test',
      role: 'staff',
    } as any,
  })
  const staffBetaMember = (
    await payload.find({
      collection: 'members',
      where: { email: { equals: 'staff-beta@rc103b.test' } },
      depth: 0,
    })
  ).docs[0]
  await payload.create({
    collection: 'member-site-roles',
    data: {
      member: staffBetaMember.id,
      site: siteB.id,
      role: 'contributor',
    },
  })

  const subscriberUser = await payload.create({
    collection: 'members',
    data: {
      email: 'subscriber@rc103b.test',
      displayName: 'Sam Subscriber',
      status: 'active',
    } as any,
  })

  // Media Asset
  const mediaAsset = await payload.create({
    collection: 'media-assets',
    data: {
      site: siteA.id,
      title: 'Field Expedition Landscape',
      kind: 'image',
      storageProvider: 'local',
      altText: 'Vast mountain landscape photographed during field expedition',
    } as any,
  })
  console.log(`   ✓ Sites, publications, authors, users, and media asset provisioned.`)

  // =========================================================================
  // Phase 2: Create Two Articles and One Page with Media & Blocks
  // =========================================================================
  console.log('\nPhase 2: Creating two articles and one page with rich formatting, media & blocks...')

  function textNode(text: string, format = 0): Record<string, unknown> {
    return {
      type: 'text',
      version: 1,
      text,
      format,
      detail: 0,
      mode: 'normal',
      style: '',
    }
  }

  function pNode(...children: Array<Record<string, unknown>>): Record<string, unknown> {
    return {
      type: 'paragraph',
      version: 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      textFormat: 0,
      children,
    }
  }

  function hNode(tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', text: string): Record<string, unknown> {
    return {
      type: 'heading',
      tag,
      version: 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      children: [textNode(text)],
    }
  }

  function quoteNode(text: string): Record<string, unknown> {
    return {
      type: 'quote',
      version: 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      children: [textNode(text)],
    }
  }

  function listNode(items: string[], listType: 'bullet' | 'number' = 'bullet'): Record<string, unknown> {
    return {
      type: 'list',
      listType,
      tag: listType === 'bullet' ? 'ul' : 'ol',
      version: 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      start: 1,
      children: items.map((item, idx) => ({
        type: 'listitem',
        value: idx + 1,
        version: 1,
        format: '',
        indent: 0,
        direction: 'ltr',
        children: [textNode(item)],
      })),
    }
  }

  function hrNode(): Record<string, unknown> {
    return {
      type: 'horizontalrule',
      version: 1,
    }
  }

  function linkNode(url: string, text: string): Record<string, unknown> {
    return {
      type: 'link',
      version: 2,
      format: '',
      indent: 0,
      direction: 'ltr',
      fields: {
        linkType: 'custom',
        url,
        newTab: false,
      },
      children: [textNode(text)],
    }
  }

  function relationshipNode(relationTo: 'media-assets' | 'content', value: string | number): Record<string, unknown> {
    return {
      type: 'relationship',
      version: 2,
      format: '',
      relationTo,
      value: String(value),
    }
  }

  function rootDoc(...children: Array<Record<string, unknown>>) {
    return {
      root: {
        type: 'root',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        children,
      },
    }
  }

  const article1Body = rootDoc(
    hNode('h2', 'Executive Summary and Primary Findings'),
    pNode(
      textNode('Our investigative field study provides '),
      textNode('compelling empirical evidence', 1),
      textNode(' along with '),
      textNode('critical insights', 2),
      textNode(' and '),
      textNode('verifiable data models', 16),
      textNode('. Refer to the full '),
      linkNode('https://alpha.rc103b.test/resources', 'reference documentation'),
      textNode(' for methodology details.'),
    ),
    quoteNode('Transparency in reporting remains our utmost priority.'),
    listNode([
      'Key Milestone 1: Site inspection complete',
      'Key Milestone 2: Audio transcripts cross-checked',
    ]),
    hrNode(),
    relationshipNode('media-assets', mediaAsset.id),
  )

  const article1 = await payload.create({
    collection: 'content',
    data: {
      site: siteA.id,
      publication: pubA.id,
      contentType: 'article',
      title: 'Alpha Investigative Field Report',
      slug: 'alpha-investigative-report',
      status: 'draft',
      summary: 'A detailed investigative inquiry into regional ecological resilience.',
      authors: [
        {
          author: authorJane.id,
          displayOrder: 0,
          role: 'Lead Reporter',
        },
      ],
      body: article1Body,
    } as any,
  })

  const article2Body = rootDoc(
    hNode('h2', 'Economic Projections for Q4'),
    pNode(
      textNode('Quarterly financial analysis indicates stable growth trajectories.'),
    ),
    relationshipNode('media-assets', mediaAsset.id),
  )

  const article2 = await payload.create({
    collection: 'content',
    data: {
      site: siteA.id,
      publication: pubA.id,
      contentType: 'article',
      title: 'Alpha Economic Outlook',
      slug: 'alpha-economic-outlook',
      status: 'draft',
      summary: 'Comprehensive macroeconomic analysis for the upcoming quarter.',
      authors: [
        {
          author: authorMark.id,
          displayOrder: 0,
          role: 'Economics Editor',
        },
      ],
      body: article2Body,
    } as any,
  })

  const page1Body = rootDoc(
    hNode('h1', 'About Alpha Investigation Team'),
    pNode(
      textNode('Renegade investigations operate independently with public support.'),
    ),
    relationshipNode('media-assets', mediaAsset.id),
  )

  const page1 = await payload.create({
    collection: 'content',
    data: {
      site: siteA.id,
      publication: pubA.id,
      contentType: 'page',
      title: 'About Alpha Investigation Team',
      slug: 'about-alpha',
      pageTemplate: 'standard',
      status: 'draft',
      summary: 'Institutional mission and editorial code of conduct.',
      body: page1Body,
    } as any,
  })

  console.log(`   ✓ Article 1 (id=${article1.id}), Article 2 (id=${article2.id}), and Page 1 (id=${page1.id}) created as drafts.`)

  // =========================================================================
  // Phase 3: Save & Reload Persistence Check
  // =========================================================================
  console.log('\nPhase 3: Verifying save/reload persistence and companion revision records...')
  const reloadedArticle1 = await payload.findByID({ collection: 'content', id: article1.id, depth: 2 })
  const reloadedArticle2 = await payload.findByID({ collection: 'content', id: article2.id, depth: 2 })
  const reloadedPage1 = await payload.findByID({ collection: 'content', id: page1.id, depth: 2 })

  assert.equal(reloadedArticle1.title, 'Alpha Investigative Field Report')
  assert.equal(reloadedArticle1.status, 'draft')
  assert.equal((reloadedArticle1.authors as any[])[0].author.displayName, 'Jane Author')
  assert.equal(reloadedArticle2.title, 'Alpha Economic Outlook')
  assert.equal(reloadedPage1.title, 'About Alpha Investigation Team')
  assert.equal(reloadedPage1.contentType, 'page')

  const family1 = (
    await payload.find({
      collection: 'article-family-content',
      where: { content: { equals: article1.id } },
      depth: 0,
    })
  ).docs[0]
  assert.ok(family1, 'Article 1 must have an article-family-content companion')
  assert.equal(family1.currentRevisionSequence, 1)
  assert.equal(family1.lifecycle, 'draft')

  const initialRevisions = await payload.find({
    collection: 'revision-records',
    where: { article: { equals: family1.id } },
    sort: 'sequence',
    depth: 0,
  })
  assert.equal(initialRevisions.totalDocs, 1)
  assert.equal(initialRevisions.docs[0].sequence, 1)
  assert.equal(initialRevisions.docs[0].reason, 'created')
  const revision1Id = initialRevisions.docs[0].id
  console.log(`   ✓ Initial revisions created: family1Id=${family1.id}, rev1Id=${revision1Id}`)

  // =========================================================================
  // Phase 4: Edit Article 1 (Autosave/Draft Persistence)
  // =========================================================================
  console.log('\nPhase 4: Editing Article 1 to verify draft mutation and revision advancement...')
  const updatedArticle1Body = rootDoc(
    ...(article1Body.root.children as any[]),
    hNode('h3', 'Phase 2 Updated Discoveries'),
    pNode(
      textNode('Supplemental fieldwork uncovered additional corroborating documents.'),
    ),
  )

  await payload.update({
    collection: 'content',
    id: article1.id,
    data: {
      body: updatedArticle1Body,
    } as any,
  })

  const family1Updated = await payload.findByID({
    collection: 'article-family-content',
    id: family1.id,
    depth: 0,
  })
  assert.equal(family1Updated.currentRevisionSequence, 2, 'Revision sequence must advance to 2')

  const revisionsAfterEdit = await payload.find({
    collection: 'revision-records',
    where: { article: { equals: family1.id } },
    sort: 'sequence',
    depth: 0,
  })
  assert.equal(revisionsAfterEdit.totalDocs, 2)
  assert.equal(revisionsAfterEdit.docs[1].sequence, 2)
  assert.equal(revisionsAfterEdit.docs[1].reason, 'edited')
  assert.equal(revisionsAfterEdit.docs[1].parentRevision, revision1Id)
  const revision2Id = revisionsAfterEdit.docs[1].id
  console.log(`   ✓ Draft mutation persisted: sequence=2, rev2Id=${revision2Id}`)

  // =========================================================================
  // Phase 5: Historical Revision Restore
  // =========================================================================
  console.log('\nPhase 5: Restoring historical Revision 1 to verify append-only revision restore...')
  const restoredResult = await restoreEditorialRevision(payload, {
    articleId: String(family1.id),
    revisionId: String(revision1Id),
    actor: { id: String(ownerUser.id), role: 'publisher' },
    actorUserId: String(ownerUser.id),
    now: new Date().toISOString(),
  })

  assert.equal(restoredResult.article.currentRevisionSequence, 3, 'Restoration must advance sequence to 3')

  const revisionsAfterRestore = await payload.find({
    collection: 'revision-records',
    where: { article: { equals: family1.id } },
    sort: 'sequence',
    depth: 0,
  })
  assert.equal(revisionsAfterRestore.totalDocs, 3)
  const rev3 = revisionsAfterRestore.docs[2]
  assert.equal(rev3.sequence, 3)
  assert.equal(rev3.reason, 'restored')
  assert.equal(rev3.restoredFromRevision, revision1Id)

  // Verify content.body reverted to Revision 1 content
  const article1AfterRestore = await payload.findByID({ collection: 'content', id: article1.id, depth: 0 })
  const plainTextRestored = JSON.stringify(article1AfterRestore.body)
  assert.ok(!plainTextRestored.includes('Phase 2 Updated Discoveries'), 'Restored body must NOT contain Edit 2 additions')
  assert.ok(plainTextRestored.includes('Executive Summary and Primary Findings'), 'Restored body must contain Revision 1 heading')
  console.log(`   ✓ Historical Revision 1 restored cleanly: sequence=3, restoredFromRevision=${revision1Id}`)

  // =========================================================================
  // Phase 6: Preview Unpublished Content & Non-Indexing Verification
  // =========================================================================
  console.log('\nPhase 6: Generating preview token and verifying unpublished presentation & noindex...')
  const previewTokenData = await createEditorialPreviewToken(payload, {
    articleId: String(family1.id),
    revisionId: String(rev3.id),
    createdBy: String(ownerUser.id),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  })
  assert.ok(previewTokenData.token, 'A raw hex preview token must be returned')

  // Resolve preview token with creator session
  const presentation = await resolveEditorialPreviewToken(
    payload,
    previewTokenData.token,
    'desktop',
    String(ownerUser.id),
  )
  assert.equal(presentation.preview, true, 'Presentation must flag preview=true')
  assert.equal(presentation.title, 'Alpha Investigative Field Report')
  assert.deepEqual(presentation.authors, ['Jane Author'], 'Author metadata must be correctly populated')
  assert.ok(presentation.tableOfContents.length >= 1, 'TOC must be extracted from headings')
  assert.equal(presentation.tableOfContents[0].text, 'Executive Summary and Primary Findings')

  // Public Access Verification: Must NOT be rendered or indexable
  assert.equal(canRenderPublic(article1AfterRestore as any), false, 'Draft content must fail canRenderPublic')
  assert.equal(canDiscoverPublic(article1AfterRestore as any), false, 'Draft content must fail canDiscoverPublic')

  let publicReadBlocked = false
  try {
    await loadPublishedArticleByPath(payload, { siteId: String(siteA.id), path: String(article1.canonicalPath) })
  } catch (err: any) {
    publicReadBlocked = true
  }
  assert.ok(publicReadBlocked, 'Unpublished draft must throw when accessed via public published reader')

  // Discovery Document Non-Indexable Contract
  const discovery = await resolveDiscoveryDocument(payload, {
    path: String(article1.canonicalPath),
    siteId: String(siteA.id),
    record: article1AfterRestore as any,
  })
  assert.equal(discovery.indexability.indexable, false, 'Draft must be indexable=false')
  assert.equal(discovery.indexability.reason, 'draft', 'Draft reason must be "draft"')
  assert.equal(discovery.indexability.robotsDirectives.index, false, 'Robots index must be false')
  assert.equal(discovery.indexability.robotsDirectives.follow, false, 'Robots follow must be false')
  console.log(`   ✓ Unpublished preview authorized for creator; public access blocked; robots noindex/nofollow guaranteed.`)

  // =========================================================================
  // Phase 7: Negative Preview Cases (Expired, Foreign, Tampered)
  // =========================================================================
  console.log('\nPhase 7: Testing negative preview cases (expired, foreign user, tampered token)...')

  // 1. Expired Token
  const expiredTokenData = await createEditorialPreviewToken(payload, {
    articleId: String(family1.id),
    revisionId: String(rev3.id),
    createdBy: String(ownerUser.id),
    expiresAt: new Date(Date.now() - 5000).toISOString(), // expired 5 seconds ago
  })
  let expiredCaught = false
  try {
    await resolveEditorialPreviewToken(payload, expiredTokenData.token, 'desktop', String(ownerUser.id))
  } catch (err: any) {
    expiredCaught = true
    assert.match(err.message, /expired/i)
  }
  assert.ok(expiredCaught, 'Expired preview token must be rejected')

  // 2. Foreign User Session
  let foreignCaught = false
  try {
    // Attempting resolution with Staff Beta (foreign site operator)
    await resolveEditorialPreviewToken(payload, previewTokenData.token, 'desktop', String(staffBetaUser.id))
  } catch (err: any) {
    foreignCaught = true
    assert.match(err.message, /creator session/i)
  }
  assert.ok(foreignCaught, 'Preview with foreign user session must be rejected')

  // 3. Tampered Token
  let tamperedCaught = false
  try {
    await resolveEditorialPreviewToken(payload, 'deadbeefcafebabe0000000000000000', 'desktop', String(ownerUser.id))
  } catch (err: any) {
    tamperedCaught = true
    assert.match(err.message, /not found/i)
  }
  assert.ok(tamperedCaught, 'Tampered preview token must be rejected')
  console.log(`   ✓ Expired, foreign, and tampered preview requests cleanly rejected.`)

  // =========================================================================
  // Phase 8: Negative Edit Cases (Unauthorized & Cross-Site)
  // =========================================================================
  console.log('\nPhase 8: Testing unauthorized & cross-site edit denials...')

  // DB unchanged snapshot before attack attempts
  const dbBeforeAttacks = await pool.query('SELECT id, site_id, title FROM content ORDER BY id')

  // 1. Foreign Staff Edit Attempt (Staff Beta mutating Site Alpha article)
  let foreignEditBlocked = false
  try {
    const staffBetaReq = {
      user: { id: staffBetaUser.id, role: 'staff', collection: 'users' },
      payload,
    } as any
    await payload.update({
      collection: 'content',
      id: article1.id,
      data: { title: 'Hacked by Foreign Staff' } as any,
      overrideAccess: false,
      req: staffBetaReq,
    })
  } catch {
    foreignEditBlocked = true
  }
  assert.ok(foreignEditBlocked, 'Foreign operator edit attempt must be denied by tenantUpdateAccess')

  // 2. Anonymous Edit Attempt
  let anonEditBlocked = false
  try {
    const anonReq = { user: null, payload } as any
    await payload.update({
      collection: 'content',
      id: article1.id,
      data: { title: 'Hacked by Anonymous' } as any,
      overrideAccess: false,
      req: anonReq,
    })
  } catch {
    anonEditBlocked = true
  }
  assert.ok(anonEditBlocked, 'Anonymous edit attempt must be denied')

  // 3. Subscriber Member Edit Attempt
  let memberEditBlocked = false
  try {
    const memberReq = {
      user: { id: subscriberUser.id, collection: 'members' },
      payload,
    } as any
    await payload.update({
      collection: 'content',
      id: article1.id,
      data: { title: 'Hacked by Subscriber' } as any,
      overrideAccess: false,
      req: memberReq,
    })
  } catch {
    memberEditBlocked = true
  }
  assert.ok(memberEditBlocked, 'Subscriber member edit attempt must be denied')

  // DB Unchanged Assertion
  const dbAfterAttacks = await pool.query('SELECT id, site_id, title FROM content ORDER BY id')
  assert.deepEqual(dbBeforeAttacks.rows, dbAfterAttacks.rows, 'PostgreSQL content rows must remain 100% unaltered after denied edits')
  console.log(`   ✓ Unauthorized and foreign edits denied; PostgreSQL content verified unchanged.`)

  // =========================================================================
  // Phase 9: Document Locking & Simultaneous Editor Sessions
  // =========================================================================
  console.log('\nPhase 9: Testing document locking and concurrent edit collision prevention...')

  // 1. Owner acquires editing lock on Article 1
  const lock = await payload.create({
    collection: 'payload-locked-documents' as any,
    data: {
      document: { value: article1.id, relationTo: 'content' },
      user: { value: ownerUser.id, relationTo: 'users' },
    } as any,
  })
  console.log(`   Lock acquired by Owner: lockId=${lock.id}`)

  // 2. Owner checks lock status -> must be UNLOCKED for the active lock owner
  const ownerLockStatus = await getIsLocked({
    collectionConfig: { slug: 'content', lockDocuments: true } as any,
    id: article1.id,
    isEditing: true,
    req: {
      user: { id: ownerUser.id, role: 'owner', collection: 'users' },
      payload,
    } as any,
  })
  assert.equal(ownerLockStatus.isLocked, false, 'Document must be UNLOCKED for active lock owner')

  // 3. Staff Alpha checks lock status -> must be LOCKED
  const staffLockStatus = await getIsLocked({
    collectionConfig: { slug: 'content', lockDocuments: true } as any,
    id: article1.id,
    isEditing: true,
    req: {
      user: { id: staffAlphaUser.id, role: 'staff', collection: 'users' },
      payload,
    } as any,
  })
  assert.equal(staffLockStatus.isLocked, true, 'Document must be LOCKED for concurrent viewer')
  assert.equal((staffLockStatus.currentEditor as any)?.id, ownerUser.id, 'Current editor must be identified as Owner')

  // 4. Staff Alpha attempts concurrent update with checkDocumentLockStatus({ overrideLock: false })
  let lockCollisionCaught = false
  try {
    await checkDocumentLockStatus({
      id: article1.id,
      collectionSlug: 'content',
      overrideLock: false,
      req: {
        user: { id: staffAlphaUser.id, role: 'staff', collection: 'users' },
        payload,
      } as any,
    })
  } catch (err: any) {
    lockCollisionCaught = true
    assert.match(err.message, /locked/i)
  }
  assert.ok(lockCollisionCaught, 'Concurrent update attempt must be blocked by checkDocumentLockStatus')

  // DB Unchanged during locked conflict
  const articleDuringLock = await payload.findByID({ collection: 'content', id: article1.id, depth: 0 })
  assert.equal(articleDuringLock.title, 'Alpha Investigative Field Report', 'Title must not be altered while locked')

  // 5. Owner releases lock
  await payload.delete({
    collection: 'payload-locked-documents' as any,
    id: lock.id,
  })
  console.log(`   Lock released by Owner.`)

  // 6. Staff Alpha acquires lock and performs legitimate update
  const staffLock = await payload.create({
    collection: 'payload-locked-documents' as any,
    data: {
      document: { value: article1.id, relationTo: 'content' },
      user: { value: staffAlphaUser.id, relationTo: 'users' },
    } as any,
  })
  const staffReq = {
    user: { id: staffAlphaUser.id, role: 'staff', collection: 'users' },
    payload,
  } as any
  await checkDocumentLockStatus({
    id: article1.id,
    collectionSlug: 'content',
    overrideLock: false,
    req: staffReq,
  })
  await payload.update({
    collection: 'content',
    id: article1.id,
    data: { title: 'Alpha Field Report - Staff Approved Note' } as any,
    req: staffReq,
  })
  const remainingLocks = await payload.find({
    collection: 'payload-locked-documents' as any,
    where: { id: { equals: staffLock.id } },
  })
  assert.equal(remainingLocks.totalDocs, 0, 'Document lock must be automatically cleared upon update completion')

  const articleAfterStaffEdit = await payload.findByID({ collection: 'content', id: article1.id, depth: 0 })
  assert.equal(articleAfterStaffEdit.title, 'Alpha Field Report - Staff Approved Note')
  console.log(`   ✓ Simultaneous editor conflict prevented; lock release enables legitimate staff update.`)

  // =========================================================================
  // Phase 10: State Snapshot Export
  // =========================================================================
  const stateSummary = {
    siteA: { id: siteA.id, name: siteA.name },
    siteB: { id: siteB.id, name: siteB.name },
    authors: [
      { id: authorJane.id, displayName: authorJane.displayName },
      { id: authorMark.id, displayName: authorMark.displayName },
    ],
    article1: { id: article1.id, title: articleAfterStaffEdit.title, status: articleAfterStaffEdit.status },
    article2: { id: article2.id, title: article2.title, status: article2.status },
    page1: { id: page1.id, title: page1.title, status: page1.status },
    family1: { id: family1.id, currentRevisionSequence: (await payload.findByID({ collection: 'article-family-content', id: family1.id, depth: 0 })).currentRevisionSequence },
    totalRevisionsArticle1: (await payload.find({ collection: 'revision-records', where: { article: { equals: family1.id } } })).totalDocs,
  }
  await writeFile('scratch/rc103b-20261018/state-summary.json', JSON.stringify(stateSummary, null, 2))
  console.log('\n✓ ALL 10 RC1-03B ACCEPTANCE PHASES COMPLETED WITH 100% SUCCESS.')

  await pool.end()
  process.exit(0)
}

run().catch((err) => {
  console.error('FATAL 03B Verification Error:', err)
  process.exit(1)
})
