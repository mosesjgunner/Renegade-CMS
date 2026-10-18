import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/rc1-01b',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'https://rc1-01b.test:38743',
    browserName: 'chromium',
    ignoreHTTPSErrors: true,
    launchOptions: { args: ['--host-resolver-rules=MAP rc1-01b.test 127.0.0.1', '--ignore-certificate-errors'] },
    trace: 'on',
    screenshot: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ignoreHTTPSErrors: true } }],
})
