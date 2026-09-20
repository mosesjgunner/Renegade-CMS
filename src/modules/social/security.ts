import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH_BYTES = 12 // 96 bits standard for GCM
const AUTH_TAG_LENGTH_BYTES = 16 // 128 bits
const DEFAULT_FALLBACK_DEV_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

/**
 * Resolves the 256-bit encryption key as a Buffer.
 * Fail-closed in production: a real encryption key must be configured.
 */
export function getEncryptionKey(explicitKeyHex?: string): Buffer {
  const rawKey = explicitKeyHex || process.env.RENEGADE_ENCRYPTION_KEY

  if (rawKey) {
    if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
      return Buffer.from(rawKey, 'hex')
    }
    return createHash('sha256').update(rawKey).digest()
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Production encryption key is required: set RENEGADE_ENCRYPTION_KEY')
  }

  return createHash('sha256').update(DEFAULT_FALLBACK_DEV_KEY).digest()
}

function resolveRequiredSecret(explicitSecret?: string): string {
  if (explicitSecret) return explicitSecret
  if (process.env.RENEGADE_ENCRYPTION_KEY) return process.env.RENEGADE_ENCRYPTION_KEY
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Production OAuth secret is required: set RENEGADE_ENCRYPTION_KEY')
  }
  return DEFAULT_FALLBACK_DEV_KEY
}

/**
 * Encrypts a plaintext secret using AES-256-GCM.
 * Output format: base64url(iv):base64url(tag):base64url(ciphertext)
 */
export function encryptSecret(plaintext: string, explicitKeyHex?: string): string {
  if (!plaintext) return ''
  const key = getEncryptionKey(explicitKeyHex)
  const iv = randomBytes(IV_LENGTH_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES })

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`
}

/**
 * Decrypts an AES-256-GCM encrypted package.
 * Expects format: base64url(iv):base64url(tag):base64url(ciphertext)
 */
export function decryptSecret(ciphertextPackage: string, explicitKeyHex?: string): string {
  if (!ciphertextPackage) return ''
  const parts = ciphertextPackage.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format: expected iv:tag:ciphertext')
  }

  const [ivB64, tagB64, encryptedB64] = parts
  const key = getEncryptionKey(explicitKeyHex)
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const encrypted = Buffer.from(encryptedB64, 'base64url')

  if (iv.length !== IV_LENGTH_BYTES || tag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error('Corrupted encryption envelope parameters')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES })
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * SSRF Protection Validator.
 * Validates URLs against private RFC 1918 addresses, loopback, AWS/GCP metadata endpoints, and non-HTTPS protocols.
 */
export function validateOutboundUrl(
  urlStr: string,
  options: { allowHttpInDev?: boolean } = {},
): { isValid: boolean; reason?: string } {
  if (!urlStr || typeof urlStr !== 'string') {
    return { isValid: false, reason: 'Empty or invalid URL provided' }
  }

  let parsed: URL
  try {
    parsed = new URL(urlStr)
  } catch {
    return { isValid: false, reason: 'Malformed URL' }
  }

  const isLocalDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
  const allowHttp = options.allowHttpInDev && isLocalDev

  // Enforce HTTPS protocol
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    return { isValid: false, reason: `Disallowed protocol: ${parsed.protocol}. HTTPS is required.` }
  }

  // Reject embedded credentials (e.g. https://user:pass@host)
  if (parsed.username || parsed.password) {
    return { isValid: false, reason: 'URLs with embedded credentials are not permitted' }
  }

  const hostname = parsed.hostname.toLowerCase().trim()

  // Loopback check
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  ) {
    if (!allowHttp) {
      return { isValid: false, reason: 'Loopback and localhost destinations are prohibited' }
    }
  }

  // Cloud metadata services check (AWS, GCP, Azure)
  if (
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data'
  ) {
    return { isValid: false, reason: 'Cloud instance metadata endpoints are prohibited' }
  }

  // RFC 1918 Private IP checks
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const [, o1, o2] = ipv4Match.map(Number)
    // 10.0.0.0/8
    if (o1 === 10) return { isValid: false, reason: 'Private 10.0.0.0/8 subnet is prohibited' }
    // 172.16.0.0/12
    if (o1 === 172 && o2 >= 16 && o2 <= 31)
      return { isValid: false, reason: 'Private 172.16.0.0/12 subnet is prohibited' }
    // 192.168.0.0/16
    if (o1 === 192 && o2 === 168)
      return { isValid: false, reason: 'Private 192.168.0.0/16 subnet is prohibited' }
    // 100.64.0.0/10 Carrier-grade NAT
    if (o1 === 100 && o2 >= 64 && o2 <= 127)
      return { isValid: false, reason: 'Carrier-grade NAT subnet is prohibited' }
    // 169.254.0.0/16 Link-local
    if (o1 === 169 && o2 === 254)
      return { isValid: false, reason: 'Link-local 169.254.0.0/16 subnet is prohibited' }
  }

  // IPv6 Private & Special Addresses
  if (
    hostname.startsWith('fc') ||
    hostname.startsWith('fd') || // Unique Local Addresses (ULA)
    hostname.startsWith('fe80') // Link-Local
  ) {
    return { isValid: false, reason: 'Private IPv6 addresses are prohibited' }
  }

  return { isValid: true }
}

/**
 * Sanitizes sensitive fields, authorization headers, tokens, and credentials from log messages or objects.
 */
export function sanitizeSocialLog(input: unknown): string {
  if (input === null || input === undefined) return String(input)

  let text = typeof input === 'string' ? input : JSON.stringify(input)

  // Mask Bearer tokens
  text = text.replace(/Bearer\s+([A-Za-z0-9\-._~+/]+=*)/gi, 'Bearer [REDACTED]')

  // Mask authorization headers in JSON or text
  text = text.replace(/(["']?authorization["']?\s*:\s*["'])[^"']+([^"'])/gi, '$1[REDACTED]$2')

  // Mask sensitive key-value pairs
  const sensitivePatterns = [
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'client_secret',
    'clientSecret',
    'appPassword',
    'app_password',
    'password',
    'secret',
    'token',
    'api_key',
    'apiKey',
    'privateKey',
  ]

  for (const key of sensitivePatterns) {
    const regex = new RegExp(`(["']?${key}["']?\\s*[:=]\\s*["']?)([^"'\\s,}{]+)(["']?)`, 'gi')
    text = text.replace(regex, '$1[REDACTED]$3')
  }

  return text
}

