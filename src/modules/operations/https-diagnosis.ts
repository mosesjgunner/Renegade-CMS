/**
 * UXI-04 — public-reachability / HTTPS diagnosis.
 *
 * Pure evaluation core plus thin, injectable I/O. Given the configured
 * public origin, the host's expected public address(es), and what DNS,
 * TLS, and the reverse proxy actually present, this module returns
 * structured findings: a stable code, a plain-language explanation, the
 * exact record or header observed, the expected value, and the next
 * action. Every failure class is blocking: public HTTPS readiness is
 * `false` while any blocking finding exists, and no code path in this
 * module reports ready on a failed or unverifiable check.
 *
 * All network access (DNS lookup, TLS connect) sits behind the
 * `DnsProbe` / `TlsProbe` interfaces so unit tests drive every failure
 * class from fixtures with no network. The node-backed probes at the
 * bottom are the production wiring; they are never used by tests.
 *
 * Honesty boundary: a passing result proves only what the probes
 * observed from this process at check time. Public proof on a real
 * owner domain/host remains an operator-run step (see UXI-04).
 */

import type { TaskCheckResult } from './task-readiness'

export type HttpsFindingCode =
  | 'ORIGIN_INVALID'
  | 'DNS_LOOKUP_FAILED'
  | 'DNS_NO_RECORD'
  | 'DNS_EXPECTED_ADDRESS_UNKNOWN'
  | 'DNS_ADDRESS_MISMATCH'
  | 'DNS_STALE_IPV6'
  | 'TLS_CERT_EXPIRED'
  | 'TLS_CERT_WRONG_HOST'
  | 'TLS_CERT_SELF_SIGNED'
  | 'TLS_CERT_UNTRUSTED_CHAIN'
  | 'TLS_HANDSHAKE_FAILURE'
  | 'PROXY_FORWARDED_HEADERS_IN_DIRECT_MODE'
  | 'PROXY_FORWARDED_HEADERS_MISSING'
  | 'PROXY_FORWARDED_PROTO_MISMATCH'
  | 'PROXY_FORWARDED_HOST_MISMATCH'
  | 'PROXY_FORWARDED_CHAIN_TOO_LONG'
  | 'LISTENER_PUBLICLY_BOUND'

export type HttpsFinding = {
  code: HttpsFindingCode
  /** Blocking findings keep public HTTPS readiness false. All current codes block. */
  blocking: boolean
  /** Plain-language explanation an operator can act on. Never contains secrets. */
  explanation: string
  /** The exact DNS record, address set, certificate fact, or header observed. */
  observed: string
  /** The exact record, address, or header value that should be observed. */
  expected: string
  nextAction: string
}

export type DnsProbeResult =
  | { ok: true; a: string[]; aaaa: string[] }
  | { ok: false; error: string }

export type DnsProbe = (hostname: string) => Promise<DnsProbeResult>

export type TlsFailureKind =
  | 'expired'
  | 'wrong-host'
  | 'self-signed'
  | 'untrusted-chain'
  | 'handshake-failure'

export type TlsProbeResult = { ok: true } | { ok: false; kind: TlsFailureKind; detail: string }

export type TlsProbe = (hostname: string, port: number) => Promise<TlsProbeResult>

export type ProxyDiagnosisConfig = {
  proxyMode: 'direct' | 'trusted'
  trustedProxyHops: number
}

export type HttpsDiagnosisInput = {
  /** The configured public origin (APP_URL), e.g. https://cms.example.com. */
  publicOrigin: string
  /**
   * The host's public address(es) the hostname must resolve to, supplied
   * by the caller (operator or fixture). Without them DNS correctness
   * cannot be verified and readiness stays false.
   */
  expectedAddresses: readonly string[]
  proxy: ProxyDiagnosisConfig
  /** Forwarded headers as observed at the app for one request, if available. */
  observedHeaders?: Headers | Record<string, string | null | undefined>
  /** The address the app listener is bound to, if known (e.g. 127.0.0.1:3000). */
  listenerBind?: string
}

