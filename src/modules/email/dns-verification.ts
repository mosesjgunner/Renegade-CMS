/**
 * RC3-EMAIL-01 / EMAIL-04: real public-DNS verification for sender domains.
 *
 * Replaces the command center's hardcoded `spfVerified/dkimVerified/
 * dmarcVerified: false` lights. Every result names what was observed and
 * exactly what is missing or invalid — never a bare boolean. The resolver is
 * injectable so the logic is unit-testable without network access.
 */
import { promises as dns } from 'node:dns'

export type DnsResolver = {
  resolveTxt(hostname: string): Promise<string[][]>
  resolveCname(hostname: string): Promise<string[]>
}

const systemResolver: DnsResolver = {
  resolveTxt: (hostname) => dns.resolveTxt(hostname),
  resolveCname: (hostname) => dns.resolveCname(hostname),
}

export type AuthCheckStatus = 'verified' | 'failed' | 'unobserved'

export type SenderDnsReport = {
  domain: string
  spf: { status: AuthCheckStatus; detail: string; record?: string }
  dkim: { status: AuthCheckStatus; detail: string; selector?: string }
  dmarc: {
    status: AuthCheckStatus
    detail: string
    policy?: string
    aligned: boolean | null
  }
  returnPath: { status: AuthCheckStatus; detail: string; target?: string }
  checkedAt: string
}

function domainOf(addressOrDomain: string): string {
  const value = addressOrDomain.trim().toLowerCase()
  const emailMatch = value.match(/<([^>]+)>/) ?? (value.includes('@') ? [null, value] : null)
  const host = emailMatch?.[1] ?? value
  return host.includes('@') ? host.split('@').pop()! : host
}

function organizationalDomain(domain: string): string {
  const parts = domain.split('.').filter(Boolean)
  return parts.length <= 2 ? domain : parts.slice(-2).join('.')
}

function aligns(identityDomain: string, fromDomain: string, strict: boolean): boolean {
  if (strict) return identityDomain === fromDomain
  return organizationalDomain(identityDomain) === organizationalDomain(fromDomain)
}

async function txtRecords(resolver: DnsResolver, hostname: string): Promise<string[]> {
  try {
    const records = await resolver.resolveTxt(hostname)
    return records.map((chunks) => chunks.join(''))
  } catch {
    return []
  }
}

/** Count DNS lookups an SPF record would consume (RFC 7208 sanity bound: 10). */
export function spfLookupCount(record: string): number {
  const mechanisms = record.match(/\b(include:|a\b|mx\b|ptr\b|exists:|redirect=)/g)
  return mechanisms ? mechanisms.length : 0
}

