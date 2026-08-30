import { audienceDigest } from './contracts'

const buckets = new Map<string, { count: number; resetAt: number }>()
/** Process-local, bounded abuse control. It retains only a keyed digest for one short window. */
export function takeAudiencePublicRequest(ip: string, operation: string, now = Date.now()) {
  const key = audienceDigest(`${process.env.PAYLOAD_SECRET ?? 'local'}:${operation}:${ip}`)
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    if (buckets.size > 10_000) buckets.clear()
    buckets.set(key, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (current.count >= 8) return false
  current.count += 1
  return true
}
