import { readFileSync } from 'node:fs'

const publicManifest = readFileSync(
  '.next/server/app/(frontend)/[...path]/page_client-reference-manifest.js',
  'utf8',
)
const builderManifest = readFileSync(
  '.next/server/app/(frontend)/builder/[id]/page_client-reference-manifest.js',
  'utf8',
)
const editorMarkers = ['@puckeditor', 'BuilderShell.tsx', 'VisualEditor.tsx']
const leaks = editorMarkers.filter((marker) => publicManifest.includes(marker))
if (leaks.length) throw new Error(`Editor code leaked into the canonical public route: ${leaks}`)
const hasPuckInChunks = () => {
  if (builderManifest.includes('@puckeditor')) return true
  const chunkMatches = builderManifest.match(/static\/chunks\/[a-zA-Z0-9_-]+\.(?:js|css)/g) || []
  return chunkMatches.some((chunkRel) => {
    const fullPath = `.next/${chunkRel}`
    return readFileSync(fullPath, 'utf8').includes('puck')
  })
}

if (!hasPuckInChunks() || !builderManifest.includes('BuilderShell.tsx'))
  throw new Error('Builder route is missing its isolated editor chunks.')
console.log('Presentation bundle boundary verified: public route excludes editor/Puck modules.')
