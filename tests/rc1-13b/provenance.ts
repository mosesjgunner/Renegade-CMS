import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

const out = 'docs/rc/evidence/rc1/18-pass/13B/source-tree.json'
mkdirSync('docs/rc/evidence/rc1/18-pass/13B', { recursive: true })
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .trim()
  .split(/\r?\n/)
  .filter(
    (path) =>
      /^(src\/|tests\/|scripts\/|patches\/)/.test(path) ||
      /^(package(-lock)?\.json|next\.config\.ts|AGENTS\.md|eslint\.config\.mjs|vitest\.config\.ts|tsconfig\.json|next-env\.d\.ts)$/.test(
        path,
      ),
  )
  .sort()
const files = await Promise.all(
  paths.map(async (path) => ({ path, sha256: hash(await readFile(path)) })),
)
const treeHash = hash(JSON.stringify(files))
if (process.argv.includes('--check')) {
  const recorded = JSON.parse(await readFile(out, 'utf8'))
  if (recorded.treeHash !== treeHash)
    throw new Error('Tested source drifted; rerun affected acceptance.')
  console.log(`Source containment PASS: ${files.length} files; SHA-256 ${treeHash}`)
} else {
  await writeFile(
    out,
    JSON.stringify(
      {
        baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        treeHash,
        dirtyStatus: execFileSync('git', ['status', '--porcelain=v1'], { encoding: 'utf8' }).trim(),
        node: process.version,
        files,
        exclusions:
          'Documentation/evidence, media, databases, dependencies and secrets; dependency identity is package-lock.json.',
      },
      null,
      2,
    ),
  )
  console.log(`Frozen ${files.length} source files; SHA-256 ${treeHash}`)
}
