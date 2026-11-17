import { classifyConnectionReference } from './provider-runtime'
import { encryptSecret } from './security'

/**
 * SOC-SEC-1 (Red F-3) maintenance scan: finds `social-accounts` rows whose
 * stored `connectionReference` is plaintext credential JSON (the legacy
 * unencrypted-at-rest path) and remediates them.
 *
 * - A plaintext row that parses as a credential object is re-encrypted
 *   into the standard `enc:` envelope, preserving the account.
 * - A plaintext row that does not parse is invalidated: the reference is
 *   wiped, health set to `expired`, capability `unavailable`, and the row
 *   is marked `reconnectRequired` in diagnostics (the Command Center
 *   renders any non-healthy account as reconnect-required). Plaintext is
 *   never silently kept.
 * - Envelope and named-reference rows are valid and untouched.
 *
 * Idempotent and dry-runnable (`apply: false` reports only). Each write
 * is a compare-and-swap on the exact reference value that was classified,
 * so a connect landing mid-scan simply makes that row report as
 * `changedDuringScan` instead of being corrupted.
 */

export type SocialCredentialScanReport = {
  dryRun: boolean
  scanned: number
  envelope: number
  namedReference: number
  empty: number
  plaintextFound: number
  reencrypted: number
  invalidated: number
  changedDuringScan: number
}

type PayloadLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  find: (args: any) => Promise<{ docs: any[]; hasNextPage?: boolean }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (args: any) => Promise<{ docs: any[] }>
}

async function remediatePlaintextRow(
  payload: PayloadLike,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: Record<string, any>,
  reference: string,
): Promise<'reencrypted' | 'invalidated' | 'changed'> {
  let parsed: unknown = null
  try {
    parsed = JSON.parse(reference)
  } catch {
    parsed = null
  }
  const at = new Date().toISOString()
  const diagnostics =
    doc.diagnostics && typeof doc.diagnostics === 'object' ? { ...doc.diagnostics } : {}

  let data: Record<string, unknown>
  let action: 'reencrypted' | 'invalidated'
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    data = {
      connectionReference: `enc:${encryptSecret(JSON.stringify(parsed))}`,
      diagnostics: { ...diagnostics, credentialScan: { action: 'reencrypted', at } },
    }
    action = 'reencrypted'
  } else {
    data = {
      connectionReference: null,
      credentialHealth: 'expired',
      capabilityState: 'unavailable',
      diagnostics: {
        ...diagnostics,
        reconnectRequired: true,
        credentialScan: { action: 'invalidated', at },
      },
    }
    action = 'invalidated'
  }

  // Compare-and-swap: the update only lands if the stored reference is
  // still the exact plaintext value classified above.
  const result = await payload.update({
    collection: 'social-accounts',
    where: {
      and: [{ id: { equals: doc.id } }, { connectionReference: { equals: reference } }],
    },
    data,
    depth: 0,
    overrideAccess: true,
  })
  return (result?.docs?.length ?? 0) > 0 ? action : 'changed'
}

export async function runSocialCredentialScan(
  payload: PayloadLike,
  apply: boolean,
): Promise<SocialCredentialScanReport> {
  const report: SocialCredentialScanReport = {
    dryRun: !apply,
    scanned: 0,
    envelope: 0,
    namedReference: 0,
    empty: 0,
    plaintextFound: 0,
    reencrypted: 0,
    invalidated: 0,
    changedDuringScan: 0,
  }

  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: 'social-accounts',
      page,
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    const docs = (res.docs ?? []) as Record<string, unknown>[]
    for (const doc of docs) {
      report.scanned += 1
      const reference = doc.connectionReference as string | null | undefined
      const kind = classifyConnectionReference(reference)
      if (kind === 'envelope') {
        report.envelope += 1
      } else if (kind === 'named-reference') {
        report.namedReference += 1
      } else if (kind === 'empty') {
        report.empty += 1
      } else {
        report.plaintextFound += 1
        if (!apply) continue
        const outcome = await remediatePlaintextRow(payload, doc, reference as string)
        if (outcome === 'reencrypted') report.reencrypted += 1
        else if (outcome === 'invalidated') report.invalidated += 1
        else report.changedDuringScan += 1
      }
    }
    if (!res.hasNextPage || docs.length === 0) break
    page += 1
  }

  return report
}
