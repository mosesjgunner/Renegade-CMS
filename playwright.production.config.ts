import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser-production',
  timeout: 30_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3200', ...devices['Desktop Chrome'] },
})
