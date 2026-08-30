import { spawn } from 'node:child_process'

export type ComposeTarget = {
  composeFile: string
  envFile: string
  imageTag?: string
  appVersion?: string
}

export const args = process.argv.slice(2)
export const has = (name: string) => args.includes(name)
export const value = (name: string, fallback?: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback

const commandEnvironment = (target: ComposeTarget) => ({
  ...process.env,
  ...(target.imageTag ? { RENEGADE_IMAGE_TAG: target.imageTag } : {}),
  ...(target.appVersion ? { APP_VERSION: target.appVersion } : {}),
})

export const composeArgs = (target: ComposeTarget) => [
  'compose',
  '--env-file',
  target.envFile,
  '-f',
  target.composeFile,
]

export function runDocker(target: ComposeTarget, command: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('docker', [...composeArgs(target), ...command], {
      env: commandEnvironment(target),
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`docker ${[...composeArgs(target), ...command].join(' ')} failed (${code})`),
          ),
    )
  })
}

export function captureDocker(target: ComposeTarget, command: string[]) {
  return new Promise<string>((resolve, reject) => {
    let text = ''
    const child = spawn('docker', [...composeArgs(target), ...command], {
      env: commandEnvironment(target),
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    child.stdout.on('data', (chunk) => (text += String(chunk)))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve(text.trim())
        : reject(
            new Error(`docker ${[...composeArgs(target), ...command].join(' ')} failed (${code})`),
          ),
    )
  })
}

export async function migrationState(target: ComposeTarget) {
  const result = await captureDocker(target, [
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'renegade',
    '-d',
    'renegade',
    '-Atc',
    'SELECT name FROM payload_migrations ORDER BY name',
  ])
  return result ? result.split(/\r?\n/).filter(Boolean) : []
}

export async function verifyReadiness(target: ComposeTarget) {
  await runDocker(target, [
    'exec',
    '-T',
    'renegade-web',
    'node',
    '-e',
    "fetch('http://127.0.0.1:3000/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))",
  ])
}
