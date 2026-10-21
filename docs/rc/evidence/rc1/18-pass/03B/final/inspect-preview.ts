/* Isolated operator diagnostic. No business rows are updated directly. */
import assert from 'node:assert/strict'
import http from 'node:http'
import { writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
assert.equal(process.env.DATABASE_URL, 'postgresql://postgres:postgres@127.0.0.1:5463/rc103b_final_release_acceptance')
const payload = await getPayload({ config })
try {
  const user = (await payload.find({ collection: 'users', where: { role: { equals: 'owner' } }, limit: 1, depth: 0 })).docs[0]
  const session = await createPasskeySession(user, loadConfig().payloadSecret, async (id, expires) => {
    await payload.db.pool.query('INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)', [id,user.id,expires])
  })
  const request = (route: string, data?: unknown) => new Promise<{status: number; headers: http.IncomingHttpHeaders; text: string}>((resolve,reject) => {
    const req = http.request(`http://localhost:39033${route}`, { method: data ? 'POST' : 'GET', headers: { cookie: `renegade-passkey=${session.token}`, origin: 'http://localhost:39033', 'content-type': 'application/json' } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk); res.on('end', () => resolve({status:res.statusCode!,headers:res.headers,text})); res.on('error',reject)
    }); req.on('error',reject); req.end(data ? JSON.stringify(data) : undefined)
  })
  const doc = (await payload.find({ collection: 'content', where: {contentType:{equals:'article'}}, limit:1, depth:0 })).docs[0]
  const minted = await request('/api/admin/content/preview', {id:doc.id})
  assert.equal(minted.status,200)
  const result = await request(JSON.parse(minted.text).url)
  await writeFile('docs/rc/evidence/rc1/18-pass/03B/final/preview-diagnostic.html', result.text)
  const diagnostic = { status:result.status, headers:result.headers, original:result.text.includes('UNPUBLISHED original'), callout:result.text.includes('Preserved callout original') }
  await writeFile('docs/rc/evidence/rc1/18-pass/03B/final/preview-diagnostic.json', JSON.stringify(diagnostic,null,2))
  console.log(JSON.stringify(diagnostic,null,2))
} finally { await payload.db.destroy() }
process.exit(0)
