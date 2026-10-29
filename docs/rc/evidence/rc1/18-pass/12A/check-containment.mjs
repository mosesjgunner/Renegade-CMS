import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
const out = 'docs/rc/evidence/rc1/18-pass/12A'
const manifest = JSON.parse(await readFile(`${out}/source-tree.json`, 'utf8'))
const hash = data => createHash('sha256').update(data).digest('hex')
const differences = [], files = []
for (const file of manifest.files) {
  const sha256 = hash(await readFile(file.path))
  files.push({ path: file.path, sha256 })
  if (sha256 !== file.sha256) differences.push({ path: file.path, testedSha256: file.sha256, currentSha256: sha256 })
}
const known = new Set(manifest.files.map(file => file.path))
const newSources = execFileSync('git', ['ls-files','--cached','--others','--exclude-standard'], {encoding:'utf8'}).trim().split(/\r?\n/).filter(path => /^(src\/|tests\/|scripts\/|patches\/)/.test(path) && !known.has(path))
assert.deepEqual(newSources, [], 'Unrecorded executable source')
for (const diff of differences) assert.ok(diff.path === 'tests/rc1-11e/provenance.ts' || diff.path === 'next-env.d.ts', `Unexpected source drift: ${diff.path}`)
const result = { baseCommit:manifest.baseCommit, testedTreeHash:manifest.treeHash, currentTreeHash:hash(JSON.stringify(files)), files:files.length, wholeTreeMatches: differences.length===0, scoped12ARuntimeAndVerifierMatch:true, allSrcFilesMatch:!differences.some(diff=>diff.path.startsWith('src/')), differences, newSources, boundary:'Only an independently edited 11E verifier or generated Next declarations may differ; every src path and 12A verifier must remain identical. No whole-checkout or sibling acceptance is inferred.', verifierSha256:hash(await readFile(`${out}/check-containment.mjs`)) }
await writeFile(`${out}/containment.json`, JSON.stringify(result,null,2))
console.log(JSON.stringify(result,null,2))
