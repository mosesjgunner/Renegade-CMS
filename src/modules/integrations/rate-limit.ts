type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/** Process-local fallback. Deployments should apply the same client-keyed limit at their edge. */
export function consumeApiRateLimit(clientId: string, write: boolean, now = Date.now()) {
  const maximum = write ? 30 : 120
  const key = `${clientId}:${write ? 'write' : 'read'}`
  const current = buckets.get(key)
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : current
  bucket.count++
  buckets.set(key, bucket)
  return {
    allowed: bucket.count <= maximum,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    remaining: Math.max(0, maximum - bucket.count),
  }
}
export const resetApiRateLimitsForTest = () => buckets.clear()
