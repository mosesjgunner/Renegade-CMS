import { describe, expect, it } from 'vitest'

import {
  diagnoseHttps,
  evaluateDns,
  evaluateListenerBind,
  evaluateProxyHeaders,
  evaluateTls,
  httpsDiagnosisToTaskCheck,
  isHttpsReady,
  type DnsProbe,
  type TlsProbe,
} from '../../src/modules/operations/https-diagnosis'
import {
  evaluateTaskReadiness,
  getTaskDefinition,
} from '../../src/modules/operations/task-readiness'

const HOST = 'cms.example.test'
const ORIGIN = `https://${HOST}`
const HOST_ADDRESSES = ['203.0.113.10', '2001:db8::10']

const dnsOk: DnsProbe = async () => ({ ok: true, a: ['203.0.113.10'], aaaa: ['2001:db8::10'] })
const tlsOk: TlsProbe = async () => ({ ok: true })
const trusted = { proxyMode: 'trusted' as const, trustedProxyHops: 1 }
const direct = { proxyMode: 'direct' as const, trustedProxyHops: 1 }
const goodHeaders = {
  'x-forwarded-for': '198.51.100.7',
  'x-forwarded-host': HOST,
  'x-forwarded-proto': 'https',
}

describe('DNS evaluation', () => {
  it('passes when A and AAAA both resolve to the expected addresses', () => {
    expect(
      evaluateDns({
        hostname: HOST,
        expectedAddresses: HOST_ADDRESSES,
        result: { ok: true, a: ['203.0.113.10'], aaaa: ['2001:db8::10'] },
      }),
    ).toEqual([])
  })

  it('flags a lookup failure with the exact expected record', () => {
    const findings = evaluateDns({
      hostname: HOST,
      expectedAddresses: HOST_ADDRESSES,
      result: { ok: false, error: 'getaddrinfo ENOTFOUND cms.example.test' },
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('DNS_LOOKUP_FAILED')
    expect(findings[0].blocking).toBe(true)
    expect(findings[0].expected).toContain(`${HOST} A 203.0.113.10`)
    expect(findings[0].expected).toContain(`${HOST} AAAA 2001:db8::10`)
  })

  it('flags missing records as DNS_NO_RECORD', () => {
    const findings = evaluateDns({
      hostname: HOST,
      expectedAddresses: HOST_ADDRESSES,
      result: { ok: true, a: [], aaaa: [] },
    })
    expect(findings[0].code).toBe('DNS_NO_RECORD')
    expect(findings[0].observed).toContain('no A or AAAA records')
  })

  it('flags an address mismatch with observed and expected records', () => {
    const findings = evaluateDns({
      hostname: HOST,
      expectedAddresses: HOST_ADDRESSES,
      result: { ok: true, a: ['192.0.2.99'], aaaa: [] },
    })
    expect(findings[0].code).toBe('DNS_ADDRESS_MISMATCH')
    expect(findings[0].observed).toContain(`${HOST} A 192.0.2.99`)
    expect(findings[0].expected).toContain(`${HOST} A 203.0.113.10`)
  })

  it('calls out stale IPv6 separately when A is right but AAAA is wrong', () => {
    const findings = evaluateDns({
      hostname: HOST,
      expectedAddresses: HOST_ADDRESSES,
      result: { ok: true, a: ['203.0.113.10'], aaaa: ['2001:db8::dead'] },
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('DNS_STALE_IPV6')
    expect(findings[0].observed).toContain('AAAA 2001:db8::dead')
    expect(findings[0].explanation).toContain('IPv6')
  })

  it('refuses to verify DNS when no expected destination was supplied', () => {
    const findings = evaluateDns({
      hostname: HOST,
      expectedAddresses: [],
      result: { ok: true, a: ['203.0.113.10'], aaaa: [] },
    })
    expect(findings[0].code).toBe('DNS_EXPECTED_ADDRESS_UNKNOWN')
    expect(findings[0].blocking).toBe(true)
  })

  it('accepts an IPv6-only host whose AAAA matches', () => {
    expect(
      evaluateDns({
        hostname: HOST,
        expectedAddresses: HOST_ADDRESSES,
        result: { ok: true, a: [], aaaa: ['2001:db8::10'] },
      }),
    ).toEqual([])
  })
})

describe('TLS evaluation', () => {
  it('passes a valid probe result', () => {
    expect(evaluateTls({ hostname: HOST, result: { ok: true } })).toEqual([])
  })

  it.each([
    ['expired', 'TLS_CERT_EXPIRED'],
    ['wrong-host', 'TLS_CERT_WRONG_HOST'],
    ['self-signed', 'TLS_CERT_SELF_SIGNED'],
    ['untrusted-chain', 'TLS_CERT_UNTRUSTED_CHAIN'],
    ['handshake-failure', 'TLS_HANDSHAKE_FAILURE'],
  ] as const)('classifies %s failures as %s, blocking', (kind, code) => {
    const findings = evaluateTls({
      hostname: HOST,
      result: { ok: false, kind, detail: `fixture ${kind}` },
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe(code)
    expect(findings[0].blocking).toBe(true)
    expect(findings[0].observed).toBe(`fixture ${kind}`)
    expect(findings[0].expected).toContain(HOST)
  })
})

describe('proxy header evaluation', () => {
  it('passes a well-behaved trusted proxy', () => {
    expect(
      evaluateProxyHeaders({ publicOrigin: ORIGIN, proxy: trusted, headers: goodHeaders }),
    ).toEqual([])
    expect(
      evaluateProxyHeaders({
        publicOrigin: ORIGIN,
        proxy: trusted,
        headers: new Headers(goodHeaders),
      }),
    ).toEqual([])
  })

  it('flags forwarded headers in direct mode as suspicious', () => {
    const findings = evaluateProxyHeaders({
      publicOrigin: ORIGIN,
      proxy: direct,
      headers: { 'x-forwarded-for': '198.51.100.7' },
    })
    expect(findings[0].code).toBe('PROXY_FORWARDED_HEADERS_IN_DIRECT_MODE')
    expect(findings[0].blocking).toBe(true)
    expect(findings[0].observed).toContain('x-forwarded-for: 198.51.100.7')
  })

  it('passes direct mode with no forwarded headers', () => {
    expect(evaluateProxyHeaders({ publicOrigin: ORIGIN, proxy: direct, headers: {} })).toEqual([])
  })

  it('flags a forwarded-for chain longer than the declared trusted hops', () => {
    const findings = evaluateProxyHeaders({
      publicOrigin: ORIGIN,
      proxy: trusted,
      headers: { ...goodHeaders, 'x-forwarded-for': '203.0.113.1, 198.51.100.7, 10.0.0.2' },
    })
    expect(findings.map((finding) => finding.code)).toContain('PROXY_FORWARDED_CHAIN_TOO_LONG')
    const finding = findings.find((entry) => entry.code === 'PROXY_FORWARDED_CHAIN_TOO_LONG')!
    expect(finding.observed).toContain('203.0.113.1')
    expect(finding.expected).toContain('TRUSTED_PROXY_HOPS=1')
  })

  it('accepts a chain that matches a multi-hop declaration', () => {
    expect(
      evaluateProxyHeaders({
        publicOrigin: ORIGIN,
        proxy: { proxyMode: 'trusted', trustedProxyHops: 2 },
        headers: { ...goodHeaders, 'x-forwarded-for': '198.51.100.7, 10.0.0.2' },
      }),
    ).toEqual([])
  })

  it('flags a forwarded host that contradicts the configured origin', () => {
    const findings = evaluateProxyHeaders({
      publicOrigin: ORIGIN,
      proxy: trusted,
      headers: { ...goodHeaders, 'x-forwarded-host': 'evil.example.test' },
    })
    expect(findings.map((finding) => finding.code)).toContain('PROXY_FORWARDED_HOST_MISMATCH')
    const finding = findings.find((entry) => entry.code === 'PROXY_FORWARDED_HOST_MISMATCH')!
    expect(finding.observed).toContain('evil.example.test')
    expect(finding.expected).toContain(HOST)
  })

  it('flags a forwarded proto that contradicts the HTTPS origin', () => {
    const findings = evaluateProxyHeaders({
      publicOrigin: ORIGIN,
      proxy: trusted,
      headers: { ...goodHeaders, 'x-forwarded-proto': 'http' },
    })
    expect(findings.map((finding) => finding.code)).toContain('PROXY_FORWARDED_PROTO_MISMATCH')
  })

  it('flags missing forwarded headers in trusted mode', () => {
    const findings = evaluateProxyHeaders({
      publicOrigin: ORIGIN,
      proxy: trusted,
      headers: { 'x-forwarded-for': '198.51.100.7' },
    })
    expect(findings[0].code).toBe('PROXY_FORWARDED_HEADERS_MISSING')
    expect(findings[0].expected).toContain(`x-forwarded-host: ${HOST}`)
  })

  it('flags a publicly bound app listener and accepts loopback', () => {
    expect(evaluateListenerBind('127.0.0.1:3000')).toEqual([])
    expect(evaluateListenerBind('[::1]:3000')).toEqual([])
    const findings = evaluateListenerBind('0.0.0.0:3000')
    expect(findings[0].code).toBe('LISTENER_PUBLICLY_BOUND')
    expect(findings[0].blocking).toBe(true)
  })
})

describe('diagnoseHttps orchestration (fixture probes)', () => {
  const base = {
    publicOrigin: ORIGIN,
    expectedAddresses: HOST_ADDRESSES,
    proxy: trusted,
    observedHeaders: goodHeaders,
    listenerBind: '127.0.0.1:3000',
  }

  it('reports ready only when DNS, TLS, proxy, and listener all pass', async () => {
    const diagnosis = await diagnoseHttps(base, { dnsProbe: dnsOk, tlsProbe: tlsOk })
    expect(diagnosis.ready).toBe(true)
    expect(diagnosis.findings).toEqual([])
    expect(isHttpsReady(diagnosis.findings)).toBe(true)
  })

  it('never reports ready on a DNS mismatch, and skips the TLS probe for a foreign host', async () => {
    let tlsProbed = false
    const diagnosis = await diagnoseHttps(base, {
      dnsProbe: async () => ({ ok: true, a: ['192.0.2.99'], aaaa: [] }),
      tlsProbe: async () => {
        tlsProbed = true
        return { ok: true }
      },
    })
    expect(diagnosis.ready).toBe(false)
    expect(diagnosis.findings.map((finding) => finding.code)).toContain('DNS_ADDRESS_MISMATCH')
    expect(tlsProbed).toBe(false)
  })

  it('still probes TLS when only the AAAA record is stale', async () => {
    const diagnosis = await diagnoseHttps(base, {
      dnsProbe: async () => ({ ok: true, a: ['203.0.113.10'], aaaa: ['2001:db8::dead'] }),
      tlsProbe: async () => ({ ok: false, kind: 'expired', detail: 'CERT_HAS_EXPIRED fixture' }),
    })
    expect(diagnosis.ready).toBe(false)
    expect(diagnosis.findings.map((finding) => finding.code)).toEqual([
      'DNS_STALE_IPV6',
      'TLS_CERT_EXPIRED',
    ])
  })

  it('never reports ready on a certificate failure', async () => {
    const diagnosis = await diagnoseHttps(base, {
      dnsProbe: dnsOk,
      tlsProbe: async () => ({
        ok: false,
        kind: 'self-signed',
        detail: 'DEPTH_ZERO_SELF_SIGNED_CERT fixture',
      }),
    })
    expect(diagnosis.ready).toBe(false)
    expect(diagnosis.findings[0].code).toBe('TLS_CERT_SELF_SIGNED')
  })

  it('never reports ready when the proxy spoofs headers', async () => {
    const diagnosis = await diagnoseHttps(
      { ...base, observedHeaders: { ...goodHeaders, 'x-forwarded-host': 'evil.example.test' } },
      { dnsProbe: dnsOk, tlsProbe: tlsOk },
    )
    expect(diagnosis.ready).toBe(false)
    expect(diagnosis.findings.map((finding) => finding.code)).toContain(
      'PROXY_FORWARDED_HOST_MISMATCH',
    )
  })

  it('rejects a non-HTTPS configured origin without probing', async () => {
    const diagnosis = await diagnoseHttps(
      { ...base, publicOrigin: 'http://cms.example.test' },
      { dnsProbe: dnsOk, tlsProbe: tlsOk },
    )
    expect(diagnosis.ready).toBe(false)
    expect(diagnosis.findings[0].code).toBe('ORIGIN_INVALID')
  })
})

describe('task-readiness expression', () => {
  it('registers setup.https behind setup.installation', () => {
    const definition = getTaskDefinition('setup.https')
    expect(definition).toBeDefined()
    expect(definition?.prerequisites).toEqual(['setup.installation'])
    expect(definition?.evidenceType).toBe('live-check')
  })

  it('maps a ready diagnosis to a passing check and a failed one to a failing check', async () => {
    const ready = await diagnoseHttps(
      {
        publicOrigin: ORIGIN,
        expectedAddresses: HOST_ADDRESSES,
        proxy: trusted,
        observedHeaders: goodHeaders,
      },
      { dnsProbe: dnsOk, tlsProbe: tlsOk },
    )
    const passCheck = httpsDiagnosisToTaskCheck(ready, '2026-11-19T12:00:00.000Z')
    expect(passCheck).toMatchObject({ taskId: 'setup.https', outcome: 'pass' })

    const failed = await diagnoseHttps(
      {
        publicOrigin: ORIGIN,
        expectedAddresses: HOST_ADDRESSES,
        proxy: trusted,
      },
      {
        dnsProbe: async () => ({ ok: true, a: [], aaaa: [] }),
        tlsProbe: tlsOk,
      },
    )
    const failCheck = httpsDiagnosisToTaskCheck(failed, '2026-11-19T12:00:00.000Z')
    expect(failCheck.outcome).toBe('fail')
    expect(failCheck.reason).toContain('no DNS address records')
    expect(failCheck.diagnostics?.codes).toContain('DNS_NO_RECORD')

    const definition = getTaskDefinition('setup.https')!
    const [task] = evaluateTaskReadiness(
      [
        {
          id: 'setup.installation',
          label: 'Owner enrollment & site provisioning',
          siteScope: 'installation',
          permission: 'owner',
          prerequisites: [],
          evidenceType: 'live-check',
          nextAction: { label: 'Finish setup' },
        },
        definition,
      ],
      [{ taskId: 'setup.installation', outcome: 'pass' }, failCheck],
      new Date('2026-11-19T12:00:00.000Z'),
    ).filter((entry) => entry.taskId === 'setup.https')
    expect(task.state).toBe('failed')
  })
})