export type HttpsDiagnosis = {
  ready: boolean
  hostname: string
  publicOrigin: string
  findings: HttpsFinding[]
}

// ---------------------------------------------------------------------------
// Address helpers
// ---------------------------------------------------------------------------

function normalizeAddress(address: string): string {
  return address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
}

function isIpv6(address: string): boolean {
  return normalizeAddress(address).includes(':')
}

function expectedRecords(hostname: string, expectedAddresses: readonly string[]): string {
  if (!expectedAddresses.length) return `an A or AAAA record for ${hostname}`
  return expectedAddresses
    .map((address) => `${hostname} ${isIpv6(address) ? 'AAAA' : 'A'} ${normalizeAddress(address)}`)
    .join('; ')
}

// ---------------------------------------------------------------------------
// DNS evaluation (pure)
// ---------------------------------------------------------------------------

export function evaluateDns(input: {
  hostname: string
  expectedAddresses: readonly string[]
  result: DnsProbeResult
}): HttpsFinding[] {
  const { hostname, expectedAddresses, result } = input
  const expected = expectedRecords(hostname, expectedAddresses)

  if (!result.ok) {
    return [
      {
        code: 'DNS_LOOKUP_FAILED',
        blocking: true,
        explanation: `The hostname ${hostname} could not be looked up at all, so visitors cannot reach this installation.`,
        observed: `DNS lookup error: ${result.error}`,
        expected,
        nextAction: `Check the DNS zone for ${hostname} at your registrar/DNS host, then re-run the HTTPS check.`,
      },
    ]
  }

  const a = result.a.map(normalizeAddress)
  const aaaa = result.aaaa.map(normalizeAddress)
  const observed =
    a.length || aaaa.length
      ? [
          ...a.map((address) => `${hostname} A ${address}`),
          ...aaaa.map((address) => `${hostname} AAAA ${address}`),
        ].join('; ')
      : `no A or AAAA records for ${hostname}`

  if (!a.length && !aaaa.length) {
    return [
      {
        code: 'DNS_NO_RECORD',
        blocking: true,
        explanation: `The hostname ${hostname} has no DNS address records, so it does not point at this host yet.`,
        observed,
        expected,
        nextAction: `Add the expected record at your DNS host: ${expected}.`,
      },
    ]
  }

  if (!expectedAddresses.length) {
    return [
      {
        code: 'DNS_EXPECTED_ADDRESS_UNKNOWN',
        blocking: true,
        explanation:
          'DNS records exist, but no expected destination address was supplied, so there is nothing to verify them against.',
        observed,
        expected: 'the public address(es) of this host, supplied by the operator',
        nextAction:
          "Supply this host's public address (for example from the host provider's panel) and re-run the HTTPS check.",
      },
    ]
  }

  const expectedSet = new Set(expectedAddresses.map(normalizeAddress))
  const aMatches = a.some((address) => expectedSet.has(address))
  const aaaaPresent = aaaa.length > 0
  const aaaaMatches = aaaa.some((address) => expectedSet.has(address))

  // A is right but AAAA points somewhere else: IPv6 visitors are sent to
  // the wrong host even though IPv4 works. Called out separately because
  // the fix is the AAAA record alone.
  if (aMatches && aaaaPresent && !aaaaMatches) {
    return [
      {
        code: 'DNS_STALE_IPV6',
        blocking: true,
        explanation: `The IPv4 (A) record for ${hostname} is correct, but the IPv6 (AAAA) record points at a different address, so IPv6 visitors reach the wrong host.`,
        observed,
        expected,
        nextAction: `Fix the AAAA record to match this host, or remove it: expected ${expected}.`,
      },
    ]
  }

  if (!aMatches && !aaaaMatches) {
    return [
      {
        code: 'DNS_ADDRESS_MISMATCH',
        blocking: true,
        explanation: `The hostname ${hostname} resolves to address(es) that do not include this host, so visitors reach a different machine (or nothing).`,
        observed,
        expected,
        nextAction: `Update the DNS record(s) at your DNS host to: ${expected}. Allow for DNS propagation, then re-run the HTTPS check.`,
      },
    ]
  }

  if (!aMatches && aaaaMatches && !a.length) {
    // Only reachable when A is absent and AAAA carries the expected
    // address: acceptable for an IPv6-only host, nothing to flag.
    return []
  }

  if (!aMatches && a.length > 0) {
    return [
      {
        code: 'DNS_ADDRESS_MISMATCH',
        blocking: true,
        explanation: `The IPv4 (A) record for ${hostname} points at a different address than this host.`,
        observed,
        expected,
        nextAction: `Update the A record at your DNS host to: ${expected}.`,
      },
    ]
  }

  return []
}

