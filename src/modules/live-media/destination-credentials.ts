import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { isPrivateAddress } from '../core/external-boundary'

export type DestinationProvider = 'custom' | 'youtube' | 'twitch'
type Credential = { ingest: string; key: string }

export const termsVersion = 1
export const relayBitrateKbps = 2700

export function destinationKey() {
  const value = process.env.LIVE_DESTINATION_ENCRYPTION_KEY ?? ''
  return /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : null
}

export function validateTarget(provider: DestinationProvider, ingest: string, key: string) {
  if (
    !/^rtmps?:\/\/[a-z0-9.-]+(?::\d{1,5})?\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/?$/i.test(ingest) ||
    !/^[a-z0-9_-]{1,256}$/i.test(key) ||
    ingest.length > 300
  )
    throw new Error('Invalid destination')
  const url = new URL(ingest.replace(/\/$/, ''))
  const port = Number(url.port || (url.protocol === 'rtmps:' ? 443 : 1935))
  const endpoint = `${url.protocol}//${url.hostname}:${port}`
  const localFixture =
    provider === 'custom' &&
    process.env.LIVE_DESTINATION_FIXTURE_ENDPOINTS?.split(',')
      .map((value) => value.trim())
      .includes(endpoint) === true
  if (
    !port ||
    !process.env.LIVE_DESTINATION_ENDPOINTS?.split(',')
      .map((value) => value.trim())
      .includes(endpoint)
  )
    throw new Error('Unapproved destination')
  if (
    !localFixture &&
    (url.protocol !== 'rtmps:' || url.hostname === 'localhost' || isPrivateAddress(url.hostname))
  )
    throw new Error('Destination must use RTMPS on a public endpoint')
  if (
    (provider === 'youtube' &&
      (url.protocol !== 'rtmps:' ||
        !/^(?:[a-z0-9-]+\.)+youtube\.com$/.test(url.hostname) ||
        url.pathname !== '/live2')) ||
    (provider === 'twitch' &&
      (!/^(?:[a-z0-9-]+\.)+(?:twitch\.tv|live-video\.net)$/.test(url.hostname) ||
        url.pathname !== '/app'))
  )
    throw new Error('Invalid provider destination')
  return { url, port, key, localFixture }
}

export function encryptDestination(key: Buffer, id: string, credential: Credential) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(id))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credential)), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
}

export function decryptDestination(key: Buffer, id: string, encrypted: Buffer): Credential {
  const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(0, 12))
  decipher.setAAD(Buffer.from(id))
  decipher.setAuthTag(encrypted.subarray(12, 28))
  return JSON.parse(
    Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString(),
  )
}
