import type { ReadonlyURLSearchParams } from 'next/navigation'
import { useSearchParams } from 'next/navigation'

export function withAdminSite(path: string, siteId: string | null | undefined): string {
  if (!siteId) return path
  const [pathname, hash] = path.split('#', 2)
  const [base, existingQuery] = pathname.split('?', 2)
  const params = new URLSearchParams(existingQuery)
  params.set('siteId', siteId)
  return `${base}?${params.toString()}${hash ? `#${hash}` : ''}`
}

export function adminSiteFromSearchParams(params: ReadonlyURLSearchParams | null): string | null {
  return params?.get('siteId') || null
}

export function useAdminSiteID(): string | null {
  return adminSiteFromSearchParams(useSearchParams())
}