// ---------------------------------------------------------------------------
// TLS evaluation (pure)
// ---------------------------------------------------------------------------

const tlsFindingByKind: Record<
  TlsFailureKind,
  { code: HttpsFindingCode; explanation: (hostname: string) => string; nextAction: string }
> = {
  expired: {
    code: 'TLS_CERT_EXPIRED',
    explanation: (hostname) =>
      `The certificate served for ${hostname} has expired, so browsers refuse the connection.`,
    nextAction:
      'Renew the certificate at the reverse proxy (managed Caddy renews automatically once DNS points at this host), then re-run the HTTPS check.',
  },
  'wrong-host': {
    code: 'TLS_CERT_WRONG_HOST',
    explanation: (hostname) =>
      `The certificate served for ${hostname} was issued for a different hostname, so browsers refuse the connection.`,
    nextAction:
      'Issue a certificate that names this exact hostname at the reverse proxy, then re-run the HTTPS check.',
  },
  'self-signed': {
    code: 'TLS_CERT_SELF_SIGNED',
    explanation: (hostname) =>
      `The certificate served for ${hostname} is self-signed, so browsers do not trust it.`,
    nextAction:
      'Replace it with a publicly trusted certificate (the managed Caddy path obtains one automatically once DNS is correct).',
  },
  'untrusted-chain': {
    code: 'TLS_CERT_UNTRUSTED_CHAIN',
    explanation: (hostname) =>
      `The certificate chain served for ${hostname} cannot be verified against a trusted authority (missing intermediate or unknown issuer).`,
    nextAction:
      'Serve the full certificate chain from the reverse proxy, or re-issue the certificate, then re-run the HTTPS check.',
  },
  'handshake-failure': {
    code: 'TLS_HANDSHAKE_FAILURE',
    explanation: (hostname) =>
      `The TLS handshake with ${hostname} failed before a certificate could be validated, so no secure connection is possible.`,
    nextAction:
      'Check that the reverse proxy is listening for TLS on port 443 for this hostname and that no firewall blocks it, then re-run the HTTPS check.',
  },
}

export function evaluateTls(input: { hostname: string; result: TlsProbeResult }): HttpsFinding[] {
  if (input.result.ok) return []
  const template = tlsFindingByKind[input.result.kind]
  return [
    {
      code: template.code,
      blocking: true,
      explanation: template.explanation(input.hostname),
      observed: input.result.detail,
      expected: `a valid, publicly trusted certificate naming ${input.hostname}`,
      nextAction: template.nextAction,
    },
  ]
}

// ---------------------------------------------------------------------------
// Proxy / forwarded-header evaluation (pure, fixture-testable)
// ---------------------------------------------------------------------------

function headerValue(
  headers: Headers | Record<string, string | null | undefined>,
  name: string,
): string | null {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.get(name)
  }
  const record = headers as Record<string, string | null | undefined>
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === name) return record[key] ?? null
  }
  return null
}

/**
 * Verify the proxy story from headers observed at the app.
 *
 * Trusted mode contract (docs/operations/reverse-proxy.md): the proxy
 * overwrites X-Forwarded-For / -Host / -Proto from connection facts and
 * TRUSTED_PROXY_HOPS is the exact controlled hop count. A longer
 * X-Forwarded-For chain than the declared hops means entries arrived
 * from beyond the controlled proxy — spoofed or appended by an
 * untrusted hop. A forwarded host/proto contradicting the configured
 * origin means the proxy is not overwriting, or something else is in
 * the path. In direct mode no proxy is declared, so any forwarded
 * header present is suspicious by definition.
 */
