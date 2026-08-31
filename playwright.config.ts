import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'

const runtimeEnv = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1)]
    }),
)
const e2eEnv = {
  ...runtimeEnv,
  APP_URL: 'http://127.0.0.1:3110',
  PORT: '3110',
  HOSTNAME: '127.0.0.1',
  LOCAL_E2E_TEST_MODE: 'true',
}

Object.assign(process.env, e2eEnv)

export default defineConfig({
  testDir: './tests/browser',
  globalSetup: './tests/browser/global-setup.ts',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:3110', browserName: 'chromium', channel: 'chrome' },
  webServer: {
    command: 'node --env-file=.env .next/standalone/server.js',
    url: 'http://127.0.0.1:3110/health/ready',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, ...e2eEnv },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
