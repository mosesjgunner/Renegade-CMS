export type PublicMenuItem = {
  label: string
  href: string
  children: PublicMenuItem[]
}

export type PublicNavigation = {
  primary: PublicMenuItem[]
  secondary: PublicMenuItem[]
  footer: PublicMenuItem[]
}

const validHref = (value: unknown): value is string =>
  typeof value === 'string' &&
  (value.startsWith('/') ? !value.startsWith('//') : /^https?:\/\//i.test(value))

function items(value: unknown): PublicMenuItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const item = candidate as Record<string, unknown>
    if (typeof item.label !== 'string' || !item.label.trim() || !validHref(item.href)) return []
    return [{ label: item.label.trim(), href: item.href, children: items(item.children) }]
  })
}

/** Accepts the original onboarding array and the richer editable menu object. */
export function normalizeNavigation(value: unknown): PublicNavigation {
  if (Array.isArray(value)) return { primary: items(value), secondary: [], footer: items(value) }
  if (!value || typeof value !== 'object') return { primary: [], secondary: [], footer: [] }
  const menus = value as Record<string, unknown>
  return {
    primary: items(menus.primary),
    secondary: items(menus.secondary),
    footer: items(menus.footer),
  }
}

export function isActiveMenuItem(item: PublicMenuItem, path: string): boolean {
  return (
    item.href.startsWith('/') &&
    (item.href === '/' ? path === '/' : path === item.href || path.startsWith(`${item.href}/`))
  )
}
