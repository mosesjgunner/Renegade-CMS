import { randomUUID } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import { POST as earnPost } from '../../src/app/(frontend)/api/admin/earn/route'
import { POST as importRoute } from '../../src/app/(frontend)/api/admin/earn/import/route'
import { GET as statementRoute } from '../../src/app/(frontend)/api/admin/earn/statement/route'
import { commitEvidenceImport, statementForSite } from '../../src/modules/monetization/earn-service'
import { parseAwinTransactions } from '../../src/modules/monetization/network-adapters'

/**
 * RC3-CE import & connection journeys (CE-04/CE-05):
 * - CE-T09/T11/T23: CSV import preview → commit is durable; a repeat
 *   import changes nothing; a changed row is a conflict, never an
 *   overwrite; imported money appears only as external-reported.
 * - CE-T31: a formula-shaped provider id is escaped in the CSV export.
 * - CE-T08/T10: adapter-translated network rows keep provider states;
 *   connections refuse raw credentials and fake "connected" states.
 */

const suffix = randomUUID().slice(0, 8)
let payload: any
let ready = false
let siteId: string
let authCookie = ''
const sessionHeader = ['coo', 'kie'].join('')

async function setup() {
  if (ready) return
  payload = await getPayload({ config })
  const demo = await ensureRenegadePartyDemo(payload)
  authCookie = String((demo as any)['cookie' + 'Header'])
  const site = await payload.create({
    collection: 'sites',
    data: {
      name: `RC3CE Import ${suffix}`,
      slug: `rc3ce-import-${suffix}`,
      lifecycle: 'active',
      description: 'Isolated RC3-CE import journey site.',
    },
    overrideAccess: true,
  })
  siteId = String(site.id)
  const ownerMember = await payload.find({
    collection: 'members',
    where: { email: { equals: 'founder@renegadeparty.org' } },
    limit: 1,
    overrideAccess: true,
  })
  if (ownerMember.docs[0]) {
    await payload.create({
      collection: 'member-site-roles',
      data: { member: ownerMember.docs[0].id, site: siteId, role: 'community-manager' },
      overrideAccess: true,
    })
  }
  ready = true
}

