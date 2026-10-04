import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'

// No default .env, destructive shared global setup, or test authentication bypass.
const env = Object.fromEntries(
  readFileSync('.env.rc01', 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1)]
    }),
)
if (!new URL(env.DATABASE_URL).pathname.endsWith('_release_acceptance')) {
  throw new Error('RC-01 requires a disposable _release_acceptance database')
}
Object.assign(process.env, env)
export default defineConfig({
  testDir: './tests/rc01',
  workers: 1,
  timeout: 90_000,
  outputDir: 'test-results/rc01',
  reporter: [['list'], ['json', { outputFile: 'docs/rc/evidence/rc-01/browser-results.json' }]],
  projects: [
    { name: 'setup', testMatch: 'setup.spec.ts' },
    { name: 'admin-matrix', testMatch: 'routes.spec.ts', dependencies: ['setup'] },
    { name: 'focused-boundaries', testMatch: 'boundaries.spec.ts', dependencies: ['setup'] },
  ],
  use: {
    baseURL: env.APP_URL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --port 3127',
    url: `${env.APP_URL}/api/setup/readiness`,
    reuseExistingServer: false,
    timeout: 120_000,
    env,
  },
})
