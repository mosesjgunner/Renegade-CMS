/**
 * SOC-SEC-1 (Red F-1): the only shape in which a social account may leave
 * the server. The stored `connectionReference` is credential material — an
 * AES-256-GCM envelope of the provider credentials — and is never part of
 * this view. `credentialsConfigured` carries the one bit of information
 * the product legitimately needs (whether a reference is stored), and the
 * narrowed `diagnostics` subset carries display state only.
 */

export type RedactedSocialAccountView = {
  id: string
  site: string | null
  network: string | null
  displayName: string | null
  externalAccountId: string | null
  actorType: string | null
  capabilityState: string | null
  capabilities: unknown
  credentialHealth: string | null
  credentialExpiresAt: string | null
  credentialsConfigured: boolean
  lastVerifiedAt: string | null
  diagnostics: {
    mode: unknown
    status: unknown
    lastError: unknown
  } | null
  createdAt: string | null
  updatedAt: string | null
}

const relationId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return id === null || id === undefined ? null : String(id)
  }
  return String(value)
}

const dateOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toRedactedSocialAccountView(doc: Record<string, any>): RedactedSocialAccountView {
  const diagnostics =
    doc.diagnostics && typeof doc.diagnostics === 'object'
      ? {
          mode: doc.diagnostics.mode ?? null,
          status: doc.diagnostics.status ?? null,
          lastError: doc.diagnostics.lastError ?? null,
        }
      : null
  return {
    id: String(doc.id),
    site: relationId(doc.site),
    network: doc.network ?? null,
    displayName: doc.displayName ?? null,
    externalAccountId: doc.externalAccountId ?? null,
    actorType: doc.actorType ?? null,
    capabilityState: doc.capabilityState ?? null,
    capabilities: doc.capabilities ?? null,
    credentialHealth: doc.credentialHealth ?? null,
    credentialExpiresAt: dateOrNull(doc.credentialExpiresAt),
    credentialsConfigured: Boolean(doc.connectionReference),
    lastVerifiedAt: dateOrNull(doc.lastVerifiedAt),
    diagnostics,
    createdAt: dateOrNull(doc.createdAt),
    updatedAt: dateOrNull(doc.updatedAt),
  }
}

const isAccountLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  'connectionReference' in (value as Record<string, unknown>)

/**
 * Deep-walks a composite response payload (draft detail, worker results)
 * and replaces any embedded social-account document — e.g. a relation
 * populated at depth 1 — with its redacted view, so credential material
 * cannot ride along inside another resource's representation.
 */
export function redactSocialAccountRelations<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((entry) => redactSocialAccountRelations(entry, depth + 1)) as T
  }
  if (isAccountLike(value)) {
    return toRedactedSocialAccountView(value) as T
  }
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = redactSocialAccountRelations(entry, depth + 1)
  }
  return out as T
}
