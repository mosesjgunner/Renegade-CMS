import type { Payload } from 'payload'
import { currentMember, readMemberSession, type IdentityStore } from '../identity/member-identity'
import { publicSiteForHost } from '../public/site-scope'
import { guestCartCookieName, hashGuestToken } from './cart'

export const commerceRelationId = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'id' in value
    ? String(value.id ?? '')
    : String(value ?? '')

/** A record ID never grants access to a customer's cart, quote or checkout. */
export async function canAccessCommerceCart(
  payload: Payload,
  request: Request,
  cart: {
    site?: unknown
    member?: unknown
    owner?: unknown
    guestTokenHash?: unknown
  },
) {
  const siteId = commerceRelationId(cart.site)
  if (!siteId || siteId !== (await publicSiteForHost(payload, request.headers.get('host'))))
    return false
  const memberId = commerceRelationId(cart.member ?? cart.owner)
  if (memberId)
    return (
      memberId ===
      (await currentMember(payload as unknown as IdentityStore, readMemberSession(request.headers)))
    )
  const cookieName = guestCartCookieName(siteId)
  const token = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1)
  return Boolean(
    token &&
      typeof cart.guestTokenHash === 'string' &&
      hashGuestToken(token) === cart.guestTokenHash,
  )
}
