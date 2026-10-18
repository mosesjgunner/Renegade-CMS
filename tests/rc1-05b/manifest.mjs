import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const candidates = [
  ...git('diff', '--name-only', '-z').split('\0'),
  ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0'),
]
const files = [...new Set(candidates)]
  .filter(
    (path) =>
      path && !path.startsWith('docs/rc/evidence/') && path !== 'docs/rc/RC1-70-SUBPASS-LEDGER.md',
  )
  .sort()
  .map((path) => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }))
const manifest = {
  baseCommit: git('rev-parse', 'HEAD'),
  files,
  overlaySha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
}
writeFileSync(
  'docs/rc/evidence/rc1/18-pass/05B/tested-tree.json',
  JSON.stringify(manifest, null, 2),
)
console.log(manifest.baseCommit, files.length, manifest.overlaySha256)
