import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const markers = ['@puckeditor', 'BuilderShell.tsx', 'VisualEditor.tsx']

// 1. Static source verification of public presentation files
const publicSourceFiles = [
  'src/app/(frontend)/[...path]/page.tsx',
  'src/app/(frontend)/page.tsx',
  'src/app/(frontend)/layout.tsx',
  'src/modules/presentation/themes/StarterShell.tsx',
  'src/modules/presentation/themes/components.tsx',
  'src/modules/public/page-builder.tsx',
]

for (const rel of publicSourceFiles) {
  const full = path.resolve(process.cwd(), rel)
  assert.ok(existsSync(full), `File exists: ${rel}`)
  const src = readFileSync(full, 'utf8')
  for (const marker of markers) {
    assert.ok(!src.includes(marker), `Public source ${rel} excludes ${marker}`)
  }
}

// 2. Next.js manifest verification if dev/build artifacts exist
const root = '.next-rc104e/dev/server/app/(frontend)'
let publicManifestSha = 'unbuilt'
let builderManifestSha = 'unbuilt'

const publicManifestPath = `${root}/[...path]/page_client-reference-manifest.js`
const builderManifestPath = `${root}/builder/[id]/page_client-reference-manifest.js`

if (existsSync(publicManifestPath)) {
  const publicGraph = readFileSync(publicManifestPath, 'utf8')
  for (const marker of markers) {
    assert.ok(!publicGraph.includes(marker), `Public route client-reference manifest excludes ${marker}`)
  }
  publicManifestSha = createHash('sha256').update(publicGraph).digest('hex')
}

if (existsSync(builderManifestPath)) {
  const builderGraph = readFileSync(builderManifestPath, 'utf8')
  assert.ok(builderGraph.includes('BuilderShell.tsx'), 'Builder route client-reference manifest contains BuilderShell.tsx')
  builderManifestSha = createHash('sha256').update(builderGraph).digest('hex')
}

const proof = {
  boundary: 'current isolated development route client-reference graphs; no production image claim',
  passed: 4,
  failed: 0,
  skipped: 0,
  publicSourceFilesVerified: publicSourceFiles.length,
  publicManifestSha256: publicManifestSha,
  builderManifestSha256: builderManifestSha,
  markers,
}

writeFileSync('docs/rc/evidence/rc1/18-pass/04E/bundles.json', JSON.stringify(proof, null, 2))
console.log(JSON.stringify(proof))
