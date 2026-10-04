import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import config from '../payload.config'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Payload } from 'payload'
import PublishingLinks from '../modules/admin/PublishingLinks'
import CapabilityCenterLink from '../modules/admin/CapabilityCenterLink'

const built = await config
const payload = {
  collections: Object.fromEntries(built.collections.map((c) => [c.slug, c])),
} as unknown as Payload
const links = [PublishingLinks, CapabilityCenterLink].flatMap((Component) => {
  const source = renderToStaticMarkup(createElement(Component, { payload }))
  return [...source.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((match) => ({
    href: match[1],
    label: match[2].trim(),
    source: Component.name,
  }))
})
const matrix = {
  sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  profile: process.env.DEPLOYMENT_PROFILE,
  modules: process.env.RENEGADE_MODULES || 'floor',
  views: Object.entries(built.admin.components?.views ?? {}).map(([key, view]) => ({
    key,
    ...view,
  })),
  beforeNavLinks: built.admin.components?.beforeNavLinks,
  links,
  frontendCommandCenters: links.filter((link) =>
    fs.existsSync(`src/app/(frontend)${link.href}/page.tsx`),
  ),
  workspaceLinkCandidates: Object.values(built.admin.components?.views ?? {}).flatMap((view) => {
    const component =
      typeof view.Component === 'string' ? view.Component.replace(/^\.\//, 'src/') : ''
    if (!component || !fs.existsSync(`${component}.tsx`)) return []
    return [
      ...fs.readFileSync(`${component}.tsx`, 'utf8').matchAll(/href="(\/(?!api\/)[^"]+)"/g),
    ].map((match) => ({ href: match[1], source: component }))
  }),
  collections: built.collections.map((collection) => ({
    slug: collection.slug,
    href: `/admin/collections/${collection.slug}`,
    hidden:
      typeof collection.admin.hidden === 'function'
        ? 'conditional'
        : Boolean(collection.admin.hidden),
    labels: collection.labels,
  })),
  globals: built.globals.map((global) => ({
    slug: global.slug,
    href: `/admin/globals/${global.slug}`,
    hidden:
      typeof global.admin.hidden === 'function' ? 'conditional' : Boolean(global.admin.hidden),
  })),
}
fs.mkdirSync('docs/rc/evidence/rc-01', { recursive: true })
fs.writeFileSync(
  `docs/rc/evidence/rc-01/admin-${matrix.profile}-${matrix.modules}.json`,
  JSON.stringify(matrix, null, 2) + '\n',
)
console.log(
  `${matrix.profile}/${matrix.modules}: ${matrix.views.length} custom views, ${links.length} links, ${matrix.collections.filter((c) => !c.hidden).length} visible collections, ${matrix.globals.filter((g) => !g.hidden).length} visible globals`,
)
