import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// Generate the active candidate's route validators in an isolated directory.
// Historical acceptance builds remain on disk and never share global route types.
for (const args of [
  [require.resolve('next/dist/bin/next'), 'typegen'],
  [require.resolve('typescript/bin/tsc'), '--noEmit'],
]) {
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, RENEGADE_NEXT_DIST_DIR: '.next-typecheck' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
