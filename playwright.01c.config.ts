import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/rc1-01c',
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP rc1-01c-lean.test 127.0.0.1, MAP rc1-01c-std.test 127.0.0.1',
        '--ignore-certificate-errors',
      ],
    },
    trace: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ignoreHTTPSErrors: true } }],
})
