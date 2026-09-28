'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter, useSearchParams } from 'next/navigation'
import React, { useCallback, useEffect } from 'react'
import { ADMIN_SECTIONS } from './PublishingLinks'

export interface AdminHeaderProps {
  user: {
    email?: string
    role?: string
  }
  sites: Array<{ id: string; name: string }>
}

const pathItem = (pathname: string) =>
  ADMIN_SECTIONS.flatMap((section) => section.items.map((item) => ({ section, item })))
    .filter(({ item }) => {
      const path = item.href.split('#')[0]
      return pathname === path || pathname.startsWith(`${path}/`)
    })
    .sort((a, b) => b.item.href.split('#')[0].length - a.item.href.split('#')[0].length)[0]

export function AdminHeader({ user, sites }: AdminHeaderProps) {
  const pathname = usePathname() || '/admin'
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedSite = searchParams.get('siteId') || (sites.length === 1 ? sites[0]?.id : '')
  const queryString = searchParams.toString()
  const changeSite = useCallback(
    (siteId: string) => {
      const params = new URLSearchParams(queryString)
      if (siteId) params.set('siteId', siteId)
      else params.delete('siteId')
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname)
    },
    [pathname, queryString, router],
  )
  useEffect(() => {
    if (!new URLSearchParams(queryString).get('siteId') && sites.length === 1)
      changeSite(sites[0].id)
  }, [pathname, queryString, sites, changeSite])
  const current = pathItem(pathname)
  const activeItem = current?.item
  const safeBack = current?.section.items.find((item) => item.href !== activeItem?.href)
  const crumbs =
    current && pathname !== '/admin'
      ? [
          { label: 'Dashboard', href: '/admin' },
          { label: current.section.title, href: safeBack?.href },
          { label: current.item.label },
        ]
      : []
  return (
    <header
      style={{
        backgroundColor: 'var(--theme-elevation-50, #18181b)',
        borderBottom: '1px solid var(--theme-elevation-150, #27272a)',
        padding: '0.65rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        fontSize: '0.875rem',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <Link
          href="/admin"
          style={{
            fontWeight: 700,
            color: 'var(--theme-elevation-900, #f3f4f6)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span style={{ color: '#38bdf8' }}>⚡</span> Renegade Admin
        </Link>
        {crumbs.map((crumb, index) => (
          <React.Fragment key={`${crumb.label}-${index}`}>
            <span aria-hidden="true" style={{ color: '#52525b' }}>
              /
            </span>
            {crumb.href ? (
              <Link
                href={`${crumb.href}${selectedSite ? `${crumb.href.includes('?') ? '&' : '?'}siteId=${encodeURIComponent(selectedSite)}` : ''}`}
                aria-current={index === crumbs.length - 1 ? 'page' : undefined}
                style={{
                  color: index === crumbs.length - 1 ? '#e4e4e7' : '#a1a1aa',
                  fontSize: '0.8125rem',
                }}
              >
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" style={{ color: '#e4e4e7', fontSize: '0.8125rem' }}>
                {crumb.label}
              </span>
            )}
          </React.Fragment>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem' }}>
        {sites.length > 0 ? (
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#a1a1aa' }}
          >
            Site
            <select
              aria-label="Active admin site"
              value={selectedSite}
              onChange={(event) => changeSite(event.target.value)}
              style={{
                maxWidth: '13rem',
                padding: '0.3rem 0.45rem',
                color: '#e4e4e7',
                background: '#27272a',
                border: '1px solid #52525b',
                borderRadius: 4,
              }}
            >
              {sites.length !== 1 ? <option value="">Select a site</option> : null}
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <span
          style={{
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
            backgroundColor: 'var(--theme-elevation-150, #27272a)',
            color: '#38bdf8',
            fontWeight: 600,
            textTransform: 'uppercase',
            fontSize: '0.7rem',
          }}
        >
          {user.role || 'staff'}
        </span>
        <span style={{ color: '#9ca3af' }}>{user.email}</span>
        <Link
          href="/"
          target="_blank"
          rel="noreferrer"
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            fontWeight: 500,
            paddingLeft: '0.5rem',
            borderLeft: '1px solid #3f3f46',
          }}
        >
          View Site ↗
        </Link>
      </div>
    </header>
  )
}
