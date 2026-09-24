import { describe, expect, it } from 'vitest'
import {
  ingestDonationEvidence,
  reverseDonation,
} from '../../src/modules/commerce/donation-ingestion'

const matches = (row: any, where: any): boolean => {
  if (!where) return true
  if (typeof where !== 'object') return String(row) === String(where)
  if (where.and) return where.and.every((part: any) => matches(row, part))
  return Object.entries(where).every(([key, condition]: [string, any]) => {
    const actual = row[key]?.id ?? row[key]
    return condition?.equals !== undefined
      ? String(actual ?? '') === String(condition.equals)
      : typeof condition === 'object'
        ? false
        : String(actual ?? '') === String(condition)
  })
}

function fixture() {
  const rows: Record<string, any[]> = {
    'payment-intents': [{ id: 'pay-1', amountMinor: '2575', currency: 'USD', state: 'pending' }],
    'donation-intents': [
      {
        id: 'di-1',
        site: 'site-1',
        campaign: 'camp-1',
        campaignVersion: 3,
        paymentIntent: 'pay-1',
        donorSnapshot: { email: 'guest@example.test', guestName: 'Guest' },
        moneySnapshot: { baseAmountMinor: '2500', feeCoveredAmountMinor: '75', currency: 'USD' },
        recognition: 'private',
        recurrence: 'one-time',
        lifecycle: 'created',
      },
    ],
    'donation-campaigns': [{ id: 'camp-1', title: 'Drive', purpose: 'Support', version: 3 }],
    'donation-events': [],
    donations: [],
    supporters: [],
    entitlements: [],
    'member-notifications': [],
  }
  let id = 0
  const payload: any = {
    find: async ({ collection, where }: any) => ({
      docs: rows[collection].filter((row) => matches(row, where)),
    }),
    findByID: async ({ collection, id }: any) =>
      rows[collection].find((row) => row.id === id) ?? null,
    create: async ({ collection, data }: any) => {
      const uniques: Record<string, (row: any) => boolean> = {
        'donation-events': (row) => row.eventKey === data.eventKey,
        donations: (row) => row.paymentIntent === data.paymentIntent,
        supporters: (row) =>
          data.emailHash
            ? row.emailHash === data.emailHash && row.site === data.site
            : row.member === data.member && row.site === data.site,
      }
      if (uniques[collection] && rows[collection].some(uniques[collection]))
        throw new Error('unique conflict')
      const row = { id: `new-${++id}`, ...data }
      rows[collection].push(row)
      return row
    },
    update: async ({ collection, id, data }: any) =>
      Object.assign(
        rows[collection].find((row) => row.id === id),
        data,
      ),
  }
  return { payload, rows }
}

const evidence = (overrides: any = {}) => ({
  providerKey: 'stripe',
  providerEventId: 'evt-1',
  paymentIntentId: 'pay-1',
  state: 'settled' as const,
  occurredAt: '2026-09-23T10:00:00Z',
  verifiedAt: '2026-09-23T10:01:00Z',
  amountMinor: '2575',
  currency: 'USD',
  evidence: {},
  ...overrides,
})

