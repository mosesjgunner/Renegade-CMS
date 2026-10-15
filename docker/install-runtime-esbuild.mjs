import { copyFileSync, chmodSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const expectedVersion = '0.28.2'
const binary = '/tmp/runtime-esbuild'
if (execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim() !== expectedVersion)
  throw new Error('Rebuilt esbuild does not match the pinned runtime API version.')

const replaced = []
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) visit(file)
    else if (entry.name === 'package.json') {
      const pkg = JSON.parse(readFileSync(file, 'utf8'))
      if (pkg.name !== 'esbuild' && !pkg.name?.startsWith('@esbuild/')) continue
      if (pkg.version !== expectedVersion)
        throw new Error(`Unexpected esbuild runtime package version at ${file}`)
      const target = join(directory, 'bin', 'esbuild')
      copyFileSync(binary, target)
      chmodSync(target, 0o755)
      replaced.push({ package: pkg.name, version: pkg.version, path: target })
    }
  }
}
visit('/app/node_modules')
if (!replaced.some((p) => p.package === 'esbuild')) throw new Error('No runtime esbuild found.')
writeFileSync('/app/esbuild-runtime-replacements.json', JSON.stringify(replaced, null, 2) + '\n')
console.log(`Installed patched Go esbuild executable at ${replaced.length} runtime package paths.`)
