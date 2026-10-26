/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator/audience acceptance */
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createServer as smtpServer } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { POST as subscribe } from '../../src/app/(frontend)/api/subscribers/subscribe/route'
import { POST as confirm } from '../../src/app/(frontend)/api/subscribers/confirm/route'
import { POST as preferences } from '../../src/app/(frontend)/api/subscribers/preferences/route'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  issueAudienceAccessToken,
  queueTestSend,
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
  'postgresql://postgres:postgres@127.0.0.1:5453/rc109d_release_acceptance',
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

let worker: ChildProcess | undefined
const sockets = new Set<any>()
const messages: any[] = []
const rejections = new Map<string, number>()
let holdSeen = false
const sink = smtpServer((socket) => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
  socket.on('error', () => {})
  let input = '',
    data = false,
    lines: string[] = [],
    to = ''
  socket.write('220 rc109d.local ESMTP\r\n')
  socket.on('data', (chunk) => {
    input += chunk.toString()
    while (input.includes('\r\n')) {
      const end = input.indexOf('\r\n'),
        line = input.slice(0, end)
      input = input.slice(end + 2)
      if (data) {
        if (line !== '.') {
          lines.push(line.replace(/^\.\./, '.'))
          continue
        }
        const raw = lines.join('\r\n') + '\r\n'
        messages.push({ to, raw, at: new Date().toISOString() })
        lines = []
        data = false
        if (to.includes('hold@')) {
          holdSeen = true
          continue
        }
        if (to.includes('unknown@')) {
          socket.destroy()
          continue
        }
        socket.write(`250 captured-${messages.length}\r\n`)
      } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-rc109d.local\r\n250 8BITMIME\r\n')
      else if (/^RCPT TO:/i.test(line)) {
        to = line.slice(8).trim().replace(/[<>]/g, '')
        assert.match(to, /@example\.test$/)
        const failures = rejections.get(to) ?? 0
        if (to.startsWith('permanent@')) socket.write('550 local permanent rejection\r\n')
        else if (
          to.startsWith('exhaust@') ||
          (to.startsWith('temporary@') && failures === 0) ||
          (to.startsWith('recover@') && failures < 4)
        ) {
          rejections.set(to, failures + 1)
          socket.write('451 local temporary rejection\r\n')
        } else socket.write('250 recipient accepted\r\n')
      } else if (/^DATA/i.test(line)) {
        data = true
        socket.write('354 end with dot\r\n')
      } else if (/^QUIT/i.test(line)) socket.end('221 goodbye\r\n')
      else socket.write('250 OK\r\n')
    }
  })
})