describe('donation evidence ingestion', () => {
  it('rejects altered replays and deduplicates exact webhook replays', async () => {
    const { payload, rows } = fixture()
    rows['payment-intents'][0].state = 'paid'
    await ingestDonationEvidence(payload, evidence())
    await expect(ingestDonationEvidence(payload, evidence())).resolves.toMatchObject({
      outcome: 'duplicate',
    })
    await expect(ingestDonationEvidence(payload, evidence({ amountMinor: '1' }))).rejects.toThrow(
      /different evidence/,
    )
    expect(rows.donations).toHaveLength(1)
  })

  it('creates one event and one donation under concurrent duplicate delivery', async () => {
    const { payload, rows } = fixture()
    rows['payment-intents'][0].state = 'paid'
    const results = await Promise.all([
      ingestDonationEvidence(payload, evidence()),
      ingestDonationEvidence(payload, evidence()),
    ])
    expect(results.map((result) => result.outcome).sort()).toEqual(['settled', 'settled'])
    expect(rows['donation-events']).toHaveLength(1)
    expect(rows.donations).toHaveLength(1)
  })

  it('waits for verified settlement and freezes the campaign and donor snapshots once paid', async () => {
    const { payload, rows } = fixture()
    await expect(
      ingestDonationEvidence(payload, evidence({ state: 'pending' })),
    ).resolves.toMatchObject({ outcome: 'pending' })
    expect(rows.donations).toHaveLength(0)
    rows['payment-intents'][0].state = 'paid'
    await ingestDonationEvidence(payload, evidence({ providerEventId: 'evt-settled' }))
    expect(rows.donations[0]).toMatchObject({
      lifecycle: 'succeeded',
      baseAmountMinor: '2500',
      campaignSnapshot: { title: 'Drive', version: 3 },
      donorSnapshot: { guestName: 'Guest' },
    })
    expect(rows.donations[0].receiptSnapshot).toMatchObject({
      amountMinor: '2500',
      currency: 'USD',
      settledAt: evidence().occurredAt,
      recurrence: 'one-time',
    })
    expect(rows.donations[0].receiptSnapshot.disclosures).not.toContain(
      'This organization is recognized as a 501(c)(3).',
    )
    expect(rows.supporters).toHaveLength(1)
  })

  it('refuses amount mismatch and does not snapshot a donation', async () => {
    const { payload, rows } = fixture()
    rows['payment-intents'][0].state = 'paid'
    await expect(
      ingestDonationEvidence(payload, evidence({ amountMinor: '2576' })),
    ).rejects.toThrow(/money does not match/)
    expect(rows.donations).toHaveLength(0)
  })

  it('resumes settlement if durable evidence was recorded before a transient snapshot failure', async () => {
    const { payload, rows } = fixture()
    rows['payment-intents'][0].state = 'paid'
    rows['donation-campaigns'].length = 0
    await expect(ingestDonationEvidence(payload, evidence())).rejects.toThrow(/campaign revision/)
    rows['donation-campaigns'].push({
      id: 'camp-1',
      title: 'Drive',
      purpose: 'Support',
      version: 3,
    })
    await expect(ingestDonationEvidence(payload, evidence())).resolves.toMatchObject({
      outcome: 'settled',
    })
    expect(rows['donation-events']).toHaveLength(1)
    expect(rows.donations).toHaveLength(1)
  })

  it('uses existing subscription supporter identity for recurring installments', async () => {
    const { payload, rows } = fixture()
    rows['donation-intents'][0].paymentIntent = null
    rows['donation-intents'][0].subscription = 'sub-1'
    rows.subscriptions = [
      {
        id: 'sub-1',
        supporter: 'supporter-master',
        providerKey: 'stripe',
        providerSubscriptionReference: 'sub_ref',
      },
    ]
    rows.supporters.push({ id: 'supporter-master', site: 'site-1', member: 'member-1' })
    rows['payment-intents'][0].state = 'paid'
    await expect(
      ingestDonationEvidence(payload, evidence({ evidence: { subscriptionReference: 'sub_ref' } })),
    ).resolves.toMatchObject({ outcome: 'settled' })
    expect(rows.supporters).toHaveLength(1)
    expect(rows.donations[0].subscription).toBe('sub-1')
  })

  it('links authenticated gifts to the member supporter record instead of creating a guest identity', async () => {
    const { payload, rows } = fixture()
    rows['donation-intents'][0].donorSnapshot = {
      memberId: 'member-1',
      email: 'member@example.test',
    }
    rows.supporters.push({ id: 'supporter-member', site: 'site-1', member: 'member-1' })
    rows['payment-intents'][0].state = 'paid'
    await ingestDonationEvidence(payload, evidence())
    expect(rows.supporters).toHaveLength(1)
  })

  it('records reversals once and preserves the immutable settled snapshot', async () => {
    const { payload, rows } = fixture()
    rows['payment-intents'][0].state = 'paid'
    await ingestDonationEvidence(payload, evidence())
    const snapshot = { ...rows.donations[0] }
    await expect(
      reverseDonation(payload, {
        donationId: rows.donations[0].id,
        eventKey: 'refund:one',
        kind: 'refunded',
        occurredAt: '2026-09-23T11:00:00Z',
      }),
    ).resolves.toMatchObject({ outcome: 'reversed', lifecycle: 'refunded' })
    await expect(
      reverseDonation(payload, {
        donationId: rows.donations[0].id,
        eventKey: 'refund:one',
        kind: 'refunded',
        occurredAt: '2026-09-23T11:00:00Z',
      }),
    ).resolves.toMatchObject({ outcome: 'duplicate' })
    expect(rows['donation-events'].filter((row) => row.eventKey === 'refund:one')).toHaveLength(1)
    expect(rows.donations[0]).toMatchObject({
      donorSnapshot: snapshot.donorSnapshot,
      baseAmountMinor: snapshot.baseAmountMinor,
      currency: snapshot.currency,
      lifecycle: 'refunded',
    })
  })

  it('provisions a finite supporter benefit and revokes it on a refund', async () => {
    const { payload, rows } = fixture()
    rows['donation-campaigns'][0].supporterEntitlement = 'supporter-badge'
    rows['donation-campaigns'][0].supporterEntitlementTermDays = 30
    rows['payment-intents'][0].state = 'paid'
    await ingestDonationEvidence(payload, evidence())
    expect(rows.entitlements[0]).toMatchObject({
      entitlement: 'supporter-badge',
      source: 'donation',
      endsAt: '2026-10-23T10:00:00.000Z',
    })
    await reverseDonation(payload, {
      donationId: rows.donations[0].id,
      eventKey: 'refund:perk',
      kind: 'refunded',
      occurredAt: '2026-09-24T10:00:00Z',
    })
    expect(rows.entitlements[0].revokedAt).toBe('2026-09-24T10:00:00Z')
  })
})
