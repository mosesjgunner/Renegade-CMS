/**
 * POD-10 (POD-REQ-21): guest invite tokens (PURE CORE + hash helpers).
 *
 * Follows the POD-03 member-feed pattern exactly: a token is 32 random
 * bytes rendered base64url (256 bits of entropy); only its SHA-256
 * (hex) is ever persisted — the raw token is returned exactly once, at
 * issue time, inside the invite link, and is never logged (the
 * structured lifecycle events in service.ts carry invite/session ids
 * only). Tokens are purpose-bound (guest-invite), session-bound (the
 * invite row names exactly one studio session record), expiring, and
 * revocable; rotating an invite (issuing a replacement for the same
 * session + guest) revokes the previous one instantly in service.ts.
 *
 * Single-use: a successful guest join consumes the invite token. The
 * join returns a separate per-guest signalling credential (same hash-
 * only storage, on the same invite row) that authenticates signalling
 * polls/posts and clip-slot registration for the rest of the session —
 * the invite token itself can never be replayed to join twice.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** 32 random bytes → 43-char base64url token (256 bits of entropy). */
export const GUEST_TOKEN_BYTES = 32
/** Default invite lifetime: 24 h. A show can pass a shorter TTL at issue. */
export const GUEST_INVITE_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

export function generateGuestToken(): string {
  return randomBytes(GUEST_TOKEN_BYTES).toString('base64url')
}

/** The only persisted form of a guest token: bare SHA-256 hex. */
export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time comparison of a candidate token against a stored hash. */
export function guestTokenMatchesHash(token: string, storedHash: unknown): boolean {
  if (typeof storedHash !== 'string' || !storedHash) return false
  const candidate = Buffer.from(hashGuestToken(token), 'utf8')
  const stored = Buffer.from(storedHash, 'utf8')
  if (candidate.length !== stored.length) return false
  return timingSafeEqual(candidate, stored)
}

export type InviteTokenVerdict =
  | { ok: true }
  | {
      ok: false
      code:
        | 'invite-not-found'
        | 'invite-expired'
        | 'invite-revoked'
        | 'invite-already-used'
        | 'invite-wrong-session'
      message: string
    }

/**
 * Pure verdict for an invite row presented at a boundary (join,
 * signalling, clip upload). `purpose` keeps the token bound to the
 * guest-invite use — a row minted for anything else never resolves.
 */
export function evaluateInviteToken(
  invite: {
    purpose?: unknown
    sessionId: string
    state: string
    expiresAt?: string | null
    revokedAt?: string | null
  } | null,
  input: { sessionId?: string; nowMs: number; forJoin: boolean },
): InviteTokenVerdict {
  if (!invite || invite.purpose !== 'guest-invite') {
    return { ok: false, code: 'invite-not-found', message: 'Guest invite not found.' }
  }
  if (input.sessionId && invite.sessionId !== input.sessionId) {
    return {
      ok: false,
      code: 'invite-wrong-session',
      message: 'Guest invite belongs to a different session.',
    }
  }
  if (invite.revokedAt) {
    return { ok: false, code: 'invite-revoked', message: 'Guest invite has been revoked.' }
  }
  if (invite.expiresAt && Date.parse(invite.expiresAt) <= input.nowMs) {
    return { ok: false, code: 'invite-expired', message: 'Guest invite has expired.' }
  }
  if (input.forJoin && invite.state !== 'invited') {
    return {
      ok: false,
      code: 'invite-already-used',
      message: 'Guest invite has already been used to join.',
    }
  }
  return { ok: true }
}