/**
 * Generates an OAuth 2.0 PKCE Code Verifier (cryptographically random string, 43–128 characters).
 */
export function generateCodeVerifier(byteLength = 64): string {
  return randomBytes(byteLength).toString('base64url')
}

/**
 * Generates the SHA-256 base64url-encoded PKCE Code Challenge for a given Code Verifier.
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

/**
 * Generates a tamper-proof, time-bounded OAuth 2.0 state parameter.
 * Format: base64url(payload).base64url(hmacSignature)
 */
export function generateOAuthState(
  metadata: { siteId: string; accountId?: string; network: string; redirectUri?: string },
  explicitSecret?: string,
): string {
  const secret = resolveRequiredSecret(explicitSecret)
  const payload = {
    ...metadata,
    issuedAt: Date.now(),
    nonce: randomBytes(16).toString('hex'),
  }

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(payloadB64).digest('base64url')

  return `${payloadB64}.${signature}`
}

/**
 * Verifies an OAuth 2.0 state parameter.
 * Enforces HMAC integrity and maximum validity window (15 minutes).
 */
export function verifyOAuthState(
  stateToken: string,
  expectedSiteId: string,
  explicitSecret?: string,
  maxAgeMs = 15 * 60 * 1000,
): { isValid: boolean; payload?: Record<string, unknown>; error?: string } {
  if (!stateToken || typeof stateToken !== 'string') {
    return { isValid: false, error: 'State token is missing or invalid' }
  }

  const parts = stateToken.split('.')
  if (parts.length !== 2) {
    return { isValid: false, error: 'Malformed state token format' }
  }

  const [payloadB64, signature] = parts
  const secret = resolveRequiredSecret(explicitSecret)
  const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('base64url')

  // Timing safe equality check
  const sigBuffer = Buffer.from(signature)
  const expectedSigBuffer = Buffer.from(expectedSig)
  if (
    sigBuffer.length !== expectedSigBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    return { isValid: false, error: 'State token signature mismatch' }
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    if (payload.siteId !== expectedSiteId) {
      return { isValid: false, error: 'State token siteId mismatch' }
    }

    if (Date.now() - payload.issuedAt > maxAgeMs) {
      return { isValid: false, error: 'State token has expired' }
    }

    return { isValid: true, payload }
  } catch {
    return { isValid: false, error: 'Failed to decode state payload' }
  }
}