export function evaluateProxyHeaders(input: {
  publicOrigin: string
  proxy: ProxyDiagnosisConfig
  headers: Headers | Record<string, string | null | undefined>
}): HttpsFinding[] {
  const findings: HttpsFinding[] = []
  const forwardedFor = headerValue(input.headers, 'x-forwarded-for')
  const forwardedHost = headerValue(input.headers, 'x-forwarded-host')
  const forwardedProto = headerValue(input.headers, 'x-forwarded-proto')
  const present = [
    forwardedFor !== null ? `x-forwarded-for: ${forwardedFor}` : null,
    forwardedHost !== null ? `x-forwarded-host: ${forwardedHost}` : null,
    forwardedProto !== null ? `x-forwarded-proto: ${forwardedProto}` : null,
  ].filter(Boolean) as string[]

  if (input.proxy.proxyMode === 'direct') {
    if (present.length) {
      findings.push({
        code: 'PROXY_FORWARDED_HEADERS_IN_DIRECT_MODE',
        blocking: true,
        explanation:
          'This installation is configured for direct mode (no trusted proxy), but forwarded headers arrived at the app. Anything in front of the app can spoof them, so they cannot be trusted.',
        observed: present.join('; '),
        expected:
          'no x-forwarded-for, x-forwarded-host, or x-forwarded-proto headers in direct mode',
        nextAction:
          'Either remove the proxy in front of the app, or switch to PROXY_MODE=trusted with the proxy overwriting forwarded headers and TRUSTED_PROXY_HOPS set to its hop count.',
      })
    }
    return findings
  }

  let origin: URL
  try {
    origin = new URL(input.publicOrigin)
  } catch {
    return findings
  }
  const expectedHost = origin.port ? `${origin.hostname}:${origin.port}` : origin.hostname

  if (forwardedHost === null || forwardedProto === null) {
    const missing = [
      forwardedHost === null ? 'x-forwarded-host' : null,
      forwardedProto === null ? 'x-forwarded-proto' : null,
    ].filter(Boolean) as string[]
    findings.push({
      code: 'PROXY_FORWARDED_HEADERS_MISSING',
      blocking: true,
      explanation:
        'Trusted proxy mode is configured, but the request reached the app without the forwarded headers the proxy is required to set. Either the proxy is not in the path or it is not overwriting forwarded headers.',
      observed: present.length ? present.join('; ') : 'no forwarded headers observed',
      expected: `x-forwarded-host: ${expectedHost}; x-forwarded-proto: https`,
      nextAction: `Configure the reverse proxy to overwrite ${missing.join(' and ')} from connection facts on every request (see docs/operations/reverse-proxy.md).`,
    })
    return findings
  }

  if (forwardedProto.trim().toLowerCase() !== 'https') {
    findings.push({
      code: 'PROXY_FORWARDED_PROTO_MISMATCH',
      blocking: true,
      explanation: `The proxy reports the public scheme as "${forwardedProto}" but the configured public origin is HTTPS. The proxy is not overwriting forwarded headers, or plain HTTP traffic is reaching it.`,
      observed: `x-forwarded-proto: ${forwardedProto}`,
      expected: 'x-forwarded-proto: https',
      nextAction:
        'Terminate TLS at the proxy, redirect HTTP to HTTPS, and have the proxy overwrite x-forwarded-proto from the actual connection scheme.',
    })
  }

  if (forwardedHost.trim().toLowerCase() !== expectedHost.toLowerCase()) {
    findings.push({
      code: 'PROXY_FORWARDED_HOST_MISMATCH',
      blocking: true,
      explanation: `The proxy reports a public host of "${forwardedHost}" but the configured public origin is ${origin.origin}. The proxy is preserving a client-supplied host or proxying a different name than the one configured.`,
      observed: `x-forwarded-host: ${forwardedHost}`,
      expected: `x-forwarded-host: ${expectedHost}`,
      nextAction:
        'Have the proxy overwrite x-forwarded-host with the configured public host and proxy only that hostname to Renegade.',
    })
  }

  if (forwardedFor !== null) {
    const chain = forwardedFor
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    if (chain.length > input.proxy.trustedProxyHops) {
      findings.push({
        code: 'PROXY_FORWARDED_CHAIN_TOO_LONG',
        blocking: true,
        explanation: `The forwarded-for chain has ${chain.length} entries but only ${input.proxy.trustedProxyHops} controlled proxy hop(s) are declared. The extra entries came from beyond the controlled proxy — a client spoofing the header or an undeclared proxy in the path.`,
        observed: `x-forwarded-for: ${forwardedFor}`,
        expected: `at most ${input.proxy.trustedProxyHops} x-forwarded-for entr${input.proxy.trustedProxyHops === 1 ? 'y' : 'ies'} (TRUSTED_PROXY_HOPS=${input.proxy.trustedProxyHops})`,
        nextAction:
          'Have the controlled proxy replace (not append to) x-forwarded-for, or correct TRUSTED_PROXY_HOPS if another controlled proxy really is in the path.',
      })
    }
  }

  return findings
}

