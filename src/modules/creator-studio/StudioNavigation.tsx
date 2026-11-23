'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { label: 'Create', href: '/studio/create' },
  { label: 'My Studio', href: '/studio' },
  { label: 'My Portfolio', href: '/studio/portfolio' },
]

export function StudioNavigation() {
  const path = usePathname()
  if (path.startsWith('/studio/guest/')) return null
  const current =
    links.find(
      ({ href }) => href !== '/studio' && (path === href || path.startsWith(href + '/')),
    ) ?? links[1]
  return (
    <nav aria-label="Creator Studio" className="mx-auto flex max-w-5xl flex-wrap gap-2 px-4 pt-4">
      {links.map(({ label, href }) => (
        <Link
          key={href}
          href={href}
          aria-current={current.href === href ? 'page' : undefined}
          className="rounded-md border px-4 py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:border-current aria-[current=page]:bg-current/10"
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
