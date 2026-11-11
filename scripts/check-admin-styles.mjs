#!/usr/bin/env node
/**
 * GUI-02D enforcement (report-only): scan operator-admin sources for
 * styling the design system bans in NEW/CHANGED code —
 *   1. raw hex colors in src/modules/admin (use --admin-* / --theme-*)
 *   2. references to public --presentation-* tokens from admin code
 * Always exits 0 and prints a report; CI gating on changed files only
 * is a deliberate later step (legacy code must not fail wholesale).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../src/modules/admin/', import.meta.url).pathname
const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (/\.(tsx?|css)$/.test(entry.name)) files.push(path)
  }
}
walk(root)

const hex = /#[0-9a-fA-F]{3,8}\b/
let hexHits = 0
let presentationHits = 0
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (hex.test(line) && !/primitives|admin-tokens/.test(file)) {
      hexHits++
      if (hexHits <= 10) console.log(`hex  ${file}:${i + 1}  ${line.trim().slice(0, 90)}`)
    }
    if (
      line.includes('--presentation-') &&
      !/admin-tokens/.test(file) &&
      !line.trim().startsWith('*')
    ) {
      presentationHits++
      console.log(`pres ${file}:${i + 1}  ${line.trim().slice(0, 90)}`)
    }
  })
}
console.log(
  `\nadmin style check (report-only): ${files.length} files, ${hexHits} hex hits outside primitives/tokens, ${presentationHits} --presentation-* references`,
)
