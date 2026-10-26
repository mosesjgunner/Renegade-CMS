/* eslint-disable @typescript-eslint/no-explicit-any -- disposable persisted intake proof */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { POST as submit } from '../../src/app/(frontend)/api/forms/[formId]/route'
import { formIntakeTask } from '../../src/modules/audience/form-tasks'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { GET as report } from '../../src/app/(frontend)/api/admin/audience/command-center/route'
import { GET as crm } from '../../src/app/(frontend)/api/admin/audience/crm/route'
import { dispatchCommunityNotification } from '../../src/modules/community/service'
import { exportAudienceSubject } from '../../src/modules/audience/service'

assert.equal(process.env.RC1_09D_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5453/rc109d_release_acceptance',
)
const out = 'docs/rc/evidence/rc1/18-pass/09D'
const payload: any = await getPayload({ config })
const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
const trace: any[] = []
function check(name: string, value: unknown) {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}
try {
  const suffix = Date.now().toString(36)
  const form = await payload.create({
    collection: 'form-definitions',
    data: {
      site: state.alphaSiteId,
      name: `09D intake ${suffix}`,
      publicPath: `/forms/intake-${suffix}`,
      visibility: 'public',
      actions: [
        { type: 'create-contact', emailField: 'email', nameField: 'name' },
        { type: 'create-task', title: `09D intake task ${suffix}` },
      ],
    },
    overrideAccess: true,
  })
  const schema = await payload.create({
    collection: 'form-schemas',
    data: {
      form: form.id,
      version: 1,
      state: 'published',
      locale: 'en',
      consentText: 'Contact me about my request.',
      consentRevision: '09d-v1',
      schema: {
        fields: [
          { key: 'email', type: 'email', label: 'Email', required: true },
          { key: 'name', type: 'text', label: 'Name', required: true },
        ],
      },
    },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'form-definitions',
    id: form.id,
    data: { activeSchema: schema.id },
    overrideAccess: true,
  })
  const request = (values: any, key: string, host = 'localhost:39003') =>
    new Request(`http://${host}/api/forms/${form.id}`, {
      method: 'POST',
      headers: { host, 'content-type': 'application/json' },
      body: JSON.stringify({ values, idempotencyKey: key }),
    })
  const context = { params: Promise.resolve({ formId: form.id }) }
  const values = { email: 'intake-person@example.test', name: '09D Intake Person' }
  const first = await submit(request(values, `intake-first-${suffix}`), context)
  const firstBody = await first.json()
  console.log('Intake response:', first.status, JSON.stringify(firstBody))
  check(
    'public saved-schema form receives submission',
    first.status === 201 && firstBody.actions === 'worker-managed',
  )
  const replay = await submit(request(values, `intake-first-${suffix}`), context)
  check(
    'public intake idempotency replay returns same persisted ID',
    replay.status === 200 && (await replay.json()).submissionId === firstBody.submissionId,
  )
  check(
    'invalid form answers rejected without success',
    (await submit(request({ email: 'invalid' }, `intake-invalid-${suffix}`), context)).status ===
      422,
  )
  check(
    'foreign host cannot submit Alpha form',
    (await submit(request(values, `intake-foreign-${suffix}`, 'beta.example.test'), context))
      .status === 404,
  )
  // More than the dashboard's historical 50-row page, all produced through the public handler.
  for (let i = 0; i < 50; i++) {
    const response = await submit(request(values, `intake-extra-${suffix}-${i}`), context)
    assert.equal(response.status, 201)
  }
  check(
    '51 real form submissions persisted through public intake',
    (
      await payload.count({
        collection: 'form-submissions',
        where: { form: { equals: form.id } },
        overrideAccess: true,
      })
    ).totalDocs === 51,
  )
  const handler = formIntakeTask.handler as any
  await handler({ req: { payload } })
  const rows = await payload.find({
    collection: 'form-submissions',
    where: { form: { equals: form.id } },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  check(
    'supported intake worker triages all 51 submissions and records completed actions',
    rows.docs.length === 51 &&
      rows.docs.every(
        (r: any) =>
          r.status === 'triaged' &&
          r.actionState.length === 2 &&
          r.actionState.every((a: any) => a.status === 'completed'),
      ),
  )
  const contactCount = await payload.count({
    collection: 'contacts',
    where: { site: { equals: state.alphaSiteId }, email: { equals: values.email } },
    overrideAccess: true,
  })
  check('intake contacts deduplicate by canonical site and address', contactCount.totalDocs === 1)
  const tasks = await payload.count({
    collection: 'workflow-items',
    where: { site: { equals: state.alphaSiteId }, title: { equals: `09D intake task ${suffix}` } },
    overrideAccess: true,
  })
  check('51 source-linked tasks persisted', tasks.totalDocs === 51)
  await handler({ req: { payload } })
  check(
    'worker replay does not duplicate completed intake tasks',
    (
      await payload.count({
        collection: 'workflow-items',
        where: {
          site: { equals: state.alphaSiteId },
          title: { equals: `09D intake task ${suffix}` },
        },
        overrideAccess: true,
      })
    ).totalDocs === 51,
  )
  const admin = await payload.create({
    collection: 'users',
    data: { email: `report-${suffix}@example.test`, role: 'owner' },
    overrideAccess: true,
  })
  const session = await createPasskeySession(
    admin,
    process.env.PAYLOAD_SECRET!,
    async (id, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, admin.id, expiresAt],
      )
    },
  )
  const headers = { cookie: `renegade-passkey=${session.token}` }
  const recipient = await payload.create({
    collection: 'members',
    data: { email: `notice-${suffix}@example.test`, displayName: '09D notification recipient' },
    overrideAccess: true,
  })
  await dispatchCommunityNotification(payload, {
    siteId: state.alphaSiteId,
    recipientMemberId: recipient.id,
    type: 'community.notice',
    object: { type: 'member', id: recipient.id },
    payloadData: { summary: '09D controlled notification' },
  })
  const notices = await payload.find({
    collection: 'notifications',
    where: { recipientMember: { equals: recipient.id } },
    depth: 0,
    overrideAccess: true,
  })
  check(
    'supported community dispatcher persists in-app notification with external channel off',
    notices.totalDocs === 1 &&
      notices.docs[0].channels.includes('in-app') &&
      !notices.docs[0].channels.includes('email'),
  )
  const response = await report(
    new Request(
      `http://localhost:39003/api/admin/audience/command-center?siteId=${state.alphaSiteId}`,
      { headers },
    ),
  )
  const body = await response.json()
  check(
    'command center returns canonical form counts above page boundary',
    response.status === 200 &&
      body.forms.total ===
        (
          await payload.count({
            collection: 'form-submissions',
            where: { site: { equals: state.alphaSiteId } },
            overrideAccess: true,
          })
        ).totalDocs &&
      body.forms.triaged >= 51 &&
      body.forms.received === 0,
  )
  check(
    'notification reporting labels canonical saved records',
    body.notifications?.activityRecords >= 1 &&
      typeof body.notifications?.inApp === 'number' &&
      typeof body.notifications?.queuedExternal === 'number',
  )
  const page = await crm(
    new Request(
      `http://localhost:39003/api/admin/audience/crm?siteId=${state.alphaSiteId}&limit=1&page=2`,
      { headers },
    ),
  )
  check('CRM supports persisted pagination', page.status === 200 && (await page.json()).page === 2)
  await assert.rejects(
    () =>
      exportAudienceSubject(payload, {
        siteId: state.betaSiteId,
        subscriberId: state.subscriberId,
      }),
    /unavailable/,
  )
  check('foreign-site subject export denied before returning private data', true)
  const bundle = await exportAudienceSubject(payload, {
    siteId: state.alphaSiteId,
    subscriberId: state.subscriberId,
  })
  check(
    'subject export retains unpopulated relationships and explicit retention boundary',
    typeof bundle.subscriber.site === 'string' &&
      bundle.policy.includes('Account deletion is not supported'),
  )
  await writeFile(
    `${out}/intake-state.json`,
    JSON.stringify(
      { siteId: state.alphaSiteId, formId: form.id, submissions: 51, tasks: 51 },
      null,
      2,
    ),
  )
} catch (error) {
  trace.push({ passed: false, error: String(error) })
  console.error(error)
  process.exitCode = 1
} finally {
  await writeFile(`${out}/intake-trace.json`, JSON.stringify(trace, null, 2))
  await payload.destroy()
  process.exit(process.exitCode ?? 0)
}
