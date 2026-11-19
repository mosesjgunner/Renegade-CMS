import { describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@payload-config'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

// RC2-DEBT-13 measurement: evaluateSegmentRecipients loads a site's
// subscribers with limit: 0 (pagination off) and filters in memory.
// This spec times it at growing seeded scale so the register row can
// close as measured-safe or indicted on evidence, not vibes.
// Seeded rows use the fixall-scale- email prefix and are deleted after.
const PREFIX = 'fixall-scale-'

async function seedSubscribers(databaseUrl: string, siteId: string, count: number, offset: number) {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  await client.query(
    `INSERT INTO subscribers (id, site_id, email, email_hash, status, created_at, updated_at)
     SELECT gen_random_uuid(), $1, '${PREFIX}' || g || '@scale.test',
            md5('${PREFIX}' || g), 'active', now(), now()
     FROM generate_series($2::int, $3::int) AS g`,
    [siteId, offset, offset + count - 1],
  )
  await client.end()
}

async function dropSubscribers(databaseUrl: string) {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  await client.query(`DELETE FROM subscribers WHERE email LIKE '${PREFIX}%'`)
  await client.end()
}

describe('fixall-audit DEBT-13 segment evaluation scale', () => {
  it('times evaluateSegmentRecipients at 0 / 5k / 25k subscribers', async () => {
    const payload: any = await getPayload({ config })
    const world = JSON.parse(
      readFileSync('/home/hatch/workspace/gui01b-logs/b01-world-backup.json', 'utf8'),
    )
    const siteId = String(world.siteA.siteId)
    const databaseUrl = process.env.DATABASE_URL as string
    const { evaluateSegmentRecipients } = await import('../../src/modules/audience/service')

    const segment = await payload.create({
      collection: 'audience-segments',
      data: {
        site: siteId,
        name: 'Fixall Scale Segment',
        version: 'fixall-v1',
        status: 'active',
        definition: {
          all: [{ predicate: { field: 'consentPurpose', op: 'is', value: 'newsletter' } }],
        },
      },
      overrideAccess: true,
    })

    const timeOnce = async () => {
      const t0 = performance.now()
      const result = await evaluateSegmentRecipients(payload, {
        segmentId: String(segment.id),
        siteId,
      })
      return { ms: performance.now() - t0, result }
    }

    const timings: Record<string, number> = {}
    try {
      timings['0'] = (await timeOnce()).ms
      await seedSubscribers(databaseUrl, siteId, 5_000, 0)
      const runs5k = [(await timeOnce()).ms, (await timeOnce()).ms, (await timeOnce()).ms]
      timings['5000'] = runs5k.sort((a, b) => a - b)[1]
      await seedSubscribers(databaseUrl, siteId, 20_000, 5_000)
      const runs25k = [(await timeOnce()).ms, (await timeOnce()).ms]
      timings['25000'] = runs25k.sort((a, b) => a - b)[0]
    } finally {
      await dropSubscribers(databaseUrl)
      await payload.delete({
        collection: 'audience-segments',
        id: segment.id,
        overrideAccess: true,
      })
    }
    console.log('DEBT-13 segment evaluation ms:', JSON.stringify(timings))
    expect(timings['5000']).toBeGreaterThan(0)
  }, 600_000)
})