/** The app listener must stay on loopback; a public bind defeats the proxy boundary. */
export function evaluateListenerBind(listenerBind: string): HttpsFinding[] {
  const host = listenerBind
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '')
  if (host === '127.0.0.1' || host === '::1' || host === 'localhost') return []
  return [
    {
      code: 'LISTENER_PUBLICLY_BOUND',
      blocking: true,
      explanation:
        'The application listener is bound to a non-loopback address, so it can be reached directly from the network, bypassing the reverse proxy and its forwarded-header overwriting.',
      observed: `listener bind: ${listenerBind}`,
      expected: 'listener bind: 127.0.0.1:3000 (loopback only)',
      nextAction:
        'Set RENEGADE_WEB_BIND to a loopback address (127.0.0.1:3000) and let only the reverse proxy reach it.',
    },
  ]
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export function isHttpsReady(findings: readonly HttpsFinding[]): boolean {
  return findings.every((finding) => !finding.blocking)
}

export async function diagnoseHttps(
  input: HttpsDiagnosisInput,
  deps: { dnsProbe: DnsProbe; tlsProbe: TlsProbe },
): Promise<HttpsDiagnosis> {
  let origin: URL
  try {
    origin = new URL(input.publicOrigin)
    if (origin.protocol !== 'https:') throw new Error('not https')
  } catch {
    return {
      ready: false,
      hostname: '',
      publicOrigin: input.publicOrigin,
      findings: [
        {
          code: 'ORIGIN_INVALID',
          blocking: true,
          explanation:
            'The configured public origin is not a valid HTTPS origin, so no public HTTPS check can run.',
          observed: `APP_URL: ${input.publicOrigin}`,
          expected: 'APP_URL: https://<public-hostname> (HTTPS origin, no path)',
          nextAction:
            'Fix APP_URL in .env.production to the public HTTPS origin, then re-run the HTTPS check.',
        },
      ],
    }
  }

  const hostname = origin.hostname
  const port = origin.port ? Number(origin.port) : 443
  const findings: HttpsFinding[] = []

  const dnsResult = await deps.dnsProbe(hostname)
  findings.push(
    ...evaluateDns({ hostname, expectedAddresses: input.expectedAddresses, result: dnsResult }),
  )

  // A TLS probe against a hostname that does not resolve to this host
  // would grade someone else's certificate; only probe when DNS is not
  // already blocking on lookup/record grounds. A stale-AAAA finding
  // still probes: the A record reaches this host.
  const dnsBlocksProbe = findings.some(
    (finding) =>
      finding.code === 'DNS_LOOKUP_FAILED' ||
      finding.code === 'DNS_NO_RECORD' ||
      finding.code === 'DNS_ADDRESS_MISMATCH',
  )
  if (!dnsBlocksProbe) {
    const tlsResult = await deps.tlsProbe(hostname, port)
    findings.push(...evaluateTls({ hostname, result: tlsResult }))
  }

  if (input.observedHeaders) {
    findings.push(
      ...evaluateProxyHeaders({
        publicOrigin: input.publicOrigin,
        proxy: input.proxy,
        headers: input.observedHeaders,
      }),
    )
  }
  if (input.listenerBind) {
    findings.push(...evaluateListenerBind(input.listenerBind))
  }

  return { ready: isHttpsReady(findings), hostname, publicOrigin: origin.origin, findings }
}

