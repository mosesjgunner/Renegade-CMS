import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

export type ComposeTarget = {
  composeFile: string
  envFile: string
  imageTag?: string
  appVersion?: string
  buildSha?: string
}

export function projectNameFromEnvFile(
  envFile: string,
  variable = 'RENEGADE_INSTANCE',
  fallback = 'renegade-cms',
) {
  const line = readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${variable}=`))
  return line?.slice(variable.length + 1) || fallback
}

export const args = process.argv.slice(2)
export const has = (name: string) => args.includes(name)
export const value = (name: string, fallback?: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback

const commandEnvironment = (target: ComposeTarget) => ({
  ...process.env,
  ...(target.imageTag ? { RENEGADE_IMAGE_TAG: target.imageTag } : {}),
  ...(target.appVersion ? { APP_VERSION: target.appVersion } : {}),
  ...(target.buildSha ? { BUILD_SHA: target.buildSha } : {}),
})

export const composeArgs = (target: ComposeTarget) => [
  'compose',
  '--project-name',
  projectNameFromEnvFile(target.envFile),
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

export function parseImageSourceSha(output: string) {
  const provenance = JSON.parse(output) as {
    root?: { sourceSha?: unknown }
    standalone?: { sourceSha?: unknown }
  } | null
  const sourceSha = provenance?.root?.sourceSha
  if (
    typeof sourceSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(sourceSha) ||
    provenance?.standalone?.sourceSha !== sourceSha
  )
    throw new Error(
      'Target image requires matching root and standalone full source SHA provenance.',
    )
  return sourceSha
}

export async function imageSourceSha(target: ComposeTarget) {
  return parseImageSourceSha(
    await captureDocker(target, [
      'run',
      '--rm',
      '--no-deps',
      '--entrypoint',
      'node',
      'renegade-web',
      '-e',
      "const fs=require('node:fs');console.log(JSON.stringify({root:JSON.parse(fs.readFileSync('/app/build-provenance.json','utf8')),standalone:JSON.parse(fs.readFileSync('/app/standalone/build-provenance.json','utf8'))}))",
    ]),
  )
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