export async function verifySenderDns(
  input: {
    /** From address or bare sending domain. */
    from: string
    /** DKIM selector expected for this sender, when the provider issued one. */
    dkimSelector?: string
    /** Hostname used as envelope Return-Path (e.g. bounce.<domain>). */
    returnPathHost?: string
  },
  resolver: DnsResolver = systemResolver,
): Promise<SenderDnsReport> {
  const domain = domainOf(input.from)
  const checkedAt = new Date().toISOString()

  // --- SPF: exactly one v=spf1 policy on the Return-Path host (the envelope
  // sender domain), falling back to the From domain when no RP host is known.
  const spfHost = input.returnPathHost ?? domain
  const spfRecords = (await txtRecords(resolver, spfHost)).filter((r) =>
    r.toLowerCase().startsWith('v=spf1'),
  )
  const spf =
    spfRecords.length === 0
      ? {
          status: 'failed' as const,
          detail: `No SPF policy (v=spf1 TXT) found at ${spfHost}. Publish the provider-issued SPF record there.`,
        }
      : spfRecords.length > 1
        ? {
            status: 'failed' as const,
            detail: `${spfRecords.length} SPF policies at ${spfHost}; exactly one is allowed — merge them into a single v=spf1 record.`,
            record: spfRecords[0],
          }
        : spfLookupCount(spfRecords[0]) > 10
          ? {
              status: 'failed' as const,
              detail: `SPF policy at ${spfHost} exceeds the 10-lookup limit (${spfLookupCount(spfRecords[0])} lookups) and will fail validation.`,
              record: spfRecords[0],
            }
          : {
              status: 'verified' as const,
              detail: `Single SPF policy present at ${spfHost}.`,
              record: spfRecords[0],
            }

  // --- Return-Path delegation (Postmark-style CNAME), when an RP host is set.
  let returnPath: SenderDnsReport['returnPath'] = {
    status: 'unobserved',
    detail: 'No Return-Path host configured to check.',
  }
  if (input.returnPathHost) {
    try {
      const cnames = await resolver.resolveCname(input.returnPathHost)
      returnPath = cnames.length
        ? {
            status: 'verified',
            detail: `${input.returnPathHost} delegates to ${cnames[0]}.`,
            target: cnames[0],
          }
        : {
            status: 'failed',
            detail: `No CNAME at ${input.returnPathHost}. Add the provider-issued Return-Path CNAME; do not add a TXT record beside it.`,
          }
    } catch {
      returnPath = {
        status: 'failed',
        detail: `No CNAME at ${input.returnPathHost}. Add the provider-issued Return-Path CNAME.`,
      }
    }
  }

  // --- DKIM: selector TXT carrying a public key.
  let dkim: SenderDnsReport['dkim'] = {
    status: 'unobserved',
    detail: 'No DKIM selector configured for this sender; provider verification state only.',
  }
  if (input.dkimSelector) {
    const host = `${input.dkimSelector}._domainkey.${domain}`
    const records = await txtRecords(resolver, host)
    const keyRecord = records.find(
      (r) => /(^|;)\s*p=/.test(r) || r.toLowerCase().includes('v=dkim1'),
    )
    dkim = keyRecord
      ? {
          status: 'verified',
          detail: `DKIM key published at ${host}.`,
          selector: input.dkimSelector,
        }
      : {
          status: 'failed',
          detail: `No DKIM public key at ${host}. Publish the exact provider-issued selector record for ${domain}.`,
          selector: input.dkimSelector,
        }
  }

  // --- DMARC: policy at _dmarc.<org domain>, alignment against From domain.
  const orgDomain = organizationalDomain(domain)
  const dmarcRecords = (await txtRecords(resolver, `_dmarc.${orgDomain}`)).filter((r) =>
    r.toLowerCase().startsWith('v=dmarc1'),
  )
  let dmarc: SenderDnsReport['dmarc']
  if (!dmarcRecords.length) {
    dmarc = {
      status: 'failed',
      detail: `No DMARC policy at _dmarc.${orgDomain}. Publish at least "v=DMARC1; p=none" with a reporting address.`,
      aligned: null,
    }
  } else {
    const record = dmarcRecords[0]
    const policy = /;\s*p=(none|quarantine|reject)/i.exec(record)?.[1]?.toLowerCase()
    const strict = /;\s*adkim=s/i.test(record)
    // DKIM identity is the From domain itself when the provider signs with
    // d=<from domain>; SPF identity is the Return-Path host. Either aligning
    // identity is enough for DMARC to pass.
    const dkimAligned = dkim.status === 'verified' ? aligns(domain, domain, strict) : false
    const spfAligned =
      spf.status === 'verified' ? aligns(spfHost, domain, /;\s*aspf=s/i.test(record)) : false
    dmarc = {
      status: policy ? 'verified' : 'failed',
      detail: policy
        ? `DMARC p=${policy} at _dmarc.${orgDomain}; alignment via ${dkimAligned ? 'DKIM' : spfAligned ? 'SPF' : 'neither identity verified yet'}.`
        : `DMARC record at _dmarc.${orgDomain} has no valid p= policy.`,
      ...(policy ? { policy } : {}),
      aligned: dkimAligned || spfAligned,
    }
  }

  return { domain, spf, dkim, dmarc, returnPath, checkedAt }
}
