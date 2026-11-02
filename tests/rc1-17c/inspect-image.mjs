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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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
const requiredDirs = ['standalone/.next/static', 'public', 'src', 'theme-packages']
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
const forbiddenPresent = forbidden.filter((name) => topLevel.includes(name))

const secretPatterns = [
  /BEGIN (OPENSSH |RSA |EC )?PRIVATE KEY/,
  /AKIA[0-9A-Z]{16}/,
  /sk-proj-[A-Za-z0-9_-]{16,}/,
  /whsec_[A-Za-z0-9]{16,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /ghp_[A-Za-z0-9]{20,}/,
]
const secretHits = []
const envFiles = []
const scan = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const rel = path.relative(root, full)
    if (entry.isDirectory()) {
      if (rel !== 'node_modules') scan(full)
      continue
    }
    if (/^\.env/.test(entry.name) && !/\.example$/.test(entry.name)) envFiles.push(rel)
    const size = statSync(full).size
    if (size > 2_000_000) continue
    const buf = readFileSync(full)
    if (buf.includes(0)) continue
    const text = buf.toString('utf8')
    if (secretPatterns.some((pattern) => pattern.test(text))) secretHits.push(rel)
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
        hasNext: graphNames.has('next'),
        hasPayload: graphNames.has('payload'),
        hasTsx: topLevel.includes('tsx'),
      },
      secrets: { hitCount: secretHits.length, hitPaths: secretHits.slice(0, 10), envFiles },
    },
    null,
    2,
  ),
)
