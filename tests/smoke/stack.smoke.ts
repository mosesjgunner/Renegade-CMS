import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3100'
const token = process.env.SMOKE_TEST_TOKEN
const secret = process.env.PAYLOAD_SECRET

if (!process.env.DATABASE_URL || !secret || !token) {
  throw new Error('DATABASE_URL, PAYLOAD_SECRET and SMOKE_TEST_TOKEN are required for stack smoke')
}

const env = {
  ...process.env,
  APP_URL: baseUrl,
  ALLOW_FIXTURE_SEED: 'true',
  ENABLE_TEST_ROUTES: 'true',
  PORT: new URL(baseUrl).port || '3100',
}

const nextCli = path.resolve('node_modules/next/dist/bin/next')
const app = spawn(process.execPath, [nextCli, 'start'], {
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
app.stdout.on('data', (chunk) => (logs += chunk.toString()))
  const liveness = await (await fetch(`${baseUrl}/health/live`)).json()
  assert(liveness.status === 'live', 'liveness did not report live')

app.stderr.on('data', (chunk) => (logs += chunk.toString()))

try {
  await waitUntilReady(`${baseUrl}/health/ready`)

  const publicResponse = await fetch(baseUrl)
  const publicHtml = await publicResponse.text()
  assert(publicResponse.ok, 'public route did not return success')
  assert(publicHtml.includes('Demo Publication'), 'public route did not render seeded Payload data')

  const adminResponse = await fetch(`${baseUrl}/admin`, { redirect: 'manual' })
  assert(adminResponse.status < 500, 'Payload admin route did not mount')

  const writeResponse = await fetch(`${baseUrl}/api/foundation-smoke`, {
    method: 'POST',
    headers: { 'x-renegade-smoke-token': token },
  })
  const writeResult = (await writeResponse.json()) as { status?: string; site?: { id?: string } }
  assert(writeResponse.ok && writeResult.status === 'ok', 'stack persistence operation failed')
  assert(Boolean(writeResult.site?.id), 'stack persistence operation returned no stable ID')

  const readiness = await (await fetch(`${baseUrl}/health/ready`)).json()
  assert(readiness.checks?.database === 'ok', 'readiness did not prove PostgreSQL')
  assert(!logs.includes(secret), 'application logs exposed PAYLOAD_SECRET')
  assert(!publicHtml.includes(secret), 'application response exposed PAYLOAD_SECRET')
  console.log(
    'PASS: Next.js public/admin routes and Payload PostgreSQL persistence are operational.',
  )
} finally {
  app.kill('SIGTERM')
  app.stdout.destroy()
  app.stderr.destroy()
}

async function waitUntilReady(url: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Application did not become ready: ${String(lastError)}`)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