async function until(name: string, fn: () => Promise<any>) {
  const end = Date.now() + 45000
  while (Date.now() < end) {
    if (await fn()) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Timed out: ${name}`)
}
async function queueControlledSend(input: {
  siteId: string
  recipientEmail: string
  subject: string
  blocks: any[]
}) {
  const message = await payload.create({
    collection: 'email-messages',
    data: {
      site: input.siteId,
      subject: input.subject,
      blocks: input.blocks,
      kind: 'bulk',
      status: 'draft',
    },
    overrideAccess: true,
  })
  return queueTestSend(payload, { messageId: message.id, recipientEmail: input.recipientEmail })
}
async function startTransport() {
  await new Promise<void>((r) => sink.listen(3141, '127.0.0.1', r))
  worker = spawn(process.execPath, ['--import', 'tsx', 'src/scripts/run-jobs-worker.ts'], {
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const log = createWriteStream(`${out}/worker.log`)
  worker.stdout!.pipe(log)
  worker.stderr!.pipe(log)
}
async function stopTransport() {
  if (worker && worker.exitCode === null) {
    const exited = new Promise<void>((r) => worker!.once('exit', () => r()))
    worker.kill('SIGKILL')
    await exited
  }
  for (const socket of sockets) socket.destroy()
  if (sink.listening) await new Promise<void>((r) => sink.close(() => r()))
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
    await payload.destroy()
    process.exit(0)
  }

  console.log('--- EXECUTING SUBPASS 09D FULL AUDIENCE & CRM ACCEPTANCE ---')

  await startTransport()
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
  check('fixture administrator session created (no WebAuthn claim)', alphaSession?.token)

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
  check('fixture foreign staff session created (no WebAuthn claim)', betaSession?.token)

  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOrigin: 'http://localhost:39003',
      canonicalOriginsBySite: {
        [alphaSite.id]: 'http://localhost:39003',
        [betaSite.id]: 'https://beta.example.test',
      },
    },
    overrideAccess: true,
  })
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
  const signupResponse = await subscribe(
    new Request('http://localhost:39003/api/subscribers/subscribe', {
      method: 'POST',
      headers: { host: 'localhost:39003', 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'visitor.jane@example.test',
        siteId: alphaSite.id,
        listId: newsletterList.id,
      }),
    }),
  )
  check('public visitor signup accepted', signupResponse.status === 202)
  await until('confirmation MIME', async () =>
    messages.some((m) => m.raw.includes('Confirm your subscription')),
  )
  const confirmationMime = messages
    .find((m) => m.raw.includes('Confirm your subscription'))
    .raw.replace(/=\r\n/g, '')
    .replace(/=3D/g, '=')
  const token = /[?&]token=([^\s"<>]+)/.exec(confirmationMime)?.[1]
  check('confirmation token observed in actual local SMTP MIME', Boolean(token))
  const confirmationResponse = await confirm(
    new Request('http://localhost:39003/api/subscribers/confirm', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  )
  check('public confirmation succeeds', confirmationResponse.status === 200)
  check(
    'confirmation replay denied',
    (
      await confirm(
        new Request('http://localhost:39003/api/subscribers/confirm', {
          method: 'POST',
          body: JSON.stringify({ token }),
        }),
      )
    ).status === 400,
  )
  const confirmed = (
    await payload.find({
      collection: 'subscribers',
      where: { site: { equals: alphaSite.id }, email: { equals: 'visitor.jane@example.test' } },
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  check(
    'active subscriber and verified timestamp persisted',
    confirmed.status === 'active' && Boolean(confirmed.verifiedAt),
  )

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
        preferenceUrl: 'http://localhost:39003/subscribe/preferences',
      },
    ],
  }

  const campaignReq = new Request(
    `http://localhost:39003/api/admin/audience/campaign?siteId=${alphaSite.id}`,
    {
      method: 'POST',
      headers: {
        cookie: alphaCookie,
        host: 'localhost:39003',
        origin: 'http://localhost:39003',
        'content-type': 'application/json',
      },
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

  await until(
    'worker campaign SMTP acceptance',
    async () =>
      (
        await payload.findByID({
          collection: 'email-deliveries',
          id: campaignBody.deliveryId,
          depth: 0,
          overrideAccess: true,
        })
      ).status === 'accepted',
  )
  check(
    'actual worker sends exact campaign MIME once',
    messages.filter((m) => m.raw.includes('Welcome Jane to the newsletter.')).length === 1,
  )
  // Foreign-site accepted deliveries to the same address must not enter Alpha reports.
  const foreignDeliveryIds: string[] = []
  for (let i = 0; i < 6; i++) {
    const delivery = await queueControlledSend({
      siteId: betaSite.id,
      recipientEmail: 'visitor.jane@example.test',
      subject: `Foreign ${i}`,
      blocks: [{ type: 'text', text: 'Foreign controlled body' }],
    })
    foreignDeliveryIds.push(delivery.id)
  }
  await until(
    'foreign sink handoffs',
    async () =>
      (
        await payload.find({
          collection: 'email-deliveries',
          where: { id: { in: foreignDeliveryIds }, status: { equals: 'accepted' } },
          limit: 0,
          pagination: false,
          overrideAccess: true,
        })
      ).totalDocs === 6,
  )
  check(
    'foreign site same-address sends are genuinely accepted',
    messages.filter((m) => m.raw.includes('Foreign controlled body')).length === 6,
  )
  const preferenceToken = await issueAudienceAccessToken(payload, {
    siteId: alphaSite.id,
    subscriberId: confirmed.id,
    purpose: 'preferences',
  })
  const preferenceResponse = await preferences(
    new Request('http://localhost:39003/api/subscribers/preferences', {
      method: 'POST',
      body: JSON.stringify({
        token: preferenceToken,
        choices: [{ channel: 'email', purpose: 'newsletter', granted: false }],
      }),
    }),
  )
  check('public preference withdrawal succeeds', preferenceResponse.status === 200)
  const blockedDelivery = await queueControlledSend({
    siteId: alphaSite.id,
    recipientEmail: 'visitor.jane@example.test',
    subject: 'Suppressed campaign',
    blocks: [{ type: 'text', text: 'MUST NOT REACH SINK' }],
  })
  await until(
    'suppression worker guard',
    async () =>
      (
        await payload.findByID({
          collection: 'email-deliveries',
          id: blockedDelivery.id,
          depth: 0,
          overrideAccess: true,
        })
      ).status === 'cancelled',
  )
  check(
    'suppressed queued dispatch is cancelled with no sink DATA',
    !messages.some((m) => m.raw.includes('MUST NOT REACH SINK')),
  )

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
    `http://localhost:39003/api/admin/audience/command-center?siteId=${alphaSite.id}`,
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
    `http://localhost:39003/api/admin/audience/crm?siteId=${alphaSite.id}&query=jAnE`,
    {
      headers: { cookie: alphaCookie },
    },
  )
  const searchNameRes = await getCrm(searchNameReq)
  check('crm search by name returns HTTP 200', searchNameRes.status === 200)
  const searchNameData = await searchNameRes.json()
  check(
    'crm search found Jane Doe',
    searchNameData.contacts?.some((c: any) => c.displayName === 'Jane Doe'),
  )

  // 2. Search by phone
  const searchPhoneReq = new Request(
    `http://localhost:39003/api/admin/audience/crm?siteId=${alphaSite.id}&query=1234567`,
    {
      headers: { cookie: alphaCookie },
    },
  )
  const searchPhoneRes = await getCrm(searchPhoneReq)
  const searchPhoneData = await searchPhoneRes.json()
  check('crm search found Jane by E.164 phone substring', searchPhoneData.contacts?.length >= 1)

  // 3. Filter by status
  const filterStatusReq = new Request(
    `http://localhost:39003/api/admin/audience/crm?siteId=${alphaSite.id}&status=lead`,
    {
      headers: { cookie: alphaCookie },
    },
  )
  const filterStatusRes = await getCrm(filterStatusReq)
  const filterStatusData = await filterStatusRes.json()
  check('crm filter by status "lead" returned matches', filterStatusData.contacts?.length >= 1)

  // 4. Contact Detail & Consent History Drawer
  const detailReq = new Request(
    `http://localhost:39003/api/admin/audience/crm?siteId=${alphaSite.id}&contactId=${janeContact.id}`,
    {
      headers: { cookie: alphaCookie },
    },
  )
  const detailRes = await getCrm(detailReq)
  check('contact detail inspection returns HTTP 200', detailRes.status === 200)
  const detailData = await detailRes.json()

  check('detail indicates recipient is suppressed', detailData.isSuppressed === true)
  check(
    'detail indicates suppression reason is unsubscribe',
    detailData.suppressionReason === 'unsubscribe',
  )
  check(
    'detail contains consent history with double-opt-in and withdrawal',
    detailData.consentHistory?.some((e: any) => e.event === 'double-opt-in-confirmed') &&
      detailData.consentHistory?.some((e: any) => e.event === 'preference-withdrawn'),
  )
  check(
    'detail observed metrics only report observed events without phantom inferences',
    detailData.metrics?.deliveriesAccepted === 2 &&
      detailData.metrics?.observedOpensConfirmed === 0 &&
      detailData.metrics?.observedClicksHuman === 0 &&
      detailData.metrics?.uncertaintyNotice?.includes('Zero unobserved events inferred'),
  )

  // 5. Privacy-Preserving CSV Export (K-Anonymity N >= 5)
  const exportReq = new Request(
    `http://localhost:39003/api/admin/audience/crm?siteId=${alphaSite.id}&action=export&format=csv`,
    {
      headers: { cookie: alphaCookie },
    },
  )
  const exportRes = await getCrm(exportReq)
  check('export report returns HTTP 200', exportRes.status === 200)
  check('export header is text/csv', exportRes.headers.get('content-type')?.includes('text/csv'))
  const exportCsv = await exportRes.text()
  check(
    'export asserts k-anonymity policy in header comments',
    exportCsv.includes('All cohorts with < 5 subjects are masked'),
  )
  check('export masks small cohorts (< 5)', exportCsv.includes('< 5'))
  check(
    'export excludes six foreign-site accepted deliveries',
    exportCsv
      .split('\n')
      .find((line: string) => line.startsWith('accepted_deliveries,'))
      ?.includes('email,< 5,'),
  )
  check(
    'DNS and TLS verification not inferred from SMTP configuration',
    !ccData.deliverabilityHealth.providers.email.spfVerified &&
      !ccData.deliverabilityHealth.providers.email.dkimVerified &&
      !ccData.deliverabilityHealth.providers.email.tlsVerified,
  )
  check('unmeasured health limits are explicit', ccData.reportingLimits.includes('not measured'))

  // 6. Create Contact via API
  const createContactReq = new Request(
    `http://localhost:39003/api/admin/audience/crm?siteId=${alphaSite.id}`,
    {
      method: 'POST',
      headers: {
        cookie: alphaCookie,
        host: 'localhost:39003',
        origin: 'http://localhost:39003',
        'content-type': 'application/json',
      },
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
    `http://localhost:39003/api/admin/audience/crm?siteId=${alphaSite.id}`,
    {
      method: 'POST',
      headers: {
        cookie: alphaCookie,
        host: 'localhost:39003',
        origin: 'http://localhost:39003',
        'content-type': 'application/json',
      },
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
    new Request(`http://localhost:39003/api/admin/audience/command-center?siteId=${alphaSite.id}`),
  )
  check('anonymous access to command center denied HTTP 403', anonCcRes.status === 403)

  // 2. Anonymous access to CRM -> 403
  const anonCrmRes = await getCrm(
    new Request(`http://localhost:39003/api/admin/audience/crm?siteId=${alphaSite.id}`),
  )
  check('anonymous access to crm denied HTTP 403', anonCrmRes.status === 403)

  // 3. Foreign site operator access to Command Center -> 403
  const foreignCcRes = await getCommandCenter(
    new Request(`http://localhost:39003/api/admin/audience/command-center?siteId=${alphaSite.id}`, {
      headers: { cookie: betaCookie },
    }),
  )
  check(
    'cross-site foreign operator command center access denied HTTP 403',
    foreignCcRes.status === 403,
  )

  // 4. Foreign site operator access to CRM -> 403
  const foreignCrmRes = await getCrm(
    new Request(`http://localhost:39003/api/admin/audience/crm?siteId=${alphaSite.id}`, {
      headers: { cookie: betaCookie },
    }),
  )
  check('cross-site foreign operator crm access denied HTTP 403', foreignCrmRes.status === 403)

  // 5. Request non-existent contact -> 404
  const notFoundContactRes = await getCrm(
    new Request(
      `http://localhost:39003/api/admin/audience/crm?siteId=${alphaSite.id}&contactId=00000000-0000-4000-8000-000000000000`,
      { headers: { cookie: alphaCookie } },
    ),
  )
  check('non-existent contact inspection returns clean HTTP 404', notFoundContactRes.status === 404)

  // =========================================================================
  // Save State Manifest for Restart Verification & Evidence
  // =========================================================================
  check(
    'CRM empty search returns zero canonical matches',
    (
      await (
        await getCrm(
          new Request(
            `http://localhost:39003/api/admin/audience/crm?siteId=${alphaSite.id}&query=NO_MATCH_SENTINEL`,
            { headers: { cookie: alphaCookie } },
          ),
        )
      ).json()
    ).totalDocs === 0,
  )
  check(
    'CRM foreign-origin write denied',
    (
      await postCrm(
        new Request(`http://localhost:39003/api/admin/audience/crm?siteId=${alphaSite.id}`, {
          method: 'POST',
          headers: {
            cookie: alphaCookie,
            host: 'localhost:39003',
            origin: 'https://evil.example.test',
          },
          body: JSON.stringify({ displayName: 'forbidden' }),
        }),
      )
    ).status === 403,
  )
  await writeFile(
    `${out}/sink-summary.json`,
    JSON.stringify(
      messages.map((m) => ({
        to: m.to,
        at: m.at,
        bytes: m.raw.length,
        subject: /Subject: ([^\r\n]+)/.exec(m.raw)?.[1],
      })),
      null,
      2,
    ),
  )
  const state = {
    alphaSiteId: alphaSite.id,
    betaSiteId: betaSite.id,
    subscriberId: confirmed.id,
    contactId: janeContact.id,
    suppressionsCount: dbSuppressions.totalDocs,
    contactsCount: 2,
    deliveryId: campaignBody.deliveryId,
    blockedDeliveryId: blockedDelivery.id,
    consentEventsCount: (
      await payload.count({
        collection: 'consent-events',
        where: { site: { equals: alphaSite.id } },
        overrideAccess: true,
      })
    ).totalDocs,
    capturedAt: new Date().toISOString(),
  }
  await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2), 'utf8')
  await writeFile(`${out}/journey-trace.json`, JSON.stringify(trace, null, 2), 'utf8')

  console.log(`\n============================================================`)
  console.log(`SUBPASS 09D ACCEPTANCE SUCCESSFUL: ${trace.length} checks passed.`)
  console.log(`============================================================\n`)
  await stopTransport()
  await payload.destroy()
  process.exit(0)
} catch (error) {
  await writeFile(
    `${out}/journey-trace.json`,
    JSON.stringify({ trace, error: String(error) }, null, 2),
  )
  await stopTransport()
  await payload.destroy()
  console.error('SUBPASS 09D ACCEPTANCE FAILED:', error)
  process.exit(1)
}
