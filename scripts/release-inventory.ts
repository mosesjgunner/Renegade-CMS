import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OPTIONAL_MODULES, gatePayloadRegistrations } from '../src/modules/module-registry'
import { loadConfig } from '../src/modules/core/config'
import { registeredPayloadDomains } from '../src/modules/payload-domains'

const evidenceRoot = 'docs/rc/evidence/rc1/18-pass'
const ledgerPath = 'docs/rc/RC1-70-SUBPASS-LEDGER.md'
export const precedingIds = [
  'ABC',
  'ABCD',
  'ABCD',
  'ABCDE',
  'ABC',
  'ABC',
  'ABC',
  'ABC',
  'ABCD',
  'ABCD',
  'ABCDE',
  'ABCD',
  'ABC',
  'ABCD',
  'ABCDE',
  'ABC',
  'ABCDEF',
].flatMap((letters, index) =>
  [...letters].map((letter) => `${String(index + 1).padStart(2, '0')}${letter}`),
)
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const git = (root: string, args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim()
const read = (root: string, name: string) =>
  readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, '')
type FileHash = { path: string; sha256: string | null }

export function sourceManifest(root: string) {
  const names = [
    ...new Set(
      git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
        .split('\0')
        .filter(Boolean),
    ),
  ]
    .filter(
      (name) =>
        !name.startsWith('docs/') &&
        !/^(scratch|media|backups)\//.test(name) &&
        (!/(^|\/)\.env(?:\.|$)/.test(name) || name.endsWith('.example')) &&
        !/\.(?:pem|key|dump|zip|tar|gz)$/.test(name),
    )
    .sort()
  const files: FileHash[] = names.map((name) => ({
    path: name,
    sha256: existsSync(path.join(root, name)) ? sha(readFileSync(path.join(root, name))) : null,
  }))
  return {
    baseCommit: git(root, ['rev-parse', 'HEAD']),
    treeHash: sha(JSON.stringify(files)),
    files,
    exclusions:
      'Documentation/evidence isolated as hashed reconciliation inputs; ignored/generated dependencies, databases, media, secrets and archives excluded. Includes tracked and nonignored new executable/config/test/asset paths; package-lock binds dependencies.',
  }
}

export function compareManifest(root: string, value: unknown) {
  const candidate = value as { files?: FileHash[]; entries?: FileHash[] }
  const recorded = {
    files: Array.isArray(value) ? (value as FileHash[]) : (candidate.files ?? candidate.entries),
  }
  if (!Array.isArray(recorded.files) || recorded.files.length === 0)
    return {
      disposition: 'unusable-manifest',
      compared: 0,
      equal: 0,
      changed: [] as string[],
      missing: [] as string[],
    }
  const changed: string[] = [],
    missing: string[] = []
  let equal = 0
  for (const file of recorded.files) {
    if (typeof file.path !== 'string' || !/^[a-f0-9]{64}$/i.test(file.sha256 ?? ''))
      throw new Error('Invalid historical manifest entry')
    const target = path.resolve(root, file.path)
    if (!target.startsWith(path.resolve(root) + path.sep))
      throw new Error('Historical manifest escapes repository')
    if (!existsSync(target)) missing.push(file.path)
    else if (sha(readFileSync(target)) === file.sha256?.toLowerCase()) equal++
    else changed.push(file.path)
  }
  return {
    disposition:
      changed.length || missing.length ? 'historical-source-drift' : 'listed-files-equal-only',
    compared: recorded.files.length,
    equal,
    changed,
    missing,
  }
}

export function parseLedger(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => /^\|\s*\d\d[A-F]\s*\|/.test(line))
    .map((line) => {
      const cells = line.split('|')
      const result = line.match(/\[RESULT\]\(([^)]+)\)/)?.[1]
      return {
        id: cells[1].trim(),
        status: cells[2].trim(),
        result: result ? path.posix.normalize(`docs/rc/${result}`) : null,
      }
    })
}

