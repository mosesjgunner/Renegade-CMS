import { defineConfig, devices } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'

const rawEnv = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
const runtimeEnv = Object.fromEntries(
  rawEnv
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1)]
    }),
)
const e2eEnv = {
  ...runtimeEnv,
  // Use `localhost` (not the 127.0.0.1 literal) so browser WebAuthn accepts the
  // origin: an IP address is an invalid RP ID, but `localhost` is allowed. It
  // resolves to the same loopback address, so non-passkey specs are unaffected.
  APP_URL: 'http://localhost:3110',
  PORT: '3110',
  HOSTNAME: 'localhost',
  LOCAL_E2E_TEST_MODE: 'true',
}

Object.assign(process.env, e2eEnv)

export default defineConfig({
  testDir: './tests/browser',
  globalSetup: process.env.A01_SETUP_TOKEN ? undefined : './tests/browser/global-setup.ts',
  timeout: 30_000,
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ??
      (process.env.A01_SETUP_TOKEN ? 'http://localhost:3201' : 'http://localhost:3110'),
    browserName: 'chromium',
    channel: 'chrome',
  },
  webServer: process.env.A01_SETUP_TOKEN
    ? undefined
    : {
        command: 'node .next/standalone/server.js',
        url: 'http://localhost:3110/health/ready',
        reuseExistingServer: false,
        timeout: 120_000,
        env: { ...process.env, ...e2eEnv },
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
