import { webcrypto, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import * as x509 from '@peculiar/x509'

const database = new URL(process.env.DATABASE_URL ?? '')
if (
  !/^postgres(ql)?:$/.test(database.protocol) ||
  !database.pathname.endsWith('_release_acceptance')
) {
  throw new Error('Integration requires a dedicated *_release_acceptance PostgreSQL database.')
}

// Local HTTPS peers need a trusted certificate even in a brand-new checkout.
// Generate new test-only keys, and trust this certificate only in the test process.
x509.cryptoProvider.set(webcrypto)
const algorithm = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
  publicExponent: new Uint8Array([1, 0, 1]),
  modulusLength: 2048,
}
const keys = await webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])
const certificate = await x509.X509CertificateGenerator.createSelfSigned({
  serialNumber: randomBytes(16).toString('hex'),
  name: 'CN=dispatch.rc02.test',
  notBefore: new Date(Date.now() - 60_000),
  notAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
  signingAlgorithm: algorithm,
  keys,
  extensions: [
    new x509.BasicConstraintsExtension(true, 0, true),
    new x509.SubjectAlternativeNameExtension([{ type: 'dns', value: 'dispatch.rc02.test' }]),
  ],
})
mkdirSync('scratch/rc02-tls', { recursive: true })
const privateKey = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', keys.privateKey))
writeFileSync(
  'scratch/rc02-tls/key.pem',
  `-----BEGIN PRIVATE KEY-----\n${privateKey
    .toString('base64')
    .match(/.{1,64}/g)
    .join('\n')}\n-----END PRIVATE KEY-----\n`,
  { mode: 0o600 },
)
writeFileSync('scratch/rc02-tls/cert.pem', certificate.toString('pem'))
const args = process.argv.slice(2)
const targets = args.some((arg) => arg.startsWith('tests/integration/'))
  ? args
  : ['tests/integration', ...args]
const child = spawn(
  process.execPath,
  [resolve('node_modules/vitest/vitest.mjs'), 'run', '--no-file-parallelism', ...targets],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ALLOW_FIXTURE_SEED: 'true',
      RENEGADE_MODULES: 'all',
      RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT: 'true',
      NODE_EXTRA_CA_CERTS: resolve('scratch/rc02-tls/cert.pem'),
    },
  },
)
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
