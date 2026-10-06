import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import {
  renderProductionConfig,
  validateProductionInstallInput,
  hasInstallerManagedConfig,
  hasUnsafeProductionConfig,
} from '../src/modules/operations/production-installer.ts'
import { assertOperationalEnv } from '../src/scripts/operational-env.ts'

const instanceA = {
  instance: 'renegadeparty',
  appUrl: 'https://party.renegadeparty.test:3181',
  proxyMode: 'direct',
  trustedProxyHops: '1',
  profile: 'Lean',
  webBind: '127.0.0.1:3181',
  ownerEmail: 'owner@renegadeparty.test',
}
const secretsA = {
  postgresPassword: randomBytes(36).toString('base64url'),
  payloadSecret: randomBytes(54).toString('base64url'),
}
const configA = renderProductionConfig(instanceA, secretsA)
writeFileSync('.env.renegadeparty', configA)
console.log('Generated .env.renegadeparty')

const instanceB = {
  instance: 'myhigherpower',
  appUrl: 'https://power.myhigherpower.test:3182',
  proxyMode: 'direct',
  trustedProxyHops: '1',
  profile: 'Standard',
  webBind: '127.0.0.1:3182',
  ownerEmail: 'owner@myhigherpower.test',
}
const secretsB = {
  postgresPassword: randomBytes(36).toString('base64url'),
  payloadSecret: randomBytes(54).toString('base64url'),
}
const configB = renderProductionConfig(instanceB, secretsB)
writeFileSync('.env.myhigherpower', configB)
console.log('Generated .env.myhigherpower')

// Validate both
validateProductionInstallInput(instanceA)
validateProductionInstallInput(instanceB)
if (!hasInstallerManagedConfig(configA) || hasUnsafeProductionConfig(configA))
  throw new Error('configA invalid')
if (!hasInstallerManagedConfig(configB) || hasUnsafeProductionConfig(configB))
  throw new Error('configB invalid')
await assertOperationalEnv('.env.renegadeparty')
await assertOperationalEnv('.env.myhigherpower')
console.log('Both instance configs validated successfully.')
