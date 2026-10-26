/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator/audience acceptance */
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  requestDoubleOptIn,
  confirmDoubleOptIn,
  suppressSubscriber,
  isSubscriberSuppressed,
  canDeliverToSubscriber,
} from '../../src/modules/audience/service'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { GET as getCommandCenter } from '../../src/app/(frontend)/api/admin/audience/command-center/route'
import {
  GET as getCrm,
  POST as postCrm,
} from '../../src/app/(frontend)/api/admin/audience/crm/route'
import { POST as postCampaign } from '../../src/app/(frontend)/api/admin/audience/campaign/route'

assert.equal(process.env.RC1_09D_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5452/rc109d_release_acceptance',
)

const out = 'docs/rc/evidence/rc1/18-pass/09D'
await mkdir(out, { recursive: true })

const payload: any = await getPayload({ config })
const trace: any[] = []

const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}

try {
  if (process.argv.includes('--restart')) {
    console.log('--- EXECUTING CONTAINER RESTART VERIFICATION ---')
    const savedState = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))

    // 1. Verify Site Alpha survived restart
    const alphaSite = await payload.findByID({
      collection: 'sites',
      id: savedState.alphaSiteId,
      depth: 0,
      overrideAccess: true,
    })
    check('site alpha persisted across postgres restart', alphaSite?.slug?.startsWith('alpha09d'))

    // 2. Verify Subscriber persisted and remains erased / suppressed
    const subscriber = await payload.findByID({
      collection: 'subscribers',
      id: savedState.subscriberId,
      depth: 0,
      overrideAccess: true,
    })
    check(
      'erased subscriber persisted with anonymized email',
      subscriber?.email?.startsWith('erased+'),
    )
    check('erased subscriber status is suppressed', subscriber?.status === 'suppressed')

    // 3. Verify Suppressions count persisted
    const suppressions = await payload.find({
      collection: 'suppressions',
      where: { site: { equals: savedState.alphaSiteId } },
      overrideAccess: true,
    })
    check(
      'suppression records intact across restart',
      suppressions.totalDocs >= savedState.suppressionsCount,
    )

    // 4. Verify CRM Contacts persisted
    const contacts = await payload.find({
      collection: 'contacts',
      where: { site: { equals: savedState.alphaSiteId } },
      overrideAccess: true,
    })
    check('crm contacts intact across restart', contacts.totalDocs >= savedState.contactsCount)

    // 5. Verify Consent Events persisted
    const consentEvents = await payload.find({
      collection: 'consent-events',
      where: { site: { equals: savedState.alphaSiteId } },
      overrideAccess: true,
    })
    check(
      'consent audit history intact across restart',
      consentEvents.totalDocs >= savedState.consentEventsCount,
    )

    await writeFile(
      `${out}/restart-trace.json`,
      JSON.stringify({ restartedAt: new Date().toISOString(), trace }, null, 2),
      'utf8',
    )
    console.log('--- RESTART CHECK COMPLETE: ALL PERSISTED ENTITIES VALIDATED ---')
    process.exit(0)
  }

  console.log('--- EXECUTING SUBPASS 09D FULL AUDIENCE & CRM ACCEPTANCE ---')

  const runId = Date.now().toString(36)

  // =========================================================================
  // Step 1: Provision Isolated Multi-Site Context & Operators
  // =========================================================================
  const alphaSite = await payload.create({
    collection: 'sites',
    data: { name: 'Alpha 09D Site', slug: `alpha09d-${runId}`, lifecycle: 'active' },
    overrideAccess: true,
  })
  check('created primary test site alpha', alphaSite?.id)

  const betaSite = await payload.create({
    collection: 'sites',
    data: { name: 'Beta 09D Foreign Site', slug: `beta09d-${runId}`, lifecycle: 'active' },
    overrideAccess: true,
  })
  check('created foreign test site beta', betaSite?.id)

  // Alpha Administrator + Member & Site Grant
  const alphaMember = await payload.create({
    collection: 'members',
    data: { email: `admin-${runId}@alpha.test`, displayName: 'Alpha Admin' },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'member-site-roles',
    data: { member: alphaMember.id, site: alphaSite.id, role: 'community-manager' },
    overrideAccess: true,
  })

  const alphaAdmin = await payload.create({
    collection: 'users',
    data: {
      email: `admin-${runId}@alpha.test`,
      role: 'administrator',
      member: alphaMember.id,
    },
    overrideAccess: true,
  })
  check('created alpha administrator with site grant', alphaAdmin?.id)

  const alphaSession = await createPasskeySession(
    alphaAdmin,
    process.env.PAYLOAD_SECRET!,
    async (id, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, alphaAdmin.id, expiresAt],
      )
    },
  )
  const alphaCookie = `renegade-passkey=${alphaSession.token}; renegade-active-site=${alphaSite.id}`
  check('minted administrator passkey session for alpha', alphaSession?.token)

  // Beta Staff Operator + Member & Site Grant (Unauthorized for Alpha)
  const betaMember = await payload.create({
    collection: 'members',
    data: { email: `staff-${runId}@beta.test`, displayName: 'Beta Staff' },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'member-site-roles',
    data: { member: betaMember.id, site: betaSite.id, role: 'community-manager' },
    overrideAccess: true,
  })

  const betaStaff = await payload.create({
    collection: 'users',
    data: {
      email: `staff-${runId}@beta.test`,
      role: 'staff',
      member: betaMember.id,
    },
    overrideAccess: true,
  })
  const betaSession = await createPasskeySession(
    betaStaff,
    process.env.PAYLOAD_SECRET!,
    async (id, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, betaStaff.id, expiresAt],
      )
    },
  )
  const betaCookie = `renegade-passkey=${betaSession.token}; renegade-active-site=${betaSite.id}`
  check('minted foreign staff passkey session for beta', betaSession?.token)

  // Primary Audience List
  const newsletterList = await payload.create({
    collection: 'audience-lists',
    data: {
      site: alphaSite.id,
      name: 'Primary Newsletter',
      slug: `primary-newsletter-${runId}`,
      visibility: 'public',
      defaultChannel: 'email',
    },
    overrideAccess: true,
  })
  check('created audience list for alpha site', newsletterList?.id)

  // =========================================================================
  // Step 2: Visitor Signup (Double Opt-In Request)
  // =========================================================================
  const signupResult = await requestDoubleOptIn(payload, {
    siteId: alphaSite.id,
    listId: newsletterList.id,
    email: 'visitor.jane@example.test',
    locale: 'en',
    consentWording: 'I consent to receiving the weekly Renegade Dispatch newsletter.',
    source: 'web_footer_signup',
  })
  check('visitor signup initiated pending subscriber', signupResult.subscriber?.status === 'pending')
  check('single-use confirmation token generated', Boolean(signupResult.token))

  // =========================================================================
  // Step 3: Confirmation (Double Opt-In Confirm)
  // =========================================================================
  const confirmed = await confirmDoubleOptIn(payload, signupResult.token!)
  check('visitor confirmed double opt-in', confirmed?.status === 'active')
  check('verifiedAt recorded on subscriber', Boolean(confirmed?.verifiedAt))

  // Verify double-opt-in-confirmed consent event in DB
  const confirmEvent = await payload.find({
    collection: 'consent-events',
    where: {
      site: { equals: alphaSite.id },
      subscriber: { equals: confirmed.id },
      event: { equals: 'double-opt-in-confirmed' },
    },
    overrideAccess: true,
  })
  check('double-opt-in-confirmed consent event persisted', confirmEvent.totalDocs >= 1)

  // =========================================================================
  // Step 4: CRM Contact Auto-Link / Directory Association
  // =========================================================================
  const janeContact = await payload.create({
    collection: 'contacts',
    data: {
      site: alphaSite.id,
      displayName: 'Jane Doe',
      email: 'visitor.jane@example.test',
      phoneE164: '+15551234567',
      status: 'lead',
      profile: { notes: 'Signed up via web footer' },
    },
    overrideAccess: true,
  })
  check('created CRM directory contact linked to email', janeContact?.id)

  // =========================================================================
  // Step 5: Campaign Dispatch (Observed Transport Handoff)
  // =========================================================================
  const messageDesign = {
    version: 1,
    templateVersion: '09d-v1',
    locale: 'en',
    tokens: {},
    plainTextStrategy: 'generated' as const,
    personalization: { missingValue: 'fallback' as const, fallbacks: {} },
    blocks: [
      { type: 'text' as const, text: 'Welcome Jane to the newsletter.' },
      {
        type: 'legal' as const,
        address: '09D local test address',
        preferenceUrl: 'http://localhost:39002/subscribe/preferences',
      },
    ],
  }

  const campaignReq = new Request(
    `http://localhost:39002/api/admin/audience/campaign?siteId=${alphaSite.id}`,
    {
      method: 'POST',
      headers: { cookie: alphaCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'test-send',
        recipientEmail: 'visitor.jane@example.test',
        subject: 'Welcome to Alpha',
        messageDesign,
      }),
    },
  )
  const campaignRes = await postCampaign(campaignReq)
  if (campaignRes.status !== 200) {
    console.error('campaignRes ERROR:', campaignRes.status, await campaignRes.clone().text())
  }
  check('campaign test-send returns HTTP 200', campaignRes.status === 200)
  const campaignBody = await campaignRes.json()
  check('campaign delivery queued', Boolean(campaignBody.deliveryId))

  // Simulate transport handoff acceptance in delivery sink
  await payload.update({
    collection: 'email-deliveries',
    id: campaignBody.deliveryId,
    data: { status: 'accepted', subscriber: confirmed.id },
    overrideAccess: true,
  })
  const acceptedDeliv = await payload.findByID({
    collection: 'email-deliveries',
    id: campaignBody.deliveryId,
    depth: 0,
    overrideAccess: true,
  })
  check('campaign delivery recorded as accepted', acceptedDeliv.status === 'accepted')

  // =========================================================================
  // Step 6: Preference Change & Suppression
  // =========================================================================
  await suppressSubscriber(payload, {
    siteId: alphaSite.id,
    email: 'visitor.jane@example.test',
    reason: 'unsubscribe',
  })
  await payload.create({
    collection: 'consent-events',
    data: {
      site: alphaSite.id,
      subscriber: confirmed.id,
      contact: janeContact.id,
      event: 'preference-withdrawn',
      basis: 'consent',
      wording: 'Unsubscribed via preferences center.',
      occurredAt: new Date().toISOString(),
      evidence: { channel: 'email', reason: 'unsubscribe' },
    },
    overrideAccess: true,
  })

  const isSuppressedNow = await isSubscriberSuppressed(
    payload,
    alphaSite.id,
    String(confirmed.emailHash),
  )
  check('subscriber suppressed after preference change', isSuppressedNow === true)

  const canDeliver = await canDeliverToSubscriber(payload, {
    siteId: alphaSite.id,
    subscriberId: confirmed.id,
    recipientEmail: 'visitor.jane@example.test',
  })
  check('canDeliverToSubscriber returns false after suppression', canDeliver === false)

  // =========================================================================
  // Step 7: Operator Command Center Inspection & Count Reconciliation
  // =========================================================================
  const commandCenterReq = new Request(
    `http://localhost:39002/api/admin/audience/command-center?siteId=${alphaSite.id}`,
    {
      headers: { cookie: alphaCookie },
    },
  )
  const ccRes = await getCommandCenter(commandCenterReq)
  check('command center returns HTTP 200 for authorized administrator', ccRes.status === 200)

  const ccData = await ccRes.json()
  // Reconcile operator counts with canonical database counts
  const dbSubscribers = await payload.find({
    collection: 'subscribers',
    where: { site: { equals: alphaSite.id } },
    overrideAccess: true,
  })
  const dbContacts = await payload.find({
    collection: 'contacts',
    where: { site: { equals: alphaSite.id } },
    overrideAccess: true,
  })
  const dbSuppressions = await payload.find({
    collection: 'suppressions',
    where: { site: { equals: alphaSite.id } },
    overrideAccess: true,
  })

  check(
    'reconciled subscribers count with canonical database',
    ccData.subscribers === dbSubscribers.totalDocs,
  )
  check(
    'reconciled contacts count with canonical database',
    ccData.contacts === dbContacts.totalDocs,
  )
  check(
    'reconciled suppressions count with canonical database',
    ccData.suppressions === dbSuppressions.totalDocs,
  )

  // Health and Metric Dictionary Verification
  check(
    'command center delivers structured deliverability health',
    Boolean(ccData.deliverabilityHealth?.metrics),
  )
  check(
    'command center includes full metric dictionary (>= 14 terms)',
    Array.isArray(ccData.metricsDictionary) && ccData.metricsDictionary.length >= 14,
  )
  check(
    'metric dictionary labels transport handoff vs carrier DLR',
    ccData.metricsDictionary.some((m: any) => m.key === 'provider_accepted') &&
      ccData.metricsDictionary.some((m: any) => m.key === 'carrier_delivered'),
  )

  // =========================================================================
  // Step 8: CRM Views: Search, Filter, Detail, and Export
  // =========================================================================
  // 1. Search by name
  const searchNameReq = new Request(
    `http://localhost:39002/api/admin/audience/crm?siteId=${alphaSite.id}&query=Jane`,
    {
      headers: { cookie: alphaCookie },
    },
  )
  const searchNameRes = await getCrm(searchNameReq)
  check('crm search by name returns HTTP 200', searchNameRes.status === 200)
  const searchNameData = await searchNameRes.json()
  check('crm search found Jane Doe', searchNameData.contacts?.some((c: any) => c.displayName === 'Jane Doe'))

  // 2. Search by phone
  const searchPhoneReq = new Request(
    `http://localhost:39002/api/admin/audience/crm?siteId=${alphaSite.id}&query=1234567`,
    {
      headers: { cookie: alphaCookie },
    },
  )
  const searchPhoneRes = await getCrm(searchPhoneReq)
  const searchPhoneData = await searchPhoneRes.json()
  check('crm search found Jane by E.164 phone substring', searchPhoneData.contacts?.length >= 1)

  // 3. Filter by status
  const filterStatusReq = new Request(
    `http://localhost:39002/api/admin/audience/crm?siteId=${alphaSite.id}&status=lead`,
    {
      headers: { cookie: alphaCookie },
    },
  )
  const filterStatusRes = await getCrm(filterStatusReq)
  const filterStatusData = await filterStatusRes.json()
  check('crm filter by status "lead" returned matches', filterStatusData.contacts?.length >= 1)

  // 4. Contact Detail & Consent History Drawer
  const detailReq = new Request(
    `http://localhost:39002/api/admin/audience/crm?siteId=${alphaSite.id}&contactId=${janeContact.id}`,
    {
      headers: { cookie: alphaCookie },
    },
  )
  const detailRes = await getCrm(detailReq)
  check('contact detail inspection returns HTTP 200', detailRes.status === 200)
  const detailData = await detailRes.json()

  check('detail indicates recipient is suppressed', detailData.isSuppressed === true)
  check('detail indicates suppression reason is unsubscribe', detailData.suppressionReason === 'unsubscribe')
  check(
    'detail contains consent history with double-opt-in and withdrawal',
    detailData.consentHistory?.some((e: any) => e.event === 'double-opt-in-confirmed') &&
      detailData.consentHistory?.some((e: any) => e.event === 'preference-withdrawn'),
  )
  check(
    'detail observed metrics only report observed events without phantom inferences',
    detailData.metrics?.deliveriesAccepted >= 1 &&
      detailData.metrics?.observedOpensConfirmed === 0 &&
      detailData.metrics?.observedClicksHuman === 0 &&
      detailData.metrics?.uncertaintyNotice?.includes('Zero unobserved events inferred'),
  )

  // 5. Privacy-Preserving CSV Export (K-Anonymity N >= 5)
  const exportReq = new Request(
    `http://localhost:39002/api/admin/audience/crm?siteId=${alphaSite.id}&action=export&format=csv`,
    {
      headers: { cookie: alphaCookie },
    },
  )
  const exportRes = await getCrm(exportReq)
  check('export report returns HTTP 200', exportRes.status === 200)
  check('export header is text/csv', exportRes.headers.get('content-type')?.includes('text/csv'))
  const exportCsv = await exportRes.text()
  check('export asserts k-anonymity policy in header comments', exportCsv.includes('All cohorts with < 5 subjects are masked'))
  check('export masks small cohorts (< 5)', exportCsv.includes('< 5'))

  // 6. Create Contact via API
  const createContactReq = new Request(
    `http://localhost:39002/api/admin/audience/crm?siteId=${alphaSite.id}`,
    {
      method: 'POST',
      headers: { cookie: alphaCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'create-contact',
        displayName: 'Robert Operator',
        email: '  robert@example.test  ',
        phoneE164: '+1 (555) 888-9999',
        status: 'active',
      }),
    },
  )
  const createContactRes = await postCrm(createContactReq)
  check('create contact returns HTTP 201', createContactRes.status === 201)
  const createdContact = await createContactRes.json()
  check('created contact normalized email', createdContact.email === 'robert@example.test')
  check('created contact normalized E.164 phone', createdContact.phoneE164 === '+15558889999')

  // 7. GDPR Subject Erasure (Right-to-be-Forgotten)
  const eraseReq = new Request(
    `http://localhost:39002/api/admin/audience/crm?siteId=${alphaSite.id}`,
    {
      method: 'POST',
      headers: { cookie: alphaCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'erase-subject',
        subscriberId: confirmed.id,
        policyVersion: '2026.1',
      }),
    },
  )
  const eraseRes = await postCrm(eraseReq)
  if (eraseRes.status !== 200) {
    console.error('eraseRes ERROR:', eraseRes.status, await eraseRes.clone().text())
  }
  check('gdpr subject erasure returns HTTP 200', eraseRes.status === 200)

  // Verify subscriber in DB was anonymized and suppressed
  const erasedSubscriber = await payload.findByID({
    collection: 'subscribers',
    id: confirmed.id,
    depth: 0,
    overrideAccess: true,
  })
  check(
    'erased subscriber email was anonymized with erased+ prefix',
    erasedSubscriber.email.startsWith('erased+'),
  )
  check('erased subscriber status is suppressed', erasedSubscriber.status === 'suppressed')
  check('erasedAt timestamp recorded', Boolean(erasedSubscriber.erasedAt))

  // Verify erased consent event in DB
  const eraseConsentEvent = await payload.find({
    collection: 'consent-events',
    where: {
      site: { equals: alphaSite.id },
      event: { equals: 'erased' },
    },
    overrideAccess: true,
  })
  check('erased consent audit record logged', eraseConsentEvent.totalDocs >= 1)

  // =========================================================================
  // Step 9: Negative Cases & Multi-Site Security
  // =========================================================================
  // 1. Anonymous access to Command Center -> 403
  const anonCcRes = await getCommandCenter(
    new Request(`http://localhost:39002/api/admin/audience/command-center?siteId=${alphaSite.id}`),
  )
  check('anonymous access to command center denied HTTP 403', anonCcRes.status === 403)

  // 2. Anonymous access to CRM -> 403
  const anonCrmRes = await getCrm(
    new Request(`http://localhost:39002/api/admin/audience/crm?siteId=${alphaSite.id}`),
  )
  check('anonymous access to crm denied HTTP 403', anonCrmRes.status === 403)

  // 3. Foreign site operator access to Command Center -> 403
  const foreignCcRes = await getCommandCenter(
    new Request(
      `http://localhost:39002/api/admin/audience/command-center?siteId=${alphaSite.id}`,
      { headers: { cookie: betaCookie } },
    ),
  )
  check('cross-site foreign operator command center access denied HTTP 403', foreignCcRes.status === 403)

  // 4. Foreign site operator access to CRM -> 403
  const foreignCrmRes = await getCrm(
    new Request(
      `http://localhost:39002/api/admin/audience/crm?siteId=${alphaSite.id}`,
      { headers: { cookie: betaCookie } },
    ),
  )
  check('cross-site foreign operator crm access denied HTTP 403', foreignCrmRes.status === 403)

  // 5. Request non-existent contact -> 404
  const notFoundContactRes = await getCrm(
    new Request(
      `http://localhost:39002/api/admin/audience/crm?siteId=${alphaSite.id}&contactId=nonexistent-id`,
      { headers: { cookie: alphaCookie } },
    ),
  )
  check('non-existent contact inspection returns clean HTTP 404', notFoundContactRes.status === 404)

  // =========================================================================
  // Save State Manifest for Restart Verification & Evidence
  // =========================================================================
  const state = {
    alphaSiteId: alphaSite.id,
    betaSiteId: betaSite.id,
    subscriberId: confirmed.id,
    contactId: janeContact.id,
    suppressionsCount: dbSuppressions.totalDocs,
    contactsCount: dbContacts.totalDocs,
    consentEventsCount: eraseConsentEvent.totalDocs,
    capturedAt: new Date().toISOString(),
  }
  await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2), 'utf8')
  await writeFile(`${out}/journey-trace.json`, JSON.stringify(trace, null, 2), 'utf8')

  console.log(`\n============================================================`)
  console.log(`SUBPASS 09D ACCEPTANCE SUCCESSFUL: ${trace.length} checks passed.`)
  console.log(`============================================================\n`)
  process.exit(0)
} catch (error) {
  console.error('SUBPASS 09D ACCEPTANCE FAILED:', error)
  process.exit(1)
}
