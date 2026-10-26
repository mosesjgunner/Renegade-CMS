import { describe, expect, it, vi } from 'vitest'
import { publicSiteForHost } from '@/modules/public/site-scope'
import { SiteSettings } from '@/globals/SiteSettings'
import { Sites } from '@/collections/Sites'

describe('02A: Sites and Persistent Settings', () => {
  describe('SiteSettings validation', () => {
    it('validates canonical origin protocol and host conflict detection', async () => {
      // Find the beforeValidate hook
      const beforeValidateHooks = SiteSettings.hooks?.beforeValidate || []
      expect(beforeValidateHooks.length).toBeGreaterThan(0)
      const hook = beforeValidateHooks[0]

      // Valid single site canonical origin
      const validData = {
        canonicalOrigin: 'https://mysite.com',
        canonicalOriginsBySite: {
          'site-1': 'https://site1.com',
          'site-2': 'https://site2.com',
        },
      }
      const res = hook!({ data: validData } as any)
      expect(res).toBeDefined()

      // Invalid canonicalOrigin (ftp or javascript protocol)
      expect(() =>
        hook!({
          data: {
            canonicalOrigin: 'ftp://invalidscheme.com',
          },
        } as any),
      ).toThrow(/must use HTTP or HTTPS protocol/)

      // Invalid canonicalOriginsBySite origin (relative path or bad protocol)
      expect(() =>
        hook!({
          data: {
            canonicalOriginsBySite: { 'site-1': 'javascript:alert(1)' },
          },
        } as any),
      ).toThrow(/must use HTTP or HTTPS protocol/)

      // Duplicate host conflict across two sites
      expect(() =>
        hook!({
          data: {
            canonicalOriginsBySite: {
              'site-1': 'https://renegadeparty.org',
              'site-2': 'https://renegadeparty.org:8080',
            },
          },
        } as any),
      ).toThrow(/conflicts between site/)
    })
  })

  describe('Sites validation and normalization', () => {
    it('requires name and normalizes slug in beforeValidate', async () => {
      const beforeValidateHooks = Sites.hooks?.beforeValidate || []
      expect(beforeValidateHooks.length).toBeGreaterThan(0)
      const hook = beforeValidateHooks[0]

      // Rejects empty name
      expect(() =>
        hook!({
          data: { name: '   ', slug: 'valid-slug' },
          operation: 'create',
        } as any),
      ).toThrow(/Site name is required/)

      // Normalizes slug
      const result = hook!({
        data: { name: 'Renegade Community', slug: 'Renegade Community / Special!' },
        operation: 'create',
      } as any) as any
      expect(result.slug).toBe('renegade-community-special')

      // Auto-generates slug from name if slug is missing
      const resultGenerated = hook!({
        data: { name: 'My New Site 2026' },
        operation: 'create',
      } as any) as any
      expect(resultGenerated.slug).toBe('my-new-site-2026')
    })
  })

  describe('publicSiteForHost resolution', () => {
    it('resolves site by port-agnostic host and canonicalOriginsBySite mapping', async () => {
      const mockPayload = {
        findGlobal: vi.fn().mockResolvedValue({
          canonicalOrigin: 'https://default-site.test:3000',
          canonicalOriginsBySite: {
            'site-alpha': 'https://alpha.example.com:443',
            'site-beta': 'https://beta.example.com:8443',
          },
        }),
        find: vi.fn().mockImplementation(async ({ collection }) => {
          if (collection === 'sites') {
            return {
              docs: [
                { id: 'site-default', slug: 'default-site', name: 'Default Site' },
                { id: 'site-alpha', slug: 'alpha', name: 'Alpha Site' },
                { id: 'site-beta', slug: 'beta', name: 'Beta Site' },
              ],
            }
          }
          return { docs: [] }
        }),
      } as any

      // Port-agnostic match for beta
      const siteBeta = await publicSiteForHost(mockPayload, 'beta.example.com:8443')
      expect(siteBeta).toBe('site-beta')

      // Port-agnostic match for alpha without port in request
      const siteAlpha = await publicSiteForHost(mockPayload, 'alpha.example.com')
      expect(siteAlpha).toBe('site-alpha')

      // Port-agnostic match for default-site canonicalOrigin
      const siteDefault = await publicSiteForHost(mockPayload, 'default-site.test:8080')
      expect(siteDefault).toBe('site-default')

      // Security invariant: unknown domain on multi-site installation must return ''
      const fallback = await publicSiteForHost(mockPayload, 'unrecognized-domain.net')
      expect(fallback).toBe('')

      // Localhost fallback on multi-site resolves primary site
      const siteLocal = await publicSiteForHost(mockPayload, 'localhost:3000')
      expect(siteLocal).toBe('site-default')
    })
  })
})


