import type { Payload, PayloadRequest } from 'payload'
import { normalizeNavigation, type PublicMenuItem } from './navigation'
import { canRenderPublic, type PublicState } from './contracts'

export function reconcileContentNavigation(
  navigation: unknown,
  previousPath: string,
  nextPath: string | null,
) {
  const visit = (items: PublicMenuItem[]): PublicMenuItem[] =>
    items.flatMap((item) => {
      const path = item.href.split(/[?#]/, 1)[0]
      const children = visit(item.children)
      if (path !== previousPath) return [{ ...item, children }]
      if (!nextPath) return children
      return [{ ...item, href: nextPath + item.href.slice(path.length), children }]
    })
  const menus = normalizeNavigation(navigation)
  return {
    primary: visit(menus.primary),
    secondary: visit(menus.secondary),
    footer: visit(menus.footer),
  }
}

/** Keep stored menus correct in the same transaction as an authorized content mutation. */
export async function updateContentNavigation(
  payload: Payload,
  record: Record<string, unknown>,
  previous: Record<string, unknown> | undefined,
  req: PayloadRequest,
  deleted = false,
) {
  const site = typeof record.site === 'string' ? record.site : (record.site as { id?: string })?.id
  const from = String(previous?.canonicalPath ?? record.canonicalPath ?? '')
  const to =
    !deleted && canRenderPublic(record as PublicState) ? String(record.canonicalPath ?? '') : null
  if (!site || !from || from === to) return
  const publications = await payload.find({
    collection: 'publications',
    where: { site: { equals: site } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  for (const publication of publications.docs) {
    const before = normalizeNavigation(publication.navigation)
    const after = reconcileContentNavigation(before, from, to)
    if (JSON.stringify(before) !== JSON.stringify(after))
      await payload.update({
        collection: 'publications',
        id: publication.id,
        data: { navigation: after },
        overrideAccess: true,
        req,
      })
  }
}
