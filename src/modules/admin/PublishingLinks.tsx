'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import React, { useState } from 'react'
import styles from './AdminNav.module.css'
import { canAccessAdminArea, type AdminArea } from './access-policy'

export interface NavItem {
  label: string
  href: string
  badge?: string
  roles?: readonly string[]
  /**
   * A destination can remain part of the ADMIN-00 map before its backed
   * Payload view is mounted.  It must not be rendered as a broken link.
   */
  unavailableReason?: string
}

export interface NavSection {
  id: string
  title: string
  items: NavItem[]
}

export const ADMIN_SECTIONS: NavSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    items: [{ label: 'Overview', href: '/admin' }],
  },
  {
    id: 'publishing',
    title: 'Publishing',
    items: [
      { label: 'Posts', href: '/admin/posts' },
      { label: 'Pages', href: '/admin/pages' },
      unavailable('All Content', '/admin/collections/content'),
      unavailable('Sections', '/admin/collections/sections'),
      unavailable('Categories', '/admin/collections/categories'),
      unavailable('Topics', '/admin/collections/topics'),
      unavailable('Tags', '/admin/collections/tags'),
    ],
  },
  {
    id: 'media',
    title: 'Media',
    items: [
      { label: 'Media Library', href: '/admin/media-library' },
      unavailable('Assets', '/admin/collections/media-assets'),
      unavailable('Podcasts', '/admin/collections/podcast-shows'),
    ],
  },
  {
    id: 'presentation',
    title: 'Presentation',
    items: [
      { label: 'Menus & Navigation', href: '/admin/navigation' },
      unavailable('Page Layouts', '/admin/collections/page-layouts'),
      { label: 'Themes & Starters', href: '/admin/capabilities#theme-center', roles: ['owner'] },
    ],
  },
  {
    id: 'discovery',
    title: 'Discovery',
    items: [
      { label: 'Search & Indexing', href: '/admin/indexing' },
      { label: 'Content Intelligence', href: '/admin/intelligence' },
      { label: 'URL Redirects', href: '/admin/redirects' },
      { label: 'Quality Center', href: '/admin/rendered-quality' },
    ],
  },
  {
    id: 'workflow',
    title: 'Workflow',
    items: [
      { label: 'Editorial Workflow', href: '/admin/workflow' },
      { label: 'Content Releases', href: '/admin/releases' },
    ],
  },
  {
    id: 'distribution',
    title: 'Distribution',
    items: [{ label: 'Social Distribution', href: '/admin/social' }],
  },
  {
    id: 'audience',
    title: 'Audience',
    items: [
      { label: 'Audience Center', href: '/admin/audience' },
      { label: 'Email Composer', href: '/admin/email-composer' },
      unavailable('Subscribers', '/admin/collections/subscribers'),
    ],
  },
  {
    id: 'community',
    title: 'Community',
    items: [
      { label: 'Moderation Queue', href: '/admin/moderation' },
      unavailable('Forums', '/admin/collections/forums'),
      unavailable('Discussions', '/admin/collections/discussions'),
    ],
  },
  {
    id: 'commerce',
    title: 'Commerce',
    items: [
      { label: 'Product Catalog', href: '/admin/catalog' },
      { label: 'Operations & Ledger', href: '/admin/commerce' },
      unavailable('Products', '/admin/collections/products'),
      { label: 'POD & Fulfillment', href: '/admin/fulfillment' },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    items: [{ label: 'Telemetry & Tests', href: '/admin/telemetry' }],
  },
  {
    id: 'users',
    title: 'Users',
    items: [
      unavailable('Staff Users', '/admin/collections/users'),
      unavailable('Authors', '/admin/collections/authors'),
      unavailable('Community Members', '/admin/collections/members'),
    ],
  },
  {
    id: 'roles',
    title: 'Roles',
    items: [{ label: 'Passkeys & Account Security', href: '/admin/security' }],
  },
  {
    id: 'providers',
    title: 'Providers',
    items: [
      { label: 'Connections & Webhooks', href: '/admin/providers' },
      { label: 'AI Studio', href: '/admin/ai' },
    ],
  },
  {
    id: 'settings',
    title: 'Site Settings',
    items: [
      unavailable('General Settings', '/admin/globals/site-settings'),
      unavailable('Sites', '/admin/collections/sites'),
      unavailable('Brands', '/admin/collections/brands'),
    ],
  },
  {
    id: 'maintenance',
    title: 'Maintenance',
    items: [
      { label: 'Capability Center', href: '/admin/capabilities', roles: ['owner'] },
      { label: 'Legacy Migration', href: '/admin/migration', roles: ['owner', 'administrator'] },
    ],
  },
]

