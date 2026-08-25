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
        if (!id || verified.payload.collection !== 'users') return { user: null }
        const user = await payload.findByID({ collection: 'users', id, depth: 0 })
        if (!user) return { user: null }
        return { user: { ...user, collection: 'users', _strategy: 'passkey' } }
      } catch {
        return { user: null }
      }
    },
  }
}

export async function createPasskeySession(user: { email: string; id: string }, secret: string) {
  const expirationSeconds = 60 * 60 * 8
  const token = await new SignJWT({ collection: 'users', email: user.email, id: user.id })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${expirationSeconds}s`)
    .sign(new TextEncoder().encode(secret))
  return { expirationSeconds, token }
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
