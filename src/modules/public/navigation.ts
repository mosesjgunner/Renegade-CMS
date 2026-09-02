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

export function validateMenuItem(item: unknown, depth = 0): PublicMenuItem {
  if (!item || typeof item !== 'object') throw new Error('Menu item must be an object.')
  const raw = item as Record<string, unknown>
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  if (!label || label.length > 100)
    throw new Error('Menu item label must be between 1 and 100 characters.')
  const href = typeof raw.href === 'string' ? raw.href.trim() : ''
  if (!validHref(href))
    throw new Error(`Invalid menu item link: "${href}". Must start with "/" or "http(s)://".`)
  if (depth > 0 && Array.isArray(raw.children) && raw.children.length > 0) {
    throw new Error('Navigation supports at most one nesting level.')
  }
  const children = Array.isArray(raw.children)
    ? raw.children.map((child) => validateMenuItem(child, depth + 1))
    : []
  return { label, href, children }
}

export function validateNavigation(value: unknown): PublicNavigation {
  if (!value || typeof value !== 'object') throw new Error('Navigation must be an object.')
  const menus = value as Record<string, unknown>
  const validateList = (list: unknown) =>
    Array.isArray(list) ? list.map((entry) => validateMenuItem(entry, 0)) : []
  return {
    primary: validateList(menus.primary),
    secondary: validateList(menus.secondary),
    footer: validateList(menus.footer),
  }
}
