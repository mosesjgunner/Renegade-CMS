import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * RC2-DEBT-12: guards the collections ↔ modules layering rule documented in
 * src/modules/module-registry.ts. The rule governs the BOUNDARY: collections
 * may import leaf helpers from modules, and the only modules → collections
 * path is the domain registrars. A cycle that crosses the boundary would
 * make that direction meaningless, so this test builds the static
 * VALUE-import graph over src/collections and src/modules (type-only imports
 * are erased at compile time and cannot form an executable cycle) and fails
 * if any strongly connected component — any import cycle — includes a
 * src/collections file.
 *
 * Scope note (measured 2026-11-16): the modules service layer contains
 * several modules-internal cycles (public/core/presentation theme scope;
 * editorial/public hierarchy + discovery; collaboration/media workflow;
 * community notifications; community conversation attachments). They work
 * because the bindings are only called after all modules evaluate, and they
 * are NOT what this rule governs — they are recorded in the RC2-DEBT-12
 * closure note as a finding for a future pass, not gated here.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const srcRoot = join(repoRoot, 'src')
const rel = (file: string) => file.replace(`${repoRoot}/`, '')

const sourceFiles: string[] = []
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) sourceFiles.push(path)
  }
}
walk(join(srcRoot, 'collections'))
walk(join(srcRoot, 'modules'))
const fileSet = new Set(sourceFiles)

const resolveSpecifier = (fromFile: string, specifier: string): string | null => {
  let base: string | null = null
  if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else if (specifier.startsWith('@/')) base = join(srcRoot, specifier.slice(2))
  if (!base) return null
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ])
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  return null
}

const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

const graph = new Map<string, Set<string>>()
for (const file of sourceFiles) {
  const edges = new Set<string>()
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(importPattern)) {
    if (/^(?:import|export)\s+type\b/.test(match[0])) continue
    const target = resolveSpecifier(file, match[1] ?? match[2])
    if (target && target !== file && fileSet.has(target)) edges.add(target)
  }
  graph.set(file, edges)
}

/** Tarjan's algorithm: returns every SCC with more than one member. */
const cyclicComponents = (): string[][] => {
  let index = 0
  const indices = new Map<string, number>()
  const lowlink = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const components: string[][] = []

  const strongconnect = (node: string) => {
    indices.set(node, index)
    lowlink.set(node, index)
    index += 1
    stack.push(node)
    onStack.add(node)
    for (const next of graph.get(node) ?? []) {
      if (!indices.has(next)) {
        strongconnect(next)
        lowlink.set(node, Math.min(lowlink.get(node)!, lowlink.get(next)!))
      } else if (onStack.has(next)) {
        lowlink.set(node, Math.min(lowlink.get(node)!, indices.get(next)!))
      }
    }
    if (lowlink.get(node) === indices.get(node)) {
      const component: string[] = []
      let member: string
      do {
        member = stack.pop()!
        onStack.delete(member)
        component.push(member)
      } while (member !== node)
      if (component.length > 1) components.push(component.map(rel).sort())
    }
  }
  for (const node of graph.keys()) if (!indices.has(node)) strongconnect(node)
  return components
}

describe('collections/modules import layering (RC2-DEBT-12)', () => {
  it('has no import cycle crossing the collections boundary', () => {
    const crossing = cyclicComponents().filter((component) =>
      component.some((file) => file.startsWith('src/collections/')),
    )
    expect(crossing, `import cycle touching src/collections: ${JSON.stringify(crossing)}`).toEqual(
      [],
    )
  })
})
