import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createHash, X509Certificate } from 'node:crypto'
import './src/scripts/rc02-network.mjs'

const env = Object.fromEntries(
  readFileSync('.env.rc02', 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const at = line.indexOf('=')
      return [line.slice(0, at), line.slice(at + 1)]
    }),
)
if (!new URL(env.DATABASE_URL).pathname.endsWith('_release_acceptance'))
  throw new Error('Disposable database required')
Object.assign(process.env, env)
env.NODE_ENV = 'production'
env.NODE_OPTIONS = `--max-old-space-size=768 --import=${pathToFileURL(resolve('src/scripts/rc02-network.mjs')).href}`
Object.assign(process.env, env)
const certificate = new X509Certificate(readFileSync('scratch/rc02-tls/cert.pem'))
const certificatePin = createHash('sha256')
  .update(certificate.publicKey.export({ type: 'spki', format: 'der' }))
  .digest('base64')
export default defineConfig({
  testDir: './tests/rc02',
  workers: 1,
  timeout: 600_000,
  outputDir: 'test-results/rc02',
  reporter: [['list'], ['json', { outputFile: 'docs/rc/evidence/rc-02/browser-results.json' }]],
  use: {
    baseURL: env.APP_URL,
    browserName: 'chromium',
    ignoreHTTPSErrors: true,
    launchOptions: { args: [
      '--host-resolver-rules=MAP dispatch.rc02.test 127.0.0.1',
      `--ignore-certificate-errors-spki-list=${certificatePin}`,
    ] },
    trace: 'on',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  webServer: {
    command: 'node src/scripts/rc02-runtime.mjs',
    url: `${env.APP_URL}/api/setup/readiness`,
    reuseExistingServer: false,
    ignoreHTTPSErrors: true,
    timeout: 120_000,
    env,
  },
})
