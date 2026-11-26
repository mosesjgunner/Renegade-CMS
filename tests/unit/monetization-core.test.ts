import { describe, expect, it } from 'vitest'
import {
  allocateByBps,
  bpsFee,
  parseMinor,
  sumByCurrency,
} from '../../src/modules/monetization/money'
import { escapeCsvCell, parseCsv, renderCsv } from '../../src/modules/monetization/csv'
import { previewImport, type EvidenceMapping } from '../../src/modules/monetization/import'
import { computeStatement, statementCsv } from '../../src/modules/monetization/statements'
import { ALL_PROVIDERS, catalogCounts, findProvider } from '../../src/modules/monetization/catalog'

describe('monetization money', () => {
  it('parses minor units strictly and keeps unknown as null', () => {
    expect(parseMinor('1200')).toBe(1200n)
    expect(parseMinor('-50')).toBe(-50n)
    expect(parseMinor('')).toBeNull()
    expect(parseMinor(null)).toBeNull()
    expect(parseMinor('12.5')).toBeNull()
    expect(parseMinor('abc')).toBeNull()
  })
  it('allocates by basis points with an exact sum', () => {
    const parts = allocateByBps(101n, [3333, 3333, 3334])
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(101n)
    expect(() => allocateByBps(100n, [5000, 4000])).toThrow(/10000/)
  })
  it('computes a floored bps fee', () => {
    expect(bpsFee(10001n, 1000)).toBe(1000n)
    expect(bpsFee(0n, 1000)).toBe(0n)
    expect(bpsFee(-5n, 1000)).toBe(0n)
  })
  it('never mixes currencies when summing', () => {
    const buckets = sumByCurrency(
      [
        { c: 'USD', a: '100' },
        { c: 'EUR', a: '50' },
        { c: 'USD', a: null },
      ],
      (r) => r.c,
      (r) => parseMinor(r.a),
    )
    expect(buckets.get('USD')).toEqual({ total: 100n, unknownCount: 1, rowCount: 2 })
    expect(buckets.get('EUR')?.total).toBe(50n)
  })
})

describe('monetization csv', () => {
  it('round-trips quoted fields and rejects malformed input', () => {
    const table = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')
    expect(table.headers).toEqual(['a', 'b'])
    expect(table.rows[0]).toEqual({ a: 'x, y', b: 'he said "hi"' })
    expect(() => parseCsv('a,b\n"unterminated,2')).toThrow(/unterminated/)
    expect(() => parseCsv('a,a\n1,2')).toThrow(/duplicate/)
    expect(() => parseCsv('a,b\n1')).toThrow(/cells/)
  })
  it('neutralizes spreadsheet formulas on export (CE-T31)', () => {
    expect(escapeCsvCell('=2+5')).toBe("'=2+5")
    expect(escapeCsvCell('+cmd')).toBe("'+cmd")
    expect(escapeCsvCell('-2+3')).toBe("'-2+3")
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(escapeCsvCell('plain')).toBe('plain')
    const csv = renderCsv(['note'], [['=HYPERLINK("http://x")']])
    expect(csv).toContain('"\'=HYPERLINK(""http://x"")"')
  })
})

const mapping: EvidenceMapping = {
  mappingVersion: 'test-v1',
  columns: { eventId: 'id', currency: 'cur', status: 'state', commission: 'amt' },
  statusMap: { PAID: 'payout-confirmed', PEND: 'reported-pending' },
  amountFormat: 'decimal',
}

