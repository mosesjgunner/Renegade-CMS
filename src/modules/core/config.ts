import path from 'node:path'

import type { ResourceProfile } from '../extensions/contracts'

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production'
  databaseUrl: string
  payloadSecret: string
  appUrl: string
  proxyMode: 'direct' | 'trusted'
  trustedProxyHops: number
  storage: {
    /** The effective driver. An incomplete optional S3 configuration degrades to local outside production. */
    driver: 'local' | 's3'
    mediaDir: string
    maxUploadBytes: number
    s3?: {
      endpoint: string
      bucket: string
      region: string
      accessKeyId: string
      secretAccessKey: string
      publicBaseUrl?: string
    }
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
  networking: {
    enabled: boolean
    /** Development-only escape hatch for isolated fixture servers. */
    allowPrivateDevelopment: boolean
  }
  realtime: {
    enabled: boolean
    presenceEnabled: boolean
    presenceTtlSeconds: number
  }
  schemaVersion: string
  deploymentProfile: ResourceProfile
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
  const localE2ETestMode = env.LOCAL_E2E_TEST_MODE === 'true'
  const isBuildPhase =
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.npm_lifecycle_event === 'build'
  const production =
    !localE2ETestMode &&
    nodeEnv === 'production' &&
    (!isBuildPhase || (env.APP_URL?.startsWith('https://') ?? false))
  // `next build` only evaluates server modules; it never connects to the
  // database or signs a request. Keep build-only values in code so the Docker
  // build neither receives nor persists a deployment secret.
  const buildDefaults = isBuildPhase
    ? {
        databaseUrl: 'postgresql://build:build@127.0.0.1:5432/build',
        payloadSecret: 'next-build-value-not-used-at-runtime-0123456789',
        appUrl: 'http://localhost:3000',
      }
    : undefined
  const databaseUrl = required(
    env.DATABASE_URL ?? buildDefaults?.databaseUrl,
    'DATABASE_URL',
    invalid,
  )
  const payloadSecret = required(
    env.PAYLOAD_SECRET ?? buildDefaults?.payloadSecret,
    'PAYLOAD_SECRET',
    invalid,
  )
  const appUrl = required(env.APP_URL ?? buildDefaults?.appUrl, 'APP_URL', invalid)
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
  const requestedStorageDriver = parseChoice(
    env.STORAGE_DRIVER ?? 'local',
    ['local', 's3'] as const,
    'STORAGE_DRIVER',
    invalid,
  )
  const mediaDir = env.MEDIA_DIR ?? (production ? '' : path.resolve('media'))
  const maxUploadBytes = parseInteger(
    env.MEDIA_MAX_UPLOAD_BYTES ?? String(25 * 1024 * 1024),
    'MEDIA_MAX_UPLOAD_BYTES',
    invalid,
    1,
    100 * 1024 * 1024,
  )
  const emailMode = parseChoice(
    env.EMAIL_MODE ?? 'disabled',
    ['disabled', 'development', 'smtp'] as const,
    'EMAIL_MODE',
    invalid,
  )
  const ownerEmail = env.OWNER_EMAIL?.trim().toLowerCase()
  const deploymentProfile = parseChoice(
    env.DEPLOYMENT_PROFILE ?? 'Standard',
    ['Lean', 'Standard', 'Media', 'Scale'] as const,
    'DEPLOYMENT_PROFILE',
    invalid,
  )
  const networkingEnabled = env.NETWORKING_ENABLED === 'true'
  const realtimeEnabled = env.REALTIME_ENABLED ?? (deploymentProfile === 'Lean' ? 'false' : 'true')
  const presenceEnabled = env.PRESENCE_ENABLED ?? (deploymentProfile === 'Lean' ? 'false' : 'true')
  if (!['true', 'false'].includes(realtimeEnabled)) invalid.push('REALTIME_ENABLED')
  if (!['true', 'false'].includes(presenceEnabled)) invalid.push('PRESENCE_ENABLED')
  const presenceTtlSeconds = parseInteger(
    env.REALTIME_PRESENCE_TTL_SECONDS ?? '90',
    'REALTIME_PRESENCE_TTL_SECONDS',
    invalid,
    30,
    600,
  )
  if (presenceEnabled === 'true' && realtimeEnabled !== 'true') invalid.push('PRESENCE_ENABLED')
  const allowPrivateDevelopment = env.NETWORK_ALLOW_PRIVATE_DEVELOPMENT === 'true'
  if (networkingEnabled && deploymentProfile === 'Lean') invalid.push('NETWORKING_ENABLED')
  if (allowPrivateDevelopment && nodeEnv !== 'development')
    invalid.push('NETWORK_ALLOW_PRIVATE_DEVELOPMENT')
  if (networkingEnabled && production && !appUrl.startsWith('https://')) invalid.push('APP_URL')

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
      if (localE2ETestMode && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        invalid.push('LOCAL_E2E_TEST_MODE')
    } catch {
      invalid.push('APP_URL')
    }
  }

  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) invalid.push('LOG_LEVEL')
  if (enableTestRoutes && (!env.SMOKE_TEST_TOKEN || env.SMOKE_TEST_TOKEN.length < 24)) {
    invalid.push('SMOKE_TEST_TOKEN')
  }
  if (production && enableTestRoutes) invalid.push('ENABLE_TEST_ROUTES')
  if (!mediaDir || (production && requestedStorageDriver === 'local' && !path.isAbsolute(mediaDir)))
    invalid.push('MEDIA_DIR')
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
    if (env.EMAIL_FROM && !isEmailSender(env.EMAIL_FROM)) invalid.push('EMAIL_FROM')
    if (Boolean(env.SMTP_USERNAME) !== Boolean(env.SMTP_PASSWORD)) {
      invalid.push(env.SMTP_USERNAME ? 'SMTP_PASSWORD' : 'SMTP_USERNAME')
    }
  }

  const warnings: string[] = []
  const s3Values = {
    endpoint: env.S3_ENDPOINT?.trim(),
    bucket: env.S3_BUCKET?.trim(),
    region: env.S3_REGION?.trim(),
    accessKeyId: env.S3_ACCESS_KEY_ID?.trim(),
    secretAccessKey: env.S3_SECRET_ACCESS_KEY?.trim(),
    publicBaseUrl: env.S3_PUBLIC_BASE_URL?.trim(),
  }
  const missingS3 = [
    !s3Values.endpoint && 'S3_ENDPOINT',
    !s3Values.bucket && 'S3_BUCKET',
    !s3Values.region && 'S3_REGION',
    !s3Values.accessKeyId && 'S3_ACCESS_KEY_ID',
    !s3Values.secretAccessKey && 'S3_SECRET_ACCESS_KEY',
  ].filter(Boolean) as string[]
  if (s3Values.endpoint) {
    try {
      const endpoint = new URL(s3Values.endpoint)
      if (
        !['http:', 'https:'].includes(endpoint.protocol) ||
        endpoint.username ||
        endpoint.password
      )
        missingS3.push('S3_ENDPOINT')
    } catch {
      missingS3.push('S3_ENDPOINT')
    }
  }
  if (s3Values.publicBaseUrl) {
    try {
      const publicBaseUrl = new URL(s3Values.publicBaseUrl)
      if (
        !['http:', 'https:'].includes(publicBaseUrl.protocol) ||
        publicBaseUrl.username ||
        publicBaseUrl.password
      )
        missingS3.push('S3_PUBLIC_BASE_URL')
    } catch {
      missingS3.push('S3_PUBLIC_BASE_URL')
    }
  }
  const s3Configured = requestedStorageDriver === 's3' && missingS3.length === 0
  if (requestedStorageDriver === 's3' && !s3Configured) {
    if (production) invalid.push(...missingS3)
    else warnings.push('storage.s3_configuration_incomplete_using_local')
  }
  const storageDriver = s3Configured ? 's3' : 'local'
  if (invalid.length) throw new ConfigurationError([...new Set(invalid)].sort())
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
    storage: {
      driver: storageDriver,
      mediaDir: path.resolve(mediaDir),
      maxUploadBytes,
      s3: s3Configured
        ? {
            endpoint: s3Values.endpoint!,
            bucket: s3Values.bucket!,
            region: s3Values.region!,
            accessKeyId: s3Values.accessKeyId!,
            secretAccessKey: s3Values.secretAccessKey!,
            publicBaseUrl: s3Values.publicBaseUrl || undefined,
          }
        : undefined,
    },
    networking: { enabled: networkingEnabled, allowPrivateDevelopment },
    realtime: {
      enabled: realtimeEnabled === 'true',
      presenceEnabled: presenceEnabled === 'true',
      presenceTtlSeconds,
    },
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
    schemaVersion: env.SCHEMA_VERSION ?? '1.0.0',
    deploymentProfile,
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

/** Reject header injection and require a real mailbox while allowing a display name. */
function isEmailSender(value: string): boolean {
  if (/[\r\n]/.test(value)) return false
  const mailbox = value.match(/<([^<>]+)>/)?.[1] ?? value.trim()
  return isEmail(mailbox)
}