export default function PublishingLinks({ initialRole }: { initialRole?: string } = {}) {
  const pathname = usePathname() || ''
  const searchParams = useSearchParams()
  const selectedSite = searchParams.get('siteId')
  const clientRole = useAdminRole()
  const role = clientRole ?? initialRole ?? 'staff'
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    // Default open the section that contains the current active route, or dashboard
    const initial: Record<string, boolean> = { dashboard: true }
    for (const section of ADMIN_SECTIONS) {
      if (
        section.items.some(
          (item) =>
            pathname === item.href.split('#')[0] ||
            (item.href.split('#')[0] !== '/admin' &&
              pathname.startsWith(`${item.href.split('#')[0]}/`)),
        )
      ) {
        initial[section.id] = true
      }
    }
    return initial
  })

  const visibleSections = ADMIN_SECTIONS.filter((section) =>
    canAccessAdminArea(role, section.id as AdminArea),
  )
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.roles || item.roles.includes(String(role))),
    }))
    .filter((section) => section.items.length > 0)

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const isItemActive = (href: string) => {
    const path = href.split('#')[0]
    if (path === '/admin') return pathname === '/admin'
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  return (
    <nav className={styles.navContainer} aria-label="Admin Sections">
      {visibleSections.map((section) => {
        const isOpen = !!openSections[section.id]
        const hasActiveChild = section.items.some((item) => isItemActive(item.href))

        return (
          <div key={section.id} className={styles.navGroup}>
            <button
              type="button"
              className={`${styles.groupToggle} ${hasActiveChild ? styles.groupToggleActive : ''}`}
              onClick={() => toggleSection(section.id)}
              aria-expanded={isOpen}
              aria-controls={`nav-section-${section.id}`}
            >
              <span>{section.title}</span>
              <span
                className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
                aria-hidden="true"
              >
                ▶
              </span>
            </button>
            {isOpen && (
              <div
                id={`nav-section-${section.id}`}
                className={styles.linkList}
                role="region"
                aria-label={`${section.title} navigation`}
              >
                {section.items.map((item) => {
                  const [itemPath, itemHash] = item.href.split('#')
                  const active = isItemActive(itemPath) && (!itemHash || pathname === item.href)
                  const query = new URLSearchParams(searchParams.toString())
                  const href =
                    selectedSite && itemPath.startsWith('/admin')
                      ? `${itemPath}${query.toString() ? `?${query.toString()}` : ''}${itemHash ? `#${itemHash}` : ''}`
                      : item.href
                  if (item.unavailableReason) {
                    return (
                      <span
                        key={item.href}
                        className={`${styles.navLink} ${styles.navLinkUnavailable}`}
                        aria-disabled="true"
                        title={item.unavailableReason}
                      >
                        {item.label} <span className={styles.unavailableNote}>Unavailable</span>
                      </span>
                    )
                  }
                  return (
                    <Link
                      key={item.href}
                      href={href}
                      className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      {item.label}
                      {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      <Link href="/" target="_blank" rel="noreferrer" className={styles.viewSiteLink}>
        <span>
          View Public Site <span aria-hidden="true">↗</span>
          <span className={styles.srOnly}> (opens in new tab)</span>
        </span>
      </Link>
    </nav>
  )
}

function unavailable(label: string, href: string): NavItem {
  return {
    label,
    href,
    unavailableReason: 'This management view is not mounted in this build.',
  }
}

function useAdminRole() {
  const [role, setRole] = useState<string | undefined>(undefined)
  React.useEffect(() => {
    let active = true
    fetch('/api/admin/navigation/permissions', { credentials: 'same-origin' })
      .then(async (response) => (response.ok ? ((await response.json()) as { role?: string }) : {}))
      .then((result) => {
        if (active) setRole(result.role)
      })
      .catch(() => {
        if (active) setRole(undefined)
      })
    return () => {
      active = false
    }
  }, [])
  return role
}
