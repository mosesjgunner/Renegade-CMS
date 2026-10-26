import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  issueMagicLink,
  consumeMagicLink,
  digest,
} from '../../src/modules/identity/member-identity'
import { POST as complete } from '../../src/app/(frontend)/api/member-auth/magic-link/complete/route'
import { PATCH as profile } from '../../src/app/(frontend)/api/member-auth/profile/route'

assert.equal(process.env.RC1_10A_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5454/rc110a_release_acceptance',
)
const payload = await getPayload({ config })
const trace: Array<{ name: string; passed: boolean }> = []
function check(name: string, value: unknown) {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}
const marker = Date.now()
const request = (token: string, host = 'localhost:39010', extra = {}) =>
  new Request(`http://${host}/api/member-auth/magic-link/complete`, {
    method: 'POST',
    headers: { host, 'content-type': 'application/json' },
    body: JSON.stringify({ token, ...extra }),
  })
try {
  // Tokens are fixture-issued only for admission/security probes. Browser enrollment uses SMTP/UI.
  const closed = (
    await payload.find({
      collection: 'sites',
      where: { slug: { contains: 'beta10a-' } },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0]
  assert.ok(closed)
  const before = await payload.count({ collection: 'members', overrideAccess: true })
  for (const policy of ['disabled', 'invite'] as const) {
    await payload.update({
      collection: 'sites',
      id: closed.id,
      overrideAccess: true,
      data: { communityRegistrationPolicy: policy },
    })
    const issued = await issueMagicLink(payload as never, `${policy}-${marker}@example.test`)
    const response = await complete(
      request(issued.token!, 'beta.example.test', { inviteCode: 'forged-invite' }),
    )
    check(
      `${policy} tenant rejects caller-supplied invite without a fictitious audit member`,
      response.status === 400,
    )
  }
  check(
    'denied registration creates no canonical member',
    (await payload.count({ collection: 'members', overrideAccess: true })).totalDocs ===
      before.totalDocs,
  )
  await payload.update({
    collection: 'sites',
    id: closed.id,
    overrideAccess: true,
    data: { communityRegistrationPolicy: 'disabled' },
  })
  const issued = await issueMagicLink(payload as never, `concurrent-${marker}@example.test`)
  const responses = await Promise.all([
    complete(request(issued.token!)),
    complete(request(issued.token!)),
  ])
  check(
    'concurrent first-enrollment token consumption has exactly one winner',
    responses
      .map((r) => r.status)
      .sort()
      .join(',') === '200,400',
  )
  const winner = responses.find((r) => r.status === 200)!
  const cookies = winner.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  const session = /renegade-member=([^;]+)/.exec(cookies)![1]
  const csrf = /renegade-member-csrf=([^;]+)/.exec(cookies)![1]
  const { currentMember } = await import('../../src/modules/identity/member-identity')
  const memberId = await currentMember(payload as never, session)
  const owned = await payload.find({
    collection: 'profiles',
    where: { member: { equals: memberId } },
    overrideAccess: true,
  })
  check(
    'concurrent enrollment persisted exactly one member and one profile',
    (await payload.count({ collection: 'members', overrideAccess: true })).totalDocs ===
      before.totalDocs + 1 && owned.totalDocs === 1,
  )
  const denied = await profile(
    new Request('http://unknown.example.test/api/member-auth/profile', {
      method: 'PATCH',
      headers: {
        host: 'unknown.example.test',
        cookie: cookies,
        'x-member-csrf': csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ bio: 'must never persist' }),
    }),
  )
  const after = await payload.findByID({
    collection: 'profiles',
    id: owned.docs[0].id,
    overrideAccess: true,
  })
  check(
    'authenticated profile writes on unknown hosts fail closed without persistence',
    denied.status === 404 && after.bio !== 'must never persist',
  )
  const expired = await complete(request('invalid-token'))
  check('invalid recovery link returns a bounded error', expired.status === 400)
  const edited = await profile(
    new Request('http://localhost:39010/api/member-auth/profile', {
      method: 'PATCH',
      headers: {
        host: 'localhost:39010',
        cookie: cookies,
        'x-member-csrf': csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ bio: `Private audit story ${marker}` }),
    }),
  )
  assert.equal(edited.status, 200)
  const alpha = (
    await payload.find({
      collection: 'sites',
      where: { slug: { contains: 'alpha10a-' } },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0]
  const staffMember = await payload.create({
    collection: 'members',
    overrideAccess: true,
    data: {
      displayName: 'Privacy probe staff',
      email: `private-staff-${marker}@example.test`,
      status: 'active',
    },
  })
  await payload.create({
    collection: 'member-site-roles',
    overrideAccess: true,
    data: { member: staffMember.id, site: alpha.id, role: 'community-manager' },
  })
  await payload.create({
    collection: 'member-site-roles',
    overrideAccess: true,
    data: { member: memberId!, site: alpha.id, role: 'member' },
  })
  const staff = await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: { email: `operator-${marker}@example.test`, member: staffMember.id, role: 'staff' },
  })
  const events = await payload.find({
    collection: 'identity-audit-events',
    overrideAccess: false,
    user: staff,
    depth: 0,
    where: { member: { equals: memberId } },
  })
  check(
    'scoped staff can read event metadata but cannot recover private bio from audit history',
    events.totalDocs > 0 &&
      events.docs.every((event) => !Object.prototype.hasOwnProperty.call(event, 'details')),
  )
  const staffView = await payload.findByID({
    collection: 'members',
    id: staffMember.id,
    overrideAccess: false,
    user: staff,
    depth: 0,
  })
  check(
    'staff member administration omits private canonical email',
    !Object.prototype.hasOwnProperty.call(staffView, 'email'),
  )
  await payload.update({
    collection: 'members',
    id: staffMember.id,
    overrideAccess: false,
    user: staff,
    data: { email: `forged-${marker}@example.test` },
  })
  const retained = await payload.findByID({
    collection: 'members',
    id: staffMember.id,
    overrideAccess: true,
  })
  check(
    'scoped staff cannot replace canonical recovery email',
    retained.email === `private-staff-${marker}@example.test`,
  )
  const twoEmail = `two-links-${marker}@example.test`
  const first = await issueMagicLink(payload as never, twoEmail)
  const second = await issueMagicLink(payload as never, twoEmail, new Date(Date.now() + 61000))
  assert.ok(first.token && second.token)
  const beforeTwo = await payload.count({ collection: 'members', overrideAccess: true })
  const pair = await Promise.all([complete(request(first.token)), complete(request(second.token))])
  const ids = await Promise.all(
    pair.map(async (response) => {
      assert.equal(response.status, 200)
      return currentMember(
        payload as never,
        /renegade-member=([^;]+)/.exec(response.headers.getSetCookie().join(';'))![1],
      )
    }),
  )
  check(
    'different valid email links converge under concurrency without duplicate canonical identities',
    ids[0] === ids[1] &&
      (await payload.count({ collection: 'members', overrideAccess: true })).totalDocs ===
        beforeTwo.totalDocs + 1,
  )
  const failed = await issueMagicLink(payload as never, `rollback-${marker}@example.test`)
  const beforeFailure = await payload.count({ collection: 'members', overrideAccess: true })
  const broken = new Proxy(payload, {
    get(target, key) {
      if (key === 'create')
        return (args: Record<string, unknown>) => {
          if (args.collection === 'profiles')
            throw new Error('Isolated profile persistence failure')
          return target.create(args as never)
        }
      const value = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  await assert.rejects(
    () => consumeMagicLink(broken as never, failed.token!),
    /Isolated profile persistence failure/,
  )
  const tokenAfter = await payload.find({
    collection: 'identity-tokens',
    where: { tokenHash: { equals: digest(failed.token!) } },
    overrideAccess: true,
  })
  check(
    'profile persistence error rolls back member creation and token consumption',
    (await payload.count({ collection: 'members', overrideAccess: true })).totalDocs ===
      beforeFailure.totalDocs && !tokenAfter.docs[0].consumedAt,
  )
  const retried = await complete(request(failed.token!))
  check(
    'same ordinary completion endpoint can retry after transactional rollback',
    retried.status === 200,
  )
  const migrated = await (
    payload.db as unknown as {
      pool: { query: (sql: string) => Promise<{ rows: Array<{ count: string }> }> }
    }
  ).pool.query('SELECT count(*) FROM payload_migrations')
  console.log(`Fresh migrations recorded: ${migrated.rows[0].count}`)
} finally {
  await writeFile(
    'docs/rc/evidence/rc1/18-pass/10A/security-trace.json',
    JSON.stringify(trace, null, 2),
  )
  await payload.destroy()
}
process.exit(0)
