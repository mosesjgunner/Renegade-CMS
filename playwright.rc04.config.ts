import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createHash, X509Certificate } from 'node:crypto'
import './src/scripts/rc02-network.mjs'
const env = Object.fromEntries(
  readFileSync('.env.rc04', 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const at = line.indexOf('=')
      return [line.slice(0, at), line.slice(at + 1)]
    }),
)
if (!new URL(env.DATABASE_URL).pathname.endsWith('_release_acceptance'))
  throw Error('Disposable DB required')
Object.assign(process.env, env)
const certificate = new X509Certificate(readFileSync('scratch/rc02-tls/cert.pem'))
const pin = createHash('sha256')
  .update(certificate.publicKey.export({ type: 'spki', format: 'der' }))
  .digest('base64')
export default defineConfig({
  testDir: './tests/rc04',
  workers: 1,
  timeout: 600_000,
  outputDir: 'test-results/rc04',
  reporter: [['list'], ['json', { outputFile: 'docs/rc/evidence/rc-04/browser-results.json' }]],
  use: {
    baseURL: env.APP_URL,
    ignoreHTTPSErrors: true,
    browserName: 'chromium',
    trace: 'off',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP dispatch.rc02.test 127.0.0.1',
        `--ignore-certificate-errors-spki-list=${pin}`,
      ],
    },
  },
  webServer: {
    command: 'node src/scripts/rc04-runtime.mjs',
    url: `${env.APP_URL}/api/setup/readiness`,
    timeout: 120_000,
    reuseExistingServer: false,
    ignoreHTTPSErrors: true,
    env,
  },
})
