/* eslint-disable @typescript-eslint/no-explicit-any -- schema probe */
import { getPayload } from 'payload'
import config from '@payload-config'

const payload: any = await getPayload({ config })
const wanted = process.argv.slice(2)
for (const slug of wanted) {
  const c = payload.collections[slug]
  if (!c) {
    console.log(`## ${slug}: MISSING`)
    continue
  }
  const table = payload.db.tables
    ? Object.keys(payload.db.tables).find((t) => payload.db.tables[t]?.collectionSlug === slug)
    : undefined
  console.log(`## ${slug} table=${table ?? '?'}`)
  const walk = (fields: any[], prefix = '') => {
    for (const f of fields ?? []) {
      if (f.type === 'tabs') {
        for (const t of f.tabs ?? []) walk(t.fields, `${prefix}${t.name ?? t.label}.`)
        continue
      }
      if (
        f.type === 'group' ||
        f.type === 'array' ||
        f.type === 'row' ||
        f.type === 'collapsible'
      ) {
        console.log(`  ${prefix}${f.name ?? '(row)'}: ${f.type}${f.required ? ' REQUIRED' : ''}`)
        if (f.fields) walk(f.fields, `${prefix}${f.name}.`)
        continue
      }
      const extra = [
        f.required ? 'REQUIRED' : '',
        f.relationTo
          ? `->${Array.isArray(f.relationTo) ? f.relationTo.join('|') : f.relationTo}`
          : '',
        f.options ? `options=${JSON.stringify(f.options.map((o: any) => o.value ?? o))}` : '',
        f.defaultValue !== undefined ? `default=${JSON.stringify(f.defaultValue)}` : '',
      ]
        .filter(Boolean)
        .join(' ')
      console.log(`  ${prefix}${f.name}: ${f.type} ${extra}`)
    }
  }
  walk(c.config.fields)
}
process.exit(0)
