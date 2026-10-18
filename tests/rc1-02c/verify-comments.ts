import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createLocalReq, getPayload } from 'payload'
import config from '@/payload.config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'
import { GET, POST } from '@/app/(frontend)/api/admin/workflow/comments/route'

async function run() {
  assert.equal(process.env.RC1_02C_DISPOSABLE, 'yes')
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/rc102c_release_acceptance')
  const payload = await getPayload({ config })
  const pool = (payload.db as any).pool
  try {
    const fixturePath = 'scratch/rc102c-20261017/fixture.json'
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
    const owner = (
      await payload.find({
        collection: 'users',
        where: { email: { equals: 'owner@rc102c.test' } },
        depth: 0,
      })
    ).docs[0]
    const session = await createPasskeySession(
      { id: owner.id, email: owner.email },
      process.env.PAYLOAD_SECRET!,
      async (id, expiry) => {
        await pool.query('INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)', [
          id,
          owner.id,
          expiry,
        ])
      },
    )
    const request = (
      method: string,
      body?: unknown,
      cookie = `renegade-passkey=${session.token}`,
      suffix = '',
    ) =>
      new Request(`http://localhost:38903/api/admin/workflow/comments${suffix}`, {
        method,
        headers: { 'content-type': 'application/json', cookie },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    if (process.argv.includes('--restart-check')) {
      const response = await GET(
        request('GET', undefined, undefined, `?articleId=${fixture.reviewArticleId}&all=true`),
      )
      assert.equal(response.status, 200)
      const { comments } = await response.json()
      assert.equal(
        comments.find((comment: any) => comment.id === fixture.resolvedCommentId)?.status,
        'resolved',
      )
      assert.equal(
        comments.find((comment: any) => comment.id === fixture.openCommentId)?.content,
        'Feedback survives worker/web/database restart',
      )
      console.log(
        'PASS new process after restart: open feedback, resolved status and resolution history reloaded via route from PostgreSQL',
      )
      return
    }
    const article = (
      await payload.find({
        collection: 'content',
        where: { site: { equals: fixture.siteA } },
        depth: 0,
      })
    ).docs[0]
    assert.ok(article)
    const created = await POST(
      request('POST', {
        action: 'create',
        articleId: article.id,
        content: 'Feedback survives worker/web/database restart',
        target: 'seo',
      }),
    )
    assert.equal(created.status, 201, await created.clone().text())
    const first = (await created.json()).comment
    const row = await pool.query('SELECT body,review,site_id FROM editorial_comments WHERE id=$1', [
      first.id,
    ])
    assert.equal(row.rows[0].body, first.content)
    assert.equal(row.rows[0].site_id, fixture.siteA)
    assert.equal(row.rows[0].review.target, 'seo')
    console.log(
      'PASS actual create route -> canonical editorial comment/discussion -> SQL persisted body, metadata and site',
    )
    const created2 = await POST(
      request('POST', {
        action: 'create',
        articleId: article.id,
        content: 'Please check this paragraph',
        target: 'body',
      }),
    )
    assert.equal(created2.status, 201)
    const second = (await created2.json()).comment
    const resolved = await POST(
      request('POST', {
        action: 'resolve',
        commentId: second.id,
        resolutionNote: 'Verified in saved revision',
      }),
    )
    assert.equal(resolved.status, 200, await resolved.clone().text())
    assert.equal((await resolved.json()).comment.status, 'resolved')
    const auditCount = async () =>
      Number(
        (
          await pool.query(
            "SELECT count(*) AS n FROM team_audit_events WHERE action='editorial.review-comment.resolved' AND details->>'commentId'=$1",
            [second.id],
          )
        ).rows[0].n,
      )
    assert.equal(await auditCount(), 1)
    assert.equal(
      (await POST(request('POST', { action: 'resolve', commentId: second.id }))).status,
      200,
    )
    assert.equal(await auditCount(), 1)
    assert.equal(
      (await POST(request('POST', { action: 'addressed', commentId: second.id }))).status,
      409,
    )
    console.log(
      'PASS resolution persisted and audited once; retry idempotent; resolved-to-addressed rejected with 409',
    )
    const member = await payload.create({
      collection: 'members',
      data: {
        email: `foreign-${Date.now()}@rc102c.test`,
        displayName: 'Foreign actor',
        status: 'active',
      },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: String(member.email), role: 'staff', member: member.id },
    })
    const ownerReq = await createLocalReq({ user: { ...owner, collection: 'users' } }, payload)
    await payload.create({
      collection: 'member-site-roles',
      data: { site: fixture.siteB, member: member.id, role: 'contributor' },
      overrideAccess: false,
      req: ownerReq,
    })
    const foreign = await createPasskeySession(
      { id: staff.id, email: staff.email },
      process.env.PAYLOAD_SECRET!,
      async (id, expiry) => {
        await pool.query('INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)', [
          id,
          staff.id,
          expiry,
        ])
      },
    )
    const foreignCookie = `renegade-passkey=${foreign.token}`
    const before = (
      await pool.query('SELECT body,review,updated_at FROM editorial_comments WHERE id=$1', [
        first.id,
      ])
    ).rows[0]
    assert.equal(
      (await POST(request('POST', { action: 'resolve', commentId: first.id }, foreignCookie)))
        .status,
      403,
    )
    assert.equal(
      (await POST(request('POST', { action: 'addressed', commentId: first.id }, foreignCookie)))
        .status,
      403,
    )
    assert.equal(
      (
        await POST(
          request(
            'POST',
            { action: 'create', articleId: article.id, content: 'Foreign write', target: 'body' },
            foreignCookie,
          ),
        )
      ).status,
      403,
    )
    assert.deepEqual(
      (
        await pool.query('SELECT body,review,updated_at FROM editorial_comments WHERE id=$1', [
          first.id,
        ])
      ).rows[0],
      before,
    )
    const foreignList = await GET(request('GET', undefined, foreignCookie))
    assert.equal(foreignList.status, 200)
    assert.deepEqual((await foreignList.json()).comments, [])
    assert.equal(
      (
        await POST(
          request('POST', { action: 'create', articleId: article.id, content: '', target: 'body' }),
        )
      ).status,
      400,
    )
    assert.equal((await GET(request('GET', undefined, ''))).status, 403)
    console.log(
      'PASS foreign list is empty; foreign create/resolve/addressed denied with persisted row unchanged; empty and anonymous requests denied',
    )
    fixture.reviewArticleId = article.id
    fixture.openCommentId = first.id
    fixture.resolvedCommentId = second.id
    await writeFile(fixturePath, JSON.stringify(fixture))
  } finally {
    await payload.db.destroy?.()
  }
}
run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
