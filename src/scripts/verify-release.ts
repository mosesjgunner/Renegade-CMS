import { execFileSync } from 'node:child_process'
import process from 'node:process'

import { releaseVerificationEnvironment } from './verification-contract'

export function runStage(name: string, action: () => void): void {
  console.log(`\n==> verify:release [${name}]`)
  try {
    action()
  } catch (error) {
    console.error(`FAIL: verify:release [${name}]`)
    throw error
  }
}

export function verifyRelease(): void {
  releaseVerificationEnvironment()
  const npmCli = process.env.npm_execpath
  if (!npmCli) throw new Error('Run verify:release through npm so npm_execpath is available.')
  const runNpm = (stage: string, script: string, env = process.env) =>
    runStage(stage, () => {
      execFileSync(process.execPath, [npmCli, 'run', script], { env, stdio: 'inherit' })
    })

  runNpm('fresh migration acceptance', 'test:migrations:fresh')
  runNpm('fixture seed', 'db:seed', { ...process.env, ALLOW_FIXTURE_SEED: 'true' })
  runNpm('upgrade migration acceptance', 'test:migrations:upgrade')
  runNpm('format', 'format:check')
  runNpm('lint', 'lint')
  runNpm('typecheck', 'typecheck')
  runNpm('unit', 'test')
  const integrationEnv = { ...process.env }
  delete integrationEnv.UPGRADE_MIGRATION_DATABASE_URL
  runNpm('integration', 'test:integration', integrationEnv)
  runNpm('production build', 'build')
  runNpm('production boot, health, and persistence smoke', 'test:smoke')
}

if (process.argv[1]?.endsWith('verify-release.ts')) {
  try {
    verifyRelease()
    console.log('PASS: release verification checks completed.')
  } catch (error) {
    process.exitCode = 1
    throw error
  }
}
