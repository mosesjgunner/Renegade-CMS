import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const out = 'docs/rc/evidence/rc1/18-pass/06C'
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const hash = (value) => createHash('sha256').update(value).digest('hex')
if (process.argv.includes('--check')) {
  const manifest = JSON.parse(readFileSync(`${out}/tested-tree.json`, 'utf8'))
  const mismatches = manifest.files.filter(
    ({ path, sha256 }) => hash(readFileSync(path)) !== sha256,
  )
  if (git('rev-parse', 'HEAD') !== manifest.baseCommit) mismatches.push({ path: 'HEAD' })
  writeFileSync(
    `${out}/containment.json`,
    JSON.stringify(
      {
        baseCommit: manifest.baseCommit,
        overlaySha256: manifest.overlaySha256,
        checkedPaths: manifest.files.length,
        mismatches,
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ checked: manifest.files.length, mismatches }))
  if (mismatches.length) process.exit(1)
} else {
  const paths = [
    ...new Set([
      ...git('diff', '--name-only', '-z').split('\0'),
      ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0'),
    ]),
  ]
    .filter(
      (path) =>
        path &&
        !path.startsWith('docs/rc/evidence/') &&
        !['next-env.d.ts', 'tsconfig.json', 'docs/rc/RC1-70-SUBPASS-LEDGER.md'].includes(path),
    )
    .sort()
  const files = paths.map((path) => ({ path, sha256: hash(readFileSync(path)) }))
  const manifest = {
    baseCommit: git('rev-parse', 'HEAD'),
    files,
    overlaySha256: hash(JSON.stringify(files)),
    excludedGeneratedFiles: ['next-env.d.ts', 'tsconfig.json'],
    runtime: 'Next development source; no OCI image claim',
  }
  writeFileSync(`${out}/tested-tree.json`, JSON.stringify(manifest, null, 2))
  console.log(manifest.baseCommit, files.length, manifest.overlaySha256)
}