describe('monetization import preview', () => {
  it('normalizes decimals, rejects unmapped statuses, classifies duplicates and conflicts', () => {
    const table = parseCsv(
      ['id,cur,state,amt', 'e1,USD,PAID,12.34', 'e2,USD,WHAT,5.00', 'e3,JPY,PEND,500'].join('\n'),
    )
    const preview = previewImport(table, mapping, new Map())
    expect(preview.accepted).toHaveLength(2)
    expect(preview.accepted[0].commissionMinor).toBe('1234')
    expect(preview.accepted[1].commissionMinor).toBe('500') // JPY exponent 0
    expect(preview.rejected).toHaveLength(1)
    expect(preview.rejected[0].reasons.join(' ')).toMatch(/Unmapped provider status/)

    const again = previewImport(
      table,
      mapping,
      new Map(preview.accepted.map((r) => [r.providerEventId, r.sourceHash])),
    )
    expect(again.accepted).toHaveLength(0)
    expect(again.duplicates).toHaveLength(2)

    const changed = parseCsv(['id,cur,state,amt', 'e1,USD,PAID,99.99'].join('\n'))
    const conflict = previewImport(
      changed,
      mapping,
      new Map(preview.accepted.map((r) => [r.providerEventId, r.sourceHash])),
    )
    expect(conflict.conflicts).toHaveLength(1)
    expect(conflict.accepted).toHaveLength(0)
  })
  it('rejects rows with no money component', () => {
    const table = parseCsv(['id,cur,state,amt', 'e9,USD,PAID,'].join('\n'))
    const preview = previewImport(table, mapping, new Map())
    expect(preview.rejected[0].reasons.join(' ')).toMatch(/no money/)
  })
})

describe('monetization statements', () => {
  it('keeps sources separate, fees honest, and never totals across sources', () => {
    const statement = computeStatement({
      native: [
        {
          currency: 'USD',
          capturedMinor: '10000',
          refundMinor: '500',
          disputeMinor: null,
          feeMinor: '300',
          state: 'collected',
        },
        {
          currency: 'USD',
          capturedMinor: '2000',
          refundMinor: null,
          disputeMinor: null,
          feeMinor: null,
          state: 'collected',
        },
        {
          currency: 'EUR',
          capturedMinor: '700',
          refundMinor: null,
          disputeMinor: null,
          feeMinor: '0',
          state: 'pending',
        },
      ],
      affiliate: [],
      external: [
        {
          providerId: 'awin',
          currency: 'USD',
          status: 'reported-estimated',
          commissionMinor: '999999',
          netMinor: null,
          isEstimated: true,
        },
      ],
    })
    const usd = statement.native.find((b) => b.currency === 'USD')!
    expect(usd.grossCapturedMinor).toBe('12000')
    expect(usd.unknownFeeCount).toBe(1)
    expect(usd.netIsComplete).toBe(false)
    expect(usd.netBeforeUnknownFeesMinor).toBe('11200')
    expect(statement.external[0].estimatedMinor).toBe('999999')
    const csv = statementCsv(statement)
    expect(csv).toContain('external-reported')
    expect(csv).not.toContain('1099999') // never a merged total
    expect(statement.notes.join(' ')).toMatch(/never added/)
  })
})

describe('monetization catalog', () => {
  it('covers every Appendix A family with honest evidence levels', () => {
    const counts = catalogCounts()
    expect(counts.total).toBeGreaterThanOrEqual(50)
    expect(counts.byEvidence['live-verified'] ?? 0).toBe(0)
    expect(counts.byMode['native-verified'] ?? 0).toBe(0)
    const families = new Set(ALL_PROVIDERS.map((p) => p.family))
    for (const family of [
      'affiliate',
      'sponsorship',
      'advertising',
      'licensing',
      'external-membership',
      'external-commerce',
    ])
      expect(families.has(family as never)).toBe(true)
    const ids = ALL_PROVIDERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('resolves aliases and records the Mediavine conflict instead of resolving it silently', () => {
    expect(findProvider('CJ')?.id).toBe('cj-affiliate')
    expect(findProvider('shareasale-legacy')?.caveats).toMatch(/closed October 6, 2025/)
    expect(findProvider('mediavine')?.caveats).toMatch(/CONFLICTING PROVIDER PAGES/)
    expect(findProvider('btcpay')?.caveats).toMatch(/NOT against a live BTCPay/)
  })
})