export function collectInventory(root: string) {
  const source = sourceManifest(root)
  const inputs = new Map<string, string>()
  const load = (name: string) => {
    const body = read(root, name)
    inputs.set(name, sha(readFileSync(path.join(root, name))))
    return body
  }
  const scope = load('docs/rc/RC1-SCOPE.md')
  const acceptance = load('docs/rc/RC1-ACCEPTANCE-MATRIX.md')
  const ledger = parseLedger(load(ledgerPath))
  const golden = load('docs/rc/evidence/rc1/stage-01/golden-journey.txt')
  load('docs/rc/evidence/rc1/stage-01/attachment-attribution.json')
  load('docs/rc/evidence/rc1/stage-01/sol/mandatory-gates.md')
  for (const name of [
    'CAPABILITY_LEDGER.md',
    'ROUTE_MATRIX.md',
    'PROVIDER_MATRIX.md',
    'SECURITY_LEDGER.md',
  ])
    load(`docs/rc/${name}`)
  const historical = JSON.parse(
    load('docs/rc/evidence/rc1/stage-01/sol/claim-ownership.json'),
  ) as Array<{ ledger: string; item: string; requirements?: string[] }>
  const baseline = JSON.parse(
    load('docs/rc/evidence/rc1/stage-01/acceptance-inventory.json'),
  ) as unknown[]
  const texts = new Map<string, string>()
  const records = precedingIds.map((id) => {
    const rows = ledger.filter((row) => row.id === id)
    const original = `${evidenceRoot}/${id}/RESULT.md`
    const result = rows[0]?.result ?? original
    const paths = [
      ...new Set([
        original,
        result,
        original.replace('RESULT.md', 'NEXT.md'),
        result.replace('RESULT.md', 'NEXT.md'),
      ]),
    ]
    let body = ''
    const receipts = paths
      .filter((name) => existsSync(path.join(root, name)))
      .map((name) => {
        const text = load(name)
        if (name === result) body = text
        return { path: name, sha256: inputs.get(name)!, bytes: Buffer.byteLength(text) }
      })
    texts.set(id, body)
    // Only the receipt's own directory is relevant. Never infer source from an unrelated sibling run.
    const dir = path.posix.dirname(result)
    const tracked = git(root, ['ls-files', '-z', '--', dir]).split('\0').filter(Boolean)
    const artifacts = tracked
      .filter(
        (name) =>
          path.posix.dirname(name) === dir &&
          /(?:source-tree|tested-tree|commands|containment|trace|state|persistence|failure-table|db-assertions).*\.json$/.test(
            path.posix.basename(name),
          ),
      )
      .map((name) => {
        const text = load(name)
        let containment = null
        if (/(?:source-tree|tested-tree)\.json$/.test(name))
          containment = compareManifest(root, JSON.parse(text))
        return { path: name, sha256: inputs.get(name)!, containment }
      })
    return {
      id,
      ledgerStatus: rows[0]?.status ?? 'MISSING LEDGER ROW',
      duplicateRows: Math.max(0, rows.length - 1),
      result: existsSync(path.join(root, result)) ? result : null,
      receipts,
      artifacts,
      sourceClaims: [...new Set(body.match(/\b[a-f0-9]{40}\b/g) ?? [])],
      imageClaims: [...new Set(body.match(/sha256:[a-f0-9]{64}/g) ?? [])],
      currentAcceptance:
        'UNPROVED: historical scoped receipt only; exact final-source runtime containment not established',
      issues: [
        ...(rows.length ? [] : ['missing-ledger-row']),
        ...(body ? [] : ['missing-result']),
        ...(rows[0]?.status.includes('NOT READY') ? ['recorded-not-ready'] : []),
      ],
    }
  })
  const sourcePaths = source.files.map((file) => file.path)
  const candidates = (name: string) =>
    [...texts].filter(([, text]) => text.includes(name)).map(([id]) => id)
  const routes = sourcePaths
    .filter((name) => /^src\/app\//.test(name) && /\/(?:page|route)\.[jt]sx?$/.test(name))
    .map((name) => ({
      path: name,
      sha256: source.files.find((file) => file.path === name)!.sha256,
      receiptCandidates: candidates(name),
      disposition:
        'required; final-source action/persistence/authorization proof unproved; text references are discovery links only',
    }))
  const modules = OPTIONAL_MODULES.map((module) => ({
    ...module,
    receiptCandidates: candidates(module.id),
    disposition:
      'required when enabled; local safety/adapter/denial/restart proof mandatory; provider credentials do not waive it',
  }))
  // Construct registration metadata only. Never boot Payload, load .env or connect to a DB.
  const registrations = registeredPayloadDomains(
    loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://inventory:unused@127.0.0.1:1/rc118a_metadata_only',
      PAYLOAD_SECRET: 'metadata-only-not-an-authentication-session-or-runtime-secret',
      APP_URL: 'http://127.0.0.1:1',
      NETWORKING_ENABLED: 'true',
    }),
  )
  const registrationProfiles = [false, true].map((all) => {
    const selected = gatePayloadRegistrations(registrations, {
      enabled: new Set(all ? OPTIONAL_MODULES.map((module) => module.id) : []),
    })
    return {
      configuration: all
        ? 'all modules (Lean/Standard share registration switches)'
        : 'default floor (Lean/Standard share registration switches)',
      collections: selected.collections.map((item) => item.slug),
      globals: selected.globals.map((item) => item.slug),
      tasks: selected.tasks.map((item) => item.slug),
      disposition:
        'Source-constructed metadata only; deployed profile/access/persistence proof unexecuted',
    }
  })
  const gates = acceptance
    .split(/\r?\n/)
    .filter((line) => /^\|\s*\d+\s*\//.test(line))
    .map((line) => {
      const cells = line.split('|')
      return {
        gate: cells[1].trim(),
        scope: cells[2].trim(),
        historicalClassification: cells[3].trim(),
        requiredProof: cells[4].trim(),
        disposition: 'UNPROVED on final candidate',
      }
    })
  const journey = golden
    .split(/\r?\n/)
    .filter((line) => /^[A-T]\. /.test(line))
    .map((line) => ({
      step: line[0],
      required: line.slice(3),
      disposition: 'UNPROVED as a complete A-T run on final candidate',
    }))
  const firstBlocker = records.find((record) => record.issues.includes('recorded-not-ready'))
  const inventory = {
    schemaVersion: 1,
    status: 'NOT READY',
    releaseTagAllowed: false,
    firstBlocker: firstBlocker
      ? `${firstBlocker.id}: ${firstBlocker.ledgerStatus}; see ${firstBlocker.result}`
      : 'No complete final-source mandatory gate and golden-journey proof',
    source,
    currentImage: null,
    imageDisposition:
      'No accepted image bound to this candidate. Historical image claims below are discovery references only.',
    expectedPreceding: 66,
    records,
    modules,
    registrationProfiles,
    routes,
    gates,
    journey,
    historicalInventory: {
      baselineCount: baseline.length,
      ownershipCount: historical.length,
      entries: historical.map((entry) => ({
        ...entry,
        receiptCandidates: candidates(entry.item),
        disposition:
          'historical inventory; requires explicit final-source closure; no automatic exclusion',
      })),
    },
    approvedExclusions: [
      'Permanent hard account deletion',
      'Private community attachments without dedicated private store/scanner',
      'Bidirectional external calendar synchronization',
      'Developer reference extensions/adapters',
      'Client-side end-to-end message encryption',
    ].map((item) => ({
      item,
      authority: 'docs/rc/RC1-SCOPE.md',
      hiddenEntryPointProof: 'unexecuted on final candidate',
    })),
    providerPolicy:
      'Unconfigured safety, local adapter harness, approved remote sandbox and real-world outcome are distinct. Mandatory local/error/retry/security proof is never waived by missing credentials. AI remains human-reviewed proposal/apply only.',
    scopePolicyPresent: scope.includes('A failed mandatory workflow cannot become deferred'),
    inputs: [...inputs]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, hash]) => ({ path: name, sha256: hash })),
  }
  const completenessErrors = inventoryProblems(inventory)
  return {
    ...inventory,
    inventoryStatus: completenessErrors.length ? 'NOT READY' : 'PASS',
    completenessErrors,
  }
}

