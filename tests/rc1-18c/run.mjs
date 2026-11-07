import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
process.env.RC118C_FINAL ??= 'true'
const {
  acceptance: { root, lane },
} = await import('./paths.mjs')
await mkdir(root, { recursive: true })
const phases = [
  'setup',
  'core',
  'identity',
  'publish',
  'public',
  'schedule',
  'audience',
  'community',
  'commerce',
  'modules-local',
  'modules-editorial',
  'experiences',
  'release',
  'network-local',
  'social-local',
  'audit-negative',
  'audit-positive',
  'operations',
  'recovery',
]
const start = process.argv[2] ?? 'setup'
if (!phases.includes(start)) throw new Error('Select a known 18C journey phase')
const commands = await readFile(`${root}/commands.json`, 'utf8')
  .then(JSON.parse)
  .catch(() => [])
for (const phase of phases.slice(phases.indexOf(start))) {
  const startedAt = new Date().toISOString()
  console.log(`START ${phase}`)
  const exit = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['tests/rc1-18c/journey.mjs', phase], {
      env: { ...process.env, RC118C_FINAL: 'true' },
      stdio: 'inherit',
    })
    child.on('error', (error) => {
      console.error(String(error))
      resolve(1)
    })
    child.on('exit', (code) => resolve(code ?? 1))
  })
  commands.push({
    command: `${lane === 'golden' ? 'RC118C_GOLDEN_REPLAY=true ' : lane === 'batch' ? 'RC118C_BATCH_REPAIRED=true ' : lane === 'worker' ? 'RC118C_WORKER_REPAIRED=true ' : ''}RC118C_FINAL=true node tests/rc1-18c/journey.mjs ${phase}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    exit,
  })
  await writeFile(`${root}/commands.json`, JSON.stringify(commands, null, 2))
  if (exit) process.exit(exit)
}
