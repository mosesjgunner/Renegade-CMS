import { execFileSync } from 'node:child_process'
import process from 'node:process'

const npmCli = process.env.npm_execpath

if (!npmCli) throw new Error('Run verify:release through npm so npm_execpath is available.')

runStage('dependencies', () => runNpm('ci'))
runStage('release checks', () => runNpm('run', 'verify:release:checks'))
console.log('PASS: clean-clone release verification completed.')

function runNpm(...args) {
  execFileSync(process.execPath, [npmCli, ...args], { env: process.env, stdio: 'inherit' })
}

function runStage(name, action) {
  console.log(`\n==> verify:release [${name}]`)
  try {
    action()
  } catch (error) {
    console.error(`FAIL: verify:release [${name}]`)
    throw error
  }
}