/** Express a diagnosis as a task-readiness check for the `setup.https` task. */
export function httpsDiagnosisToTaskCheck(
  diagnosis: HttpsDiagnosis,
  checkedAt: string,
): TaskCheckResult {
  if (diagnosis.ready) {
    return {
      taskId: 'setup.https',
      outcome: 'pass',
      reason: `Public HTTPS verified for ${diagnosis.hostname}: DNS, certificate, and proxy checks passed.`,
      checkedAt,
      diagnostics: { hostname: diagnosis.hostname, findings: 0 },
    }
  }
  const first = diagnosis.findings.find((finding) => finding.blocking) ?? diagnosis.findings[0]
  return {
    taskId: 'setup.https',
    outcome: 'fail',
    reason: first
      ? `${first.explanation} Next: ${first.nextAction}`
      : 'Public HTTPS checks did not pass.',
    checkedAt,
    diagnostics: {
      hostname: diagnosis.hostname,
      findings: diagnosis.findings.length,
      codes: diagnosis.findings.map((finding) => finding.code).join(', '),
    },
  }
}

// ---------------------------------------------------------------------------
// Thin node I/O (production wiring; tests inject fixtures instead)
// ---------------------------------------------------------------------------

export function createNodeDnsProbe(): DnsProbe {
  return async (hostname) => {
    try {
      const dns = await import('node:dns/promises')
      const [a, aaaa] = await Promise.all([
        dns.resolve4(hostname).catch(() => [] as string[]),
        dns.resolve6(hostname).catch(() => [] as string[]),
      ])
      if (!a.length && !aaaa.length) {
        // Distinguish "resolver failed" from "no records" where we can:
        // a lookup that throws ENOTFOUND/ENODATA surfaces as no records
        // here, which evaluateDns reports as DNS_NO_RECORD — accurate
        // enough for the operator action it prescribes.
        try {
          await dns.lookup(hostname)
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
      }
      return { ok: true, a, aaaa }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

export function createNodeTlsProbe(): TlsProbe {
  return async (hostname, port) =>
    new Promise((resolve) => {
      void (async () => {
        try {
          const tls = await import('node:tls')
          const socket = tls.connect(
            { host: hostname, port, servername: hostname, timeout: 10_000 },
            () => {
              socket.end()
              resolve({ ok: true })
            },
          )
          socket.on('error', (error: NodeJS.ErrnoException) => {
            const code = error.code ?? ''
            const detail = `${code ? `${code}: ` : ''}${error.message}`
            if (code === 'CERT_HAS_EXPIRED') resolve({ ok: false, kind: 'expired', detail })
            else if (code === 'ERR_TLS_CERT_ALTNAME_INVALID')
              resolve({ ok: false, kind: 'wrong-host', detail })
            else if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN')
              resolve({ ok: false, kind: 'self-signed', detail })
            else if (
              code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
              code === 'UNABLE_TO_GET_ISSUER_CERT' ||
              code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'
            )
              resolve({ ok: false, kind: 'untrusted-chain', detail })
            else resolve({ ok: false, kind: 'handshake-failure', detail })
          })
          socket.on('timeout', () => {
            socket.destroy()
            resolve({
              ok: false,
              kind: 'handshake-failure',
              detail: `TLS connection to ${hostname}:${port} timed out`,
            })
          })
        } catch (error) {
          resolve({
            ok: false,
            kind: 'handshake-failure',
            detail: error instanceof Error ? error.message : String(error),
          })
        }
      })()
    })
}
