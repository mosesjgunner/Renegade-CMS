import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compareManifest,
  parseLedger,
  precedingIds,
  verifyInventory,
  writeExclusive,
  inventoryProblems,
} from '../../scripts/release-inventory'
import { OPTIONAL_MODULES } from '../../src/modules/module-registry'

function completeCoverage(): Parameters<typeof inventoryProblems>[0] {
  const hash = 'a'.repeat(64)
  return {
    source: {
      baseCommit: 'b'.repeat(40),
      files: [{ path: 'src/app/example/page.tsx', sha256: hash }],
    },
    records: precedingIds.map((id) => ({
      id,
      duplicateRows: 0,
      result: null,
      receipts: [],
      issues: ['missing-result'],
      currentAcceptance: 'Missing runtime proof; release remains blocked',
    })),
    modules: OPTIONAL_MODULES.map((module) => ({
      id: module.id,
      disposition: 'required; unproved',
    })),
    routes: [{ path: 'src/app/example/page.tsx', sha256: hash, disposition: 'required; unproved' }],
    gates: Array.from({ length: 19 }, (_, index) => ({
      gate: String(index + 1),
      requiredProof: 'mandatory scoped proof',
      disposition: 'unproved',
    })),
    journey: [...'ABCDEFGHIJKLMNOPQRST'].map((step) => ({
      step,
      required: 'ordinary action',
      disposition: 'unproved',
    })),
    scopePolicyPresent: true,
  }
}

describe('release inventory safety and provenance', () => {
  it('accepts complete accounting of missing runtime proof without granting release readiness', () => {
    expect(inventoryProblems(completeCoverage())).toEqual([])
  })

  it('refuses incomplete, ambiguous or falsely bound inventories', () => {
    const missingRecord = completeCoverage()
    missingRecord.records.pop()
    expect(inventoryProblems(missingRecord)).toContain(
      'Preceding assignment coverage is incomplete or duplicated',
    )
    const hiddenGap = completeCoverage()
    hiddenGap.records[0].issues = []
    expect(inventoryProblems(hiddenGap)).toContain('01A: missing receipt was not disclosed')
    const fabricated = completeCoverage()
    fabricated.records[0].result = 'fabricated/RESULT.md'
    expect(inventoryProblems(fabricated)).toContain('01A: receipt is not source-bound')
    const duplicate = completeCoverage()
    duplicate.records[0].duplicateRows = 1
    expect(inventoryProblems(duplicate)).toContain('01A: ambiguous disposition')
    const missingSource = completeCoverage()
    missingSource.source.files[0].sha256 = null
    expect(inventoryProblems(missingSource)).toContain('Candidate source missing or unidentified')
    const wrongRoute = completeCoverage()
    wrongRoute.routes[0].sha256 = 'f'.repeat(64)
    expect(inventoryProblems(wrongRoute)).toContain(
      'Advertised route inventory is incomplete or unbound',
    )
    for (const key of ['modules', 'gates', 'journey'] as const) {
      const gap = completeCoverage()
      gap[key].pop()
      expect(inventoryProblems(gap).length).toBeGreaterThan(0)
    }
  })
  it('accounts for all 66 preceding assignments including absent 12A and 15C ledger rows', () => {
    expect(precedingIds).toHaveLength(66)
    expect(new Set(precedingIds).size).toBe(66)
    expect(precedingIds).toEqual(expect.arrayContaining(['12A', '15C', '17F']))
    expect(precedingIds).not.toContain('18B')
  })

  it('uses the ledger-selected repair without promoting its PASS to current acceptance', () => {
    const rows = parseLedger(
      '| 01B | PASS (repair) | note | [RESULT](evidence/rc1/repairs/R-01B/RESULT.md) | next |\n| 14A | NOT READY | note | [RESULT](evidence/rc1/18-pass/14A/RESULT.md) | next |',
    )
    expect(rows).toEqual([
      {
        id: '01B',
        status: 'PASS (repair)',
        result: 'docs/rc/evidence/rc1/repairs/R-01B/RESULT.md',
      },
      { id: '14A', status: 'NOT READY', result: 'docs/rc/evidence/rc1/18-pass/14A/RESULT.md' },
    ])
  })

  it('detects changed and deleted historical source and never treats partial containment as complete proof', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'rc118a-containment-'))
    try {
      writeFileSync(path.join(root, 'same.ts'), 'original')
      writeFileSync(path.join(root, 'changed.ts'), 'new')
      const hash = createHash('sha256').update('original').digest('hex')
      const result = compareManifest(root, {
        files: ['same.ts', 'changed.ts', 'missing.ts'].map((name) => ({
          path: name,
          sha256: hash,
        })),
      })
      expect(result).toEqual({
        disposition: 'historical-source-drift',
        compared: 3,
        equal: 1,
        changed: ['changed.ts'],
        missing: ['missing.ts'],
      })
      expect(
        compareManifest(root, { files: [{ path: 'same.ts', sha256: hash }] }).disposition,
      ).toBe('listed-files-equal-only')
      expect(compareManifest(root, {}).disposition).toBe('unusable-manifest')
      expect(compareManifest(root, [{ path: 'same.ts', sha256: hash.toUpperCase() }]).equal).toBe(1)
      expect(compareManifest(root, { entries: [{ path: 'same.ts', sha256: hash }] }).equal).toBe(1)
    } finally {
      rmSync(root, { recursive: true })
    }
  })

  it('rejects foreign paths before reading them', () => {
    expect(() =>
      compareManifest(process.cwd(), {
        files: [{ path: '../foreign-secret', sha256: 'a'.repeat(64) }],
      }),
    ).toThrow('escapes repository')
    expect(() =>
      compareManifest(process.cwd(), { files: [{ path: 'package.json', sha256: 'forged' }] }),
    ).toThrow('Invalid historical')
  })

  it('denies stale source, edited evidence and forged readiness', () => {
    const current = { source: 'exact', inputs: ['receipt-hash'], status: 'NOT READY' }
    expect(() => verifyInventory(structuredClone(current), current)).not.toThrow()
    expect(() => verifyInventory({ ...current, source: 'old' }, current)).toThrow(
      'drift or tampering',
    )
    expect(() => verifyInventory({ ...current, inputs: [] }, current)).toThrow('drift or tampering')
    expect(() => verifyInventory({ ...current, status: 'PASS' }, current)).toThrow(
      'drift or tampering',
    )
  })

  it('persists a refetchable inventory and refuses to overwrite retained evidence on retry', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'rc118a-write-'))
    try {
      const target = path.join(root, 'inventory.json')
      writeExclusive(target, { status: 'NOT READY' })
      expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ status: 'NOT READY' })
      expect(() => writeExclusive(target, { status: 'PASS' })).toThrow()
      expect(JSON.parse(readFileSync(target, 'utf8')).status).toBe('NOT READY')
    } finally {
      rmSync(root, { recursive: true })
    }
  })
})
