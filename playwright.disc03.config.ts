import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'

Object.assign(
  process.env,
  Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  ),
  {
    APP_URL: process.env.DISC03_BASE_URL || 'http://localhost:3103',
    RENEGADE_MODULES: 'all',
    RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT: 'true',
  },
)

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: process.env.DISC03_BASE_URL || 'http://localhost:3103',
    browserName: 'chromium',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
