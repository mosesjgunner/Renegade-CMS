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

const webhookBuckets = new Map<string, Bucket>()

/**
 * Per-route inbound webhook bound (requests per minute). Signature verification
 * stays the authentication control; this limiter only sheds flood load before
 * any signature, correlation, or database work happens. The default is generous
 * enough for legitimate provider retry bursts; operators can tighten or relax
 * it with INBOUND_WEBHOOK_RATE_LIMIT_PER_MINUTE.
 */
export function inboundWebhookRateLimitPerMinute(): number {
  const parsed = Number(process.env.INBOUND_WEBHOOK_RATE_LIMIT_PER_MINUTE)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 300
}

/**
 * Process-local fallback with the same deployment note as the API limiter
 * above: apply the same keyed bound at the edge. Keys are per inbound route
 * (and per provider for commerce), so one noisy provider cannot starve
 * another route's callbacks.
 */
export function consumeInboundWebhookRateLimit(key: string, now = Date.now()) {
  const maximum = inboundWebhookRateLimitPerMinute()
  const current = webhookBuckets.get(key)
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : current
  bucket.count++
  webhookBuckets.set(key, bucket)
  return {
    allowed: bucket.count <= maximum,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    remaining: Math.max(0, maximum - bucket.count),
  }
}
export const resetInboundWebhookRateLimitsForTest = () => webhookBuckets.clear()
