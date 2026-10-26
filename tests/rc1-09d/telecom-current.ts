/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator acceptance */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  queueTelecomCampaignDeliveries,
  processInboundTelecomMessage,
} from '../../src/modules/telecom/service'
import { telecomDeliveryTask, selectTelecomAdapter } from '../../src/modules/telecom/tasks'
import {
  getTelecomEmulatorReceipts,
  resetTelecomEmulator,
} from '../../src/modules/telecom/emulator'
import { audienceDigest } from '../../src/modules/audience/contracts'
import { telecomDigest } from '../../src/modules/telecom/contracts'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { POST as retry } from '../../src/app/(frontend)/api/admin/audience/retry/route'

assert.equal(process.env.RC1_09D_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5453/rc109d_release_acceptance',
)
assert.equal(process.env.TELECOM_MODE, 'emulator')
const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/09D'
const trace: any[] = []
function check(name: string, value: unknown) {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}
const handler = telecomDeliveryTask.handler as any
const run = (id: string) => handler({ input: { deliveryId: id }, req: { payload } })
const get = (id: string) =>
  payload.findByID({ collection: 'telecom-deliveries', id, depth: 0, overrideAccess: true })
const create = (collection: string, data: any) =>
  payload.create({ collection, data, overrideAccess: true })
