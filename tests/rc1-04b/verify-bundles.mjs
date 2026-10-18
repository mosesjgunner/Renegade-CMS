import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const root = '.next-rc104b/dev/server/app/(frontend)'
const read = (route) => readFileSync(`${root}/${route}/page_client-reference-manifest.js`, 'utf8')
const publicGraph = read('[...path]')
const builderGraph = read('builder/[id]')
const markers = ['@puckeditor', 'BuilderShell.tsx', 'VisualEditor.tsx']
for (const marker of markers)
  assert.ok(!publicGraph.includes(marker), `public graph excludes ${marker}`)
assert.ok(builderGraph.includes('BuilderShell.tsx'), 'builder owns the editor client entry')
const proof = {
  boundary: 'current isolated development route client-reference graphs; no production image claim',
  passed: 4,
  failed: 0,
  skipped: 0,
  publicSha256: createHash('sha256').update(publicGraph).digest('hex'),
  builderSha256: createHash('sha256').update(builderGraph).digest('hex'),
  markers,
}
writeFileSync('docs/rc/evidence/rc1/18-pass/04B/bundles.json', JSON.stringify(proof, null, 2))
console.log(JSON.stringify(proof))