type InventoryCoverage = {
  source: { baseCommit: string; files: FileHash[] }
  records: Array<{
    id: string
    duplicateRows: number
    result: string | null
    receipts: Array<{ path: string; sha256: string }>
    issues: string[]
    currentAcceptance: string
  }>
  modules: Array<{ id: string; disposition: string }>
  routes: Array<{ path: string; sha256: string | null; disposition: string }>
  gates: Array<{ gate: string; requiredProof: string; disposition: string }>
  journey: Array<{ step: string; required: string; disposition: string }>
  scopePolicyPresent: boolean
}

// 18A certifies an exhaustive, source-bound inventory, not the missing release workflows.
// Missing/blocked/stale proof must be explicit; it never grants release permission.
export function inventoryProblems(inventory: InventoryCoverage) {
  const errors: string[] = []
  const exact = (actual: string[], expected: string[]) =>
    actual.length === expected.length &&
    new Set(actual).size === expected.length &&
    expected.every((id) => actual.includes(id))
  if (
    !/^[a-f0-9]{40}$/.test(inventory.source.baseCommit) ||
    !inventory.source.files.length ||
    inventory.source.files.some((file) => !/^[a-f0-9]{64}$/.test(file.sha256 ?? ''))
  )
    errors.push('Candidate source missing or unidentified')
  if (
    !exact(
      inventory.records.map((row) => row.id),
      precedingIds,
    )
  )
    errors.push('Preceding assignment coverage is incomplete or duplicated')
  for (const row of inventory.records) {
    if (row.duplicateRows || !row.currentAcceptance) errors.push(`${row.id}: ambiguous disposition`)
    if (!row.result && !row.issues.includes('missing-result'))
      errors.push(`${row.id}: missing receipt was not disclosed`)
    if (
      row.result &&
      !row.receipts.some(
        (receipt) => receipt.path === row.result && /^[a-f0-9]{64}$/.test(receipt.sha256),
      )
    )
      errors.push(`${row.id}: receipt is not source-bound`)
  }
  if (
    !exact(
      inventory.modules.map((module) => module.id),
      OPTIONAL_MODULES.map((module) => module.id),
    ) ||
    inventory.modules.some((module) => !module.disposition)
  )
    errors.push('Module scope coverage is incomplete')
  const routes = inventory.source.files.filter(
    (file) => /^src\/app\//.test(file.path) && /\/(?:page|route)\.[jt]sx?$/.test(file.path),
  )
  if (
    !routes.length ||
    !exact(
      inventory.routes.map((route) => route.path),
      routes.map((route) => route.path),
    ) ||
    inventory.routes.some(
      (route) =>
        !route.disposition ||
        route.sha256 !== inventory.source.files.find((file) => file.path === route.path)?.sha256,
    )
  )
    errors.push('Advertised route inventory is incomplete or unbound')
  if (
    inventory.gates.length !== 19 ||
    new Set(inventory.gates.map((gate) => gate.gate)).size !== 19 ||
    inventory.gates.some((gate) => !gate.requiredProof || !gate.disposition)
  )
    errors.push('Mandatory gate inventory is incomplete')
  if (
    !exact(
      inventory.journey.map((step) => step.step),
      [...'ABCDEFGHIJKLMNOPQRST'],
    ) ||
    inventory.journey.some((step) => !step.required || !step.disposition)
  )
    errors.push('Golden journey inventory is incomplete')
  if (!inventory.scopePolicyPresent) errors.push('Mandatory scope policy is absent')
  return errors
}

