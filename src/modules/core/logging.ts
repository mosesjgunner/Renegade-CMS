const sensitiveKey = /authorization|cookie|database.?url|password|secret|token/i
const inlineSecret = /(bearer\s+|(?:token|secret|password|authorization|cookie)[=: ]+)[^\s,;&]+/gi

export function configuredSecretValues(env: Record<string, string | undefined> = process.env) {
  return Object.entries(env)
    .filter(([key, value]) => Boolean(value) && sensitiveKey.test(key))
    .map(([, value]) => value!)
}

export function redact(value: unknown, configuredSecrets = configuredSecretValues()): unknown {
  if (typeof value === 'string') {
    const withoutConfiguredSecrets = configuredSecrets
      .filter(Boolean)
      .reduce((result, secret) => result.split(secret).join('[REDACTED]'), value)
    return withoutConfiguredSecrets.replace(inlineSecret, '$1[REDACTED]')
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, configuredSecrets))
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? '[REDACTED]' : redact(item, configuredSecrets),
      ]),
    )
  return value
}

export function log(
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
) {
  const entry = redact({ timestamp: new Date().toISOString(), level, event, ...fields })
  const output = JSON.stringify(entry)
  if (level === 'error') console.error(output)
  else console.log(output)
}
