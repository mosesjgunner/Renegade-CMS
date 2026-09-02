'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { isActiveMenuItem, type PublicMenuItem, type PublicNavigation } from './navigation'

function MenuLink({ item, nested = false }: { item: PublicMenuItem; nested?: boolean }) {
  const path = usePathname()
  const active = isActiveMenuItem(item, path)
  const external = !item.href.startsWith('/')
  const className = `rounded px-3 py-2 text-sm ${active ? 'font-bold text-red-700 underline underline-offset-4' : 'text-stone-700 hover:text-red-700 dark:text-stone-200'} ${nested ? 'block' : ''}`
  return external ? (
    <a href={item.href} className={className} target="_blank" rel="noreferrer">
      {item.label}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={className}>
      {item.label}
    </Link>
  )
}

function Menu({ items, mobile = false }: { items: PublicMenuItem[]; mobile?: boolean }) {
  return (
    <ul className={mobile ? 'space-y-1' : 'flex items-center gap-1'}>
      {items.map((item) => (
        <li key={`${item.label}:${item.href}`} className={mobile ? '' : 'relative group'}>
          <MenuLink item={item} />
          {item.children.length ? (
            <ul
              className={
                mobile
                  ? 'ml-4 border-l pl-2'
                  : 'absolute left-0 hidden min-w-48 rounded border bg-white p-1 shadow group-focus-within:block group-hover:block dark:bg-stone-900'
              }
            >
              {item.children.map((child) => (
                <li key={`${child.label}:${child.href}`}>
                  <MenuLink item={child} nested />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function PublicNavigationBar({
  siteName,
  logoUrl,
  navigation,
}: {
  siteName: string
  logoUrl?: string | null
  navigation: PublicNavigation
}) {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/95 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold tracking-tight text-stone-950 dark:text-white"
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={siteName} className="h-8 w-auto max-w-[140px] object-contain" />
          ) : null}
          <span>{siteName}</span>
        </Link>
        <nav aria-label="Primary navigation" className="hidden md:block">
          <Menu items={navigation.primary} />
        </nav>
        <nav aria-label="Secondary navigation" className="hidden md:block">
          <Menu items={navigation.secondary} />
        </nav>
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm md:hidden"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen(!open)}
        >
          Menu
        </button>
      </div>
      {open ? (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="border-t px-4 py-3 md:hidden"
        >
          <Menu items={[...navigation.primary, ...navigation.secondary]} mobile />
        </nav>
      ) : null}
    </header>
  )
}
