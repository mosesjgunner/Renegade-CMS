import {
  crawlerEntries,
  sitemapPage,
  sitemapPageCount,
  renderSitemapIndex,
} from '../../../../src/modules/public/crawler.ts'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
const count = 25001
const docs = Array.from({ length: count }, (_, i) => ({
  canonicalUrl: `https://scale.example/articles/${String(count - i).padStart(5, '0')}`,
  indexability: { indexable: true },
  dates: {},
  contentType: 'article',
  socialImage: { variantEligible: false },
}))
const start = performance.now()
const entries = crawlerEntries(docs)
const pages = sitemapPageCount(entries.length)
const xml = renderSitemapIndex('https://scale.example', entries)
console.log(
  JSON.stringify(
    {
      count: entries.length,
      pages,
      sizes: Array.from({ length: pages }, (_, i) => sitemapPage(entries, i).length),
      first: entries[0].url,
      last: entries.at(-1).url,
      page1last: entries[999].url,
      page2first: entries[1000].url,
      unique: new Set(entries.map((e) => e.url)).size,
      indexLocations: (xml.match(/<loc>/g) || []).length,
      ordered: entries.every((e, i) => i === 0 || entries[i - 1].url.localeCompare(e.url) <= 0),
      sha256: createHash('sha256')
        .update(entries.map((e) => e.url).join('\n'))
        .digest('hex'),
      elapsedMs: Math.round(performance.now() - start),
    },
    null,
    2,
  ),
)