try {
  const emailState = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
  if (process.argv.includes('--restart')) {
    const state = JSON.parse(await readFile(`${out}/telecom-state.json`, 'utf8'))
    for (const expected of state.rows) {
      const row = await get(expected.id)
      check(
        `restart telecom ${expected.id}: state and attempts retained`,
        row.status === expected.status &&
          row.attempts === expected.attempts &&
          row.quietHoursDelayedUntil === expected.quietHoursDelayedUntil,
      )
    }
    await writeFile(`${out}/telecom-restart-trace.json`, JSON.stringify(trace, null, 2))
  } else {
    const suffix = Date.now().toString(36)
    const site = emailState.alphaSiteId
    const foreign = await create('sites', {
      name: '09C foreign',
      slug: `rc109d-foreign-${suffix}`,
      lifecycle: 'active',
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: `foreign-staff-${suffix}@example.test`, role: 'staff' },
      context: { skipEnrollmentToken: true },
      overrideAccess: true,
    })
    const memberId = typeof staff.member === 'object' ? staff.member.id : staff.member
    await create('member-site-roles', { member: memberId, site: foreign.id, role: 'contributor' })
    const session = await createPasskeySession(
      staff,
      process.env.PAYLOAD_SECRET!,
      async (id, expiresAt) => {
        await payload.db.pool.query(
          'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
          [id, staff.id, expiresAt],
        )
      },
    )
    const target = { id: emailState.deliveryId }
    const response = await retry(
      new Request('http://localhost:39003/retry', {
        method: 'POST',
        headers: {
          host: 'localhost:39003',
          origin: 'http://localhost:39003',
          cookie: `renegade-passkey=${session.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ deliveryId: target.id }),
      }),
    )
    check(
      'foreign-site staff cannot retry another tenant delivery',
      response.status === 400 && (await response.json()).error === 'Delivery unavailable.',
    )
    let denied = false
    try {
      await payload.update({
        collection: 'email-deliveries',
        id: target.id,
        data: { status: 'accepted' },
        user: staff,
        overrideAccess: false,
      })
    } catch {
      denied = true
    }
    check('native staff delivery status mutation denied', denied)
    denied = false
    try {
      await payload.create({
        collection: 'email-deliveries',
        data: {
          message: 'invalid',
          recipientEmail: 'forged@example.test',
          idempotencyKey: 'forged',
        },
        overrideAccess: false,
      })
    } catch {
      denied = true
    }
    check('anonymous native delivery creation denied', denied)
    const member = await create('members', {
      displayName: '09C telecom recipient',
      email: 'telecom@example.test',
      status: 'active',
    })
    const hour = new Date().getUTCHours()
    const offset = ((2 - hour + 36) % 24) - 12
    const quietZone =
      offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`
    const profile = await create('profiles', {
      member: member.id,
      handle: 'rc109c-recipient',
      displayName: 'Controlled recipient',
      timeZone: quietZone,
      preferences: { relationshipNotifications: { follows: false, messages: true } },
    })
    const phone = '+14155550199'
    const contact = await create('contacts', {
      site,
      displayName: 'Controlled phone',
      phoneE164: phone,
      member: member.id,
    })
    const subscriber = await create('subscribers', {
      site,
      email: 'telecom@example.test',
      emailHash: audienceDigest('telecom@example.test'),
      status: 'active',
      member: member.id,
      contact: contact.id,
    })
    const list = await create('audience-lists', {
      site,
      name: '09C telecom',
      slug: 'rc109c-telecom',
      title: 'Controlled only',
    })
    await create('audience-memberships', {
      subscriber: subscriber.id,
      audienceList: list.id,
      status: 'active',
    })
    for (const purpose of ['marketing', 'alerts'])
      await create('consent-events', {
        site,
        subscriber: subscriber.id,
        event: 'preference-granted',
        basis: 'consent',
        channel: 'sms',
        purpose,
        occurredAt: new Date().toISOString(),
      })
    const message = async (title: string, purpose: string, notificationKind: string) =>
      create('telecom-messages', {
        site,
        title,
        body: '09C controlled telecom body',
        channel: 'sms',
        purpose,
        status: 'scheduled',
        scheduledFor: new Date(Date.now() - 1000).toISOString(),
        audience: { lists: [list.id], notificationKind },
      })
    const delivery = async (messageId: string) => {
      await queueTelecomCampaignDeliveries(payload, messageId)
      return (
        await payload.find({
          collection: 'telecom-deliveries',
          where: { message: { equals: messageId } },
          depth: 0,
          overrideAccess: true,
        })
      ).docs[0]
    }
    resetTelecomEmulator()
    check(
      'emulation explicitly selected; live carrier disabled',
      selectTelecomAdapter().id === 'telecom-emulator' &&
        process.env.TELECOM_ALLOW_OUTBOUND === 'false',
    )
    const quietMessage = await message('quiet', 'marketing', 'message.created')
    const quiet = await delivery(quietMessage.id)
    check(
      'canonical contact phone and profile timezone produce durable quiet-hour scheduling',
      quiet.recipientPhone === phone && Date.parse(quiet.quietHoursDelayedUntil) > Date.now(),
    )
    await run(quiet.id)
    check(
      'early quiet-hours replay emits no telecom message',
      (await get(quiet.id)).attempts === 0 && getTelecomEmulatorReceipts().length === 0,
    )
    const followMessage = await message('follow off', 'alerts', 'relationship.follow')
    const follow = await delivery(followMessage.id)
    await run(follow.id)
    check(
      'per-event follow preference cancels telecom emulation',
      (await get(follow.id)).status === 'cancelled' && getTelecomEmulatorReceipts().length === 0,
    )
    const allowedMessage = await message('allowed alerts', 'alerts', 'message.created')
    const allowed = await delivery(allowedMessage.id)
    await payload.jobs.run({ queue: 'operations' })
    await run(allowed.id)
    check(
      'allowed event accepted once with exact emulated body and persistent attempt',
      (await get(allowed.id)).status === 'accepted' &&
        (await get(allowed.id)).attempts === 1 &&
        getTelecomEmulatorReceipts().length === 1 &&
        getTelecomEmulatorReceipts()[0].text === '09C controlled telecom body',
    )
    const stoppedMessage = await message('STOP race', 'alerts', 'message.created')
    const stopped = await delivery(stoppedMessage.id)
    const foreignContact = await create('contacts', {
      site: foreign.id,
      displayName: 'Same phone foreign site',
      phoneE164: phone,
    })
    const foreignSubscriber = await create('subscribers', {
      site: foreign.id,
      email: 'foreign-phone@example.test',
      emailHash: audienceDigest('foreign-phone@example.test'),
      status: 'active',
      contact: foreignContact.id,
    })
    const foreignList = await create('audience-lists', {
      site: foreign.id,
      name: 'foreign list',
      title: 'foreign',
      slug: '09c-foreign-list',
    })
    await create('audience-memberships', {
      audienceList: foreignList.id,
      subscriber: foreignSubscriber.id,
      status: 'active',
    })
    await create('consent-events', {
      site: foreign.id,
      subscriber: foreignSubscriber.id,
      event: 'preference-granted',
      basis: 'consent',
      channel: 'sms',
      purpose: 'alerts',
      occurredAt: new Date().toISOString(),
    })
    const foreignMessage = await create('telecom-messages', {
      site: foreign.id,
      title: 'Foreign phone',
      body: 'Foreign controlled',
      purpose: 'alerts',
      status: 'scheduled',
      audience: { lists: [foreignList.id] },
    })
    const foreignDelivery = await delivery(foreignMessage.id)
    await processInboundTelecomMessage(payload, {
      siteId: site,
      fromE164: phone,
      toE164: '+14155550198',
      text: 'STOP',
      provider: 'telecom-emulator',
      providerMessageId: '09c-stop',
    })
    await run(stopped.id)
    check(
      'site-scoped STOP cannot cancel a foreign tenant using the same phone',
      (await get(foreignDelivery.id)).status === 'queued',
    )
    check(
      'STOP after queue prevents another send',
      (await get(stopped.id)).status === 'cancelled' && getTelecomEmulatorReceipts().length === 1,
    )
    check(
      'STOP suppression persisted using canonical phone hash',
      (
        await payload.find({
          collection: 'suppressions',
          where: { emailHash: { equals: telecomDigest(phone) } },
          overrideAccess: true,
        })
      ).docs.length > 0,
    )
    check(
      'campaign replay does not add deliveries',
      (await queueTelecomCampaignDeliveries(payload, allowedMessage.id)).queuedCount === 0,
    )
    const rows = (
      await payload.find({
        collection: 'telecom-deliveries',
        depth: 0,
        limit: 100,
        overrideAccess: true,
      })
    ).docs
    await writeFile(
      `${out}/telecom-state.json`,
      JSON.stringify(
        {
          profile: profile.id,
          quietZone,
          rows: rows.map((row: any) => ({
            id: row.id,
            status: row.status,
            attempts: row.attempts,
            scheduledFor: row.scheduledFor,
            quietHoursDelayedUntil: row.quietHoursDelayedUntil,
            provider: row.provider,
            outcome: row.outcome,
          })),
          receipts: getTelecomEmulatorReceipts(),
        },
        null,
        2,
      ),
    )
    await writeFile(`${out}/telecom-trace.json`, JSON.stringify(trace, null, 2))
  }
  console.log(`ALL ${trace.length} CHECKS PASSED`)
} finally {
  await payload.destroy()
}
process.exit(0)
