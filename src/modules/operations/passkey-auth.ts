import { randomUUID } from 'node:crypto'

import { jwtVerify, SignJWT } from 'jose'
import type { AuthStrategy } from 'payload'

const cookieName = 'renegade-passkey'

export function createPasskeyAuthStrategy(secret: string): AuthStrategy {
  return {
    name: 'passkey',
    authenticate: async ({ headers, payload }) => {
      const token = readCookie(headers, cookieName)
      if (!token) return { user: null }
      try {
        const verified = await jwtVerify(token, new TextEncoder().encode(secret))
        const id = typeof verified.payload.id === 'string' ? verified.payload.id : undefined
        const sessionId =
          typeof verified.payload.sid === 'string' ? verified.payload.sid : undefined
        if (!id || !sessionId || verified.payload.collection !== 'users') return { user: null }
        const database = payload.db as typeof payload.db & {
          pool?: {
            query: (text: string, values?: unknown[]) => Promise<{ rows: { id: string }[] }>
          }
        }
        const active = await database.pool?.query(
          `SELECT id FROM admin_sessions WHERE id = $1 AND user_id = $2
           AND revoked_at IS NULL AND expires_at > now()`,
          [sessionId, id],
        )
        if (!active?.rows[0]) return { user: null }
        const user = await payload.findByID({ collection: 'users', id, depth: 0 })
        if (!user) return { user: null }
        return { user: { ...user, collection: 'users', _strategy: 'passkey' } }
      } catch {
        return { user: null }
      }
    },
  }
}

export async function createPasskeySession(
  user: { email: string; id: string },
  secret: string,
  createSession?: (sessionId: string, expiresAt: Date) => Promise<void>,
) {
  const expirationSeconds = 60 * 60 * 8
  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + expirationSeconds * 1000)
  await createSession?.(sessionId, expiresAt)
  const token = await new SignJWT({
    collection: 'users',
    email: user.email,
    id: user.id,
    sid: sessionId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${expirationSeconds}s`)
    .sign(new TextEncoder().encode(secret))
  return { expirationSeconds, sessionId, token }
}

export function clearPasskeySessionCookie(secure: boolean): string {
  return `${cookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

export async function requireAdminUser(
  payload: {
    db: unknown
    findByID: (args: { collection: 'users'; id: string; depth: 0 }) => Promise<unknown>
  },
  secret: string,
  headers: Headers,
): Promise<{ email: string; id: string; role: 'owner' | 'administrator' | 'staff' }> {
  const token = readCookie(headers, cookieName)
  if (!token) throw new Error('Sign in is required.')
  const verified = await jwtVerify(token, new TextEncoder().encode(secret))
  const id = typeof verified.payload.id === 'string' ? verified.payload.id : undefined
  const sessionId = typeof verified.payload.sid === 'string' ? verified.payload.sid : undefined
  if (!id || !sessionId || verified.payload.collection !== 'users')
    throw new Error('Your session has expired.')
  const database = payload.db as {
    pool?: { query: (text: string, values?: unknown[]) => Promise<{ rows: { id: string }[] }> }
  }
  const active = await database.pool?.query(
    `SELECT id FROM admin_sessions WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`,
    [sessionId, id],
  )
  if (!active?.rows[0]) throw new Error('Your session has expired.')
  const user = (await payload.findByID({ collection: 'users', id, depth: 0 })) as {
    email?: string
    id?: string
    role?: string
  }
  if (!user?.id || !user.email || !['owner', 'administrator', 'staff'].includes(user.role ?? ''))
    throw new Error('Your account is not authorized for the admin.')
  return { email: user.email, id: user.id, role: user.role as 'owner' | 'administrator' | 'staff' }
}

export async function revokePasskeySession(
  payload: { db: unknown },
  secret: string,
  headers: Headers,
): Promise<void> {
  const token = readCookie(headers, cookieName)
  if (!token) return
  try {
    const verified = await jwtVerify(token, new TextEncoder().encode(secret))
    const sessionId = typeof verified.payload.sid === 'string' ? verified.payload.sid : undefined
    if (!sessionId) return
    const database = payload.db as {
      pool?: { query: (text: string, values?: unknown[]) => Promise<unknown> }
    }
    await database.pool?.query(`UPDATE admin_sessions SET revoked_at = now() WHERE id = $1`, [
      sessionId,
    ])
  } catch {
    // Clearing an invalid or expired browser cookie is still a successful logout.
  }
}

export function passkeySessionCookie(
  token: string,
  expirationSeconds: number,
  secure: boolean,
): string {
  return `${cookieName}=${token}; Max-Age=${expirationSeconds}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

function readCookie(headers: Headers, name: string): string | undefined {
  const cookie = headers.get('cookie')
  if (!cookie) return undefined
  return cookie
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1]
}
