import { defineConfig, devices } from '@playwright/test'
import { createHash, X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import './src/scripts/rc02-network.mjs'

const databaseURL = process.env.E2E_DATABASE_URL
const mediaDir = process.env.E2E_MEDIA_DIR
const certPath = process.env.E2E_TLS_CERT_PATH
const keyPath = process.env.E2E_TLS_KEY_PATH
if (!databaseURL || !mediaDir || !certPath || !keyPath) {
  throw new Error('RC1 browser runs require explicit disposable DB/media and local TLS targets.')
}
const target = new URL(databaseURL)
if (
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  !target.pathname.endsWith('_release_acceptance') ||
  !path.isAbsolute(mediaDir) ||
  !path.basename(mediaDir).startsWith('rc1-')
) {
  throw new Error(
    'RC1 browser targets must be a loopback disposable release-acceptance DB and rc1- media directory.',
  )
}

const runtimeEnv = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1)]
    }),
)
const certificate = new X509Certificate(readFileSync(certPath))
const certificatePin = createHash('sha256')
  .update(certificate.publicKey.export({ type: 'spki', format: 'der' }))
  .digest('base64')
const env = {
  ...runtimeEnv,
  ...process.env,
  DATABASE_URL: databaseURL,
  APP_URL: 'https://dispatch.rc02.test:3111',
  PORT: '3110',
  HOSTNAME: 'localhost',
  MEDIA_DIR: mediaDir,
  E2E_TLS_CERT_PATH: certPath,
  E2E_TLS_KEY_PATH: keyPath,
  NODE_OPTIONS: `--import=${pathToFileURL(path.resolve('src/scripts/rc02-network.mjs')).href}`,
  PROXY_MODE: 'trusted',
  TRUSTED_PROXY_HOPS: '1',
  LOCAL_E2E_TEST_MODE: 'false',
  NEXT_PUBLIC_LOCAL_E2E_TEST_MODE: 'false',
  ENABLE_TEST_ROUTES: 'false',
  RENEGADE_MODULES: 'all',
  RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT: 'true',
}
Object.assign(process.env, env)

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: env.APP_URL,
    browserName: 'chromium',
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP dispatch.rc02.test 127.0.0.1',
        `--ignore-certificate-errors-spki-list=${certificatePin}`,
      ],
    },
  },
  webServer: [
    {
      command: 'node .next/standalone/server.js',
      url: 'http://localhost:3110/health/ready',
      reuseExistingServer: false,
      timeout: 120_000,
      env,
    },
    {
      command: 'node tests/browser/rc1-local-proxy.mjs',
      url: 'https://127.0.0.1:3111/health/ready',
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 120_000,
      env,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
