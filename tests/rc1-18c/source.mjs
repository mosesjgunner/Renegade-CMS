import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { acceptance } from './paths.mjs'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const paths = [
  ...new Set(
    execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  ),
]
const runtime = paths
  .filter(
    (path) =>
      /^(src|scripts|docker|public|theme-packages)\//.test(path) ||
      [
        'package.json',
        'package-lock.json',
        'next.config.ts',
        'tsconfig.json',
        'Dockerfile',
        '.dockerignore',
        'compose.production.yaml',
        'compose.restore.yaml',
        '.env.production.example',
      ].includes(path),
  )
  .sort()
const files = runtime.map((path) => ({ path, sha256: sha256(readFileSync(path)) }))
const manifest = {
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  files,
  executableTreeSha256: sha256(JSON.stringify(files)),
  count: files.length,
}
const { root } = acceptance
mkdirSync(root, { recursive: true })
if (existsSync(`${root}/source.json`)) {
  if (
    JSON.parse(readFileSync(`${root}/source.json`, 'utf8')).executableTreeSha256 !==
    manifest.executableTreeSha256
  )
    throw new Error('Frozen source changed; preserve this manifest and choose a new attempt')
} else writeFileSync(`${root}/source.json`, JSON.stringify(manifest, null, 2))
console.log(
  JSON.stringify({
    baseCommit: manifest.baseCommit,
    count: manifest.count,
    executableTreeSha256: manifest.executableTreeSha256,
  }),
)
