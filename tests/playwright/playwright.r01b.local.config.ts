import { resolve as resolveFromRoot } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Local-process variant of playwright.r01b.config.ts for hosts without Docker.
// The web/worker run as local production processes (standalone server) behind a
// local HTTPS proxy on https://rc1-01b.test:38756, exactly mirroring the
// container topology used by tests/rc1-r01b/owner.spec.ts. Driven by
// tests/rc1-r01b/run-local.mjs, which supplies R01B_* environment variables.
export default defineConfig({
  testDir: resolveFromRoot('./tests/rc1-r01b'),
  testMatch: 'owner.local.spec.ts',
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  outputDir: resolveFromRoot(process.env.R01B_OUTPUT_DIR ?? 'test-results/r01b-local'),
  use: {
    baseURL: 'https://rc1-01b.test:38756',
    browserName: 'chromium',
    ignoreHTTPSErrors: true,
    navigationTimeout: 60_000,
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP rc1-01b.test 127.0.0.1',
        '--ignore-certificate-errors',
        // The browser only talks to the local TLS proxy; never route through
        // the host's egress proxy (its CONNECT tunnel rejects .test hosts).
        '--no-proxy-server',
      ],
    },
    trace: 'on',
    screenshot: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ignoreHTTPSErrors: true } }],
})
