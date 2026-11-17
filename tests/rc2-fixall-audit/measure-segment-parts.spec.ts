import { describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@payload-config'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

// RC2-DEBT-13 profile: which leg of evaluateSegmentRecipients eats the
// ~0.9 ms/subscriber — the limit:0 subscribers find, or the
// memberships find with its giant IN list?
const PREFIX = 'fixall-scale-'

describe('fixall-audit DEBT-13 leg profile', () => {
  it('times the two finds separately at 25k subscribers', async () => {
    const payload: any = await getPayload({ config })
    const world = JSON.parse(
      readFileSync('/home/hatch/workspace/gui01b-logs/b01-world-backup.json', 'utf8'),
    )
    const siteId = String(world.siteA.siteId)
    const databaseUrl = process.env.DATABASE_URL as string
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    await client.query(
      `INSERT INTO subscribers (id, site_id, email, email_hash, status, created_at, updated_at)
       SELECT gen_random_uuid(), $1, '${PREFIX}' || g || '@scale.test',
              md5('${PREFIX}' || g), 'active', now(), now()
       FROM generate_series(0, 24999) AS g`,
      [siteId],
    )
    try {
      let t0 = performance.now()
      const subs = await payload.find({
        collection: 'subscribers',
        where: { site: { equals: siteId } },
        limit: 0,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      const subsMs = performance.now() - t0
      const ids = subs.docs.map((d: any) => String(d.id))

      t0 = performance.now()
      const mems = await payload.find({
        collection: 'audience-memberships',
        where: {
          and: [{ status: { equals: 'active' } }, { subscriber: { in: ids } }],
        },
        limit: 0,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      const memsMs = performance.now() - t0

      t0 = performance.now()
      const raw = await client.query(
        'SELECT id, email, status FROM subscribers WHERE site_id = $1',
        [siteId],
      )
      const rawMs = performance.now() - t0
      console.log(
        `DEBT-13 legs at 25k: subscribers find ${subsMs.toFixed(0)}ms (${subs.docs.length} docs), ` +
          `memberships find ${memsMs.toFixed(0)}ms (${mems.docs.length} docs), ` +
          `raw SQL projection ${rawMs.toFixed(0)}ms (${raw.rows.length} rows)`,
      )
      expect(subs.docs.length).toBe(25_000)
    } finally {
      await client.query(`DELETE FROM subscribers WHERE email LIKE '${PREFIX}%'`)
      await client.end()
    }
  }, 600_000)
})
