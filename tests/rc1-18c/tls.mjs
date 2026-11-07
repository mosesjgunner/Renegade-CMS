import { webcrypto } from 'node:crypto'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import {
  X509CertificateGenerator,
  SubjectAlternativeNameExtension,
  BasicConstraintsExtension,
} from '@peculiar/x509'
const root = 'scratch/rc118c-tls'
mkdirSync(root, { recursive: true })
if (!existsSync(`${root}/cert.pem`)) {
  const keys = await webcrypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const cert = await X509CertificateGenerator.createSelfSigned(
    {
      name: 'CN=18C disposable local acceptance',
      keys,
      notBefore: new Date(Date.now() - 60000),
      notAfter: new Date(Date.now() + 7 * 86400000),
      extensions: [
        new BasicConstraintsExtension(true, undefined, true),
        new SubjectAlternativeNameExtension([
          { type: 'dns', value: 'rc118c.example.test' },
          { type: 'ip', value: '127.0.0.1' },
        ]),
      ],
    },
    webcrypto,
  )
  const privateKey = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', keys.privateKey))
    .toString('base64')
    .match(/.{1,64}/g)
    .join('\n')
  writeFileSync(
    `${root}/key.pem`,
    `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----\n`,
    { mode: 0o600 },
  )
  writeFileSync(`${root}/cert.pem`, cert.toString('pem'))
}
console.log('Disposable local TLS certificate is ready')