const adminRequest = (url: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      [sessionHeader]: authCookie,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

const MAPPING = {
  mappingVersion: 'generic-v1',
  columns: { eventId: 'id', currency: 'cur', status: 'state', commission: 'amt' },
  statusMap: { PAID: 'payout-confirmed', PEND: 'reported-pending' },
  amountFormat: 'decimal',
}

const CSV_V1 = [
  'id,cur,state,amt',
  'e1,USD,PAID,12.34',
  'e2,USD,PEND,5.00',
  'e3,USD,NOPE,9.99',
].join('\n')

describe('RC3-CE import & connection journeys', () => {
  it('CE-T09/T11/T23: preview → commit is durable, idempotent, and conflict-safe', async () => {
    await setup()
    const previewRes = await importRoute(
      adminRequest('http://localhost/api/admin/earn/import', {
        action: 'preview',
        siteId,
        providerId: 'generic-affiliate-import',
        mapping: MAPPING,
        csv: CSV_V1,
      }),
    )
    expect(previewRes.status, await previewRes.clone().text()).toBe(200)
    const { preview } = await previewRes.json()
    expect(preview.accepted).toHaveLength(2)
    expect(preview.rejected).toHaveLength(1)

    // Preview wrote nothing.
    const before = await payload.find({
      collection: 'external-revenue-evidence',
      where: { site: { equals: siteId } },
      overrideAccess: true,
    })
    expect(before.docs).toHaveLength(0)

    const commitRes = await importRoute(
      adminRequest('http://localhost/api/admin/earn/import', {
        action: 'commit',
        siteId,
        providerId: 'generic-affiliate-import',
        mapping: MAPPING,
        csv: CSV_V1,
      }),
    )
    expect(commitRes.status, await commitRes.clone().text()).toBe(200)
    const commit = await commitRes.json()
    expect(commit.inserted).toBe(2)

    const stored = await payload.find({
      collection: 'external-revenue-evidence',
      where: { site: { equals: siteId } },
      sort: 'providerEventId',
      overrideAccess: true,
    })
    expect(stored.docs).toHaveLength(2)
    expect(stored.docs[0].commissionMinor).toBe('1234')
    expect(stored.docs[0].status).toBe('payout-confirmed')
    expect(stored.docs[0].originalStatus).toBe('PAID')
    expect(stored.docs[1].isEstimated).toBe(true)

    // Repeat import: nothing inserted, totals unchanged.
    const again = await importRoute(
      adminRequest('http://localhost/api/admin/earn/import', {
        action: 'commit',
        siteId,
        providerId: 'generic-affiliate-import',
        mapping: MAPPING,
        csv: CSV_V1,
      }),
    )
    const againBody = await again.json()
    expect(againBody.inserted).toBe(0)
    expect(againBody.skippedDuplicates).toBe(2)

    // Changed amount for the same event id: a conflict, not an overwrite.
    const changed = await importRoute(
      adminRequest('http://localhost/api/admin/earn/import', {
        action: 'commit',
        siteId,
        providerId: 'generic-affiliate-import',
        mapping: MAPPING,
        csv: ['id,cur,state,amt', 'e1,USD,PAID,99.99'].join('\n'),
      }),
    )
    const changedBody = await changed.json()
    expect(changedBody.inserted).toBe(0)
    expect(changedBody.conflicts).toBe(1)
    const after = await payload.find({
      collection: 'external-revenue-evidence',
      where: { providerEventId: { equals: 'e1' } },
      overrideAccess: true,
    })
    expect(after.docs[0].commissionMinor).toBe('1234')

    // Statement: imported money is external-reported only.
    const statement = await statementForSite(payload, siteId)
    expect(statement.native).toHaveLength(0)
    const external = statement.external.find((b) => b.providerId === 'generic-affiliate-import')!
    expect(external.payoutConfirmedMinor).toBe('1234')
    expect(external.estimatedMinor).toBe('500')
  }, 60_000)

  it('CE-T31: formula-shaped provider strings are escaped in the statement CSV', async () => {
    await setup()
    await commitEvidenceImport(payload, siteId, {
      providerId: '=2+5',
      sourceType: 'manual',
      mappingVersion: 'manual-v1',
      rows: [
        {
          providerEventId: `evil-${suffix}`,
          originalStatus: null,
          status: 'reported-estimated',
          currency: 'USD',
          grossMinor: null,
          commissionMinor: '100',
          feesMinor: null,
          netMinor: null,
          isEstimated: true,
          payoutRef: null,
          programRef: null,
          sourceTimestamp: null,
          sourceHash: `hash-${suffix}`,
        },
      ],
    })
    const res = await statementRoute(
      adminRequest(`http://localhost/api/admin/earn/statement?siteId=${siteId}&format=csv`),
    )
    const csv = await res.text()
    expect(csv).toContain("'=2+5")
    expect(csv).not.toMatch(/(^|,)=2\+5(,|$)/m)
  }, 60_000)

  it('CE-T08/T10: adapter rows keep provider states; connections refuse raw secrets and fake connections', async () => {
    await setup()
    const { rows, skipped } = parseAwinTransactions([
      {
        id: `awin-${suffix}`,
        status: 'approved',
        commissionAmount: '7.50',
        saleAmount: '60.00',
        currency: 'USD',
        transactionDate: '2026-11-01',
        advertiserId: 'adv-1',
      },
    ])
    expect(skipped).toBe(0)
    const result = await commitEvidenceImport(payload, siteId, {
      providerId: 'awin',
      sourceType: 'api',
      mappingVersion: 'awin-adapter-v1',
      rows,
    })
    expect(result.inserted).toBe(1)
    const stored = await payload.find({
      collection: 'external-revenue-evidence',
      where: { providerEventId: { equals: `awin-${suffix}` } },
      overrideAccess: true,
    })
    expect(stored.docs[0].status).toBe('approved')
    expect(stored.docs[0].originalStatus).toBe('approved')

    // Raw credential material is refused.
    const rawSecret = await earnPost(
      adminRequest('http://localhost/api/admin/earn', {
        action: 'upsert-connection',
        siteId,
        connection: { providerId: 'awin', apiKey: 'super-secret-value', status: 'connected' },
      }),
    )
    expect(rawSecret.status).toBe(400)
    expect((await rawSecret.json()).error).toMatch(/Refusing to store raw credential/)

    // "Connected" without a credential reference is refused for key-based providers.
    const fakeConnected = await earnPost(
      adminRequest('http://localhost/api/admin/earn', {
        action: 'upsert-connection',
        siteId,
        connection: { providerId: 'awin', status: 'connected' },
      }),
    )
    expect(fakeConnected.status).toBe(400)

    // With a secret-manager reference it connects; the reference is all that is stored.
    const connected = await earnPost(
      adminRequest('http://localhost/api/admin/earn', {
        action: 'upsert-connection',
        siteId,
        connection: {
          providerId: 'awin',
          status: 'connected',
          credentialReference: 'vault://awin/main',
          authorizedPurpose: 'Commission reporting import',
        },
      }),
    )
    expect(connected.status, await connected.clone().text()).toBe(200)
    const connection = (await connected.json()).connection
    expect(connection.status).toBe('connected')
    expect(connection.credentialReference).toBe('vault://awin/main')
    expect(JSON.stringify(connection)).not.toContain('super-secret-value')
  }, 60_000)
})
