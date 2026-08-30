import { createPrivateKey, sign } from 'node:crypto'
export type SigningKey = { keyId: string; algorithm: 'rsa-sha256'; privateKeyPem: string }
/** Runtime-only key boundary. Persistence stores public records and lifecycle state, never private material. */
export class NetworkKeyManager {
  constructor(private readonly keys: readonly SigningKey[]) {}
  active() {
    const key = this.keys[0]
    if (!key) throw new Error('Network signing is not configured.')
    return key
  }
  sign(input: string) {
    const key = this.active()
    return {
      keyId: key.keyId,
      algorithm: key.algorithm,
      signature: sign(
        'RSA-SHA256',
        Buffer.from(input),
        createPrivateKey(key.privateKeyPem),
      ).toString('base64'),
    }
  }
  publicRecords() {
    return this.keys.map(({ keyId, algorithm }) => ({ keyId, algorithm }))
  }
}
