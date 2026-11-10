const mod = await import('../../src/collections/Publishing.ts')
function walk(fields: unknown[], depth: number, out: string[]): void {
  for (const f of fields as Record<string, unknown>[]) {
    const name = typeof f.name === 'string' ? f.name : `(${String(f.type)})`
    out.push(`${' '.repeat(depth)}${name} [${String(f.type)}]${f.admin && (f.admin as Record<string, unknown>).condition ? ' CONDITION' : ''}`)
    if (Array.isArray(f.fields)) walk(f.fields as unknown[], depth + 2, out)
    if (Array.isArray(f.tabs)) for (const t of f.tabs as Record<string, unknown>[]) walk((t.fields ?? []) as unknown[], depth + 2, out)
  }
}
for (const key of Object.keys(mod)) {
  const col = (mod as Record<string, unknown>)[key] as Record<string, unknown> | undefined
  if (col && col.slug === 'content' && Array.isArray(col.fields)) {
    const out: string[] = []
    walk(col.fields as unknown[], 0, out)
    console.log(out.join('\n'))
  }
}
process.exit(0)
