import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashGuestToken, guestCartCookieName } from '../../src/modules/commerce/cart'
const member = vi.hoisted(() => vi.fn())
vi.mock('../../src/modules/identity/member-identity', () => ({
  currentMember: member,
  readMemberSession: () => 'session',
}))
import { canAccessCommerceCart } from '../../src/modules/commerce/cart-access'
import { catalogOriginForSite, catalogSiteForHost } from '../../src/modules/commerce/site-scope'
const payload = {
  findGlobal: async () => ({ canonicalOriginsBySite: { 'site-a': 'https://shop.example.test' } }),
  find: async ({ collection }: { collection: string }) => ({
    docs: collection === 'sites' ? [{ id: 'site-a' }, { id: 'site-b' }] : [],
  }),
} as never
const request = (host = 'shop.example.test', cookie = '') =>
  new Request('https://shop.example.test/checkout', { headers: { host, cookie } })
describe('customer cart capability boundary', () => {
  it('uses the configured site origin for provider returns', async () => {
    expect(await catalogOriginForSite(payload, 'site-a')).toBe('https://shop.example.test')
  })
  beforeEach(() => {
    member.mockReset().mockResolvedValue(null)
  })
  it('requires the correct guest cart token on the configured host', async () => {
    const cart = { site: 'site-a', guestTokenHash: hashGuestToken('private-cart-token') }
    expect(await canAccessCommerceCart(payload, request(), cart)).toBe(false)
    expect(
      await canAccessCommerceCart(
        payload,
        request('shop.example.test', guestCartCookieName('site-a') + '=wrong'),
        cart,
      ),
    ).toBe(false)
    const cookie = guestCartCookieName('site-a') + '=private-cart-token'
    expect(await canAccessCommerceCart(payload, request('shop.example.test', cookie), cart)).toBe(
      true,
    )
    expect(
      await canAccessCommerceCart(payload, request('unknown.example.test', cookie), cart),
    ).toBe(false)
  })
  it('retains a recent legacy guest cart with a null expiry', async () => {
    const cart = {
      site: 'site-a',
      expiresAt: null,
      createdAt: new Date().toISOString(),
      guestTokenHash: hashGuestToken('legacy'),
    }
    expect(
      await canAccessCommerceCart(
        payload,
        request('shop.example.test', guestCartCookieName('site-a') + '=legacy'),
        cart,
      ),
    ).toBe(true)
  })
  it('denies an old legacy guest cart without extending its lifetime', async () => {
    const cart = {
      site: 'site-a',
      expiresAt: null,
      createdAt: '2020-01-01T00:00:00Z',
      guestTokenHash: hashGuestToken('legacy'),
    }
    expect(
      await canAccessCommerceCart(
        payload,
        request('shop.example.test', guestCartCookieName('site-a') + '=legacy'),
        cart,
      ),
    ).toBe(false)
  })
  it('requires the owning member even when a guest token is supplied', async () => {
    const cart = {
      site: { id: 'site-a' },
      member: { id: 'member-a' },
      guestTokenHash: hashGuestToken('token'),
    }
    member.mockResolvedValue('member-b')
    expect(
      await canAccessCommerceCart(
        payload,
        request('shop.example.test', guestCartCookieName('site-a') + '=token'),
        cart,
      ),
    ).toBe(false)
    member.mockResolvedValue('member-a')
    expect(await canAccessCommerceCart(payload, request(), cart)).toBe(true)
  })
  it('refuses unknown catalog hosts on a multi-site installation', async () => {
    expect(await catalogSiteForHost(payload, 'shop.example.test')).toBe('site-a')
    await expect(catalogSiteForHost(payload, 'unknown.example.test')).rejects.toThrow(
      'Catalog site unavailable',
    )
    await expect(catalogSiteForHost(payload, 'localhost.attacker.test')).rejects.toThrow(
      'Catalog site unavailable',
    )
  })
})
