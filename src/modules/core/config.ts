import path from 'node:path'

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production'
  databaseUrl: string
  payloadSecret: string
  appUrl: string
  proxyMode: 'direct' | 'trusted'
  trustedProxyHops: number
  storage: {
    driver: 'local'
    mediaDir: string
  }
  email: {
    mode: 'disabled' | 'development' | 'smtp'
    from?: string
    host?: string
    port?: number
    secure: boolean
    username?: string
    password?: string
    connectionTimeoutMs: number
    sendTimeoutMs: number
  }
  secureCookies: boolean
  enableTestRoutes: boolean
  smokeTestToken?: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  version: string
  buildSha?: string
  ownerEmail?: string
  warnings: string[]
}

export class ConfigurationError extends Error {
  readonly code = 'CONFIGURATION_INVALID'

  constructor(readonly keys: string[]) {
    super(`Invalid configuration: ${keys.join(', ')}`)
    this.name = 'ConfigurationError'
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const invalid: string[] = []
  const nodeEnv = parseNodeEnv(env.NODE_ENV, invalid)
  const isBuildPhase =
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.npm_lifecycle_event === 'build'
  const production =
    nodeEnv === 'production' && (!isBuildPhase || (env.APP_URL?.startsWith('https://') ?? false))
  const databaseUrl = required(env.DATABASE_URL, 'DATABASE_URL', invalid)
  const payloadSecret = required(env.PAYLOAD_SECRET, 'PAYLOAD_SECRET', invalid)
  const appUrl = required(env.APP_URL, 'APP_URL', invalid)
  const enableTestRoutes = env.ENABLE_TEST_ROUTES === 'true'
  const logLevel = env.LOG_LEVEL ?? 'info'
  const proxyMode = parseChoice(
    env.PROXY_MODE ?? (production ? undefined : 'direct'),
    ['direct', 'trusted'] as const,
    'PROXY_MODE',
    invalid,
  )
  const trustedProxyHops = parseInteger(
    env.TRUSTED_PROXY_HOPS ?? '1',
    'TRUSTED_PROXY_HOPS',
    invalid,
    1,
    3,
  )
  const storageDriver = parseChoice(
    env.STORAGE_DRIVER ?? 'local',
    ['local'] as const,
    'STORAGE_DRIVER',
    invalid,
  )
  const mediaDir = env.MEDIA_DIR ?? (production ? '' : path.resolve('media'))
  const emailMode = parseChoice(
    env.EMAIL_MODE ?? 'disabled',
    ['disabled', 'development', 'smtp'] as const,
    'EMAIL_MODE',
    invalid,
  )
  const ownerEmail = env.OWNER_EMAIL?.trim().toLowerCase()

  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) invalid.push('DATABASE_URL')
  if (production) {
    try {
      const database = new URL(databaseUrl)
      if (isPlaceholder(database.password) || /renegade_dev_only/i.test(databaseUrl))
        invalid.push('DATABASE_URL')
    } catch {
      // The protocol validation above reports DATABASE_URL for malformed URLs.
    }
  }
  if (
    payloadSecret &&
    (payloadSecret.length < (production ? 48 : 32) || isPlaceholder(payloadSecret))
  ) {
    invalid.push('PAYLOAD_SECRET')
  }

