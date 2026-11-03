/**
 * RC1 17C in-image inspector. Executed inside the production runner via
 * `docker run --rm -v <this file>:/tmp/inspect.mjs:ro <image> node
 * /tmp/inspect.mjs` with an expected-hashes JSON mounted at
 * /tmp/expected.json. Emits one JSON object: packaged-file presence,
 * embedded provenance vs the shipped lockfile, byte-identity of shipped
 * source against the candidate tree, the top-level runtime dependency
 * set, dev-tool absence, and a secret-pattern sweep (paths only, never
 * matched content).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

const root = '/app'
const hash = (buf) => createHash('sha256').update(buf).digest('hex')

const requiredFiles = [
  'standalone/server.js',
  'build-provenance.json',
  'standalone/build-provenance.json',
  'package.json',
  'package-lock.json',
  'next.config.ts',
  'tsconfig.json',
  'src/payload.config.ts',
  'docker/worker-healthcheck.mjs',
  'docker/install-runtime-esbuild.mjs',
  'esbuild-build.txt',
  'node_modules/next/package.json',
  'node_modules/payload/package.json',
  'node_modules/tsx/package.json',
]
const requiredDirs = ['standalone/.next/static', 'standalone/public', 'src', 'theme-packages']
const files = Object.fromEntries(
  [...requiredFiles, ...requiredDirs].map((p) => [p, existsSync(path.join(root, p))]),
)

const provenanceRoot = JSON.parse(readFileSync(path.join(root, 'build-provenance.json'), 'utf8'))
const provenanceStandalone = JSON.parse(
  readFileSync(path.join(root, 'standalone/build-provenance.json'), 'utf8'),
)
const lockfileSha256 = hash(readFileSync(path.join(root, 'package-lock.json')))

const expected = JSON.parse(readFileSync('/tmp/expected.json', 'utf8'))
const mismatches = []
let compared = 0
for (const [rel, want] of Object.entries(expected)) {
  const full = path.join(root, rel)
  if (!existsSync(full)) {
    mismatches.push({ path: rel, missing: true })
    continue
  }
  compared += 1
  if (hash(readFileSync(full)) !== want) mismatches.push({ path: rel, mismatch: true })
}

const graph = JSON.parse(
  execFileSync('npm', ['ls', '--all', '--omit=dev', '--json'], { cwd: root, encoding: 'utf8' }),
)
const graphNames = new Set()
const walkGraph = (node) => {
  for (const [name, child] of Object.entries(node.dependencies ?? {})) {
    graphNames.add(name)
    walkGraph(child)
  }
}
walkGraph(graph)
const topLevel = readdirSync(path.join(root, 'node_modules')).filter((n) => !n.startsWith('.'))
const forbidden = ['vitest', 'eslint', '@playwright', 'tinypool', 'typescript', 'prettier']
// Payload imports its schema generator, which depends on Prettier at runtime.
// Preserve that locked production dependency, while still rejecting unrelated
// formatter installs and optional peer test/compiler tooling.
const payloadPrettier =
  graph.dependencies?.payload?.dependencies?.['json-schema-to-typescript']?.dependencies?.prettier
const requiredProductionTooling = payloadPrettier
  ? [
      {
        name: 'prettier',
        version: payloadPrettier.version,
        requiredBy: 'payload > json-schema-to-typescript',
      },
    ]
  : []
const forbiddenPresent = forbidden.filter(
  (name) => topLevel.includes(name) && !(name === 'prettier' && payloadPrettier),
)

const secretPatterns = [
  // A parser's PEM-header string is not private key material. Require a body
  // and matching footer; both real PEM data and escaped source literals count.
  /-----BEGIN (OPENSSH |RSA |EC )?PRIVATE KEY-----(?:\s|\\[rn])*[A-Za-z0-9+/=]{32,}(?:(?:\s|\\[rn])+[A-Za-z0-9+/=]+)*(?:\s|\\[rn])*-----END (?:OPENSSH |RSA |EC )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /sk-proj-[A-Za-z0-9_-]{16,}/,
  /whsec_[A-Za-z0-9]{16,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /ghp_[A-Za-z0-9]{20,}/,
]
const secretHits = []
const knownPublicFixtures = []
const lockedPackages = JSON.parse(
  readFileSync(path.join(root, 'package-lock.json'), 'utf8'),
).packages
// Happy DOM 20.11.2 publishes this fixed virtual-server certificate key in
// lib/fetch/certificate/FetchHTTPSCertificate.js. This exact public fixture is
// not an operator credential. Retain its path/fingerprint in the report; no
// other PEM key, package version or application source path is exempted.
const happyDomFixtureHash = '7f7f8c83ded111336dca167452776b8b6c35e4223882103df5edeb55875a2d41'
const envFiles = []
const scannedDirectories = new Set()
const scan = (dir) => {
  const canonical = realpathSync(dir)
  if (scannedDirectories.has(canonical)) return
  scannedDirectories.add(canonical)
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const rel = path.relative(root, full)
    const stats = statSync(full)
    if (stats.isDirectory()) {
      if (rel !== 'node_modules') scan(full)
      continue
    }
    if (/^\.env/.test(entry.name) && !/\.example$/.test(entry.name)) envFiles.push(rel)
    const size = stats.size
    if (size > 2_000_000) continue
    const buf = readFileSync(full)
    if (buf.includes(0)) continue
    const text = buf.toString('utf8')
    let unexpectedSecret = false
    for (const [index, pattern] of secretPatterns.entries()) {
      for (const match of text.matchAll(new RegExp(pattern.source, 'g'))) {
        const fingerprint = hash(match[0].replace(/\\n/g, '\n').replace(/\\r/g, '\r'))
        const fixtureScope =
          rel.startsWith('standalone/.next/server/chunks/') ||
          /(?:^|\/)node_modules\/happy-dom\//.test(rel)
        if (
          index === 0 &&
          fixtureScope &&
          lockedPackages['node_modules/happy-dom']?.version === '20.11.2' &&
          fingerprint === happyDomFixtureHash
        ) {
          knownPublicFixtures.push({ path: rel, package: 'happy-dom@20.11.2', sha256: fingerprint })
        } else {
          unexpectedSecret = true
        }
      }
    }
    if (unexpectedSecret) secretHits.push(rel)
  }
}
scan(root)

console.log(
  JSON.stringify(
    {
      user: { uid: process.getuid?.(), gid: process.getgid?.() },
      files,
      provenance: {
        root: provenanceRoot,
        standalone: provenanceStandalone,
        lockfileSha256,
        lockfileMatches: provenanceRoot.lockfileSha256 === lockfileSha256,
      },
      sourceComparison: {
        compared,
        mismatches: mismatches.slice(0, 10),
        mismatchCount: mismatches.length,
      },
      dependencies: {
        graphPackageCount: graphNames.size,
        topLevelCount: topLevel.length,
        forbiddenPresent,
        requiredProductionTooling,
        hasNext: graphNames.has('next'),
        hasPayload: graphNames.has('payload'),
        hasTsx: topLevel.includes('tsx'),
      },
      secrets: {
        hitCount: secretHits.length,
        hitPaths: secretHits.slice(0, 10),
        knownPublicFixtures,
        envFiles,
      },
    },
    null,
    2,
  ),
)
