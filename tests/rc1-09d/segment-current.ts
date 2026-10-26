/* eslint-disable @typescript-eslint/no-explicit-any -- persisted selector reconciliation */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload, createLocalReq } from 'payload'
import config from '@payload-config'
import { requestDoubleOptIn, confirmDoubleOptIn } from '../../src/modules/audience/service'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { POST as campaign } from '../../src/app/(frontend)/api/admin/audience/campaign/route'

assert.equal(process.env.RC1_09D_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5453/rc109d_release_acceptance',
)
const out = 'docs/rc/evidence/rc1/18-pass/09D'
const payload: any = await getPayload({ config })
const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
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
} catch (error) {
  trace.push({ passed: false, error: String(error) })
  console.error(error)
  process.exitCode = 1
} finally {
  await writeFile(`${out}/segment-trace.json`, JSON.stringify(trace, null, 2))
  await payload.destroy()
  process.exit(process.exitCode ?? 0)
}
