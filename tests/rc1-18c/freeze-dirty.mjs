import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
const target = 'docs/rc/evidence/rc1/18-pass/18C/dirty-tree.json'
const paths = [
  ...new Set(
    execFileSync('git', ['ls-files', '-z', '--modified', '--others', '--exclude-standard'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  ),
]
  .filter((x) => x !== target)
  .sort()
const files = paths.map((path) => ({
  path,
  sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
}))
const preexisting = [
  'docs/rc/RC1-70-SUBPASS-LEDGER.md',
  'docs/rc/evidence/rc1/18-pass/18B/RESULT.md',
  'docs/rc/evidence/rc1/18-pass/18B/NEXT.md',
]
const result = {
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  preexisting,
  index: execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim(),
  files,
  manifestExcludesSelf: true,
  sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
}
writeFileSync(target, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ files: files.length, sha256: result.sha256, index: result.index }))