export function writeExclusive(target: string, value: unknown) {
  const fd = openSync(target, 'wx')
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2) + '\n')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

export function verifyInventory(recorded: unknown, current: unknown) {
  if (JSON.stringify(recorded) !== JSON.stringify(current))
    throw new Error(
      'Inventory drift or tampering: regenerate into a NEW artifact; release readiness denied',
    )
}

function main() {
  const args = process.argv.slice(2)
  if (
    args.length !== 2 ||
    !['--output', '--check', '--require-ready', '--require-complete'].includes(args[0])
  )
    throw new Error(
      'Usage: node --import tsx scripts/release-inventory.ts --output NEW.json | --check inventory.json | --require-ready inventory.json',
    )
  const inventory = collectInventory(process.cwd())
  if (args[0] === '--output') writeExclusive(args[1], inventory)
  else verifyInventory(JSON.parse(readFileSync(args[1], 'utf8')), inventory)
  console.log(
    JSON.stringify({
      status: inventory.status,
      inventoryStatus: inventory.inventoryStatus,
      source: inventory.source.treeHash,
      preceding: inventory.records.length,
      modules: inventory.modules.length,
      routes: inventory.routes.length,
      gates: inventory.gates.length,
      journey: inventory.journey.length,
      firstBlocker: inventory.firstBlocker,
      releaseTagAllowed: false,
    }),
  )
  if (args[0] === '--require-ready') process.exitCode = 2
  if (args[0] === '--require-complete' && inventory.inventoryStatus !== 'PASS') process.exitCode = 2
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Inventory failed')
    process.exitCode = 1
  }
}
