/* eslint-disable @typescript-eslint/no-explicit-any -- persisted selector reconciliation */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { getPayload, createLocalReq } from 'payload'
import config from '@payload-config'
import {
  requestDoubleOptIn,
  confirmDoubleOptIn,
  suppressSubscriber,
} from '../../src/modules/audience/service'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { POST as campaign } from '../../src/app/(frontend)/api/admin/audience/campaign/route'

assert.equal(process.env.RC1_09D_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5453/rc109d_release_acceptance',
)
const baseline = 'docs/rc/evidence/rc1/18-pass/09D'
const out = process.env.RC1_09D_EVIDENCE_DIR ?? baseline
await mkdir(out, { recursive: true })
const payload: any = await getPayload({ config })
const state = JSON.parse(await readFile(`${baseline}/state.json`, 'utf8'))
const trace: any[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}
try {
  const owner = (
    await payload.find({
      collection: 'users',
      where: { role: { equals: 'owner' } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0]
  assert.ok(owner)
  const session = await createPasskeySession(
    owner,
    process.env.PAYLOAD_SECRET!,
    async (id, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, owner.id, expiresAt],
      )
    },
  )
  const headers = {
    cookie: `renegade-passkey=${session.token}`,
    host: 'localhost:39003',
    origin: 'http://localhost:39003',
  }
  const post = async (siteId: string, body: any, auth = headers) =>
    campaign(
      new Request(`http://localhost:39003/api/admin/audience/campaign?siteId=${siteId}`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify(body),
      }),
    )
  const evaluate = async (id: string) => {
    const response = await post(state.alphaSiteId, { action: 'evaluate-segment', segmentId: id })
    assert.equal(response.status, 200)
    return response.json()
  }
  const original = JSON.parse(await readFile(`${baseline}/segment-observed.json`, 'utf8'))
  const originalResult = await evaluate(original.segmentId)
  check(
    'previously failing persisted fixture now returns its exact tagged subscriber',
    originalResult.counts.eligibleConsented === 1 &&
      originalResult.eligibleRecipientsSample[0]?.subscriberId === original.subscriberId,
  )
  if (process.argv.includes('--restart')) {
    const saved = JSON.parse(await readFile(`${out}/segment-repair-state.json`, 'utf8'))
    const retained = await evaluate(saved.segmentId)
    check(
      'restart retains canonical tag and snapshot membership',
      retained.counts.eligibleConsented === 0 && retained.isEmpty === true,
    )
    const snapshot = await payload.findByID({
      collection: 'recipient-snapshots',
      id: saved.snapshotId,
      depth: 0,
      overrideAccess: true,
    })
    check(
      'restart retains exact approved recipient snapshot hash and member',
      snapshot.hash === saved.snapshotHash &&
        snapshot.recipients.length === 1 &&
        snapshot.recipients[0].subscriberId === saved.subscriberId,
    )
    await writeFile(`${out}/segment-restart-trace.json`, JSON.stringify(trace, null, 2))
    await payload.destroy()
    process.exit(0)
  }
  const list = (
    await payload.find({
      collection: 'audience-lists',
      where: { site: { equals: state.alphaSiteId } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0]
  const signup = await requestDoubleOptIn(payload, {
    siteId: state.alphaSiteId,
    listId: list.id,
    email: `segment-${Date.now()}@example.test`,
    locale: 'en',
    consentWording: 'Send newsletter updates.',
    source: '09d-selector-probe',
  })
  const subscriber = await confirmDoubleOptIn(payload, signup.token!)
  check(
    'canonical double-opt-in service persists active subscriber',
    subscriber.status === 'active' && Boolean(subscriber.verifiedAt),
  )
  const req = await createLocalReq({ user: owner }, payload)
  req.headers.set('host', 'localhost:39003')
  const create = (collection: string, data: any) =>
    payload.create({ collection, data, req, user: owner, overrideAccess: false })
  const contact = await create('contacts', {
    site: state.alphaSiteId,
    displayName: '09D tagged supporter',
    email: subscriber.email,
    emailHash: subscriber.emailHash,
  })
  await payload.update({
    collection: 'subscribers',
    id: subscriber.id,
    data: { contact: contact.id },
    req,
    user: owner,
    overrideAccess: false,
  })
  const tag = await create('contact-tags', {
    site: state.alphaSiteId,
    name: `09D supporter ${Date.now()}`,
  })
  const tagging = await create('contact-taggings', {
    contact: contact.id,
    tag: tag.id,
    source: 'operator',
  })
  check('authorized native operator persists linked contact and tag', Boolean(tagging.id))
  const segment = await create('audience-segments', {
    site: state.alphaSiteId,
    name: '09D tagged newsletter supporters',
    version: '09d-selector-v1',
    status: 'active',
    definition: {
      all: [
        { predicate: { field: 'tag', op: 'is', value: tag.id } },
        { predicate: { field: 'consentPurpose', op: 'is', value: 'newsletter' } },
      ],
    },
  })
  const response = await campaign(
    new Request(`http://localhost:39003/api/admin/audience/campaign?siteId=${state.alphaSiteId}`, {
      method: 'POST',
      headers: {
        cookie: `renegade-passkey=${session.token}`,
        host: 'localhost:39003',
        origin: 'http://localhost:39003',
      },
      body: JSON.stringify({ action: 'evaluate-segment', segmentId: segment.id }),
    }),
  )
  const body = await response.json()
  check('authorized operator API evaluates saved segment', response.status === 200)
  await writeFile(
    `${out}/segment-observed.json`,
    JSON.stringify(
      {
        siteId: state.alphaSiteId,
        subscriberId: subscriber.id,
        contactId: contact.id,
        tagId: tag.id,
        taggingId: tagging.id,
        segmentId: segment.id,
        expectedEligible: 1,
        responseStatus: response.status,
        response: body,
      },
      null,
      2,
    ),
  )
  check(
    'tagged confirmed subscriber reconciles to exactly one eligible recipient',
    body.counts?.eligibleConsented === 1,
  )
  check(
    'anonymous tag segment evaluation denied',
    (
      await post(
        state.alphaSiteId,
        { action: 'evaluate-segment', segmentId: segment.id },
        {} as any,
      )
    ).status === 403,
  )
  check(
    'foreign-site segment substitution denied',
    (await post(state.betaSiteId, { action: 'evaluate-segment', segmentId: segment.id })).status ===
      403,
  )
  const foreignTag = await payload.create({
    collection: 'contact-tags',
    data: { site: state.betaSiteId, name: `Foreign ${Date.now()}` },
    overrideAccess: true,
  })
  // Deliberately inconsistent fixture tests the persisted relationship boundary.
  await payload.create({
    collection: 'contact-taggings',
    data: { contact: contact.id, tag: foreignTag.id },
    overrideAccess: true,
  })
  const foreignSelector = await create('audience-segments', {
    site: state.alphaSiteId,
    name: 'Foreign tag boundary',
    version: '1',
    definition: { predicate: { field: 'tag', op: 'is', value: foreignTag.id } },
  })
  check(
    'foreign-site tag on local contact cannot contribute audience facts',
    (await evaluate(foreignSelector.id)).counts.eligibleConsented === 0,
  )
  const foreignContact = await payload.create({
    collection: 'contacts',
    data: {
      site: state.betaSiteId,
      displayName: 'Foreign contact boundary',
      email: subscriber.email,
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'contact-taggings',
    data: { contact: foreignContact.id, tag: tag.id },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'subscribers',
    id: subscriber.id,
    data: { contact: foreignContact.id },
    overrideAccess: true,
  })
  check(
    'foreign-site contact cannot lend local tag facts through an inconsistent subscriber link',
    (await evaluate(segment.id)).counts.eligibleConsented === 0,
  )
  await payload.update({
    collection: 'subscribers',
    id: subscriber.id,
    data: { contact: contact.id },
    req,
    user: owner,
    overrideAccess: false,
  })
  check(
    'restoring the authorized contact restores its canonical tag facts',
    (await evaluate(segment.id)).counts.eligibleConsented === 1,
  )
  await payload.delete({
    collection: 'contact-taggings',
    id: tagging.id,
    req,
    user: owner,
    overrideAccess: false,
  })
  check(
    'operator removal immediately removes recipient from the segment',
    (await evaluate(segment.id)).counts.eligibleConsented === 0,
  )
  await create('contact-taggings', { contact: contact.id, tag: tag.id, source: 'operator' })
  check(
    'operator restoration re-evaluates canonical membership',
    (await evaluate(segment.id)).counts.eligibleConsented === 1,
  )
  const scheduled = await post(state.alphaSiteId, {
    action: 'save-and-schedule',
    targetStatus: 'schedule',
    segmentId: segment.id,
    subject: '09D tagged recipient snapshot',
    scheduledFor: new Date(Date.now() + 86400000).toISOString(),
    messageDesign: {
      version: 1,
      templateVersion: 'tag-repair',
      locale: 'en',
      tokens: {},
      plainTextStrategy: 'generated',
      personalization: { missingValue: 'fallback', fallbacks: {} },
      blocks: [
        { type: 'text', text: 'Controlled tag snapshot proof' },
        {
          type: 'legal',
          address: '09D isolated test address',
          preferenceUrl: 'http://localhost:39003/subscribe/preferences',
        },
      ],
    },
  })
  const scheduledBody = await scheduled.json()
  check(
    'operator scheduling persists a real recipient snapshot',
    scheduled.status === 200 &&
      scheduledBody.recipientCount === 1 &&
      Boolean(scheduledBody.snapshotId),
  )
  const snapshot = await payload.findByID({
    collection: 'recipient-snapshots',
    id: scheduledBody.snapshotId,
    depth: 0,
    overrideAccess: true,
  })
  check(
    'snapshot binds the exact tagged subscriber and fingerprint',
    snapshot.recipients.length === 1 &&
      snapshot.recipients[0].subscriberId === subscriber.id &&
      snapshot.hash === scheduledBody.snapshotHash,
  )
  const saved = {
    segmentId: segment.id,
    subscriberId: subscriber.id,
    snapshotId: snapshot.id,
    snapshotHash: snapshot.hash,
  }
  await writeFile(`${out}/segment-repair-state.json`, JSON.stringify(saved, null, 2))
  await suppressSubscriber(payload, {
    siteId: state.alphaSiteId,
    email: subscriber.email,
    reason: 'unsubscribe',
  })
  const suppressed = await evaluate(segment.id)
  check(
    'tag selection cannot override canonical suppression',
    suppressed.counts.eligibleConsented === 0 &&
      (
        await payload.findByID({
          collection: 'subscribers',
          id: subscriber.id,
          depth: 0,
          overrideAccess: true,
        })
      ).status === 'unsubscribed',
  )
  // Restart checks must retain the suppressed state, not resubscribe the subject.
  saved.subscriberId = subscriber.id
  await writeFile(
    `${out}/segment-repair-state.json`,
    JSON.stringify({ ...saved, suppressed: true }, null, 2),
  )
} catch (error) {
  trace.push({ passed: false, error: String(error) })
  console.error(error)
  process.exitCode = 1
} finally {
  if (!process.argv.includes('--restart'))
    await writeFile(`${out}/segment-trace.json`, JSON.stringify(trace, null, 2))
  await payload.destroy()
  process.exit(process.exitCode ?? 0)
}
