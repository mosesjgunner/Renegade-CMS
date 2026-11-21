import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import './apply-patches.mjs'

let sourceSha = process.env.BUILD_SHA
let clean = null
try {
  const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
  if (sourceSha && sourceSha !== gitSha) throw new Error('BUILD_SHA does not match source HEAD.')
  sourceSha = gitSha
  clean = !execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    encoding: 'utf8',
  }).trim()
} catch (error) {
  if (error.message === 'BUILD_SHA does not match source HEAD.') throw error
}
if (!/^[a-f0-9]{40}$/.test(sourceSha ?? '')) {
  throw new Error(
    'Build requires a Git checkout or an explicit full BUILD_SHA for exported/Docker source.',
  )
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const manifest = {
  sourceSha,
  clean,
  version: pkg.version,
  lockfileSha256: createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),
}
writeFileSync('build-provenance.json', JSON.stringify(manifest, null, 2) + '\n')
const build = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    BUILD_SHA: sourceSha,
    RENEGADE_ARTIFACT_SHA: sourceSha,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --no-deprecation`.trim(),
  },
})
if (build.status !== 0) process.exit(build.status ?? 1)
const dist = process.env.RENEGADE_NEXT_DIST_DIR || '.next'
const standalone = resolve(dist, 'standalone')
cpSync('theme-packages', resolve(standalone, 'theme-packages'), { recursive: true })
cpSync(resolve(dist, 'static'), resolve(standalone, dist, 'static'), { recursive: true })
if (existsSync('public')) cpSync('public', resolve(standalone, 'public'), { recursive: true })
cpSync('build-provenance.json', resolve(standalone, 'build-provenance.json'))
// Perf lane 08 / RC3-04: the middleware (src/proxy.ts) dynamically imports
// the Payload config, so the standalone tracer spans the whole repository
// and copies non-runtime trees into the artifact — docs/ alone measured
// 826,230,127 bytes of the 1,117,797,606-byte standalone at the RC2
// baseline, and the outputFileTracingExcludes entry in next.config.ts did
// not stop it. Nothing reads docs/, tests/ or fixtures/ at runtime (theme
// discovery reads theme-packages/, copied above), so prune them here, at
// packaging time: the shipped artifact is correct by construction no
// matter which trace path pulled them in.
for (const tree of ['docs', 'tests', 'fixtures']) {
  rmSync(resolve(standalone, tree), { recursive: true, force: true })
}
console.log(`Built source ${sourceSha}; clean source: ${String(clean)}.`)
