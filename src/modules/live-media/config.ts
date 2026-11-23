import { cloudflareStream } from './cloudflare'
import { mediaMtx } from './mediamtx'
import { LiveMediaError, type LiveMediaProvider, type ProviderId } from './provider'

export function liveMediaProvider(id: ProviderId): LiveMediaProvider | null {
  if (id === 'mediamtx') {
    const control = process.env.LIVE_MEDIAMTX_CONTROL_URL
    const recordings = process.env.LIVE_MEDIAMTX_RECORDINGS_URL
    if (!control || !recordings) return null
    const ice = process.env.LIVE_MEDIAMTX_STUN_URL
    return mediaMtx(control, recordings, ice ? [{ urls: ice }] : [])
  }
  const account = process.env.LIVE_CLOUDFLARE_ACCOUNT
  const apiToken = process.env.LIVE_CLOUDFLARE_TOKEN
  const keyId = process.env.LIVE_CLOUDFLARE_KEY_ID
  const privateKey = process.env.LIVE_CLOUDFLARE_PRIVATE_KEY
  const customerHost = process.env.LIVE_CLOUDFLARE_CUSTOMER_HOST
  if (
    !account ||
    !/^[a-f0-9]{32}$/.test(account) ||
    !apiToken ||
    !keyId ||
    !privateKey ||
    !customerHost ||
    !/^customer-[a-z0-9]+\.cloudflarestream\.com$/.test(customerHost)
  )
    return null
  return cloudflareStream({
    account,
    apiToken,
    keyId,
    privateKey: privateKey.replaceAll('\\n', '\n'),
    customerHost,
  })
}

export function configuredProvider(id: ProviderId) {
  const provider = liveMediaProvider(id)
  if (!provider) throw new LiveMediaError('This live media provider is disabled.', 409)
  return provider
}

export function managedInputForRoom(roomId: string, requested: string) {
  const allowed = (process.env.LIVE_CLOUDFLARE_INPUTS ?? '').split(',').map((entry) => entry.trim())
  if (!/^[a-f0-9]{32}$/.test(requested) || !allowed.includes(`${roomId}=${requested}`))
    throw new LiveMediaError('Choose a managed input assigned to this room.', 422)
  return requested
}