  let secureCookies = false
  if (appUrl) {
    try {
      const url = new URL(appUrl)
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      ) {
        invalid.push('APP_URL')
      }
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (production && (url.protocol !== 'https:' || loopback)) invalid.push('APP_URL')
      secureCookies = url.protocol === 'https:'
    } catch {
      invalid.push('APP_URL')
    }
  }

  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) invalid.push('LOG_LEVEL')
  if (enableTestRoutes && (!env.SMOKE_TEST_TOKEN || env.SMOKE_TEST_TOKEN.length < 24)) {
    invalid.push('SMOKE_TEST_TOKEN')
  }
  if (production && enableTestRoutes) invalid.push('ENABLE_TEST_ROUTES')
  if (!mediaDir || (production && !path.isAbsolute(mediaDir))) invalid.push('MEDIA_DIR')
  if (ownerEmail && !isEmail(ownerEmail)) invalid.push('OWNER_EMAIL')

  const smtpPort =
    emailMode === 'smtp' ? parseInteger(env.SMTP_PORT, 'SMTP_PORT', invalid, 1, 65535) : undefined
  const smtpConnectionTimeoutMs = parseInteger(
    env.SMTP_CONNECTION_TIMEOUT_MS ?? '10000',
    'SMTP_CONNECTION_TIMEOUT_MS',
    invalid,
    1000,
    120000,
  )
  const smtpSendTimeoutMs = parseInteger(
    env.SMTP_SEND_TIMEOUT_MS ?? '30000',
    'SMTP_SEND_TIMEOUT_MS',
    invalid,
    1000,
    120000,
  )
  if (emailMode === 'smtp') {
    required(env.SMTP_HOST, 'SMTP_HOST', invalid)
    required(env.EMAIL_FROM, 'EMAIL_FROM', invalid)
    if (Boolean(env.SMTP_USERNAME) !== Boolean(env.SMTP_PASSWORD)) {
      invalid.push(env.SMTP_USERNAME ? 'SMTP_PASSWORD' : 'SMTP_USERNAME')
    }
  }

  if (invalid.length) throw new ConfigurationError([...new Set(invalid)].sort())

  const warnings: string[] = []
  if (proxyMode === 'trusted') warnings.push('proxy.forwarded_headers_must_be_overwritten')
  if (storageDriver === 'local') warnings.push('storage.local_path_requires_persistent_volume')
  if (emailMode === 'disabled') warnings.push('email.disabled')

  return {
    nodeEnv,
    databaseUrl,
    payloadSecret,
    appUrl,
    proxyMode,
    trustedProxyHops,
    storage: { driver: storageDriver, mediaDir: path.resolve(mediaDir) },
    email: {
      mode: emailMode,
      from: env.EMAIL_FROM,
      host: env.SMTP_HOST,
      port: smtpPort,
      secure: env.SMTP_SECURE !== 'false',
      username: env.SMTP_USERNAME,
      password: env.SMTP_PASSWORD,
      connectionTimeoutMs: smtpConnectionTimeoutMs,
      sendTimeoutMs: smtpSendTimeoutMs,
    },
    secureCookies,
    enableTestRoutes,
    smokeTestToken: env.SMOKE_TEST_TOKEN,
    logLevel: logLevel as AppConfig['logLevel'],
    version: env.APP_VERSION ?? '0.1.0-dev',
    buildSha: env.BUILD_SHA,
    ownerEmail,
    warnings,
  }
}

function required(value: string | undefined, key: string, invalid: string[]): string {
  if (!value) invalid.push(key)
  return value ?? ''
}

function parseNodeEnv(value: string | undefined, invalid: string[]): AppConfig['nodeEnv'] {
  const parsed = value ?? 'development'
  if (!['development', 'test', 'production'].includes(parsed)) invalid.push('NODE_ENV')
  return parsed as AppConfig['nodeEnv']
}

function parseChoice<const T extends readonly string[]>(
  value: string | undefined,
  choices: T,
  key: string,
  invalid: string[],
): T[number] {
  if (!value || !choices.includes(value)) invalid.push(key)
  return (value ?? choices[0]) as T[number]
}

function parseInteger(
  value: string | undefined,
  key: string,
  invalid: string[],
  min: number,
  max: number,
): number {
  const parsed = Number(value)
  if (!value || !Number.isInteger(parsed) || parsed < min || parsed > max) invalid.push(key)
  return parsed
}

function isPlaceholder(value: string): boolean {
  return /replace|build-only|changeme|example|development-secret/i.test(value)
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
