import { resolve as resolveFromRoot } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  outputDir: resolveFromRoot('test-results'),
  testDir: resolveFromRoot('./tests/browser-production'),
  timeout: 30_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3200', ...devices['Desktop Chrome'] },
})
